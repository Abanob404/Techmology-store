const CACHE_NAME = 'technology-store-v8-commerce-analytics-1';
const APP_SHELL = [
  '/',
  '/products',
  '/services',
  '/app.js',
  '/v8.js',
  '/style.css',
  '/theme.css',
  '/logo.webp',
  '/main-banner.webp',
  '/favicon.svg',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512-maskable.png',
  '/assets/no-image.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.all(
      APP_SHELL.map((url) => cache.add(url).catch(() => null))
    ))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  const isImage = request.destination === 'image';
  if (isImage) {
    // Stale-while-revalidate for local images: fast display, but refresh changed files.
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request).then((response) => {
          if (response && response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Network-first prevents old JS/CSS/HTML from being stuck in the service-worker cache.
  event.respondWith(
    fetch(request).then((response) => {
      if (response && response.ok) {
        caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      }
      return response;
    }).catch(() => caches.match(request))
  );
});


// Optional Web Push. This listener is harmless when push is not configured.
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let data = {};
    try {
      if (event.data) data = event.data.json();
      else {
        const response = await fetch('/api/push/latest', { cache: 'no-store' });
        if (response.ok) data = await response.json();
      }
    } catch (_) {
      try { data = { body: event.data ? event.data.text() : '' }; } catch (_) { data = {}; }
    }
    const title = data.title || 'TECHNOLOGY STORE';
    const options = {
      body: data.body || 'لدينا تحديث جديد في المتجر',
      icon: data.icon || '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/products' },
      tag: 'technology-store-offer',
      renotify: false,
      dir: 'rtl',
      lang: 'ar'
    };
    await self.registration.showNotification(title, options);
  })());
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification?.data?.url || '/products';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const client of list) {
      if ('focus' in client && new URL(client.url).origin === self.location.origin) {
        if ('navigate' in client) return client.navigate(target).then(() => client.focus());
        return client.focus();
      }
    }
    return clients.openWindow ? clients.openWindow(target) : null;
  }));
});
