/**
 * Test file for the enhanced BunextFetchCaching implementation
 * Run with: bun test fetch.test.ts
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { BunextFetchCaching, type FetchCacheConfig } from "../../plugins/fetch-caching/fetch";

// Mock the global fetch for testing
const mockFetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const response = new Response(JSON.stringify({ url, timestamp: Date.now() }), {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' }
    });

    // Manually set the URL property on the response
    Object.defineProperty(response, 'url', {
        value: url,
        writable: false,
        enumerable: true,
        configurable: true
    });

    return response;
});

// Store original fetch to restore later
const originalFetch = globalThis.fetch;
globalThis.__FETCH_BUNEXT__ = mockFetch;

describe("BunextFetchCaching", () => {
    let cache: BunextFetchCaching;

    beforeEach(() => {
        // Create a new cache instance for each test
        const config: FetchCacheConfig = {
            maxCacheSize: 10,
            defaultTtl: 3600,
            enableLogging: 1,
            enableStats: true
        };
        cache = new BunextFetchCaching(config);
    });

    afterEach(() => {
        // Clean up after each test
        cache.destroy();
        mockFetch.mockClear();
    });

    test("should initialize with default configuration", () => {
        const defaultCache = new BunextFetchCaching();
        const stats = defaultCache.getCacheStats();

        expect(stats.maxSize).toBe(100);
        expect(stats.size).toBe(0);
        expect(stats.hits).toBe(0);
        expect(stats.misses).toBe(0);

        defaultCache.destroy();
    });

    test("should cache fetch responses", async () => {
        const url = "https://api.example.com/data";

        // First request should hit the network
        const response1 = await fetch(url);
        expect(mockFetch).toHaveBeenCalledTimes(1);

        // Second request should hit the cache
        const response2 = await fetch(url);
        expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1, not 2

        const stats = cache.getCacheStats();
        expect(stats.size).toBe(1);
        expect(stats.hits).toBe(1);
        expect(stats.misses).toBe(1);

        // Both responses should have the same content
        const data1 = await response1.json();
        const data2 = await response2.json();
        expect(data1).toEqual(data2);
    });

    test("should respect cache size limits", async () => {
        // Make more requests than the cache limit (10)
        const promises = Array.from({ length: 15 }, (_, i) =>
            fetch(`https://api.example.com/data/${i}`)
        );

        await Promise.all(promises);

        const stats = cache.getCacheStats();
        expect(stats.size).toBeLessThanOrEqual(10);
        expect(stats.misses).toBe(15); // All were network requests initially
    });

    test("should handle no-store cache directive", async () => {
        const url = "https://api.example.com/data";

        // Request with no-store should bypass cache
        await fetch(url, { cache: "no-store" });
        await fetch(url, { cache: "no-store" });

        expect(mockFetch).toHaveBeenCalledTimes(2);

        const stats = cache.getCacheStats();
        expect(stats.size).toBe(0); // Nothing should be cached
    });

    test("should generate consistent cache keys", async () => {
        const url = "https://api.example.com/data";
        const options = { method: "POST", headers: { "content-type": "application/json" } };

        const key1 = await cache.generateCacheKey(url, options);
        const key2 = await cache.generateCacheKey(url, options);

        expect(key1).toBe(key2);
        expect(key1).toHaveLength(64); // SHA-256 hex string length
    });

    test("should exclude dynamic headers from cache keys", async () => {
        const url = "https://api.example.com/data";

        const key1 = await cache.generateCacheKey(url, {
            headers: { authorization: "Bearer token1" }
        });

        const key2 = await cache.generateCacheKey(url, {
            headers: { authorization: "Bearer token2" }
        });

        expect(key1).toBe(key2); // Should be the same despite different auth tokens
    });

    test("should handle cache invalidation", async () => {
        const url = "https://api.example.com/data";

        // Cache a response
        await fetch(url);
        expect(cache.getCacheStats().size).toBe(1);

        // Invalidate the cached response
        const invalidated = await cache.invalidate(url);
        expect(invalidated).toBe(true);
        expect(cache.getCacheStats().size).toBe(0);
    });

    test("should handle pattern-based invalidation", async () => {
        // Cache multiple responses
        await Promise.all([
            fetch("https://api.example.com/users/1"),
            fetch("https://api.example.com/users/2"),
            fetch("https://api.example.com/posts/1")
        ]);

        expect(cache.getCacheStats().size).toBe(3);

        // Invalidate all user endpoints
        const invalidated = await cache.invalidatePattern(/\/users\//);
        expect(invalidated).toBe(2);
        expect(cache.getCacheStats().size).toBe(1); // Only posts endpoint should remain
    });

    test("should provide cache info for debugging", async () => {
        const url = "https://api.example.com/data";

        // Check info for non-existent cache entry
        const info1 = await cache.getCacheInfo(url);
        expect(info1.exists).toBe(false);

        // Cache a response
        await fetch(url);

        // Check info for existing cache entry
        const info2 = await cache.getCacheInfo(url);
        expect(info2.exists).toBe(true);
        expect(info2.entry).toBeDefined();
        expect(info2.entry?.url).toBe(url);
        expect(info2.entry?.status).toBe(200);
    });

    test("should support cache warmup", async () => {
        const urls = [
            { url: "https://api.example.com/users" },
            { url: "https://api.example.com/posts" },
            { url: "https://api.example.com/comments" }
        ];

        await cache.warmup(urls);

        const stats = cache.getCacheStats();
        expect(stats.size).toBe(3);
        expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    test("should export and import cache data", async () => {
        // Cache some responses
        await Promise.all([
            fetch("https://api.example.com/data1"),
            fetch("https://api.example.com/data2")
        ]);

        // Export cache data
        const exported = cache.exportCache();
        expect(exported).toHaveLength(2);
        expect(exported[0]).toHaveProperty('hash');
        expect(exported[0]).toHaveProperty('data');

        // Clear cache and import data
        cache.reset();
        expect(cache.getCacheStats().size).toBe(0);

        cache.importCache(exported);
        expect(cache.getCacheStats().size).toBe(2);
    });

    test("should handle TTL from cache-control headers", async () => {
        // Mock a response with cache-control header
        mockFetch.mockImplementationOnce(async () => {
            return new Response("data", {
                headers: { 'cache-control': 'max-age=300' }
            });
        });

        const url = "https://api.example.com/ttl-test";
        await fetch(url);

        const info = await cache.getCacheInfo(url);
        expect(info.exists).toBe(true);

        // TTL should be 300 seconds from now
        const expectedExpiry = Date.now() + (300 * 1000);
        const actualExpiry = info.entry?.expiresAt || 0;

        // Allow for small timing differences
        expect(Math.abs(actualExpiry - expectedExpiry)).toBeLessThan(1000);
    });

    test("should handle errors gracefully", async () => {
        // Mock a failing fetch
        mockFetch.mockImplementationOnce(async () => {
            throw new Error("Network error");
        });

        // Should fall back to original fetch behavior
        const url = "https://api.example.com/error-test";

        try {
            await fetch(url);
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }

        // Cache should remain stable
        const stats = cache.getCacheStats();
        expect(stats.size).toBe(0);
    });

    test("should track statistics correctly", async () => {
        const url = "https://api.example.com/stats-test";

        // First request (miss)
        await fetch(url);
        let stats = cache.getCacheStats();
        expect(stats.hits).toBe(0);
        expect(stats.misses).toBe(1);
        expect(stats.hitRatio).toBe(0);

        // Second request (hit)
        await fetch(url);
        stats = cache.getCacheStats();
        expect(stats.hits).toBe(1);
        expect(stats.misses).toBe(1);
        expect(stats.hitRatio).toBe(0.5);

        // Third request (hit)
        await fetch(url);
        stats = cache.getCacheStats();
        expect(stats.hits).toBe(2);
        expect(stats.misses).toBe(1);
        expect(stats.hitRatio).toBeCloseTo(0.667, 2);
    });

    test("should clean up expired entries", async () => {
        // Create a cache with very short TTL for testing
        const shortTtlCache = new BunextFetchCaching({
            defaultTtl: 1, // 1 second
            enableLogging: 1
        });

        const url = "https://api.example.com/expire-test";
        await fetch(url);

        expect(shortTtlCache.getCacheStats().size).toBe(1);

        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, 1100));

        // Try to get the cache info, which should trigger expiry check
        const info = await shortTtlCache.getCacheInfo(url);
        expect(info.exists).toBe(false);

        shortTtlCache.destroy();
    });
});

// Restore original fetch after all tests
process.on('exit', () => {
    globalThis.fetch = originalFetch;
});
