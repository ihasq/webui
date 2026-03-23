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

type ProgressCallback = (phase: string, progress?: number) => void;

// Create a custom store for asset cache
const assetStore = createStore("asset-cache", "assets");

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
 * Check if content type should skip compression
 */
function shouldSkipCompression(contentType: string): boolean {
  return (
    contentType.startsWith("image/") ||
    contentType.startsWith("video/") ||
    contentType.startsWith("audio/") ||
    contentType.includes("font/") ||
    contentType.includes("application/zip") ||
    contentType.includes("application/gzip")
  );
}

/**
 * Compress data with gzip
 */
async function compressWithGzip(data: Uint8Array): Promise<Blob> {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));
  return new Response(compressedStream).blob();
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
 * Download and extract bundle.tar.zst, storing files in IndexedDB
 */
export async function extractBundle(
  bundleInfo: BundleInfo,
  onProgress?: ProgressCallback
): Promise<number> {
  onProgress?.("Downloading bundle...", 0);

  // Download the bundle with progress tracking
  const response = await fetch(bundleInfo.url, { cache: "no-store" });
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download bundle: ${response.status}`);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let downloaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    downloaded += value.length;
    const progress = Math.round((downloaded / bundleInfo.size) * 50); // 0-50%
    onProgress?.("Downloading bundle...", progress);
  }

  // Combine chunks
  const bundleData = new Uint8Array(downloaded);
  let offset = 0;
  for (const chunk of chunks) {
    bundleData.set(chunk, offset);
    offset += chunk.length;
  }

  onProgress?.("Extracting files...", 50);

  // Create a readable stream from the bundle data
  const bundleStream = new ReadableStream({
    start(controller) {
      controller.enqueue(bundleData);
      controller.close();
    },
  });

  // Decompress with zstd and extract tar
  const decompressedStream = bundleStream.pipeThrough(
    new ZstdDecompressionStream()
  );
  const tarStream = decompressedStream.pipeThrough(new UntarStream());
  const tarReader = tarStream.getReader();

  let filesExtracted = 0;
  const totalEstimatedFiles = 500; // Rough estimate for progress

  while (true) {
    const { done, value: entry } = await tarReader.read();
    if (done) break;

    const tarEntry = entry as TarStreamEntry;
    const typeflag = tarEntry.header.typeflag ?? "0";

    if ((typeflag === "0" || typeflag === "") && tarEntry.readable) {
      const fileData = await readStream(tarEntry.readable);
      const path = "/" + tarEntry.path;
      const contentType = getContentType(path);
      const skipCompression = shouldSkipCompression(contentType);

      let blob: Blob;
      let compressed: boolean;

      if (skipCompression || typeof CompressionStream === "undefined") {
        blob = new Blob([new Uint8Array(fileData)]);
        compressed = false;
      } else {
        blob = await compressWithGzip(fileData);
        compressed = true;
      }

      // Store in IndexedDB using idb-keyval
      await set(path, { blob, contentType, compressed }, assetStore);

      filesExtracted++;
      const progress = 50 + Math.round((filesExtracted / totalEstimatedFiles) * 50);
      onProgress?.(`Extracting files... (${filesExtracted})`, Math.min(progress, 99));
    } else if (tarEntry.readable) {
      await tarEntry.readable.cancel();
    }
  }

  onProgress?.("Complete!", 100);
  return filesExtracted;
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
 * Check if bundle is already extracted (by checking for index.html)
 */
export async function isBundleExtracted(): Promise<boolean> {
  const { get } = await import("idb-keyval");
  const indexHtml = await get("/index.html", assetStore);
  return !!indexHtml;
}
