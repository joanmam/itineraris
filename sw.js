// Service Worker — Itineraris PWA
// Guarda l'app shell i els fitxers Firebase CDN per funcionar offline

const APP_CACHE = 'itineraris-app-v1';
const CDN_CACHE = 'itineraris-cdn-v1';

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
          .filter(k => k !== APP_CACHE && k !== CDN_CACHE)
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

  // Firebase CDN (SDK JS) → caché primer, xarxa si no hi és
  if (url.hostname === FIREBASE_CDN_ORIGIN) {
    event.respondWith(
      caches.open(CDN_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
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
