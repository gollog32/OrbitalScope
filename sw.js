const CACHE_NAME = "orbitalscope-pwa-v11";
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "https://cdn.tailwindcss.com/3.4.17",
  "https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js",
  "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js",
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json",
  "https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of PRECACHE_URLS) {
        try {
          const req = new Request(url, { cache: "reload" });
          const res = await fetch(req);
          if (res && (res.status === 200 || res.type === "opaque")) {
            await cache.put(url, res);
          }
        } catch (err) {}
      }
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = event.request.url;

  // Live ephemeris APIs: network first, fallback to cache
  if (url.includes("celestrak.org") || url.includes("wheretheiss.at")) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Navigation / HTML shell: serve cached app shell immediately, update in background only if valid OrbitalScope HTML
  const isNav = event.request.mode === "navigate" || (event.request.headers.get("accept") || "").includes("text/html");
  if (isNav) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedIndex =
          (await cache.match("./index.html", { ignoreSearch: true })) ||
          (await cache.match("./", { ignoreSearch: true })) ||
          (await cache.match(event.request, { ignoreSearch: true }));

        const networkPromise = fetch(event.request)
          .then(async (res) => {
            if (res && res.status === 200) {
              const clone = res.clone();
              const txt = await clone.text();
              if (txt && txt.includes("OrbitalScope")) {
                cache.put("./index.html", res.clone());
                cache.put("./", res.clone());
                return res;
              }
            }
            return cachedIndex || res;
          })
          .catch(() => cachedIndex);

        return cachedIndex || networkPromise;
      })
    );
    return;
  }

  // Static assets: cache first, fallback to network and cache
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          if (res && (res.status === 200 || res.type === "opaque")) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
