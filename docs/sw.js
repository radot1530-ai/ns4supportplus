const DB_NAME = 'ns4-offline-db';
const DB_VERSION = 1;
const STORE_NAME = 'files';
const MANIFEST_VERSION = 'v4';

// 🔵 Kalkile otomatikman chemen baz la (egzanp "/radot1530-ai/")
const BASE_PATH = new URL('.', self.location).pathname;

const FILE_NAMES = [
  'index.html',
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
  'paramet.js', 'paramèt.html',
  'pwofil.html', 'pwofil.js',
  'quiz.html', 'quiz.js',
  'ranking.html', 'ranking.js',
  'stats.js',
  'questions.js',
  'tyle.css',
  'vocab.html'
];

// Chemen konplè pou chak fichye, ansanm ak alyas pou "/" (rasin app la)
const ALL_FILES = FILE_NAMES.map((f) => BASE_PATH + f);
const ROOT_ALIAS = BASE_PATH; // egzanp "/radot1530-ai/" → menm kontni ak index.html

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

async function downloadAllFiles() {
  const total = ALL_FILES.length;
  let done = 0;
  const clientsList = await self.clients.matchAll({ includeUncontrolled: true });
  const broadcast = (msg) => clientsList.forEach((c) => c.postMessage(msg));
  
  broadcast({ type: 'dl-start', total });
  
  await Promise.all(ALL_FILES.map(async (url) => {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const body = await res.blob();
        const contentType = res.headers.get('content-type') || '';
        await idbPut(url, { body, contentType, manifestVersion: MANIFEST_VERSION });
        if (url === BASE_PATH + 'index.html') {
          await idbPut(ROOT_ALIAS, { body, contentType, manifestVersion: MANIFEST_VERSION });
        }
      }
    } catch (e) {
      console.warn('SW: erè telechajman', url, e);
    } finally {
      done++;
      broadcast({ type: 'dl-progress', done, total });
    }
  }));
  
  broadcast({ type: 'dl-complete', done, total });
}
self.addEventListener('install', (event) => {
  event.waitUntil(downloadAllFiles().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim().then(() => downloadAllFiles()));
});

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
      const cached = await idbGet(url.pathname);
      if (cached) return new Response(cached.body, { headers: { 'Content-Type': cached.contentType } });
      
      if (event.request.mode === 'navigate') {
        const fallback = await idbGet(BASE_PATH + 'index.html');
        if (fallback) return new Response(fallback.body, { headers: { 'Content-Type': fallback.contentType } });
      }
      return new Response('Offline — done pa disponib.', { status: 503 });
    }
  })());
});