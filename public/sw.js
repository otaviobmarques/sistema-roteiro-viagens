/* Rotta 365 · service worker (PWA, RF-102 versão inicial)
 * - Páginas abertas ficam guardadas: sem internet, o roteiro e o modo Hoje continuam abrindo.
 * - Arquivos do app e mapas já vistos vêm do cache.
 * - API, login e pagamentos nunca vêm do cache.
 */
const VERSION = "rotta-v2";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const TILES = `${VERSION}-tiles`;
const PRECACHE = ["/offline", "/icons/icon-192.png", "/icons/icon-512.png", "/brand/logo-h.png", "/brand/pino-oi.png", "/brand/pino-partiu.png", "/manifest.webmanifest"];

// Guarda a página "sem internet" junto com os scripts e estilos dela, para abrir completa offline
async function precache() {
  const c = await caches.open(STATIC);
  await c.addAll(PRECACHE.filter((u) => u !== "/offline"));
  const res = await fetch("/offline", { cache: "reload" });
  const html = await res.clone().text();
  await c.put("/offline", res);
  const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)]+/g) || [])];
  await Promise.all(assets.map((a) => c.add(a).catch(() => null)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === "basic") { cache.put(req, res.clone()); trim(cacheName, 80); }
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreVary: true });
    if (hit) return hit;
    if (req.mode === "navigate") return (await caches.match("/offline")) || Response.error();
    return Response.error();
  }
}

async function cacheFirst(req, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") { cache.put(req, res.clone()); if (max) trim(cacheName, max); }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // mapas (OpenFreeMap) e estilos: cache primeiro, limitado
  if (url.hostname === "tiles.openfreemap.org") { event.respondWith(cacheFirst(req, TILES, 600)); return; }
  if (url.origin !== self.location.origin) return;

  // nunca cachear dados sensíveis ou dinâmicos
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/") || url.pathname.startsWith("/admin") || url.pathname.startsWith("/entrar")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/brand/") || url.pathname.startsWith("/maplibre/")) {
    event.respondWith(cacheFirst(req, STATIC, 300));
    return;
  }
  // páginas do app e roteiros públicos (inclui navegação interna do Next): rede primeiro, cópia para offline
  if (req.mode === "navigate" || req.headers.get("RSC") === "1") {
    event.respondWith(networkFirst(req, PAGES));
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

// Lembretes da viagem (push)
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: "Rotta 365", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(d.title || "Rotta 365", {
    body: d.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: d.url || "/app" },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/app";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ("focus" in c) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
