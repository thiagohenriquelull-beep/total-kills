const CACHE = "gol-kills-remote-data-20260713";

const PRECACHE = [
  "./",
  "./index.html?v=remote-data-20260713",
  "./styles.css?v=remote-data-20260713",
  "./remote-config.js?v=remote-data-20260713",
  "./app.js?v=remote-data-20260713",
  "./model-core.js?v=remote-data-20260713",
  "./data/games.js?v=remote-data-20260713",
  "./data/historical-analysis.js?v=remote-data-20260713",
  "./icons/icon-192.png?v=icon-combat-1",
  "./icons/icon-512.png?v=icon-combat-1",
  "./manifest.json?v=icon-combat-1",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const networkFirst =
    event.request.mode === "navigate" ||
    ["script", "style"].includes(event.request.destination) ||
    url.pathname.endsWith("/data/games.js") ||
    url.origin !== self.location.origin;

  if (networkFirst) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type !== "opaque") {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === "opaque") {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }
        });
    })
  );
});

