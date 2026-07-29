// Simple memory cache for React Native
const cache = new Map<string, { value: any; expiry: number }>();

export default cache;

/**
 * Get-or-set cache helper.
 * Calls `fetcher` only when `key` is missing/expired; stores the result with `ttl` seconds.
 */
export async function getOrSet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number
): Promise<T> {
  const now = Date.now();
  const cached = cache.get(key);
  
  if (cached && cached.expiry > now) {
    return cached.value as T;
  }

  const fresh = await fetcher();
  cache.set(key, { value: fresh, expiry: now + (ttl * 1000) });
  return fresh;
}
