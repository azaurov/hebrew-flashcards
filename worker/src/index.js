// Cloudflare Worker: Google Cloud Text-to-Speech proxy for Hebrew Reading
// Flashcards.
//
// Keeps GOOGLE_TTS_API_KEY server-side (set via `wrangler secret put`) so the
// static GitHub Pages site never ships a usable key in its client bundle.
//
// GET /?text=<hebrew> — cached at Cloudflare's edge (Cache API) so repeat
// requests for the same flashcard word across all users cost zero quota
// after the first fetch. Google's free tier is generous (~4M chars/month
// standard, 1M WaveNet), but this app's ~250-word vocabulary repeats
// constantly across users/sessions, so caching still matters.
//
// Switched from ElevenLabs: that account had zero Hebrew-tagged voices in
// either its own library or the shared community library, so every word
// was going through a plain American-English voice guessing at Hebrew —
// widespread mispronunciation was the expected outcome, not a bug to
// patch around. Google's he-IL voices are trained specifically for Hebrew.

const ALLOWED_ORIGINS = new Set([
  "https://azaurov.github.io",
  "http://localhost:8081",
  "http://localhost:8792",
  "http://localhost:8793",
]);

const LANGUAGE_CODE = "he-IL";
const DEFAULT_VOICE_NAME = "he-IL-Wavenet-C";
// Voices allowed via ?voice= for A/B testing pronunciation quality — see
// `GET /v1/voices?languageCode=he-IL` for the full catalog.
const ALLOWED_VOICES = new Set([
  "he-IL-Wavenet-A",
  "he-IL-Wavenet-B",
  "he-IL-Wavenet-C",
  "he-IL-Wavenet-D",
  "he-IL-Standard-A",
  "he-IL-Standard-B",
  "he-IL-Standard-C",
  "he-IL-Standard-D",
  "he-IL-Chirp3-HD-Charon",
  "he-IL-Chirp3-HD-Kore",
  "he-IL-Chirp3-HD-Puck",
  "he-IL-Chirp3-HD-Zephyr",
]);
// Bump on any change to voice/model/text-transform, so previously-cached
// audio generated under the old behavior doesn't keep being served forever.
const CACHE_VERSION = "v3-google";

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://azaurov.github.io";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: cors });
    }

    const text = (url.searchParams.get("text") || "").trim();
    if (!text || text.length > 200) {
      return new Response("Missing or oversized `text` query param", { status: 400, headers: cors });
    }

    const requestedVoice = url.searchParams.get("voice") || "";
    const voiceName = ALLOWED_VOICES.has(requestedVoice) ? requestedVoice : DEFAULT_VOICE_NAME;

    // Cache key ignores Origin — the audio itself is origin-independent.
    const cacheKey = new Request(`https://cache.internal/tts/${CACHE_VERSION}/${voiceName}/${encodeURIComponent(text)}`);
    const cache = caches.default;

    let cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
      headers.set("X-Cache", "HIT");
      return new Response(cached.body, { headers, status: 200 });
    }

    const upstream = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${env.GOOGLE_TTS_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: LANGUAGE_CODE, name: voiceName },
          audioConfig: { audioEncoding: "MP3", speakingRate: 0.9 },
        }),
      }
    );

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      return new Response(`TTS upstream error: ${upstream.status} ${errText}`, {
        status: 502,
        headers: cors,
      });
    }

    const { audioContent } = await upstream.json();
    if (!audioContent) {
      return new Response("TTS upstream returned no audio", { status: 502, headers: cors });
    }
    const audioBytes = base64ToBytes(audioContent);

    const cacheableResponse = new Response(audioBytes, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        // 30 days, not a full year+immutable: the client also appends a
        // cache-busting `v` param it bumps on backend changes, but this is
        // a safety net in case that's ever forgotten.
        "Cache-Control": "public, max-age=2592000",
      },
    });
    ctx.waitUntil(cache.put(cacheKey, cacheableResponse.clone()));

    const headers = new Headers(cacheableResponse.headers);
    Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
    headers.set("X-Cache", "MISS");
    return new Response(audioBytes, { headers, status: 200 });
  },
};
