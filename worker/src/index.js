// Cloudflare Worker: Azure Cognitive Services TTS proxy for Hebrew Reading
// Flashcards.
//
// Keeps AZURE_SPEECH_KEY server-side (set via `wrangler secret put`) so the
// static GitHub Pages site never ships a usable key in its client bundle.
//
// GET /?text=<hebrew> — cached at Cloudflare's edge (Cache API) so repeat
// requests for the same flashcard word across all users cost zero quota
// after the first fetch.
//
// Switched from Google Cloud TTS: all 10 Google he-IL voices, tested
// against three different text-pointing formulations, produced the exact
// same "bal"-ish mispronunciation of a common word ("בר" / "בַּר") — and
// critically, Google Translate's own product (same underlying tech)
// reproduces it too. That's a confirmed limitation of Google's Hebrew
// TTS itself, not something fixable from this Worker. Azure's he-IL
// neural voices are a different underlying stack, worth testing fresh.

const ALLOWED_ORIGINS = new Set([
  "https://azaurov.github.io",
  "http://localhost:8081",
  "http://localhost:8792",
  "http://localhost:8793",
]);

const AZURE_REGION = "eastus";
const LANGUAGE_CODE = "he-IL";
const DEFAULT_VOICE_NAME = "he-IL-AvriNeural";
const ALLOWED_VOICES = new Set(["he-IL-AvriNeural", "he-IL-HilaNeural"]);
// Bump on any change to voice/provider/text-transform, so previously-
// cached audio generated under the old behavior doesn't keep being
// served forever.
const CACHE_VERSION = "v4-azure";

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://azaurov.github.io";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function escapeSsml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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
    const gender = voiceName === "he-IL-HilaNeural" ? "Female" : "Male";

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

    const ssml = `<speak version='1.0' xml:lang='${LANGUAGE_CODE}'><voice xml:lang='${LANGUAGE_CODE}' xml:gender='${gender}' name='${voiceName}'>${escapeSsml(text)}</voice></speak>`;

    const upstream = await fetch(
      `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY,
          "Content-Type": "application/ssml+xml; charset=utf-8",
          "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
          // Azure's Speech endpoint is itself fronted by Cloudflare, and
          // requests from a Cloudflare Worker with no User-Agent were
          // getting rejected by its WAF with a bodiless 400 — a normal-
          // looking UA is enough to pass.
          "User-Agent": "curl/8.0",
        },
        body: new TextEncoder().encode(ssml),
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
        "Cache-Control": "public, max-age=2592000",
      },
    });
    ctx.waitUntil(cache.put(cacheKey, cacheableResponse.clone()));

    const headers = new Headers(cacheableResponse.headers);
    Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
    headers.set("X-Cache", "MISS");
    return new Response(audioBuffer, { headers, status: 200 });
  },
};
