const CACHE_NAME = "rudelbar-v21";

const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./rudelbar-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
  );

  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
  );

  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)

      .then(response => {
        const kopie = response.clone();

        caches
          .open(CACHE_NAME)
          .then(cache =>
            cache.put(
              event.request,
              kopie
            )
          );

        return response;
      })

      .catch(async () => {
        const cached = await caches.match(event.request);

        if (cached) {
          return cached;
        }

        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }

        throw new Error("Offline und nicht im Cache");
      })
  );
});