/**
 * Service Worker with Bundle-based Installation
 *
 * This SW downloads and extracts bundle.tar.zst during installation,
 * then serves assets from IndexedDB cache.
 */

/// <reference lib="webworker" />

import { get, set, createStore } from "idb-keyval";
import { extractBundle, getCachedAsset } from "./bundle-extractor";

declare const self: ServiceWorkerGlobalScope;

// These will be replaced by generate-sw.mjs
// Using quoted strings as placeholders so they survive minification
const BUILD_ID: string = "%%BUILD_ID%%";
const BUNDLE_INFO: { url: string; size: number; hash: string } | null = JSON.parse("%%BUNDLE_INFO%%");

// Meta store for build tracking
const metaStore = createStore("asset-cache", "meta");

/**
 * Broadcast progress to all clients
 */
async function broadcastProgress(phase: string, progress?: number, message?: string) {
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({
      type: "INSTALL_PROGRESS",
      phase,
      progress,
      message: message || phase,
    });
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
 * Install event: Download and extract bundle
 */
self.addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      try {
        // Check if already extracted with same build
        const installedBuild = await get("buildId", metaStore);
        if (installedBuild === BUILD_ID) {
          console.log("[SW] Bundle already extracted for this build");
          await broadcastProgress("Ready!", 100);
          self.skipWaiting();
          return;
        }

        // Extract bundle
        if (BUNDLE_INFO) {
          await broadcastProgress("Starting installation...", 0);

          const filesExtracted = await extractBundle(BUNDLE_INFO, (phase, progress) => {
            broadcastProgress(phase, progress);
          });

          // Store build ID
          await set("buildId", BUILD_ID, metaStore);

          console.log(`[SW] Extracted ${filesExtracted} files from bundle`);
          await broadcastProgress("Installation complete!", 100);
        } else {
          console.warn("[SW] No bundle info available");
          await broadcastProgress("No bundle available", 100);
        }
      } catch (err) {
        console.error("[SW] Installation failed:", err);
        await broadcastProgress("Installation failed: " + (err as Error).message, 0);
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
 * Fetch event: Serve from cache
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
        // Try to get from cache
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
          // Try to return cached index.html
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
