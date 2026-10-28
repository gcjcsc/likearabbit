// Keeps the app usable with no signal: everything is fetched fresh when online and the last good copy
// is saved, so the herd (as of the last time it loaded) still opens offline. Saving changes needs a connection.

const CACHE = "mcf-v5";
const SHELL = ["/", "/app.js", "/styles.css", "/favicon.svg", "/manifest.webmanifest", "/icons/apple-touch-icon.png", "/pedigree-pdf.js", "/photos.js", "/reminders.js", "/vendor/jspdf.umd.min.js"];

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

// Photo bytes never change once uploaded, so a saved copy is always right
const cacheFirst = async (request) => {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(request);
  if (saved) return saved;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return;

  if (url.pathname === "/api/data") return event.respondWith(networkFirst(request, "/api/data"));
  if (url.pathname.startsWith("/api/photos/")) return event.respondWith(cacheFirst(request));
  if (url.pathname.startsWith("/api/") || url.pathname === "/login") return;
  // Every page of the app is the same document; the part after # picks the view
  if (request.mode === "navigate") {
    // Only the app itself; other pages (like the public sale page) are left to the network
    if (url.pathname === "/") event.respondWith(networkFirst(request, "/"));
    return;
  }
  event.respondWith(networkFirst(request, url.pathname));
});


// Phone notifications sent by the Worker's daily job
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "MCF Rabbitry", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).pathname === "/");
      return open ? open.focus().then(() => open.navigate(url)) : self.clients.openWindow(url);
    })
  );
});
