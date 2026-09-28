// Service Worker — Itineraris PWA
// Guarda l'app shell i els fitxers Firebase CDN per funcionar offline

const APP_CACHE  = 'itineraris-app-v3';
const CDN_CACHE  = 'itineraris-cdn-v2';
const TILE_CACHE = 'itineraris-tiles-v1';
const TILE_MAX   = 1500; // màxim de rajoles de mapa guardades

// Fitxers de l'app que es guarden en instal·lar el SW
const APP_SHELL = [
  '/itineraris/',
  '/itineraris/index.html',
];

// Firebase CDN — es guarden la primera vegada que es carreguen
const FIREBASE_CDN_ORIGIN = 'www.gstatic.com';

// ── Instal·lació: guarda l'app shell ──────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activació: neteja caches velles ──────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== APP_CACHE && k !== CDN_CACHE && k !== TILE_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: estratègia per cada tipus de recurs ───────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Firebase Storage / Auth / Firestore API → xarxa sempre (Firebase gestiona l'offline)
  if (
    url.hostname.includes('firebasestorage.googleapis.com') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('firebase.googleapis.com')
  ) {
    return; // deixa que el navegador ho gestioni (Firebase SDK ho controla)
  }

  // Rajoles del mapa OpenStreetMap → caché primer (les rutes ja vistes es veuen offline)
  if (url.hostname === 'tile.openstreetmap.org') {
    event.respondWith(
      caches.open(TILE_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok || response.type === 'opaque') {
              cache.put(event.request, response.clone()).then(() => trimCache(cache, TILE_MAX));
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // Firebase CDN (SDK JS) i Leaflet (cdnjs) → caché primer, xarxa si no hi és
  if (url.hostname === FIREBASE_CDN_ORIGIN || url.hostname === 'cdnjs.cloudflare.com') {
    event.respondWith(
      caches.open(CDN_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok || response.type === 'opaque') cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached); // si falla la xarxa i hi ha caché, usa-la
        })
      )
    );
    return;
  }

  // App shell (mateixa origen) → caché primer, xarxa de fons per actualitzar
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(APP_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          const networkFetch = fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => null);

          // Retorna la caché immediatament (offline funciona), actualitza en segon pla
          return cached || networkFetch;
        })
      )
    );
    return;
  }
});

// ── Limita la mida d'una caché esborrant les entrades més antigues ──
async function trimCache(cache, max) {
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)));
}
