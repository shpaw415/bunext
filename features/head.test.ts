

import { describe, test, expect, beforeAll } from "bun:test";
import { safeMerge, validateHeadData } from "plugins/head/utils";

/**
 * Integration tests for the enhanced head management system using Bun test API
 */

// Import HeadUtils with error handling for system dependencies


describe('Head Management System', () => {
    describe('HeadUtils', () => {
        test('should validate correct head data', () => {
            const validHeadData = {
                title: 'My Amazing Page',
                meta: [
                    { name: 'description', content: 'A great page with awesome content' },
                    { property: 'og:title', content: 'My Amazing Page' }
                ]
            };

            const isValid = validateHeadData(validHeadData);
            expect(isValid).toBe(true);
        });

        test('should reject invalid head data', () => {
            const invalidHeadData = {
                title: 'Test',
                invalidField: 'Should not be here'
            };

            const isValid = validateHeadData(invalidHeadData);
            expect(isValid).toBe(false);
        });

        test('should safely merge head data objects', () => {
            const baseHeadData = {
                title: 'Base Title',
                author: 'John Doe'
            };

            const pageSpecificData = {
                title: 'Page Specific Title', // This will override base title
                meta: [{ name: 'description', content: 'Page description' }]
            };

            const mergedData = safeMerge(baseHeadData, pageSpecificData);

            expect(mergedData.title).toBe('Page Specific Title');
            expect(mergedData.author).toBe('John Doe');
            expect(mergedData.meta).toBeDefined();
            expect(Array.isArray(mergedData.meta)).toBe(true);
        });

        test('should handle undefined values in safe merge', () => {
            const baseHeadData = {
                title: 'Base Title',
                author: 'John Doe'
            };

            const mergedData = safeMerge(baseHeadData, undefined);

            expect(mergedData.title).toBe('Base Title');
            expect(mergedData.author).toBe('John Doe');
        });

    });

    describe('Performance Tests', () => {
        test('should validate large amounts of head data efficiently', () => {
            const testData = Array.from({ length: 1000 }, (_, i) => ({
                title: `Page ${i}`,
                meta: [{ name: 'description', content: `Description ${i}` }]
            }));

            const startTime = performance.now();
            const results = testData.map(data => validateHeadData(data));
            const endTime = performance.now();

            const duration = endTime - startTime;

            expect(results.length).toBe(1000);
            expect(results.every(Boolean)).toBe(true);
            expect(duration).toBeLessThan(100); // Should be fast (less than 100ms)
        });
    });

    describe('Edge Cases', () => {
        test('should handle null head data', () => {
            const isValid = validateHeadData(null);
            expect(isValid).toBe(false);
        });

        test('should handle empty object head data', () => {
            const isValid = validateHeadData({});
            expect(isValid).toBe(true); // Empty object is valid
        });

        test('should handle non-object head data', () => {
            const isValid = validateHeadData('not an object');
            expect(isValid).toBe(false);
        });

        test('should merge multiple head data objects', () => {
            const data1 = { title: 'Title 1' };
            const data2 = { author: 'Author 1' };
            const data3 = { publisher: 'Publisher 1' };

            const merged = safeMerge(data1, data2, data3);

            expect(merged.title).toBe('Title 1');
            expect(merged.author).toBe('Author 1');
            expect(merged.publisher).toBe('Publisher 1');
        });
    });
});

