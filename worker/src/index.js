// Cloudflare Worker: ElevenLabs TTS proxy for Hebrew Reading Flashcards.
//
// Keeps ELEVENLABS_API_KEY server-side (set via `wrangler secret put`) so the
// static GitHub Pages site never ships a usable key in its client bundle.
//
// GET /?text=<hebrew> — cached at Cloudflare's edge (Cache API) so repeat
// requests for the same flashcard word across all users cost zero
// ElevenLabs quota after the first fetch. ElevenLabs' free tier is only
// 10k chars/month, and this app's vocabulary repeats constantly, so
// caching matters a lot more here than it would for arbitrary text.

const ALLOWED_ORIGINS = new Set([
  "https://azaurov.github.io",
  "http://localhost:8081",
  "http://localhost:8792",
  "http://localhost:8793",
]);

const VOICE_ID = "EXAVITQu4vr4xnSDxMaL";
const MODEL_ID = "eleven_multilingual_v2";
// Bump on any change to how `text` is transformed before synthesis (e.g.
// the punctuation padding below), so previously-cached audio generated
// under the old behavior doesn't keep being served forever.
const CACHE_VERSION = "v2";

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://azaurov.github.io";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
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

    // Cache key ignores Origin — the audio itself is origin-independent.
    const cacheKey = new Request(`https://cache.internal/tts/${CACHE_VERSION}/${VOICE_ID}/${MODEL_ID}/${encodeURIComponent(text)}`);
    const cache = caches.default;

    let cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
      headers.set("X-Cache", "HIT");
      return new Response(cached.body, { headers, status: 200 });
    }

    // ElevenLabs tends to clip or rush very short, isolated inputs (a
    // single letter name like "אָלֶף" with nothing after it). Padding with
    // trailing punctuation gives the model a natural place to land instead
    // of cutting off mid-word.
    const ttsText = /[.!?׃…]$/.test(text) ? text : `${text}.`;

    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: ttsText,
          model_id: MODEL_ID,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
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

    const audioBuffer = await upstream.arrayBuffer();
    const cacheableResponse = new Response(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
    ctx.waitUntil(cache.put(cacheKey, cacheableResponse.clone()));

    const headers = new Headers(cacheableResponse.headers);
    Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
    headers.set("X-Cache", "MISS");
    return new Response(audioBuffer, { headers, status: 200 });
  },
};
