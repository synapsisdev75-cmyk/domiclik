/* DomiClick PWA — network-first para no servir datos/JS viejos */
const CACHE = 'domiclick-v11-shell';
const PRECACHE = [
  '/manifest.webmanifest',
  '/brand/logo-mark.png',
  '/brand/logo-192.png',
  '/brand/favicon.png',
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

  // Nunca cachear módulos JS/CSS ni HTML de la app — siempre red (tiempo real)
  const isAppCode =
    url.origin === self.location.origin &&
    (url.pathname === '/' ||
      url.pathname.endsWith('.html') ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css') ||
      url.pathname.startsWith('/src/') ||
      url.pathname.startsWith('/assets/') ||
      url.pathname.includes('@'));

  if (isAppCode) {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(() => caches.match(request))
    );
    return;
  }

  // Solo assets estáticos de marca en cache
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
      .catch(() => caches.match(request))
  );
});
