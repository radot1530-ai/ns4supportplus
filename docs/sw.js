const DB_NAME = 'ns4-offline-db';
const DB_VERSION = 1;
const STORE_NAME = 'files';
const MANIFEST_VERSION = 'v3'; // 🔵 monte chak fwa lis ALL_FILES chanje

const ALL_FILES = [
  '/', '/index.html',
  '/defi.html', '/defi.js',
  '/exam.html',
  '/fòmil.html',
  '/home.html', '/home.js',
  '/inscription.html',
  '/login.html',
  '/milti.html', '/milti.js',
  '/notifications.js',
  '/ns4-content.js',
  '/ns4-correction.js',
  '/ns4-math.js',
  '/paramet.js', '/paramèt.html',
  '/pwofil.html', '/pwofil.js',
  '/quiz.html', '/quiz.js',
  '/ranking.html', '/ranking.js',
  '/stats.js',
  '/tyle.css',
  '/vocab.html'
];

/* ---------- IndexedDB helpers ---------- */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(url, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(data, url);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(url) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(url);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/* ---------- Telechaje TOUT fichye yo pwoaktivman ---------- */
async function downloadAllFiles() {
  await Promise.all(ALL_FILES.map(async (url) => {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return;
      const body = await res.blob();
      const contentType = res.headers.get('content-type') || '';
      await idbPut(url, { body, contentType, manifestVersion: MANIFEST_VERSION });
    } catch (e) {
      console.warn('SW: pa t kapab telechaje', url, e);
    }
  }));
}

/* ---------- Cycle de vie ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(downloadAllFiles().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim().then(() => downloadAllFiles()));
});

/* ---------- Sèvi paj yo: rezo an premye, IndexedDB an sekou ---------- */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
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
      const cached = await idbGet(url.pathname === '/' ? '/' : url.pathname);
      if (cached) {
        return new Response(cached.body, { headers: { 'Content-Type': cached.contentType } });
      }
      if (event.request.mode === 'navigate') {
        const fallback = await idbGet('/index.html');
        if (fallback) return new Response(fallback.body, { headers: { 'Content-Type': fallback.contentType } });
      }
      return new Response('Offline — done pa disponib.', { status: 503 });
    }
  })());
});