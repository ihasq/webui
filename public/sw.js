const CACHE_NAME = "chat-pwa-v1";
const BUILD_ID = "dev";

// Assets to cache for offline use
const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/favicon.svg",
  "/manifest.json",
];

// Install event: precache essential assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Message handler for update-related commands
self.addEventListener("message", (event) => {
  if (event.data?.type === "GET_BUILD_ID") {
    event.ports[0].postMessage({ buildId: BUILD_ID });
  } else if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Fetch event: cache-first for app assets, network-first for API requests
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") {
    return;
  }

  // Network-only for API requests (external LLM endpoints)
  if (url.origin !== self.location.origin) {
    return;
  }

  // Cache-first strategy for app assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached response and update cache in background
        event.waitUntil(
          fetch(event.request)
            .then((response) => {
              if (response.ok) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, response);
                });
              }
            })
            .catch(() => {
              // Network failed, ignore
            })
        );
        return cachedResponse;
      }

      // Not in cache, fetch from network and cache
      return fetch(event.request)
        .then((response) => {
          if (!response.ok) {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        })
        .catch(() => {
          // Network failed and not in cache
          // Return offline page for navigation requests
          if (event.request.mode === "navigate") {
            return caches.match("/");
          }
          return new Response("Offline", { status: 503 });
        });
    })
  );
});
