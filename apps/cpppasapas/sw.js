// ==========================================================
// sw.js — service worker: lets the app open fast and work offline.
// Strategy: show the saved copy right away, then update it in the
// background ("stale-while-revalidate"). Change VERSION to force
// everyone to get fresh files after a big update.
// ==========================================================
const VERSION = 'v1';
const CACHE = 'cpp-pas-a-pas-' + VERSION;
const SHELL = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/app.js', 'js/ui.js', 'js/store.js', 'js/content.js', 'js/quiz.js', 'js/tools.js', 'js/config.js',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('cpp-pas-a-pas-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Only our own files (Firebase + Google handle their own caching).
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/__/')) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(e.request);
    const fresh = fetch(e.request).then(res => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }).catch(() => cached);
    return cached || fresh;
  }));
});
