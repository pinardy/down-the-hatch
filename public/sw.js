// Offline support: cache the app shell on install, serve from cache, refresh in the background,
// and tell the page when that refresh brought back a newer version of the game.
// Bump when the shell changes in a way installed copies must pick up promptly.
const CACHE = "down-the-hatch-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

/** The page itself, as opposed to the icons and manifest beside it. */
const isPage = (request) => request.mode === "navigate" || /\/(index\.html)?$/.test(new URL(request.url).pathname);

/** Tell every open copy of the game that a newer version is now in the cache. */
const announce = () => self.clients.matchAll({ type: "window" }).then((all) => all.forEach((c) => c.postMessage({ type: "update-ready" })));

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      // Kept aside to compare with what the network sends: the copy handed to the page is used up by it.
      const before = cached && isPage(e.request) ? cached.clone() : null;
      const fresh = fetch(e.request)
        .then(async (res) => {
          if (!res.ok) return res;
          const after = before ? res.clone() : null;
          await (await caches.open(CACHE)).put(e.request, res.clone());
          // The game is one file, so a page that differs from the cached one is a new version.
          // Say so only once it is safely in the cache, where a reload will find it.
          if (before && after && (await before.text()) !== (await after.text())) await announce();
          return res;
        })
        .catch(() => cached);
      // Let the background refresh finish even though the page already has its answer.
      e.waitUntil(fresh);
      return cached || fresh;
    }),
  );
});
