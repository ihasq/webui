/**
 * HTML compression utilities using CompressionStream API
 * Falls back to uncompressed storage if API is not available
 */

const COMPRESSION_SUPPORTED =
  typeof CompressionStream !== 'undefined' &&
  typeof DecompressionStream !== 'undefined';

/**
 * Compress HTML string to base64-encoded compressed data
 */
export async function compressHtml(html: string): Promise<string> {
  if (!COMPRESSION_SUPPORTED) {
    // Fallback: just base64 encode
    return btoa(unescape(encodeURIComponent(html)));
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(html);

  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(data);
  writer.close();

  const compressedChunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    compressedChunks.push(value);
  }

  // Combine chunks
  const totalLength = compressedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const compressed = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of compressedChunks) {
    compressed.set(chunk, offset);
    offset += chunk.length;
  }

  // Convert to base64
  return btoa(String.fromCharCode(...compressed));
}

/**
 * Decompress base64-encoded compressed data back to HTML string
 */
export async function decompressHtml(compressed: string): Promise<string> {
  if (!COMPRESSION_SUPPORTED) {
    // Fallback: just base64 decode
    return decodeURIComponent(escape(atob(compressed)));
  }

  try {
    // Convert from base64 to Uint8Array
    const binaryString = atob(compressed);
    const data = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      data[i] = binaryString.charCodeAt(i);
    }

    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(data);
    writer.close();

    const decompressedChunks: Uint8Array[] = [];
    const reader = ds.readable.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      decompressedChunks.push(value);
    }

    // Combine chunks
    const totalLength = decompressedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const decompressed = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of decompressedChunks) {
      decompressed.set(chunk, offset);
      offset += chunk.length;
    }

    const decoder = new TextDecoder();
    return decoder.decode(decompressed);
  } catch {
    // If decompression fails, try as uncompressed base64 (backward compatibility)
    try {
      return decodeURIComponent(escape(atob(compressed)));
    } catch {
      return '';
    }
  }
}
