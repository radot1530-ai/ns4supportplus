const CACHE_VERSION = 'ns4-v2';
const CACHE_NAME = CACHE_VERSION;

// ⚠️ Ajiste lis sa a pou l matche EGZAKTEMAN non fichye ki nan /docs ou a
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/home.html', '/home.js',
  '/login.html',
  '/inscription.html',
  '/pwofil.html', '/pwofil.js',
  '/ranking.html', '/ranking.js',
  '/quiz.html',
  '/milti.html', '/milti.js',
  '/defi.html', '/defi.js',
  '/exam.html',
  '/fòmil.html',
  '/vocab.html',
  '/paramèt.html', '/paramet.js',
  '/stats.js',
  '/notifications.js',
  '/tyle.css',
  '/offline.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(URLS_TO_CACHE).catch((err) => console.warn('Cache pasyèl:', err))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((n) => n !== CACHE_NAME && caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Firebase, Google Fonts, elt. — pa entèsepte, kite rezo a jere yo dirèkteman
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    // Network-first: eseye rezo a pou toujou gen dènye vèsyon an lè online
    fetch(event.request)
      .then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      })
      .catch(() =>
        // Rezo echwe → tonbe sou kach la
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') return caches.match('/offline.html');
        })
      )
  );
});