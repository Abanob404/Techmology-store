self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('technology-store-v1').then((cache) => cache.addAll([
      '/',
      '/products',
      '/services',
      '/app.js',
      '/style.css',
      '/logo.png',
      '/favicon.svg'
    ])),
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request)),
  );
});
