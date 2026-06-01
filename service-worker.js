const CACHE_NAME = 'passplay-BUILD_VERSION';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/games.json',
  '/games/word-wolf/index.html',
  '/games/word-wolf/game.js',
  '/games/word-wolf/style.css',
  '/games/word-wolf/words.json',
  '/games/othello/index.html',
  '/games/othello/game.js',
  '/games/othello/style.css',
  '/games/ranking-game/index.html',
  '/games/ranking-game/game.js',
  '/games/ranking-game/style.css',
  '/games/story-chain/index.html',
  '/games/story-chain/game.js',
  '/games/story-chain/style.css',
  '/games/haiku575/index.html',
  '/games/haiku575/game.js',
  '/games/haiku575/style.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {
        console.warn('Some assets failed to cache');
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== location.origin) {
    return;
  }

  if (request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(request).then((response) => {
      if (response) {
        return response;
      }
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });
        return response;
      }).catch(() => {
        return caches.match('/index.html');
      });
    })
  );
});
