/**
 * Bundle Updater - Downloads and extracts tar.zst bundles for PWA updates
 *
 * Flow:
 * 1. Download bundle.tar.zst
 * 2. Decompress with zstd-decompression-stream
 * 3. Extract tar with @std/tar
 * 4. Re-compress each file with gzip and store in IndexedDB
 */

import { ZstdDecompressionStream } from "zstd-decompression-stream";
import { UntarStream } from "@std/tar/untar-stream";

const DB_NAME = "asset-cache";
const STORE_NAME = "compressed-assets";

interface BundleInfo {
  url: string;
  size: number;
  hash: string;
}

interface UpdateProgress {
  phase: "downloading" | "extracting" | "complete" | "error";
  downloaded?: number;
  total?: number;
  filesExtracted?: number;
  error?: string;
}

type ProgressCallback = (progress: UpdateProgress) => void;

interface TarStreamEntry {
  header: { name?: string; typeflag?: string };
  path: string;
  readable?: ReadableStream<Uint8Array>;
}

/**
 * Open IndexedDB for asset cache
 */
function openDB(version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Store a compressed asset in IndexedDB
 */
async function storeAsset(
  db: IDBDatabase,
  path: string,
  data: {
    blob: Blob;
    contentType: string;
    compressed: boolean;
  }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(data, path);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

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
export async function applyBundleUpdate(
  bundleInfo: BundleInfo,
  cacheVersion: number,
  onProgress?: ProgressCallback
): Promise<boolean> {
  try {
    onProgress?.({ phase: "downloading", downloaded: 0, total: bundleInfo.size });

    // Download the bundle
    const response = await fetch(bundleInfo.url, { cache: "no-store" });
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download bundle: ${response.status}`);
    }

    // Track download progress
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let downloaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      downloaded += value.length;
      onProgress?.({ phase: "downloading", downloaded, total: bundleInfo.size });
    }

    // Combine chunks into a single buffer
    const bundleData = new Uint8Array(downloaded);
    let offset = 0;
    for (const chunk of chunks) {
      bundleData.set(chunk, offset);
      offset += chunk.length;
    }

    onProgress?.({ phase: "extracting", filesExtracted: 0 });

    // Create a readable stream from the bundle data
    const bundleStream = new ReadableStream({
      start(controller) {
        controller.enqueue(bundleData);
        controller.close();
      },
    });

    // Decompress with zstd and extract tar
    const untarStream = new UntarStream();
    const decompressedStream = bundleStream.pipeThrough(
      new ZstdDecompressionStream()
    );

    // Pipe to untar
    const tarStream = decompressedStream.pipeThrough(untarStream);

    // Open IndexedDB
    const db = await openDB(cacheVersion);

    let filesExtracted = 0;

    // Read entries from the tar stream using a reader
    const tarReader = tarStream.getReader();

    while (true) {
      const { done, value: entry } = await tarReader.read();
      if (done) break;

      const tarEntry = entry as TarStreamEntry;

      // Check if it's a file (typeflag '0' or '' for regular file)
      const typeflag = tarEntry.header.typeflag ?? "0";
      if (typeflag === "0" || typeflag === "") {
        if (tarEntry.readable) {
          // Read file content
          const fileData = await readStream(tarEntry.readable);

          // Determine content type and whether to compress
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

          // Store in IndexedDB
          await storeAsset(db, path, { blob, contentType, compressed });

          filesExtracted++;
          onProgress?.({ phase: "extracting", filesExtracted });
        }
      } else if (tarEntry.readable) {
        // Cancel the readable stream for non-file entries
        await tarEntry.readable.cancel();
      }
    }

    db.close();
    onProgress?.({ phase: "complete", filesExtracted });
    return true;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    onProgress?.({ phase: "error", error: errorMessage });
    console.error("Bundle update failed:", err);
    return false;
  }
}

/**
 * Check if bundle update is supported in this browser
 */
export function isBundleUpdateSupported(): boolean {
  return (
    typeof ReadableStream !== "undefined" &&
    typeof CompressionStream !== "undefined" &&
    typeof indexedDB !== "undefined"
  );
}
