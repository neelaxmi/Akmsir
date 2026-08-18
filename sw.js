const CACHE_NAME = 'neelaxmi-cache-v3'; // Changed to v3 to force update
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/offline.html',
  '/pictures/neelaxmi.jpg',
  '/manifest.json'
];

// Install: Cache critical files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching app shell');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting(); // Activate new SW immediately
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});


self.addEventListener('fetch', (event) => {
  // 1. Logic for Page Navigation
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
      .catch(() => {
        return caches.match(event.request)
          .then((response) => response || caches.match('/offline.html'));
      })
    );
    return; // Stop here for navigation
  }

  // 2. Logic for Assets (CSS, JS, Images) - CRITICAL FOR PC INSTALL
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});