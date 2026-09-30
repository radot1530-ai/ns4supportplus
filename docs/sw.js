const DB_NAME = 'ns4-offline-db';
const DB_VERSION = 1;
const STORE_NAME = 'files';
const MANIFEST_VERSION = 'v5';

const BASE_PATH = new URL('.', self.location).pathname;

// 🔵 Noms de fichiers corrigés (style.css, paramet.html)
const FILE_NAMES = [
  'index.html',
  'ads.js', 'nav.js',
  'defi.html', 'defi.js',
  'exam.html',
  'fòmil.html',
  'home.html', 'home.js',
  'inscription.html',
  'login.html',
  'milti.html', 'milti.js',
  'notifications.js',
  'ns4-content.js',
  'ns4-correction.js',
  'ns4-math.js',
  'paramet.js', 'paramet.html', // Corrigé (sans accent pour éviter les bugs WebView)
  'pwofil.html', 'pwofil.js',
  'quiz.html', 'quiz.js',
  'ranking.html', 'ranking.js',
  'stats.js',
  'style.css',                  // Corrigé (style.css au lieu de tyle.css)
  'vocab.html'
];

const ALL_FILES = FILE_NAMES.map((f) => BASE_PATH + f);
const ROOT_ALIAS = BASE_PATH;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(data, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function broadcast(msg) {
  const clientsList = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  clientsList.forEach((client) => client.postMessage(msg));
}

async function downloadAllFiles() {
  const total = ALL_FILES.length;
  let done = 0;
  await broadcast({ type: 'dl-start', done: 0, total });

  await Promise.all(ALL_FILES.map(async (url) => {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) { console.warn('SW: 404 sou', url); return; }
      const body = await res.blob();
      const contentType = res.headers.get('content-type') || '';
      await idbPut(url, { body, contentType, manifestVersion: MANIFEST_VERSION });

      if (url === BASE_PATH + 'index.html') {
        await idbPut(ROOT_ALIAS, { body, contentType, manifestVersion: MANIFEST_VERSION });
      }
    } catch (e) {
      console.warn('SW: erè telechajman', url, e);
    } finally {
      done++;
      await broadcast({ type: 'dl-progress', done, total });
    }
  }));

  await broadcast({ type: 'dl-complete', done, total });
}

self.addEventListener('install', (event) => {
  event.waitUntil(downloadAllFiles().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  // 🔵 Ne relance pas downloadAllFiles() ici pour éviter les téléchargements en double
  event.waitUntil(self.clients.claim());
});

// 🔵 Stratégie optimisée : Chercher d'abord dans le Cache / IndexedDB
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    // 1. Regarder si le fichier est déjà dans IndexedDB
    const cached = await idbGet(url.pathname);
    if (cached) {
      return new Response(cached.body, { headers: { 'Content-Type': cached.contentType } });
    }

    // 2. Sinon, essayer de le récupérer en réseau
    try {
      const res = await fetch(event.request);
      if (res && res.ok) {
        const clone = res.clone();
        const body = await clone.blob();
        const contentType = res.headers.get('content-type') || '';
        idbPut(url.pathname, { body, contentType, manifestVersion: MANIFEST_VERSION });
      }
      return res;
    } catch (e) {
      // 3. Repli si aucune donnée
      if (event.request.mode === 'navigate') {
        const fallback = await idbGet(BASE_PATH + 'index.html');
        if (fallback) return new Response(fallback.body, { headers: { 'Content-Type': fallback.contentType } });
      }
      return new Response('Offline — done pa disponib.', { status: 503 });
    }
  })());
});