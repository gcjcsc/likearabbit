// Keeps the app usable with no signal: everything is fetched fresh when online and the last good copy
// is saved, so the herd (as of the last time it loaded) still opens offline. Saving changes needs a connection.

const CACHE = "mcf-v3";
const SHELL = ["/", "/app.js", "/styles.css", "/favicon.svg", "/manifest.webmanifest", "/icons/apple-touch-icon.png", "/pedigree-pdf.js", "/vendor/jspdf.umd.min.js"];

self.addEventListener("install", (event) => {
  // Signed-out installs get redirected to /login; skip those rather than caching the redirect
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(SHELL.map((url) => fetch(url).then((res) => res.ok && !res.redirected && cache.put(url, res)).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Online: use the network and save a copy. Offline: fall back to the saved copy, marked so the app can say so.
const networkFirst = async (request, cacheKey) => {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok && res.type === "basic") cache.put(cacheKey, res.clone());
    return res;
  } catch (err) {
    const saved = await cache.match(cacheKey);
    if (!saved) throw err;
    const headers = new Headers(saved.headers);
    headers.set("X-Offline", "1");
    return new Response(saved.body, { status: saved.status, headers });
  }
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return;

  if (url.pathname === "/api/data") return event.respondWith(networkFirst(request, "/api/data"));
  if (url.pathname.startsWith("/api/") || url.pathname === "/login") return;
  // Every page of the app is the same document; the part after # picks the view
  if (request.mode === "navigate") return event.respondWith(networkFirst(request, "/"));
  event.respondWith(networkFirst(request, url.pathname));
});

