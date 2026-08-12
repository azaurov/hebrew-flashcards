// Hebrew Reading Flashcards service worker.
// Network-first for navigation (HTML) so users always get fresh code;
// offline fallback to cached index.html for flaky connections.
// Uses self.registration.scope so this works at any base URL (local dev,
// GitHub Pages at /hebrew-flashcards/, a custom domain at /, etc.).

const CACHE_NAME = "hebrew-flashcards-v1";
// Strip trailing slash so we can append paths cleanly.
const BASE = self.registration.scope.replace(/\/$/, "");
const APP_SHELL = [
  BASE + "/",
  BASE + "/index.html",
  BASE + "/manifest.json",
  BASE + "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Navigation: try network, fall back to cached index.html.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(BASE + "/", copy));
          return res;
        })
        .catch(() =>
          caches
            .match(BASE + "/index.html")
            .then((r) => r || new Response("Offline", { status: 503 }))
        )
    );
    return;
  }
  // All other requests (JS bundles, fonts) go straight to network.
});
