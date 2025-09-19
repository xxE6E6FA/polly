/*
  Minimal service worker for Polly
  - Caches the app shell for offline navigation
  - Uses stale-while-revalidate for static assets
*/

const CACHE_VERSION = "v1";
const APP_SHELL_CACHE = `polly-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `polly-runtime-${CACHE_VERSION}`;

// Core routes/assets to keep the SPA available offline
const APP_SHELL_URLS = [
  "/",
  "/index.html",
  "/favicon.svg",
  "/og-image.png",
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      // Remove old caches
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => ![APP_SHELL_CACHE, RUNTIME_CACHE].includes(k))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Basic helper to decide if a request is for navigation (SPA route)
function isNavigationRequest(request) {
  return (
    request.mode === "navigate" ||
    (request.method === "GET" &&
      request.headers.get("accept")?.includes("text/html"))
  );
}

// Runtime caching: stale-while-revalidate for static assets
self.addEventListener("fetch", event => {
  const { request } = event;

  // Never intercept non-GET requests
  if (request.method !== "GET") return;

  // SPA navigation: serve cached index.html as fallback when offline
  if (isNavigationRequest(request)) {
    event.respondWith(
      (async () => {
        try {
          // Network first for fresh content
          const net = await fetch(request);
          // Update shell cache opportunistically
          const cache = await caches.open(APP_SHELL_CACHE);
          cache.put("/index.html", net.clone());
          return net;
        } catch (_err) {
          // Offline fallback
          const cache = await caches.open(APP_SHELL_CACHE);
          return (await cache.match("/index.html")) || Response.error();
        }
      })()
    );
    return;
  }

  // Static assets: css/js/fonts/images
  const url = new URL(request.url);
  const isStatic =
    /\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|gif|webp|svg)$/.test(
      url.pathname
    ) || url.pathname.startsWith("/assets/");

  if (isStatic) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      const networkFetch = fetch(request)
        .then(response => {
          // Only cache successful, basic or opaque responses
          if (
            response &&
            (response.type === "basic" || response.type === "opaque") &&
            response.status === 200
          ) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached);
      // Return cached immediately if present; otherwise wait for network
      return cached || networkFetch;
    })());
  }
});

// Optional: allow clients to request cache reset
self.addEventListener("message", event => {
  if (event.data === "CLEAR_POLLY_CACHES") {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      })()
    );
  }
});
