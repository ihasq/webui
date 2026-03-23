/**
 * Bundle Extractor for Service Worker
 * Downloads and extracts tar.zst bundles, storing files in IndexedDB via idb-keyval
 */

import { ZstdDecompressionStream } from "zstd-decompression-stream";
import { UntarStream } from "@std/tar/untar-stream";
import { createStore, set } from "idb-keyval";

interface BundleInfo {
  url: string;
  size: number;
  hash: string;
}

interface TarStreamEntry {
  header: { name?: string; typeflag?: string };
  path: string;
  readable?: ReadableStream<Uint8Array>;
}

// Create a custom store for asset cache (separate DB from meta)
const assetStore = createStore("sw-assets", "store");

/**
 * Get content type from file path
 */
function getContentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const types: Record<string, string> = {
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    mjs: "application/javascript",
    json: "application/json",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    ico: "image/x-icon",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    eot: "application/vnd.ms-fontobject",
    otf: "font/otf",
    txt: "text/plain",
    xml: "application/xml",
    webmanifest: "application/manifest+json",
  };
  return types[ext] ?? "application/octet-stream";
}

/**
 * Read all data from a ReadableStream
 */
async function readStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  return result;
}

/**
 * Get cached asset from IndexedDB
 */
export async function getCachedAsset(path: string): Promise<{
  blob: Blob;
  contentType: string;
  compressed: boolean;
} | undefined> {
  const { get } = await import("idb-keyval");
  return get(path, assetStore);
}

/**
 * Streaming bundle extraction - extracts files as they arrive
 * Stores files UNCOMPRESSED for fast initial display
 * Compression happens later when serving via fetch
 */
export async function extractBundleStreaming(
  bundleInfo: BundleInfo,
  onFileReady?: (path: string) => void | Promise<void>
): Promise<number> {
  const response = await fetch(bundleInfo.url, { cache: "no-store" });
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download bundle: ${response.status}`);
  }

  // Stream directly through zstd decompression and tar extraction
  const decompressedStream = response.body.pipeThrough(
    new ZstdDecompressionStream()
  );
  const tarStream = decompressedStream.pipeThrough(new UntarStream());
  const tarReader = tarStream.getReader();

  let filesExtracted = 0;

  while (true) {
    const { done, value: entry } = await tarReader.read();
    if (done) break;

    const tarEntry = entry as TarStreamEntry;
    const typeflag = tarEntry.header.typeflag ?? "0";

    // Regular file
    if ((typeflag === "0" || typeflag === "") && tarEntry.readable) {
      const fileData = await readStream(tarEntry.readable);
      const path = "/" + tarEntry.path;
      const contentType = getContentType(path);

      // Store UNCOMPRESSED for fast extraction
      const blob = new Blob([new Uint8Array(fileData)]);
      await set(path, { blob, contentType, compressed: false }, assetStore);
      filesExtracted++;

      // Notify that this file is ready
      if (onFileReady) {
        await onFileReady(path);
      }
    } else if (tarEntry.readable) {
      await tarEntry.readable.cancel();
    }
  }

  return filesExtracted;
}

/**
 * Update cached asset with compressed version (called after serving)
 */
export async function updateCachedAssetCompressed(
  path: string,
  blob: Blob,
  contentType: string
): Promise<void> {
  await set(path, { blob, contentType, compressed: true }, assetStore);
}
