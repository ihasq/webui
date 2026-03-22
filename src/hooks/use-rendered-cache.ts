/**
 * In-memory cache for rendered markdown HTML.
 * Keys are based on message content hash to handle edits.
 */

const cache = new Map<string, string>();

// Simple hash function for content
function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

export function getCacheKey(messageId: string, content: string): string {
  return `${messageId}:${hashContent(content)}`;
}

export function getCachedHtml(key: string): string | undefined {
  return cache.get(key);
}

export function setCachedHtml(key: string, html: string): void {
  cache.set(key, html);

  // Limit cache size to prevent memory issues
  if (cache.size > 500) {
    // Remove oldest entries (first 100)
    const keys = Array.from(cache.keys());
    for (let i = 0; i < 100; i++) {
      cache.delete(keys[i]);
    }
  }
}

export function clearCache(): void {
  cache.clear();
}
