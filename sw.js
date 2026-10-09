// Офлайн-кэш: приложение открывается без интернета после первого запуска.
const CACHE = 'kt-v4';
const ASSETS = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/app.js', 'js/engine.js', 'js/ai.js', 'js/coach.js', 'js/equity.js',
  'js/evaluator.js', 'js/handinfo.js', 'js/preflop.js', 'js/cards.js', 'js/rig.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Сначала сеть (чтобы обновления приходили сразу). Если сеть молчит дольше 2,5 с или её нет — берём из кэша.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const cacheable = url.origin === location.origin || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com');
  if (!cacheable) return;
  e.respondWith((async () => {
    const net = fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    });
    const cached = await caches.match(req, { ignoreSearch: true });
    if (!cached) {
      try { return await net; } catch {
        return (req.mode === 'navigate' && (await caches.match('index.html'))) || Response.error();
      }
    }
    const slow = new Promise((resolve) => setTimeout(() => resolve(cached), 2500));
    return Promise.race([net.catch(() => cached), slow]);
  })());
});
