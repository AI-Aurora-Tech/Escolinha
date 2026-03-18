const CACHE_NAME = 'martinica-cache-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/logo.svg',
  '/manifest.json'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // Força a atualização imediata
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Assume o controle imediatamente
  );
});

self.addEventListener('fetch', event => {
  // Ignora requisições que não sejam GET (como POST, PUT, DELETE para APIs)
  if (event.request.method !== 'GET') return;

  // Estratégia Network First (Tenta a rede primeiro, depois o cache)
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Se a requisição for bem sucedida, atualiza o cache
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Se a rede falhar, busca no cache
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Fallback para index.html em caso de navegação offline
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});
