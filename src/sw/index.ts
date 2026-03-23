/**
 * Service Worker with Streaming Bundle Installation
 *
 * Extracts bundle.tar.zst progressively and serves files as they become available.
 * Sends APP_READY message as soon as index.html is extracted.
 */

/// <reference lib="webworker" />

import { get, set, createStore } from "idb-keyval";
import { extractBundleStreaming, getCachedAsset, updateCachedAssetCompressed } from "./bundle-extractor";

declare const self: ServiceWorkerGlobalScope;

// These will be replaced by generate-sw.mjs
const BUILD_ID: string = "%%BUILD_ID%%";
const BUNDLE_INFO: { url: string; size: number; hash: string } | null = JSON.parse("%%BUNDLE_INFO%%");

// Meta store for build tracking (separate DB from assets)
const metaStore = createStore("sw-meta", "store");

// Flag to indicate index.html is ready and clients should be notified on activate
let indexHtmlReady = false;

// Flag to indicate extraction is complete
let extractionComplete = false;

/**
 * Wait for an asset to be extracted (polling with timeout)
 */
async function waitForAsset(
  pathname: string,
  maxWaitMs: number = 30000,
  intervalMs: number = 50
): Promise<{ blob: Blob; contentType: string; compressed: boolean } | undefined> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const cached = await getCachedAsset(pathname);
    if (cached) return cached;
    if (extractionComplete) return undefined; // Extraction done but file not found
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return undefined; // Timeout
}

/**
 * Notify all clients that app is ready
 */
async function notifyAppReady() {
  // includeUncontrolled: true is required during install phase
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  for (const client of clients) {
    client.postMessage({ type: "APP_READY" });
  }
}

/**
 * Decompress gzip response
 */
function decompressResponse(blob: Blob, contentType: string, compressed: boolean): Response {
  let bodyStream: ReadableStream<Uint8Array>;

  if (compressed && typeof DecompressionStream !== "undefined") {
    bodyStream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
  } else {
    bodyStream = blob.stream();
  }

  return new Response(bodyStream, {
    headers: { "Content-Type": contentType },
  });
}

/**
 * Install event: Extract bundle with streaming
 */
self.addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      try {
        // Check if already extracted with same build
        const installedBuild = await get("buildId", metaStore);
        if (installedBuild === BUILD_ID) {
          self.skipWaiting();
          return;
        }

        // Extract bundle with streaming
        if (BUNDLE_INFO) {
          // Use a promise that resolves when index.html is ready
          await new Promise<void>((resolveInstall) => {
            // Start extraction - don't await the full process
            extractBundleStreaming(BUNDLE_INFO, async (path) => {
              // When index.html (app entry) is ready, complete install
              if (path === "/index.html") {
                indexHtmlReady = true;
                resolveInstall();
              }
            }).then(async () => {
              // This runs in background after install completes
              extractionComplete = true;
              await set("buildId", BUILD_ID, metaStore);
            });
          });
        }

        // Skip waiting to activate immediately
        self.skipWaiting();
      } catch {
        // Installation failed - let browser handle retry
      }
    })()
  );
});

/**
 * Activate event: Claim all clients and notify if index.html is ready
 */
self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();

      // If index.html was extracted during install, notify clients
      if (indexHtmlReady) {
        await notifyAppReady();
      }
    })()
  );
});

/**
 * Message handler
 */
self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data?.type === "GET_BUILD_ID") {
    event.ports[0]?.postMessage({ buildId: BUILD_ID });
  } else if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/**
 * Compress blob in background and update cache
 */
function compressInBackground(pathname: string, blob: Blob, contentType: string): void {
  // Skip compression for already-compressed formats
  if (
    contentType.startsWith("image/") ||
    contentType.startsWith("video/") ||
    contentType.startsWith("audio/") ||
    contentType.includes("font/")
  ) {
    return;
  }

  const chunks: BlobPart[] = [];

  // Compress and update cache asynchronously
  blob.stream()
    .pipeThrough(new CompressionStream("gzip"))
    .pipeTo(new WritableStream({
      write(chunk) { chunks.push(chunk); },
      close() {
        const compressedBlob = new Blob(chunks);
        updateCachedAssetCompressed(pathname, compressedBlob, contentType);
      }
    }));
}

/**
 * Fetch event: Serve from cache, fallback to network
 */
self.addEventListener("fetch", (event: FetchEvent) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) return;

  // Always fetch version.json fresh
  if (url.pathname === "/version.json") return;

  // Skip bundle file itself
  if (url.pathname === "/bundle.tar.zst") return;

  event.respondWith(
    (async () => {
      const pathname = url.pathname === "/" ? "/index.html" : url.pathname;

      try {
        // Try to get from cache first
        let cached = await getCachedAsset(pathname);

        // If not in cache and extraction is ongoing, wait for it
        if (!cached && !extractionComplete && pathname.startsWith("/assets/")) {
          cached = await waitForAsset(pathname);
        }

        if (cached) {
          if (cached.compressed) {
            // Already compressed, decompress and serve
            return decompressResponse(cached.blob, cached.contentType, true);
          } else {
            // Not compressed yet - serve directly and compress in background
            compressInBackground(pathname, cached.blob, cached.contentType);
            return new Response(cached.blob, {
              headers: { "Content-Type": cached.contentType },
            });
          }
        }
      } catch {
        // Cache read failed, fall through to network
      }

      // Not in cache and extraction complete, try network
      try {
        const response = await fetch(event.request);
        return response;
      } catch {
        // Offline and not cached
        if (event.request.mode === "navigate") {
          const indexCached = await getCachedAsset("/index.html");
          if (indexCached) {
            return decompressResponse(indexCached.blob, indexCached.contentType, indexCached.compressed);
          }
        }
        return new Response("Offline", { status: 503 });
      }
    })()
  );
});
