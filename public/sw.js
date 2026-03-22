const CACHE_VERSION = 1;
const BUILD_ID = "dev";
const DB_NAME = "asset-cache";
const STORE_NAME = "compressed-assets";

// Assets to cache for offline use
const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/favicon.svg",
  "/manifest.json",
];

// ============================================
// IndexedDB Compressed Cache Implementation
// ============================================

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, CACHE_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function getCachedResponse(url) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(url);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function setCachedResponse(url, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(data, url);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function deleteCachedResponse(url) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(url);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function clearAllCache() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Check if CompressionStream is available
const supportsCompression = typeof CompressionStream !== "undefined";

async function compressResponse(response) {
  const contentType = response.headers.get("Content-Type") || "";
  const blob = await response.blob();

  // Skip compression for already compressed formats
  const skipCompression =
    contentType.includes("image/") ||
    contentType.includes("video/") ||
    contentType.includes("audio/") ||
    contentType.includes("application/zip") ||
    contentType.includes("application/gzip");

  if (!supportsCompression || skipCompression) {
    return {
      blob,
      contentType,
      compressed: false,
    };
  }

  // Compress using gzip
  const compressedStream = blob.stream().pipeThrough(new CompressionStream("gzip"));
  const compressedBlob = await new Response(compressedStream).blob();

  return {
    blob: compressedBlob,
    contentType,
    compressed: true,
  };
}

async function decompressToResponse(cached) {
  if (!cached) return null;

  const { blob, contentType, compressed } = cached;

  let bodyStream;
  if (compressed && supportsCompression) {
    // Decompress using stream - this allows streaming from disk
    bodyStream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
  } else {
    bodyStream = blob.stream();
  }

  return new Response(bodyStream, {
    headers: {
      "Content-Type": contentType,
    },
  });
}

// ============================================
// Service Worker Event Handlers
// ============================================

// Install event: precache essential assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      for (const url of PRECACHE_ASSETS) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            const compressed = await compressResponse(response);
            await setCachedResponse(url, compressed);
          }
        } catch (err) {
          console.warn(`Failed to precache ${url}:`, err);
        }
      }
    })()
  );
  self.skipWaiting();
});

// Activate event: take control of all clients immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Message handler for update-related commands
self.addEventListener("message", (event) => {
  if (event.data?.type === "GET_BUILD_ID") {
    event.ports[0].postMessage({ buildId: BUILD_ID });
  } else if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (event.data?.type === "CLEAR_CACHE") {
    event.waitUntil(clearAllCache());
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

  // Skip version.json to always get fresh version
  if (url.pathname === "/version.json") {
    return;
  }

  event.respondWith(
    (async () => {
      const cacheKey = url.pathname;

      // Try to get from compressed cache
      try {
        const cached = await getCachedResponse(cacheKey);
        if (cached) {
          // Return cached response and update cache in background
          event.waitUntil(
            (async () => {
              try {
                const response = await fetch(event.request);
                if (response.ok) {
                  const compressed = await compressResponse(response);
                  await setCachedResponse(cacheKey, compressed);
                }
              } catch {
                // Network failed, ignore
              }
            })()
          );
          return await decompressToResponse(cached);
        }
      } catch {
        // Cache read failed, continue to network
      }

      // Not in cache, fetch from network and cache
      try {
        const response = await fetch(event.request);
        if (!response.ok) {
          return response;
        }

        // Clone before consuming
        const responseToCache = response.clone();

        // Cache in background
        event.waitUntil(
          (async () => {
            try {
              const compressed = await compressResponse(responseToCache);
              await setCachedResponse(cacheKey, compressed);
            } catch (err) {
              console.warn(`Failed to cache ${cacheKey}:`, err);
            }
          })()
        );

        return response;
      } catch {
        // Network failed and not in cache
        // Return offline page for navigation requests
        if (event.request.mode === "navigate") {
          const cached = await getCachedResponse("/");
          if (cached) {
            return await decompressToResponse(cached);
          }
        }
        return new Response("Offline", { status: 503 });
      }
    })()
  );
});
