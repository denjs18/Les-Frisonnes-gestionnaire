/*
 * Service worker de Prépa Commandes : permet d'ouvrir l'appli sans connexion une fois qu'elle a été chargée.
 * - Pages : le réseau d'abord (toujours la dernière version), le cache si le réseau est absent ou trop lent.
 * - Fichiers /_next/static et icônes : le cache d'abord (leurs noms changent à chaque mise à jour).
 * Rien d'autre n'est intercepté, et aucune donnée de l'utilisateur n'est stockée ici.
 */
const VERSION = "v1";
const STATIC_CACHE = `prepa-static-${VERSION}`;
const PAGES_CACHE = `prepa-pages-${VERSION}`;
const PAGES = ["/", "/verification", "/preparation", "/fin", "/reglages", "/aide"];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== STATIC_CACHE && key !== PAGES_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Charge toutes les pages et les fichiers dont elles ont besoin, pour que chaque écran marche hors connexion.
async function precache() {
  const pages = await caches.open(PAGES_CACHE);
  const statics = await caches.open(STATIC_CACHE);
  const assets = new Set();
  await Promise.allSettled(
    PAGES.map(async (path) => {
      const response = await fetch(path, { cache: "reload" });
      if (!response.ok) return;
      await pages.put(path, response.clone());
      const html = await response.text();
      for (const match of html.matchAll(/\/_next\/static\/[^"'\\\s)<>]+/g)) assets.add(match[0]);
    }),
  );
  await Promise.allSettled([...assets].map((url) => statics.add(url)));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(pageNetworkFirst(request));
  } else if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(staticCacheFirst(request));
  }
});

async function pageNetworkFirst(request) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS)),
    ]);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = (await cache.match(request, { ignoreSearch: true })) || (await cache.match("/"));
    return cached || Response.error();
  }
}

async function staticCacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}
