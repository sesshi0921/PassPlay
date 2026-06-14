const CACHE_NAME = 'passplay-BUILD_VERSION';
const CORE_ASSETS = [
  './',
  './index.html',
  './play.html',
  './app.js',
  './styles.css',
  './manifest.json',
  './games.json',
  './icon.svg',
  './core/plugin-host.css',
  './core/plugin-host.js',
  './core/plugin-sdk.js',
  './core/plugin-api.d.ts',
  './core/plugin-manifest.schema.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const manifestResponse = await fetch(new URL('./games.json', self.registration.scope), { cache: 'no-cache' });
    const plugins = manifestResponse.ok ? await manifestResponse.clone().json() : [];
    const pluginAssets = Array.isArray(plugins)
      ? plugins.flatMap(plugin => plugin.assets.map(asset => `./games/${plugin.id}/${asset}`))
      : [];
    const assets = [...new Set([...CORE_ASSETS, ...pluginAssets])];

    await Promise.all(assets.map(asset => (
      cache.add(new URL(asset, self.registration.scope)).catch(() => {
        console.warn(`Failed to cache: ${asset}`);
      })
    )));
  })());
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
        return caches.match(new URL('./index.html', self.registration.scope));
      });
    })
  );
});
