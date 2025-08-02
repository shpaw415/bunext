import { describe, test, expect, beforeEach } from "bun:test";

/**
 * Unit tests for HeadUtils - isolated from Bunext system dependencies
 */

// Create isolated HeadUtils for testing
export type HeadData = {
    title?: string;
    author?: string;
    publisher?: string;
    meta?: Array<{ name?: string; property?: string; content?: string;[key: string]: any }>;
    link?: Array<{ rel?: string; href?: string;[key: string]: any }>;
};

function deepMerge(obj: HeadData, assign: HeadData): HeadData {
    const copy = structuredClone(obj || {});
    for (const key of Object.keys(assign || {}) as Array<keyof HeadData>) {
        switch (key) {
            case "author":
            case "publisher":
            case "title":
                copy[key] = assign[key];
                break;
            case "link":
            case "meta":
                if (copy[key]) copy[key]!.push(...(assign[key] as any));
                else copy[key] = assign[key] as any;
                break;
        }
    }
    return copy;
}

// CSS path cache for performance optimization
const cssPathCache = new Map<string, string[]>();
const CSS_CACHE_MAX_SIZE = 100;

/**
 * Isolated HeadUtils for testing
 */
const HeadUtils = {
    /**
     * Clears the CSS path cache
     */
    clearCssCache(): void {
        cssPathCache.clear();
    },

    /**
     * Gets cache statistics
     */
    getCacheStats(): { size: number; maxSize: number } {
        return {
            size: cssPathCache.size,
            maxSize: CSS_CACHE_MAX_SIZE,
        };
    },

    /**
     * Validates head data structure
     */
    validateHeadData(data: any): data is HeadData {
        if (!data || typeof data !== 'object') return false;

        const validKeys = ['title', 'author', 'publisher', 'meta', 'link'];
        const dataKeys = Object.keys(data);

        return dataKeys.every(key => validKeys.includes(key));
    },

    /**
     * Safely merges multiple head data objects
     */
    safeMerge(...headDataArray: (HeadData | undefined)[]): HeadData {
        return headDataArray.reduce<HeadData>((acc, data) => {
            if (data && this.validateHeadData(data)) {
                return deepMerge(acc, data);
            }
            return acc;
        }, {});
    },

    /**
     * Mock preload function for testing
     */
    preloadCssPaths(routes: string[]): void {
        routes.forEach(route => {
            const cacheKey = `${route}-test-mock`;
            if (cssPathCache.size >= CSS_CACHE_MAX_SIZE) {
                const firstKey = cssPathCache.keys().next().value;
                if (firstKey) {
                    cssPathCache.delete(firstKey);
                }
            }
            cssPathCache.set(cacheKey, [`${route}/style.css`]);
        });
    }
};

describe('HeadUtils Unit Tests', () => {
    beforeEach(() => {
        // Clear cache before each test
        HeadUtils.clearCssCache();
    });

    describe('validateHeadData', () => {
        test('should validate correct head data', () => {
            const validHeadData: HeadData = {
                title: 'My Amazing Page',
                meta: [
                    { name: 'description', content: 'A great page with awesome content' },
                    { property: 'og:title', content: 'My Amazing Page' }
                ]
            };

            const result = HeadUtils.validateHeadData(validHeadData);
            expect(result).toBe(true);
        });

        test('should reject invalid head data with unknown fields', () => {
            const invalidHeadData = {
                title: 'Test',
                invalidField: 'Should not be here'
            };

            const result = HeadUtils.validateHeadData(invalidHeadData);
            expect(result).toBe(false);
        });

        test('should reject null data', () => {
            const result = HeadUtils.validateHeadData(null);
            expect(result).toBe(false);
        });

        test('should reject undefined data', () => {
            const result = HeadUtils.validateHeadData(undefined);
            expect(result).toBe(false);
        });

        test('should reject non-object data', () => {
            const result = HeadUtils.validateHeadData('not an object');
            expect(result).toBe(false);
        });

        test('should accept empty object', () => {
            const result = HeadUtils.validateHeadData({});
            expect(result).toBe(true);
        });
    });

    describe('safeMerge', () => {
        test('should merge valid head data objects', () => {
            const baseHeadData: HeadData = {
                title: 'Base Title',
                author: 'John Doe'
            };

            const pageSpecificData: HeadData = {
                title: 'Page Specific Title',
                meta: [{ name: 'description', content: 'Page description' }]
            };

            const result = HeadUtils.safeMerge(baseHeadData, pageSpecificData);

            expect(result.title).toBe('Page Specific Title');
            expect(result.author).toBe('John Doe');
            expect(result.meta).toBeDefined();
            expect(Array.isArray(result.meta)).toBe(true);
            expect(result.meta?.length).toBe(1);
        });

        test('should handle undefined values gracefully', () => {
            const baseHeadData: HeadData = {
                title: 'Base Title',
                author: 'John Doe'
            };

            const result = HeadUtils.safeMerge(baseHeadData, undefined);

            expect(result.title).toBe('Base Title');
            expect(result.author).toBe('John Doe');
        });

        test('should merge multiple objects', () => {
            const data1: HeadData = { title: 'Title 1' };
            const data2: HeadData = { author: 'Author 1' };
            const data3: HeadData = { publisher: 'Publisher 1' };

            const result = HeadUtils.safeMerge(data1, data2, data3);

            expect(result.title).toBe('Title 1');
            expect(result.author).toBe('Author 1');
            expect(result.publisher).toBe('Publisher 1');
        });

        test('should handle meta array merging', () => {
            const data1: HeadData = {
                meta: [{ name: 'description', content: 'First description' }]
            };
            const data2: HeadData = {
                meta: [{ property: 'og:title', content: 'OG Title' }]
            };

            const result = HeadUtils.safeMerge(data1, data2);

            expect(result.meta).toBeDefined();
            expect(result.meta?.length).toBe(2);
            expect(result.meta?.[0].name).toBe('description');
            expect(result.meta?.[1].property).toBe('og:title');
        });
    });

    describe('cache management', () => {
        test('should return correct initial cache stats', () => {
            const stats = HeadUtils.getCacheStats();

            expect(stats.size).toBe(0);
            expect(stats.maxSize).toBe(100);
            expect(typeof stats.size).toBe('number');
            expect(typeof stats.maxSize).toBe('number');
        });

        test('should clear cache successfully', () => {
            // Add some items to cache first
            HeadUtils.preloadCssPaths(['/test1', '/test2']);
            expect(HeadUtils.getCacheStats().size).toBe(2);

            // Clear cache
            HeadUtils.clearCssCache();
            const stats = HeadUtils.getCacheStats();

            expect(stats.size).toBe(0);
        });

        test('should preload CSS paths', () => {
            const routes = ['/home', '/about', '/contact'];
            HeadUtils.preloadCssPaths(routes);

            const stats = HeadUtils.getCacheStats();
            expect(stats.size).toBe(3);
        });

        test('should respect cache size limit', () => {
            // Create more routes than the cache limit
            const manyRoutes = Array.from({ length: 150 }, (_, i) => `/route-${i}`);
            HeadUtils.preloadCssPaths(manyRoutes);

            const stats = HeadUtils.getCacheStats();
            expect(stats.size).toBeLessThanOrEqual(100);
        });
    });

    describe('performance tests', () => {
        test('should validate large amounts of data efficiently', () => {
            const testData = Array.from({ length: 1000 }, (_, i) => ({
                title: `Page ${i}`,
                meta: [{ name: 'description', content: `Description ${i}` }]
            }));

            const startTime = performance.now();
            const results = testData.map(data => HeadUtils.validateHeadData(data));
            const endTime = performance.now();

            const duration = endTime - startTime;

            expect(results.length).toBe(1000);
            expect(results.every(Boolean)).toBe(true);
            expect(duration).toBeLessThan(100); // Should be fast
        });

        test('should handle safe merge performance with large datasets', () => {
            const baseData: HeadData = { title: 'Base' };
            const largeMeta = Array.from({ length: 100 }, (_, i) => ({
                name: `meta-${i}`,
                content: `Content ${i}`
            }));

            const dataWithMeta: HeadData = { meta: largeMeta };

            const startTime = performance.now();
            const result = HeadUtils.safeMerge(baseData, dataWithMeta);
            const endTime = performance.now();

            const duration = endTime - startTime;

            expect(result.title).toBe('Base');
            expect(result.meta?.length).toBe(100);
            expect(duration).toBeLessThan(50); // Should be fast
        });
    });
});

// Export for use in other files
export { HeadUtils };
