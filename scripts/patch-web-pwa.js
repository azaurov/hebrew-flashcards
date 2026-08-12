#!/usr/bin/env node
// Post-build patcher for expo export --platform web.
//
// Expo generates index.html from its own template and doesn't honor a
// custom web/index.html. For "Add to Home Screen" PWA install we need:
//   1. <link rel="manifest" href="...manifest.json">
//   2. apple-mobile-web-app meta tags + apple-touch-icon
//   3. Service worker registration
// Reads experiments.baseUrl from app.json so this works for GitHub Pages
// (/hebrew-flashcards/) and for a root-hosted custom domain (empty base URL).

const fs   = require("fs");
const path = require("path");

const distDir   = path.resolve(process.argv[2] || "dist");
const indexPath = path.join(distDir, "index.html");

if (!fs.existsSync(indexPath)) {
  console.error(`[patch-web-pwa] No index.html at ${indexPath}`);
  process.exit(1);
}

const appJson  = JSON.parse(fs.readFileSync(path.join(__dirname, "../app.json"), "utf8"));
const BASE_URL = (appJson.expo?.experiments?.baseUrl || "").replace(/\/$/, "");

let html = fs.readFileSync(indexPath, "utf8");

const headInjection = `
    <link rel="manifest" href="${BASE_URL}/manifest.json" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="HebrewCards" />
    <meta name="mobile-web-app-capable" content="yes" />
    <link rel="apple-touch-icon" href="${BASE_URL}/favicon.ico" />`;

if (!html.includes('rel="manifest"')) {
  html = html.replace(/<\/head>/i, `${headInjection}\n  </head>`);
}

const swScript = `
    <script>
      if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('${BASE_URL}/sw.js').catch((err) => {
            console.warn('[PWA] service worker registration failed:', err);
          });
        });
      }
    </script>`;

if (!html.includes("serviceWorker.register")) {
  html = html.replace(/<\/body>/i, `${swScript}\n  </body>`);
}

fs.writeFileSync(indexPath, html);
console.log(`[patch-web-pwa] Patched ${indexPath}`);
console.log(`[patch-web-pwa]   base URL  : "${BASE_URL}"`);
console.log(`[patch-web-pwa]   manifest  : ${html.includes('rel="manifest"')}`);
console.log(`[patch-web-pwa]   touch icon: ${html.includes('rel="apple-touch-icon"')}`);
