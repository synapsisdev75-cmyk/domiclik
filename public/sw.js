/* DomiClick PWA — v18: mapa sectores CARTO rastertiles */
const CACHE = 'domiclick-v18-shell';
const PRECACHE = [
  '/manifest.webmanifest',
  '/brand/ops-favicon.png',
  '/brand/ops-logo-192.png',
  '/brand/logo-mark.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  const isAppCode =
    url.origin === self.location.origin &&
    (url.pathname === '/' ||
      url.pathname.endsWith('.html') ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css') ||
      url.pathname.startsWith('/src/') ||
      url.pathname.startsWith('/assets/') ||
      url.pathname.includes('@'));

  // Código de la app: solo red. Evita pantalla en blanco por JS viejo en caché.
  if (isAppCode) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (
          response &&
          response.status === 200 &&
          response.type === 'basic' &&
          url.pathname.startsWith('/brand/')
        ) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});
