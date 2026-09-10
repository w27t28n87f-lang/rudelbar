const CACHE_NAME = "rudelbar-v91";

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./Logo-Haupt.png",
  "./Logo-Mobile_Kneipe.png",
  "./Logo-Mode.png",
  "./Logo-Service.png",
  "./assets/invoice-mode-header.jpg",
  "./assets/invoice-service-header.jpg",
  "./assets/invoice-security-header.jpg",
  "./assets/creator/hoodie.jpg",
  "./assets/creator/tshirt.jpg",
  "./assets/creator/polo.jpg",
  "./assets/creator/sweat.jpg",
  "./assets/creator/zip.jpg",
  "./assets/creator/softshell.jpg",
  "./assets/creator/tank.jpg",
  "./assets/creator/cap.jpg",
  "./assets/creator/bag.jpg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && (response.ok || response.type === "opaque")) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(event.request)) || Response.error())
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;

        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }

        return Response.error();
      })
  );
});
