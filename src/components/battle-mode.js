import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { DECKS, PHRASE_DECKS } from '../data/decks';

// Same Cloudflare Worker + Durable Object referee used by the earlier
// static-HTML build of battle mode — the protocol is client-agnostic
// (plain JSON over WebSocket), so this React Native client talks to the
// exact same already-deployed, already-tested backend with no server
// changes needed. See the multiplayer-games skill: one DO instance per
// room is the sole authority on correctness and win conditions; clients
// only ever report which option they picked.
const BATTLE_HTTP = 'https://hebrew-flashcards-battle.azaurov.workers.dev';
const BATTLE_WS = 'wss://hebrew-flashcards-battle.azaurov.workers.dev/ws';

// Multiple-choice needs decks with short, single-concept `mean` fields and
// enough cards for varied distractors — excludes phrase decks (whole
// sentences) and the letter/vowel/lookalike reference decks (no `mean`).
const BATTLE_DECK_KEYS = Object.keys(DECKS).filter(
  (k) => DECKS[k].vocab && !PHRASE_DECKS.includes(k) && DECKS[k].cards.length >= 8
);

const COLORS = {
  ink: '#0B1729',
  ink2: '#132340',
  rule: '#22375A',
  paper: '#F2F5F9',
  accent: '#2E6BE6',
  accentSoft: '#8FB4F7',
  copper: '#C77B3C',
  muted: '#8298B5',
  good: '#3FA56B',
  bad: '#C85C4B',
};

const initialBattleState = {
  screen: 'home', // home | lobby | playing | over
  code: null,
  name: '',
  role: null, // 'host' | 'guest'
  token: null,
  room: null,
  match: null, // {duration, endTime, totalCards}
  card: null, // {front, size, options}
  gameOver: null,
  answeredLock: false,
  lastFeedback: null, // true | false | null
  error: null,
};

export default function BattleMode({ visible, onRequestClose }) {
  const [B, setB] = useState(initialBattleState);
  const wsRef = useRef(null);
  const leavingRef = useRef(false);
  const [nameInput, setNameInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [deckKey, setDeckKey] = useState(BATTLE_DECK_KEYS[0]);
  const deckKeyRef = useRef(deckKey);
  const [duration, setDuration] = useState(60);
  const [remaining, setRemaining] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    deckKeyRef.current = deckKey;
  }, [deckKey]);

  function patch(p) {
    setB((prev) => ({ ...prev, ...p }));
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function startTimer(endTime) {
    stopTimer();
    const tick = () => setRemaining(Math.max(0, Math.ceil((endTime - Date.now()) / 1000)));
    tick();
    timerRef.current = setInterval(tick, 250);
  }

  useEffect(() => () => stopTimer(), []);

  function onMessage(ev) {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch (e) {
      return;
    }

    setB((prev) => {
      let next = { ...prev, error: prev.error };

      if (msg.type === 'joined') {
        next.role = msg.role;
        next.token = msg.token;
        next.error = null;
        // The host announces a default deck as soon as its role is
        // confirmed — waiting on a follow-up room_state to gate this (as an
        // effect keyed on `!room.deckLabel` would) never re-fires, because
        // that computed value is `null` both before and after the DO's
        // first (deckLabel-less) room_state broadcast arrives.
        if (msg.role === 'host') {
          setTimeout(() => sendSelectDeck(deckKeyRef.current), 0);
        }
      } else if (msg.type === 'room_state') {
        next.room = msg;
        if (msg.status === 'waiting' && (prev.screen === 'playing' || prev.screen === 'over')) {
          next.screen = 'lobby';
          next.gameOver = null;
          next.match = null;
          next.card = null;
          next.lastFeedback = null;
          stopTimer();
          // A rematch clears the room's deck server-side but doesn't send a
          // fresh 'joined' message (same connection) — re-announce so the
          // room isn't left with nothing to start.
          if (prev.role === 'host') setTimeout(() => sendSelectDeck(deckKeyRef.current), 0);
        } else if (msg.status === 'playing' && prev.screen === 'lobby') {
          next.screen = 'playing';
          if (!prev.match) next.match = { duration: msg.duration, endTime: msg.endTime, totalCards: msg.cardCount };
          startTimer(msg.endTime);
        } else if (msg.status === 'ended' && prev.screen !== 'over') {
          next.screen = 'over';
          if (!prev.gameOver) next.gameOver = { winner: msg.winner, reason: msg.endReason, host: msg.host, guest: msg.guest };
          stopTimer();
        }
        next.error = null;
      } else if (msg.type === 'error') {
        next.error = msg.message;
      } else if (msg.type === 'match_start') {
        next.match = { duration: msg.duration, endTime: msg.endTime, totalCards: msg.totalCards };
        next.screen = 'playing';
        next.lastFeedback = null;
        startTimer(msg.endTime);
      } else if (msg.type === 'card') {
        next.card = { front: msg.front, size: msg.size, options: msg.options };
        next.answeredLock = false;
        next.lastFeedback = typeof msg.lastCorrect === 'boolean' ? msg.lastCorrect : null;
      } else if (msg.type === 'game_over') {
        next.gameOver = msg;
        next.screen = 'over';
        stopTimer();
      }
      return next;
    });
  }

  function connect(code, token) {
    leavingRef.current = false;
    const finalName = (nameInput || 'Player').trim().slice(0, 20) || 'Player';
    const url =
      BATTLE_WS + '?code=' + encodeURIComponent(code) + '&name=' + encodeURIComponent(finalName) + (token ? '&token=' + encodeURIComponent(token) : '');
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onmessage = onMessage;
    ws.onclose = () => {
      if (!leavingRef.current) patch({ error: 'Connection lost.' });
    };
    patch({ code, screen: 'lobby', error: null });
  }

  async function createRoom() {
    patch({ error: null });
    try {
      const res = await fetch(BATTLE_HTTP + '/api/room', { method: 'POST' });
      const data = await res.json();
      connect(data.code, null);
    } catch (e) {
      patch({ error: 'Could not reach the battle server.' });
    }
  }

  function joinRoom() {
    const code = (codeInput || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(code)) {
      patch({ error: 'Enter a valid room code.' });
      return;
    }
    connect(code, null);
  }

  function sendSelectDeck(key) {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const cards = DECKS[key].cards.map((c) => ({ front: c.front, mean: c.mean, translit: c.translit, size: c.size || 'md' }));
    wsRef.current.send(JSON.stringify({ type: 'select_deck', deckKey: key, deckLabel: DECKS[key].label, cards }));
  }

  function startBattle() {
    if (!wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: 'start', duration }));
  }

  function answer(i) {
    if (B.answeredLock || !wsRef.current) return;
    patch({ answeredLock: true });
    wsRef.current.send(JSON.stringify({ type: 'answer', choice: i }));
  }

  function rematch() {
    if (!wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: 'rematch' }));
  }

  function reconnect() {
    if (B.code && B.token) connect(B.code, B.token);
  }

  function leaveBattle() {
    leavingRef.current = true;
    if (wsRef.current) wsRef.current.close();
    wsRef.current = null;
    stopTimer();
    setRemaining(null);
    setCodeInput('');
    setB(initialBattleState);
  }

  function close() {
    onRequestClose && onRequestClose();
  }

  const r = B.room;
  const isHost = B.role === 'host';

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <TouchableOpacity style={styles.closeBtn} onPress={close} accessibilityLabel="Close battle mode">
            <Text style={styles.closeText}>×</Text>
          </TouchableOpacity>

          <ScrollView contentContainerStyle={styles.cardInner} keyboardShouldPersistTaps="handled">
            {B.screen === 'home' && (
              <>
                <Text style={styles.title}>Battle Mode</Text>
                <View style={styles.field}>
                  <Text style={styles.label}>Your name</Text>
                  <TextInput
                    style={styles.input}
                    value={nameInput}
                    onChangeText={setNameInput}
                    maxLength={20}
                    placeholder="Player"
                    placeholderTextColor={COLORS.muted}
                  />
                </View>
                <TouchableOpacity style={styles.btn} onPress={createRoom}>
                  <Text style={styles.btnText}>Create room</Text>
                </TouchableOpacity>
                <Text style={styles.hint}>— or join a friend's room —</Text>
                <View style={styles.field}>
                  <Text style={styles.label}>Room code</Text>
                  <TextInput
                    style={styles.input}
                    value={codeInput}
                    onChangeText={(t) => setCodeInput(t.toUpperCase())}
                    maxLength={8}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    placeholder="ABCDE"
                    placeholderTextColor={COLORS.muted}
                  />
                </View>
                <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={joinRoom}>
                  <Text style={[styles.btnText, styles.btnTextGhost]}>Join room</Text>
                </TouchableOpacity>
                {!!B.error && <Text style={styles.error}>{B.error}</Text>}
              </>
            )}

            {B.screen === 'lobby' && (
              <>
                <Text style={styles.title}>Room</Text>
                <Text style={styles.code}>{B.code}</Text>
                <Text style={styles.hint}>Share this code with your opponent.</Text>
                <View style={styles.playersRow}>
                  <Slot slot={r && r.host} label="Host" />
                  <Slot slot={r && r.guest} label="Guest" />
                </View>

                {isHost ? (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.label}>Deck</Text>
                      <View style={styles.pillRow}>
                        {BATTLE_DECK_KEYS.map((k) => (
                          <TouchableOpacity
                            key={k}
                            style={[styles.pill, deckKey === k && styles.pillSelected]}
                            onPress={() => {
                              setDeckKey(k);
                              sendSelectDeck(k);
                            }}
                          >
                            <Text style={[styles.pillText, deckKey === k && styles.pillTextSelected]}>
                              {DECKS[k].label} ({DECKS[k].cards.length})
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.label}>Time limit</Text>
                      <View style={styles.pillRow}>
                        {[30, 60, 90, 120].map((d) => (
                          <TouchableOpacity
                            key={d}
                            style={[styles.pill, duration === d && styles.pillSelected]}
                            onPress={() => setDuration(d)}
                          >
                            <Text style={[styles.pillText, duration === d && styles.pillTextSelected]}>{d}s</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.btn, (!r || !r.guest || !r.guest.connected) && styles.btnDisabled]}
                      disabled={!r || !r.guest || !r.guest.connected}
                      onPress={startBattle}
                    >
                      <Text style={styles.btnText}>Start battle</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={styles.hint}>
                    {r && r.deckLabel
                      ? `Host picked "${r.deckLabel}" (${r.cardCount} cards). Waiting for host to start…`
                      : 'Waiting for the host to pick a deck…'}
                  </Text>
                )}

                {!!B.error && (
                  <>
                    <Text style={styles.error}>{B.error}</Text>
                    {B.error === 'Connection lost.' && B.token ? (
                      <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={reconnect}>
                        <Text style={[styles.btnText, styles.btnTextGhost]}>Reconnect</Text>
                      </TouchableOpacity>
                    ) : null}
                  </>
                )}
                <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={leaveBattle}>
                  <Text style={[styles.btnText, styles.btnTextGhost]}>Leave room</Text>
                </TouchableOpacity>
              </>
            )}

            {B.screen === 'playing' && (() => {
              const mySlot = B.role === 'host' ? r && r.host : r && r.guest;
              const oppSlot = B.role === 'host' ? r && r.guest : r && r.host;
              const oppLabel = B.role === 'host' ? 'Guest' : 'Host';
              return (
                <>
                  <Text style={styles.title}>{(r && r.deckLabel) || 'Battle'}</Text>
                  <Text style={styles.timer}>{remaining == null ? '…' : remaining + 's'}</Text>
                  <View style={styles.scoreRow}>
                    <Text style={styles.scoreText}>
                      You: <Text style={styles.scoreBold}>{mySlot ? mySlot.correct : 0}</Text> correct
                    </Text>
                    <Text style={styles.scoreText}>
                      {oppLabel}: <Text style={styles.scoreBold}>{oppSlot ? oppSlot.correct : 0}</Text> correct
                    </Text>
                  </View>
                  {B.card ? (
                    <>
                      <Text style={styles.glyph}>{B.card.front}</Text>
                      <View style={styles.opts}>
                        {B.card.options.map((t, i) => (
                          <TouchableOpacity
                            key={i}
                            style={[styles.opt, B.answeredLock && styles.optDisabled]}
                            disabled={B.answeredLock}
                            onPress={() => answer(i)}
                          >
                            <Text style={styles.optText}>{t}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  ) : (
                    <Text style={styles.hint}>Loading next card…</Text>
                  )}
                  {B.lastFeedback === true && <Text style={[styles.feedback, { color: COLORS.good }]}>Correct!</Text>}
                  {B.lastFeedback === false && <Text style={[styles.feedback, { color: COLORS.bad }]}>Not quite.</Text>}
                </>
              );
            })()}

            {B.screen === 'over' && (() => {
              const g =
                B.gameOver ||
                (r && r.status === 'ended' ? { winner: r.winner, reason: r.endReason, host: r.host, guest: r.guest } : null);
              if (!g) return <Text style={styles.hint}>Match ended.</Text>;
              const tie = g.winner === 'tie';
              const who = tie ? "It's a tie!" : g.winner === B.role ? 'You win!' : (g.winner === 'host' ? g.host.name : g.guest.name) + ' wins!';
              const why = g.reason === 'forfeit' ? 'Opponent disconnected.' : g.reason === 'time_up' ? "Time's up." : '';
              return (
                <>
                  <Text style={styles.title}>Battle Over</Text>
                  <Text style={styles.resultWho}>{who}</Text>
                  {!!why && <Text style={styles.resultWhy}>{why}</Text>}
                  <View style={styles.playersRow}>
                    <View style={styles.finalSlot}>
                      <Text style={styles.finalName}>{g.host.name}</Text>
                      <Text style={styles.finalScore}>{g.host.correct} correct · {g.host.wrong} wrong</Text>
                    </View>
                    <View style={styles.finalSlot}>
                      <Text style={styles.finalName}>{g.guest.name}</Text>
                      <Text style={styles.finalScore}>{g.guest.correct} correct · {g.guest.wrong} wrong</Text>
                    </View>
                  </View>
                  {B.role === 'host' ? (
                    <TouchableOpacity style={styles.btn} onPress={rematch}>
                      <Text style={styles.btnText}>Play again</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.hint}>Waiting for host to start a rematch…</Text>
                  )}
                  <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={leaveBattle}>
                    <Text style={[styles.btnText, styles.btnTextGhost]}>Leave room</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Slot({ slot, label }) {
  return (
    <View style={[styles.slot, slot && styles.slotOn]}>
      <Text style={[styles.slotName, !slot && styles.slotNameOff]}>{slot ? slot.name : '—'}</Text>
      <Text style={styles.slotStatus}>
        {label}
        {slot ? (slot.connected ? '' : ' · reconnecting…') : ' · waiting'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5,10,20,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '92%',
    backgroundColor: COLORS.ink2,
    borderWidth: 1,
    borderColor: COLORS.rule,
    borderRadius: 16,
  },
  cardInner: { padding: 22, paddingTop: 30 },
  closeBtn: { position: 'absolute', top: 8, right: 10, zIndex: 2, padding: 8 },
  closeText: { fontSize: 22, color: COLORS.muted, lineHeight: 22 },

  title: { fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', color: COLORS.copper, fontWeight: '700', marginBottom: 14 },
  field: { gap: 6, marginTop: 10 },
  label: { fontSize: 11, color: COLORS.muted, letterSpacing: 0.5 },
  input: {
    fontSize: 15,
    padding: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.rule,
    backgroundColor: COLORS.ink,
    color: COLORS.paper,
  },
  btn: {
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.rule,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
  },
  btnGhost: { backgroundColor: 'transparent' },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  btnTextGhost: { color: COLORS.muted },
  hint: { fontSize: 12, color: COLORS.muted, textAlign: 'center', marginTop: 14, lineHeight: 18 },
  error: { fontSize: 12.5, color: COLORS.copper, marginTop: 8 },

  code: { fontSize: 30, fontWeight: '700', letterSpacing: 4, textAlign: 'center', color: COLORS.paper, marginTop: 6 },
  playersRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  slot: { flex: 1, borderWidth: 1, borderColor: COLORS.rule, borderRadius: 10, padding: 10, alignItems: 'center' },
  slotOn: { borderColor: COLORS.accent },
  slotName: { fontSize: 13.5, fontWeight: '600', color: COLORS.paper },
  slotNameOff: { color: COLORS.muted },
  slotStatus: { fontSize: 11, color: COLORS.muted, marginTop: 3 },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  pill: { borderWidth: 1, borderColor: COLORS.rule, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  pillSelected: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  pillText: { fontSize: 12.5, fontWeight: '600', color: COLORS.muted },
  pillTextSelected: { color: '#fff' },

  timer: { fontSize: 34, fontWeight: '700', textAlign: 'center', color: COLORS.accentSoft, marginTop: 4, marginBottom: 14 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  scoreText: { fontSize: 12.5, color: COLORS.muted },
  scoreBold: { color: COLORS.paper, fontWeight: '700' },
  glyph: {
    fontFamily: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'serif' }),
    fontSize: 56,
    textAlign: 'center',
    color: '#fff',
    marginBottom: 10,
    writingDirection: 'rtl',
  },
  opts: { gap: 8 },
  opt: { borderWidth: 1, borderColor: COLORS.rule, backgroundColor: COLORS.ink, borderRadius: 10, padding: 13 },
  optDisabled: { opacity: 0.6 },
  optText: { fontSize: 14.5, color: COLORS.paper },

  feedback: { fontSize: 12.5, textAlign: 'center', marginTop: 10, fontWeight: '600' },

  resultWho: { fontSize: 20, fontWeight: '700', color: COLORS.paper, textAlign: 'center', marginTop: 4 },
  resultWhy: { fontSize: 12.5, color: COLORS.muted, textAlign: 'center', marginTop: 4 },
  finalSlot: { flex: 1, borderWidth: 1, borderColor: COLORS.rule, borderRadius: 10, padding: 10, alignItems: 'center' },
  finalName: { fontSize: 13.5, fontWeight: '600', color: COLORS.paper },
  finalScore: { fontSize: 11, color: COLORS.muted, marginTop: 3, textAlign: 'center' },
});
