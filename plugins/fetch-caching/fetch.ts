"server only";

import type { BunextPlugin } from "plugins/types";

declare global {
  var __FETCH_BUNEXT__: (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => Promise<Response>;
}

/**
 * Configuration options for BunextFetchCaching
 */
export interface FetchCacheConfig {
  /** Maximum number of cached responses (default: 100) */
  maxCacheSize?: number;
  /** Default cache TTL in seconds (default: 3600) */
  defaultTtl?: number;
  /** Enable debug logging (default: false) */
  enableLogging?: number;
  /** Headers to exclude from cache key generation */
  excludeHeaders?: string[];
  /** Maximum response size to cache in bytes (default: 10MB) */
  maxResponseSize?: number;
  /** Enable cache statistics tracking (default: false) */
  enableStats?: boolean;
}

/**
 * Represents a cached response with metadata
 */
interface CacheEntry {
  /** Unique hash identifier for the request */
  hash: string;
  /** Cached response data as ArrayBuffer */
  responseData: ArrayBuffer;
  /** Response headers */
  headers: Record<string, string>;
  /** Response status */
  status: number;
  /** Response status text */
  statusText: string;
  /** Cache expiration timestamp */
  expiresAt: number;
  /** Response URL */
  url: string;
  /** Timestamp when cached */
  cachedAt: number;
  /** Number of times this cache entry was accessed */
  accessCount: number;
}

/**
 * Cache statistics for monitoring and debugging
 */
export interface CacheStats {
  /** Total number of cached entries */
  size: number;
  /** Maximum allowed cache size */
  maxSize: number;
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Cache hit ratio (0-1) */
  hitRatio: number;
  /** Total memory usage estimate in bytes */
  memoryUsage: number;
}

/**
 * Enhanced fetch caching implementation with improved robustness
 */
export class BunextFetchCaching {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly config!: Required<FetchCacheConfig>;
  private cleanupInterval?: Timer;
  private stats = {
    hits: 0,
    misses: 0,
    totalRequests: 0,
    memoryUsage: 0
  };

  constructor(config: FetchCacheConfig = {}) {
    // Only initialize on server-side
    if (typeof window !== "undefined") return;

    this.config = {
      maxCacheSize: config.maxCacheSize ?? 100,
      defaultTtl: config.defaultTtl ?? 3600,
      enableLogging: config.enableLogging ?? 0,
      excludeHeaders: config.excludeHeaders ?? ['authorization', 'cookie', 'user-agent'],
      maxResponseSize: config.maxResponseSize ?? 10 * 1024 * 1024, // 10MB
      enableStats: config.enableStats ?? false
    };

    this.initializeFetchOverride();
    this.startCleanupInterval();
  }

  /**
   * Initialize the global fetch override
   */
  private initializeFetchOverride(): void {
    try {
      globalThis.__FETCH_BUNEXT__ ??= fetch;
      // Override fetch with type assertion to handle missing properties
      (globalThis as any).fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        return this.fetch(input, init);
      };
      this.log('Fetch caching initialized');
    } catch (error) {
      console.error('Failed to initialize fetch caching:', error);
    }
  }

  /**
   * Start periodic cleanup of expired cache entries
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60000); // Cleanup every minute
  }

  /**
   * Enhanced fetch implementation with caching
   */
  private async fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    this.stats.totalRequests++;

    try {
      // Skip caching for no-store requests
      if (init.cache === "no-store") {
        //this.log('Bypassing cache (no-store)');
        return await globalThis.__FETCH_BUNEXT__(input, init);
      }

      // Check if response is cached
      const cachedEntry = await this.getCachedResponse(input, init);
      if (cachedEntry) {
        this.stats.hits++;
        //this.log('Cache hit for request');
        return this.createResponseFromCache(cachedEntry);
      }

      this.stats.misses++;
      this.log('Cache miss, fetching from network');

      // Fetch from network
      const response = await globalThis.__FETCH_BUNEXT__(input, init);

      // Cache the response if it's cacheable
      if (this.isCacheable(response, init)) {
        await this.cacheResponse(input, init, response.clone());
      }

      return response;
    } catch (error) {
      console.error('Fetch error:', error);
      // Fallback to original fetch on error
      return await globalThis.__FETCH_BUNEXT__(input, init);
    }
  }

  /**
   * Check if a response should be cached
   */
  private isCacheable(response: Response, init: RequestInit): boolean {
    // Don't cache error responses
    if (!response.ok) return false;

    // Don't cache if explicitly disabled
    if (init.cache === "no-cache" || init.cache === "no-store") return false;

    // Check response size
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > this.config.maxResponseSize) {
      this.log('Response too large to cache');
      return false;
    }

    // Check cache-control headers
    const cacheControl = response.headers.get('cache-control');
    if (cacheControl?.includes('no-cache') || cacheControl?.includes('no-store')) {
      return false;
    }

    return true;
  }

  /**
   * Cache a response
   */
  private async cacheResponse(
    input: RequestInfo | URL,
    init: RequestInit,
    response: Response
  ): Promise<void> {
    try {
      const hash = await this.generateCacheKey(input, init);
      const responseData = await response.arrayBuffer();
      const ttl = this.getTtl(init, response);

      // Enforce cache size limit
      if (this.cache.size >= this.config.maxCacheSize) {
        this.evictOldestEntry();
      }

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      const entry: CacheEntry = {
        hash,
        responseData,
        headers,
        status: response.status,
        statusText: response.statusText,
        url: response.url || this.resolveUrl(input), // Use response URL or resolve from input
        expiresAt: Date.now() + (ttl * 1000),
        cachedAt: Date.now(),
        accessCount: 0
      };

      this.cache.set(hash, entry);
      this.updateMemoryUsage();
      this.log(`Cached response for ${entry.url} (TTL: ${ttl}s)`);
    } catch (error) {
      console.error('Failed to cache response:', error);
    }
  }

  /**
   * Get cached response if available and not expired
   */
  private async getCachedResponse(
    input: RequestInfo | URL,
    init: RequestInit
  ): Promise<CacheEntry | null> {
    try {
      const hash = await this.generateCacheKey(input, init);
      const entry = this.cache.get(hash);

      if (!entry) return null;

      // Check if expired
      if (Date.now() > entry.expiresAt) {
        this.cache.delete(hash);
        this.updateMemoryUsage();
        this.log('Cache entry expired and removed');
        return null;
      }

      // Update access count
      entry.accessCount++;
      return entry;
    } catch (error) {
      console.error('Error checking cache:', error);
      return null;
    }
  }

  /**
   * Create a Response object from cached data
   */
  private createResponseFromCache(entry: CacheEntry): Response {
    return new Response(entry.responseData, {
      status: entry.status,
      statusText: entry.statusText,
      headers: new Headers(entry.headers)
    });
  }

  /**
   * Generate a cache key for a request
   */
  async generateCacheKey(url: RequestInfo | URL, options: RequestInit = {}): Promise<string> {
    try {
      const { method = "GET", headers = {}, body } = options;

      // Normalize headers, excluding dynamic ones
      const normalizedHeaders = this.normalizeHeaders(headers);

      const resolvedUrl = this.resolveUrl(url);

      // Handle body serialization safely
      const serializedBody = await this.serializeBody(body);

      const keyData = JSON.stringify({
        url: resolvedUrl,
        method: method.toUpperCase(),
        headers: normalizedHeaders,
        body: serializedBody,
      });

      const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(keyData)
      );

      return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch (error) {
      console.error('Failed to generate cache key:', error);
      // Fallback to a simple hash
      return btoa(this.resolveUrl(url) + (options.method || 'GET'));
    }
  }

  /**
   * Normalize headers for cache key generation
   */
  private normalizeHeaders(headers: HeadersInit): Array<[string, string]> {
    const headerEntries: Array<[string, string]> = [];

    if (headers instanceof Headers) {
      headers.forEach((value, key) => {
        if (!this.config.excludeHeaders.includes(key.toLowerCase())) {
          headerEntries.push([key.toLowerCase(), value]);
        }
      });
    } else if (Array.isArray(headers)) {
      for (const [key, value] of headers) {
        if (!this.config.excludeHeaders.includes(key.toLowerCase())) {
          headerEntries.push([key.toLowerCase(), value]);
        }
      }
    } else if (headers && typeof headers === 'object') {
      for (const [key, value] of Object.entries(headers)) {
        if (value && !this.config.excludeHeaders.includes(key.toLowerCase())) {
          headerEntries.push([key.toLowerCase(), value]);
        }
      }
    }

    return headerEntries.sort(([a], [b]) => a.localeCompare(b));
  }

  /**
   * Resolve URL from various input types
   */
  private resolveUrl(url: RequestInfo | URL): string {
    if (url instanceof Request) return url.url;
    if (url instanceof URL) return url.toString();
    return url;
  }

  /**
   * Safely serialize request body
   */
  private async serializeBody(body: BodyInit | null | undefined): Promise<string | null> {
    if (!body) return null;

    try {
      if (typeof body === 'string') return body;
      if (body instanceof URLSearchParams) return body.toString();
      if (body instanceof FormData) {
        // Convert FormData to a serializable format
        const entries: Array<[string, string]> = [];
        for (const [key, value] of body.entries()) {
          entries.push([key, typeof value === 'string' ? value : '[File]']);
        }
        return JSON.stringify(entries);
      }
      if (body instanceof ArrayBuffer || body instanceof Uint8Array) {
        return btoa(String.fromCharCode(...new Uint8Array(body)));
      }
      if ('toString' in body && typeof body.toString === 'function') {
        return body.toString();
      }
      return '[Unserializable Body]';
    } catch {
      return '[Serialization Error]';
    }
  }

  /**
   * Get TTL from request init or response headers
   */
  private getTtl(init: RequestInit, response?: Response): number {
    // Check custom cache-revalidate header
    if (init.headers) {
      const headers = new Headers(init.headers);
      const revalidateHeader = headers.get('cache-revalidate');
      if (revalidateHeader) {
        const parsed = parseInt(revalidateHeader);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    }

    // Check response Cache-Control header
    if (response) {
      const cacheControl = response.headers.get('cache-control');
      if (cacheControl) {
        const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
        if (maxAgeMatch) {
          const maxAge = parseInt(maxAgeMatch[1]);
          if (!isNaN(maxAge) && maxAge > 0) return maxAge;
        }
      }
    }

    return this.config.defaultTtl;
  }

  /**
   * Evict the oldest cache entry based on LRU policy
   */
  private evictOldestEntry(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      const lastAccessed = entry.cachedAt + (entry.accessCount * 1000);
      if (lastAccessed < oldestTime) {
        oldestTime = lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.updateMemoryUsage();
      this.log('Evicted oldest cache entry');
    }
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.updateMemoryUsage();
      this.log(`Cleaned up ${removedCount} expired cache entries`);
    }
  }

  /**
   * Update memory usage estimation
   */
  private updateMemoryUsage(): void {
    if (!this.config.enableStats) return;

    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += entry.responseData.byteLength;
      totalSize += JSON.stringify(entry.headers).length * 2; // Rough estimate
      totalSize += entry.url.length * 2;
    }
    this.stats.memoryUsage = totalSize;
  }

  /**
   * Log debug messages if logging is enabled
   */
  private log(message: string): void {
    if (this.config.enableLogging) {
      console.log(`[BunextFetchCache] ${message}`);
    }
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): CacheStats {
    const hitRatio = this.stats.totalRequests > 0
      ? this.stats.hits / this.stats.totalRequests
      : 0;

    return {
      size: this.cache.size,
      maxSize: this.config.maxCacheSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRatio,
      memoryUsage: this.stats.memoryUsage
    };
  }

  /**
   * Clear all cache entries
   */
  public reset(): void {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      totalRequests: 0,
      memoryUsage: 0
    };
    this.log('Cache reset');
  }

  /**
   * Remove specific cache entry by URL and options
   */
  public async invalidate(url: RequestInfo | URL, options: RequestInit = {}): Promise<boolean> {
    try {
      const hash = await this.generateCacheKey(url, options);
      const deleted = this.cache.delete(hash);
      if (deleted) {
        this.updateMemoryUsage();
        this.log(`Invalidated cache entry for ${this.resolveUrl(url)}`);
      }
      return deleted;
    } catch (error) {
      console.error('Failed to invalidate cache entry:', error);
      return false;
    }
  }

  /**
   * Invalidate all cache entries matching a URL pattern
   */
  public async invalidatePattern(pattern: string | RegExp): Promise<number> {
    let removedCount = 0;
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

    for (const [hash, entry] of this.cache.entries()) {
      if (regex.test(entry.url)) {
        this.cache.delete(hash);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.updateMemoryUsage();
      this.log(`Invalidated ${removedCount} cache entries matching pattern: ${pattern}`);
    }

    return removedCount;
  }

  /**
   * Get cache entry information for debugging
   */
  public async getCacheInfo(url: RequestInfo | URL, options: RequestInit = {}): Promise<{
    exists: boolean;
    entry?: Omit<CacheEntry, 'responseData'>;
    hash: string;
  }> {
    try {
      const hash = await this.generateCacheKey(url, options);
      const entry = this.cache.get(hash);

      if (!entry) {
        return { exists: false, hash };
      }

      // Check if expired (same logic as getCachedResponse)
      if (Date.now() > entry.expiresAt) {
        this.cache.delete(hash);
        this.updateMemoryUsage();
        this.log('Cache entry expired and removed during info check');
        return { exists: false, hash };
      }

      const { responseData, ...entryInfo } = entry;
      return {
        exists: true,
        entry: entryInfo,
        hash
      };
    } catch (error) {
      console.error('Error getting cache info:', error);
      const hash = 'error-generating-hash';
      return { exists: false, hash };
    }
  }

  /**
   * Warm up the cache with a list of URLs
   */
  public async warmup(urls: Array<{ url: string; options?: RequestInit }>): Promise<void> {
    this.log(`Starting cache warmup for ${urls.length} URLs`);

    const promises = urls.map(async ({ url, options = {} }) => {
      try {
        await this.fetch(url, options);
      } catch (error) {
        console.error(`Failed to warm up cache for ${url}:`, error);
      }
    });

    await Promise.allSettled(promises);
    this.log('Cache warmup completed');
  }

  /**
   * Export cache data for persistence
   */
  public exportCache(): Array<{
    hash: string;
    url: string;
    headers: Record<string, string>;
    status: number;
    statusText: string;
    expiresAt: number;
    cachedAt: number;
    accessCount: number;
    data: string; // Base64 encoded response data
  }> {
    const exported: ReturnType<typeof this.exportCache> = [];

    for (const [hash, entry] of this.cache.entries()) {
      exported.push({
        hash,
        url: entry.url,
        headers: entry.headers,
        status: entry.status,
        statusText: entry.statusText,
        expiresAt: entry.expiresAt,
        cachedAt: entry.cachedAt,
        accessCount: entry.accessCount,
        data: btoa(String.fromCharCode(...new Uint8Array(entry.responseData)))
      });
    }

    return exported;
  }

  /**
   * Import cache data from persistence
   */
  public importCache(data: ReturnType<typeof this.exportCache>): void {
    const now = Date.now();
    let importedCount = 0;

    for (const item of data) {
      // Skip expired entries
      if (now > item.expiresAt) continue;

      try {
        // Convert base64 back to ArrayBuffer
        const binaryString = atob(item.data);
        const responseData = new ArrayBuffer(binaryString.length);
        const uint8Array = new Uint8Array(responseData);

        for (let i = 0; i < binaryString.length; i++) {
          uint8Array[i] = binaryString.charCodeAt(i);
        }

        const entry: CacheEntry = {
          hash: item.hash,
          responseData,
          headers: item.headers,
          status: item.status,
          statusText: item.statusText,
          url: item.url,
          expiresAt: item.expiresAt,
          cachedAt: item.cachedAt,
          accessCount: item.accessCount
        };

        this.cache.set(item.hash, entry);
        importedCount++;
      } catch (error) {
        console.error(`Failed to import cache entry for ${item.url}:`, error);
      }
    }

    this.updateMemoryUsage();
    this.log(`Imported ${importedCount} cache entries`);
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.reset();
    this.log('Cache destroyed');
  }
}

export const fetchCaching = new BunextFetchCaching();



export default {
  build_worker: {
    before_build() {
      fetchCaching.destroy();
    },
  },
} as BunextPlugin;