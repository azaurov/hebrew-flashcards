import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { DECKS, TOTAL_LABEL } from '../data/decks';
import BattleMode from '../components/battle-mode';

function speakTextFor(c, deck){
  if(!c) return '';
  // Only the Alef-Bet deck needs the letter's name spoken instead of its
  // glyph — a bare consonant (e.g. ר alone) has no vowel to cue correct
  // pronunciation. Vowels/Nikkud cards are a letter+vowel-point combo
  // (e.g. אַ) that already sounds right read as-is; speaking the nikud's
  // *name* there would say "Patach" instead of the "ah" sound it wants.
  if(deck && deck.tag === 'Letter' && c.name && /[א-ת]/.test(c.name)) return c.name;
  return c.front;
}

function isHebrewText(s){
  return !!s && /[א-ת]/.test(s);
}

const DAGESH = 'ּ';
// Letters where the U+05BC combining mark is meaningful and must be kept:
// bet/kaf/pe, where dagesh audibly changes the sound (b/v, k/kh, p/f) in
// Modern Israeli Hebrew — and vav, where the *same* codepoint doubles as
// the "shuruk" vowel sign (וּ = "oo"), not a dagesh at all. On every other
// letter it's a silent grammatical mark (dagesh qal) that TTS engines
// apparently mistake for a gemination/glottal cue, inserting a spurious
// extra syllable (e.g. גַּן "gan" coming out "ga-e-an").
const DAGESH_AUDIBLE_LETTERS = new Set(['ב', 'כ', 'פ', 'ו']); // ב כ פ ו

// Prepares display text for speech only — never used for what's shown
// on the card, only for what's sent to the TTS proxy.
function normalizeForSpeech(text){
  if(!text) return text;
  let result = text
    // יְיָ is the traditional written substitute for the divine name —
    // always read aloud as "Adonai" regardless of how it's spelled. No
    // TTS engine can infer that liturgical convention on its own.
    .replace(/יְיָ/g, 'אֲדֹנָי');

  // Match each Hebrew consonant plus its whole trailing run of combining
  // marks (nikkud, dagesh, shin/sin dot) as one cluster — the source data
  // isn't consistent about whether dagesh comes immediately after the
  // letter or after the vowel point, so a simple one-char lookbehind for
  // dagesh isn't reliable; scanning the whole cluster is.
  result = result.replace(
    /([א-ת])([֑-ׇ]*)/gu,
    (match, letter, marks) => {
      if (!marks.includes(DAGESH)) return match;
      if (DAGESH_AUDIBLE_LETTERS.has(letter)) return match;
      return letter + marks.replace(DAGESH, '');
    }
  );

  return result;
}

/* ============================ THEME ============================ */
const COLORS = {
  ink: '#0B1729',
  ink2: '#132340',
  rule: '#22375A',
  paper: '#F2F5F9',
  paperEdge: '#D7DFEA',
  accent: '#2E6BE6',
  accentSoft: '#8FB4F7',
  copper: '#C77B3C',
  muted: '#8298B5',
};

const HEB_FONT = Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'serif' });

// Cloudflare Worker proxying Google Cloud TTS (web only) — see worker/src/index.js.
// Native platforms keep using the device's TextToSpeech engine via expo-speech.
const TTS_PROXY_URL = 'https://hebrew-flashcards-tts.azaurov.workers.dev';
// The Worker's response has a 1-year immutable Cache-Control, which caches
// per exact URL in the *browser's own* HTTP cache — separate from and in
// addition to Cloudflare's edge cache. Swapping TTS providers/voices server-
// side does nothing for a returning visitor's browser cache, since the
// request URL never changed. Bump this whenever the backend voice/provider
// changes so the URL itself changes and old cached audio can't be reused.
// Switched from Google Cloud TTS to Azure Cognitive Services: all 10 of
// Google's he-IL voices produced the same mispronunciation of a common
// word regardless of voice or text-pointing formulation tested, and
// Google Translate's own product (same underlying tech) reproduced it
// too -- a confirmed limitation of Google's Hebrew TTS, not our Worker.
const TTS_CACHE_BUST = 'v4-azure';

// Mirrors the original CSS clamp(min, vw%, max) rules so glyphs scale with
// screen width the same way the WebView version did.
function clampSize(min, vwPercent, max, width){
  return Math.min(max, Math.max(min, (width * vwPercent) / 100));
}

const GLYPH_CLAMPS = {
  xl:   [70, 21,  126],
  lg:   [44, 13,  78],
  md:   [30, 8.5, 50],
  sm:   [21, 5.6, 34],
  pair: [52, 16,  92],
};

/* ============================ APP ============================ */
// Fixed fallback matched on both the static server render and the first
// client render, so hydration never disagrees; the real size is applied
// via effect immediately after mount (client-only, avoids React error #418).
const FALLBACK_DIMS = { width: 390, height: 844 };

export default function App() {
  const deckKeys = useMemo(() => Object.keys(DECKS), []);
  const [{ width, height }, setDims] = useState(FALLBACK_DIMS);

  useEffect(() => {
    setDims(Dimensions.get('window'));
    const sub = Dimensions.addEventListener('change', ({ window }) => setDims(window));
    return () => sub.remove();
  }, []);

  const [deckKey, setDeckKey] = useState(deckKeys[0]);
  const [queue, setQueue] = useState(() => DECKS[deckKeys[0]].cards.slice());
  const [battleOpen, setBattleOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const [reverse, setReverse] = useState(false);
  const [done, setDone] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [hebrewVoice, setHebrewVoice] = useState(null);

  const flipAnim = useRef(new Animated.Value(0)).current;
  const audioPlayerRef = useRef(null);

  useEffect(() => {
    Speech.getAvailableVoicesAsync()
      .then((voices) => {
        const heb = voices.filter((v) => v.language && v.language.toLowerCase().startsWith('he'));
        const best =
          heb.find((v) => v.identifier.includes('hed-network')) ||
          heb.find((v) => v.identifier.includes('hed-local')) ||
          heb.find((v) => v.identifier.includes('hed')) ||
          heb[0];
        setHebrewVoice(best?.identifier || null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    // Without this, audio playback via expo-audio is silenced whenever the
    // iOS hardware mute switch is on — a common "no sound" surprise.
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  useEffect(() => {
    Animated.timing(flipAnim, {
      toValue: flipped ? 1 : 0,
      duration: 500,
      easing: Easing.bezier(0.4, 0.15, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [flipped, flipAnim]);

  const deck = DECKS[deckKey];
  const card = queue[idx];
  const rev = reverse && deck.vocab;

  // Browser/OS voices vary wildly (some devices only expose one Hebrew
  // voice, and it can mispronounce letters like resh) — used only as a
  // fallback if the TTS proxy is unreachable (e.g. offline).
  function speakWithBrowserVoice(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const match = hebrewVoice ? voices.find((v) => v.voiceURI === hebrewVoice) : null;
    utterance.voice = match || null;
    utterance.lang = match ? match.lang : 'he-IL';
    utterance.rate = 0.85;
    setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  function speak(text) {
    if (!text) return;
    // Only affects what's sent to the TTS proxy — the displayed card text
    // is untouched.
    const ttsText = normalizeForSpeech(text);

    if (Platform.OS === 'web') {
      setSpeaking(true);
      setDone('');

      // Safari (notably iOS) generally requires audio.play() to happen
      // synchronously inside the user-gesture call stack — a play() called
      // later, after an async fetch resolves, can get silently blocked.
      // Priming an <audio> element with play() right here, before the
      // fetch even starts, keeps it "unlocked" for the real playback once
      // its src is set below. Chrome/Android didn't surface this because
      // it's more lenient about deferred gesture-linked playback.
      const audio = new window.Audio();
      try {
        const primePromise = audio.play();
        if (primePromise && primePromise.catch) primePromise.catch(() => {});
      } catch {
        // Playing with no source throws synchronously in some browsers —
        // fine, the element is still primed for the src swap below.
      }

      fetch(`${TTS_PROXY_URL}/?text=${encodeURIComponent(ttsText)}&v=${TTS_CACHE_BUST}`)
        .then((res) => {
          if (!res.ok) throw new Error(`TTS proxy error ${res.status}`);
          return res.blob();
        })
        .then((blob) => {
          const url = window.URL.createObjectURL(blob);
          audio.src = url;
          audio.onended = () => {
            setSpeaking(false);
            window.URL.revokeObjectURL(url);
          };
          audio.onerror = () => {
            setSpeaking(false);
            window.URL.revokeObjectURL(url);
          };
          const playPromise = audio.play();
          if (playPromise && playPromise.catch) {
            playPromise.catch(() => {
              setSpeaking(false);
              setDone('Using device voice (playback blocked).');
              speakWithBrowserVoice(text);
            });
          }
        })
        .catch(() => {
          setSpeaking(false);
          setDone('Using device voice (audio service unreachable).');
          speakWithBrowserVoice(text);
        });
      return;
    }

    // Native: prefer the same Azure-TTS-backed proxy used on web, since
    // on-device voices vary wildly in Hebrew pronunciation quality across
    // manufacturers/OS versions (see the Android "hed" voice hunt, which
    // doesn't even transfer to iOS — Apple's voice identifiers use a
    // completely different naming scheme). Fall back to the device voice
    // only if the proxy is unreachable.
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.remove();
      } catch {
        // already released
      }
      audioPlayerRef.current = null;
    }
    setSpeaking(true);
    setDone('');

    const uri = `${TTS_PROXY_URL}/?text=${encodeURIComponent(ttsText)}&v=${TTS_CACHE_BUST}`;
    const player = createAudioPlayer(uri);
    audioPlayerRef.current = player;
    let settled = false;

    const cleanUp = () => {
      if (audioPlayerRef.current === player) audioPlayerRef.current = null;
      try {
        player.remove();
      } catch {
        // already released
      }
    };

    // expo-audio has no dedicated load-error event to react to; if
    // playback hasn't started within a few seconds (bad network, proxy
    // down), assume it failed and fall back rather than leaving the user
    // with silence.
    const fallbackTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      subscription.remove();
      cleanUp();
      setDone('Using device voice (audio service unreachable).');
      speakWithDeviceVoice(text);
    }, 4000);

    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (settled) return;
      if (status.didJustFinish) {
        settled = true;
        clearTimeout(fallbackTimer);
        subscription.remove();
        cleanUp();
        setSpeaking(false);
      }
    });

    player.play();
  }

  function speakWithDeviceVoice(text) {
    Speech.stop();
    setSpeaking(true);
    Speech.speak(text, {
      language: 'he-IL',
      voice: hebrewVoice || undefined,
      rate: 0.85,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }

  // Keyboard shortcuts only make sense on web (desktop browser).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    function onKeyDown(e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped((f) => !f); }
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === '1') mark(false);
      else if (e.key === '2') mark(true);
      else if (e.key.toLowerCase() === 'p') speak(speakTextFor(queue[idx], deck));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, idx, hebrewVoice, deck]);

  function loadDeck(key) {
    setDeckKey(key);
    setQueue(DECKS[key].cards.slice());
    setIdx(0);
    setFlipped(false);
    setReviewCount(0);
    setDone('');
  }

  function shuffle() {
    const next = queue.slice();
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    setQueue(next);
    setIdx(0);
    setFlipped(false);
    setDone('Shuffled.');
  }

  function step(n) {
    setIdx((prevIdx) => {
      const t = prevIdx + n;
      if (t < 0 || t >= queue.length) {
        if (t >= queue.length) {
          setDone(
            reviewCount
              ? `End of deck — ${reviewCount} card${reviewCount > 1 ? 's' : ''} re-queued for review.`
              : 'End of deck. Shuffle to run it again.'
          );
        }
        return prevIdx;
      }
      setFlipped(false);
      setDone('');
      return t;
    });
  }

  function mark(knew) {
    if (!knew) {
      setQueue((q) => [...q, q[idx]]);
      setReviewCount((c) => c + 1);
    }
    if (idx === queue.length - 1) {
      setDone('End of deck. Shuffle to run it again.');
      setFlipped(false);
      return;
    }
    step(1);
  }

  if (!card) return null;

  const cardWrapMaxHeight = height < 640 ? 290 : 420;
  const showKeys = height >= 640;

  const frontRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  const glyphFontSize = (() => {
    const key = card.size || 'xl';
    const [min, vw, max] = GLYPH_CLAMPS[key] || GLYPH_CLAMPS.xl;
    return clampSize(min, vw, max, width);
  })();
  const nameFontSize = clampSize(24, 6.4, 34, width);
  const translitFontSize = clampSize(17, 4.6, 23, width);
  const meanFontSize = clampSize(15, 4, 19, width);
  const promptFontSize = clampSize(22, 6, 32, width);

  return (
    <>
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.ink} />

      <View style={styles.header}>
        <Text style={styles.title}>HEBREW READING FLASHCARDS</Text>
        <Text style={styles.sub}>
          The New Reading Hebrew · <Text style={styles.subBold}>{TOTAL_LABEL}</Text>
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.decksRow}
        >
          {deckKeys.map((key) => {
            const d = DECKS[key];
            const selected = key === deckKey;
            const isHeb = /[א-ת]/.test(d.label) && d.label.length < 14;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => loadDeck(key)}
                style={[styles.deckPill, selected && styles.deckPillSelected]}
              >
                <Text
                  style={[
                    styles.deckLabel,
                    isHeb && styles.deckLabelHeb,
                    selected && styles.deckLabelSelected,
                  ]}
                >
                  {d.label}
                </Text>
                <Text style={[styles.deckCount, selected && styles.deckCountSelected]}>
                  {' '}{d.cards.length}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <TouchableOpacity style={styles.battleOpenBtn} onPress={() => setBattleOpen(true)}>
          <Text style={styles.battleOpenText}>⚔ Battle mode</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.rail}>
        {deck.vocab ? (
          <TouchableOpacity
            style={styles.dirBtn}
            onPress={() => {
              setReverse((r) => !r);
              setFlipped(false);
            }}
          >
            <Text style={styles.dirText}>{rev ? 'EN → עב' : 'עב → EN'}</Text>
          </TouchableOpacity>
        ) : null}
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${((idx + 1) / queue.length) * 100}%` }]} />
        </View>
        <Text style={styles.count}>{idx + 1} / {queue.length}</Text>
      </View>

      <View style={styles.stage}>
        <View style={[styles.cardWrap, { maxHeight: cardWrapMaxHeight }]}>
          {isHebrewText(card.front) ? (
            <TouchableOpacity
              style={[styles.speakBtn, speaking && styles.speakBtnActive]}
              onPress={() => speak(speakTextFor(card, deck))}
            >
              <Text style={styles.speakIcon}>🔊</Text>
            </TouchableOpacity>
          ) : null}

          <Pressable style={styles.cardTouchable} onPress={() => setFlipped((f) => !f)}>
            <Animated.View
              style={[
                styles.face,
                styles.faceFront,
                { transform: [{ perspective: 1400 }, { rotateY: frontRotate }] },
              ]}
            >
              <Text style={styles.tagFront}>{deck.tag}</Text>
              {rev ? (
                <Text style={[styles.prompt, { fontSize: promptFontSize }]}>{card.mean}</Text>
              ) : card.size === 'pair' ? (
                <View style={styles.pairRow}>
                  {card.front.split(' ').map((g, i) => (
                    <Text key={i} style={[styles.glyph, { fontSize: glyphFontSize }]}>{g}</Text>
                  ))}
                </View>
              ) : (
                <Text style={[styles.glyph, { fontSize: glyphFontSize }]}>{card.front}</Text>
              )}
              <Text style={styles.hint}>Tap to reveal</Text>
            </Animated.View>

            <Animated.View
              style={[
                styles.face,
                styles.faceBack,
                { transform: [{ perspective: 1400 }, { rotateY: backRotate }] },
              ]}
            >
              <Text style={styles.tagBack}>Answer</Text>
              {rev ? (
                <>
                  <Text style={[styles.glyph, styles.glyphBack, { fontSize: glyphFontSize }]}>
                    {card.front}
                  </Text>
                  <Text style={[styles.translit, { fontSize: translitFontSize }]}>{card.translit}</Text>
                </>
              ) : (
                <>
                  {card.name ? (
                    <Text style={[styles.name, { fontSize: nameFontSize }]}>{card.name}</Text>
                  ) : null}
                  {card.translit ? (
                    <Text style={[styles.translit, { fontSize: translitFontSize }]}>{card.translit}</Text>
                  ) : null}
                  {card.mean ? (
                    <Text style={[styles.mean, { fontSize: meanFontSize }]}>{card.mean}</Text>
                  ) : null}
                  {card.note ? <Text style={styles.note}>{card.note}</Text> : null}
                </>
              )}
            </Animated.View>
          </Pressable>
        </View>
      </View>

      <View style={styles.controls}>
        <Text style={styles.done}>{done}</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.actBtn} onPress={() => mark(false)}>
            <Text style={styles.actText}>Review again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actBtn, styles.actPrimary]} onPress={() => mark(true)}>
            <Text style={[styles.actText, styles.actTextPrimary]}>Knew it</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.actBtn, styles.actGhost]}
            disabled={idx === 0}
            onPress={() => step(-1)}
          >
            <Text style={[styles.actText, styles.actTextGhost, idx === 0 && styles.actTextDisabled]}>←</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actBtn} onPress={() => setFlipped((f) => !f)}>
            <Text style={styles.actText}>Flip card</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actBtn, styles.actGhost]} onPress={shuffle}>
            <Text style={[styles.actText, styles.actTextGhost]}>Shuffle</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actBtn, styles.actGhost]} onPress={() => step(1)}>
            <Text style={[styles.actText, styles.actTextGhost]}>→</Text>
          </TouchableOpacity>
        </View>
        {showKeys ? (
          <Text style={styles.keys}>
            {Platform.OS === 'web'
              ? 'Space flips · Arrows move · P plays audio · 1 review, 2 knew it'
              : 'Tap card to flip · Tap 🔊 to hear pronunciation'}
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
    <BattleMode visible={battleOpen} onRequestClose={() => setBattleOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.ink, padding: 14, gap: 12 },
  header: {},
  title: { fontSize: 13, letterSpacing: 2, color: COLORS.muted, fontWeight: '600' },
  sub: { fontSize: 12, color: COLORS.rule, marginTop: 2 },
  subBold: { color: COLORS.muted, fontWeight: '600' },
  decksRow: { gap: 6, marginTop: 12, paddingBottom: 2 },
  deckPill: {
    borderWidth: 1,
    borderColor: COLORS.rule,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },
  deckPillSelected: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  deckLabel: { fontSize: 12.5, fontWeight: '600', color: COLORS.muted },
  deckLabelHeb: { fontFamily: HEB_FONT, fontSize: 15, writingDirection: 'rtl' },
  deckLabelSelected: { color: '#fff' },
  deckCount: { fontSize: 11, fontWeight: '500', color: COLORS.muted, opacity: 0.6 },
  deckCountSelected: { color: '#fff', opacity: 0.8 },
  battleOpenBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.copper,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  battleOpenText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: COLORS.copper },

  rail: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dirBtn: {
    borderWidth: 1,
    borderColor: COLORS.rule,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  dirText: { fontSize: 11, fontWeight: '600', color: COLORS.muted, letterSpacing: 0.5 },
  track: { flex: 1, height: 3, backgroundColor: COLORS.rule, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: COLORS.accent },
  count: { fontSize: 11.5, color: COLORS.muted, letterSpacing: 0.5 },

  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cardWrap: {
    position: 'relative',
    width: '100%',
    maxWidth: 460,
    height: '100%',
    minHeight: 230,
  },
  cardTouchable: { flex: 1 },
  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backfaceVisibility: 'hidden',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  faceFront: { backgroundColor: COLORS.paper, borderBottomWidth: 3, borderBottomColor: COLORS.paperEdge },
  faceBack: {
    backgroundColor: COLORS.ink2,
    borderWidth: 1,
    borderColor: COLORS.rule,
    borderBottomWidth: 3,
    borderBottomColor: COLORS.accent,
  },
  tagFront: { position: 'absolute', top: 12, right: 14, fontSize: 10, letterSpacing: 1.4, fontWeight: '700', color: '#93A5BA' },
  tagBack: { position: 'absolute', top: 12, right: 14, fontSize: 10, letterSpacing: 1.4, fontWeight: '700', color: COLORS.copper },
  glyph: { fontFamily: HEB_FONT, color: COLORS.ink, textAlign: 'center', writingDirection: 'rtl' },
  glyphBack: { color: '#fff' },
  pairRow: { flexDirection: 'row', gap: 14 },
  hint: { marginTop: 18, fontSize: 11.5, color: '#8494A8', letterSpacing: 0.5 },
  name: { fontFamily: HEB_FONT, fontWeight: '500', color: '#fff', writingDirection: 'rtl' },
  translit: { fontWeight: '600', color: COLORS.accentSoft, marginTop: 6, textAlign: 'center' },
  mean: { color: COLORS.paper, marginTop: 12, lineHeight: 24, textAlign: 'center', maxWidth: '90%' },
  note: { fontSize: 13, color: COLORS.muted, marginTop: 14, lineHeight: 19, textAlign: 'center', maxWidth: '90%' },
  prompt: { fontWeight: '600', color: COLORS.ink, lineHeight: 34, textAlign: 'center' },

  speakBtn: {
    position: 'absolute',
    top: 10,
    left: 12,
    zIndex: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.ink2,
    borderWidth: 1,
    borderColor: COLORS.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakBtnActive: { borderColor: COLORS.accent },
  speakIcon: { fontSize: 16 },

  controls: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  actBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.rule,
    backgroundColor: COLORS.ink2,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  actPrimary: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  actGhost: { flex: 0, backgroundColor: 'transparent', paddingHorizontal: 16 },
  actText: { fontSize: 13.5, fontWeight: '600', color: COLORS.paper },
  actTextPrimary: { color: '#fff' },
  actTextGhost: { color: COLORS.muted },
  actTextDisabled: { opacity: 0.35 },
  done: { fontSize: 12.5, color: COLORS.copper, textAlign: 'center', minHeight: 16 },
  keys: { fontSize: 11, color: COLORS.rule, textAlign: 'center', letterSpacing: 0.5 },
});
