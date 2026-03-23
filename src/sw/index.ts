/**
 * Service Worker with Streaming Bundle Installation
 *
 * Extracts bundle.tar.zst progressively and serves files as they become available.
 * Sends APP_READY message as soon as index.html is extracted.
 */

/// <reference lib="webworker" />

import { get, set, createStore } from "idb-keyval";
import { extractBundleStreaming, getCachedAsset } from "./bundle-extractor";

declare const self: ServiceWorkerGlobalScope;

// These will be replaced by generate-sw.mjs
const BUILD_ID: string = "%%BUILD_ID%%";
const BUNDLE_INFO: { url: string; size: number; hash: string } | null = JSON.parse("%%BUNDLE_INFO%%");

// Meta store for build tracking
const metaStore = createStore("asset-cache", "meta");

/**
 * Notify all clients that app is ready
 */
async function notifyAppReady() {
  const clients = await self.clients.matchAll();
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
          console.log("[SW] Bundle already extracted for this build");
          self.skipWaiting();
          return;
        }

        // Extract bundle with streaming
        if (BUNDLE_INFO) {
          await extractBundleStreaming(BUNDLE_INFO, async (path) => {
            // When index.html is ready, notify clients immediately
            if (path === "/index.html") {
              await notifyAppReady();
            }
          });

          // Store build ID
          await set("buildId", BUILD_ID, metaStore);
          console.log("[SW] Bundle extraction complete");
        } else {
          console.warn("[SW] No bundle info available");
        }
      } catch (err) {
        console.error("[SW] Installation failed:", err);
        throw err;
      }

      self.skipWaiting();
    })()
  );
});

/**
 * Activate event: Claim all clients
 */
self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim());
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
        const cached = await getCachedAsset(pathname);
        if (cached) {
          return decompressResponse(cached.blob, cached.contentType, cached.compressed);
        }
      } catch (err) {
        console.warn("[SW] Cache read failed:", err);
      }

      // Not in cache, try network
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
