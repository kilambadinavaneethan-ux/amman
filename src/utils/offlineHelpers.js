import { getDocs, getDocsFromCache } from "firebase/firestore";

/**
 * In-memory query cache to eliminate redundant duplicate queries executed within short time windows.
 */
const queryCache = new Map();
const DEFAULT_CACHE_TTL = 3000; // 3 seconds TTL for fast repeated renders

/**
 * Attempt getDocs from server first with timeout; fall back to cache if offline/error.
 * Works with persistent disk cache enabled in Firestore config.
 */
export async function getDocsOfflineSafe(q, options = {}) {
  const { useMemoryCache = false, cacheKey = null, timeoutMs = 8000 } = options;

  if (useMemoryCache && cacheKey && queryCache.has(cacheKey)) {
    const cached = queryCache.get(cacheKey);
    if (Date.now() - cached.timestamp < DEFAULT_CACHE_TTL) {
      return cached.data;
    }
  }

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Firestore server query timeout - falling back to cache"));
    }, timeoutMs);
  });

  try {
    const snapshot = await Promise.race([getDocs(q), timeoutPromise]);
    clearTimeout(timeoutId);

    if (useMemoryCache && cacheKey) {
      queryCache.set(cacheKey, { data: snapshot, timestamp: Date.now() });
    }
    return snapshot;
  } catch (err) {
    clearTimeout(timeoutId);
    // Server unavailable or timeout — read from local persistent cache
    try {
      const cacheSnapshot = await getDocsFromCache(q);
      if (useMemoryCache && cacheKey) {
        queryCache.set(cacheKey, { data: cacheSnapshot, timestamp: Date.now() });
      }
      return cacheSnapshot;
    } catch (_cacheErr) {
      // Cache empty or fail — rethrow original error
      throw err;
    }
  }
}

export function clearMemoryCache() {
  queryCache.clear();
}
