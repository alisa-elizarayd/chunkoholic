const CACHE_NAME = 'chunkoholic-v10';

const APP_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(cacheName => cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // This worker owns the GitHub Pages app shell only.
  // Never intercept cross-origin requests such as Supabase Auth/Data API.
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (event.request.method !== 'GET') {
    return;
  }

  const isNavigation = event.request.mode === 'navigate' ||
    event.request.destination === 'document';

  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          if (networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then(cache =>
                cache.put(event.request, responseToCache)
              )
            );
          }
          return networkResponse;
        })
        .catch(() =>
          caches.match(event.request).then(cachedResponse =>
            cachedResponse || caches.match('./index.html')
          )
        )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then(networkResponse => {
        if (networkResponse.ok) {
          const responseToCache = networkResponse.clone();
          event.waitUntil(
            caches.open(CACHE_NAME).then(cache =>
              cache.put(event.request, responseToCache)
            )
          );
        }

        return networkResponse;
      });
    })
  );
});
