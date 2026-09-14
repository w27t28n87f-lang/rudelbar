const CACHE_NAME = "rudelbar-runtime-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./Logo-Haupt.png",
  "./Logo-Mobile_Kneipe.png",
  "./Logo-Mode.png",
  "./Logo-Service.png"
];

const ALWAYS_FRESH = new Set([
  "index.html",
  "style.css",
  "app.js",
  "manifest.json"
]);

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Fremde Quellen, z. B. Supabase-CDN, nicht in unseren App-Cache zwingen.
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(event.request));
    return;
  }

  const fileName = url.pathname.split("/").pop() || "index.html";
  const istNavigation = event.request.mode === "navigate";
  const immerFrisch = istNavigation || ALWAYS_FRESH.has(fileName);

  if (immerFrisch) {
    // Für Code und HTML online immer die aktuelle GitHub-Version anfordern.
    // Der Cache dient hier nur als Offline-Fallback.
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
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

          if (istNavigation) {
            return caches.match("./index.html");
          }

          return Response.error();
        })
    );
    return;
  }

  // Bilder und sonstige statische Dateien: Cache nutzen, im Hintergrund aktualisieren.
  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached || Response.error());

      return cached || network;
    })
  );
});
