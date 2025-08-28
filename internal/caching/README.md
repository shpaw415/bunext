# Enhanced BunextFetchCaching

A robust and efficient HTTP response caching implementation for Bunext with advanced features and improved reliability.

## Key Improvements

### 🚀 Performance Enhancements
- **Memory Efficient**: Uses `Map` instead of arrays for O(1) cache lookups
- **LRU Eviction**: Implements Least Recently Used policy for cache size management
- **Smart Response Handling**: Stores responses as `ArrayBuffer` to avoid cloning issues
- **Automatic Cleanup**: Periodic removal of expired entries

### 🔧 Robustness Features
- **Comprehensive Error Handling**: Graceful fallbacks for all operations
- **Type Safety**: Full TypeScript support with proper interfaces
- **Configuration Options**: Flexible configuration for different use cases
- **Resource Management**: Proper cleanup and memory management

### 📊 Monitoring & Debugging
- **Cache Statistics**: Hit/miss ratios, memory usage tracking
- **Debug Logging**: Configurable logging for troubleshooting
- **Cache Inspection**: Methods to inspect cache state and entries
- **Performance Metrics**: Request timing and cache efficiency metrics

### 🛠 Advanced Features
- **Pattern-based Invalidation**: Invalidate multiple entries with regex patterns
- **Cache Warmup**: Pre-populate cache with important URLs
- **Import/Export**: Persist cache data across restarts
- **Custom TTL**: Support for response-specific cache durations
- **Header Filtering**: Configurable exclusion of dynamic headers

## Configuration

```typescript
import { BunextFetchCaching, type FetchCacheConfig } from './fetch';

const config: FetchCacheConfig = {
  // Maximum number of cached responses (default: 100)
  maxCacheSize: 200,
  
  // Default cache TTL in seconds (default: 3600)
  defaultTtl: 7200,
  
  // Enable debug logging (default: false)
  enableLogging: true,
  
  // Headers to exclude from cache key generation
  excludeHeaders: ['authorization', 'cookie', 'user-agent', 'x-request-id'],
  
  // Maximum response size to cache in bytes (default: 10MB)
  maxResponseSize: 5 * 1024 * 1024, // 5MB
  
  // Enable cache statistics tracking (default: false)
  enableStats: true
};

const cache = new BunextFetchCaching(config);
```

## Usage Examples

### Basic Caching
```typescript
// Automatic caching with default settings
const response = await fetch('https://api.example.com/data');

// Skip caching for specific requests
const response = await fetch('https://api.example.com/realtime', {
  cache: 'no-store'
});

// Custom cache duration
const response = await fetch('https://api.example.com/data', {
  headers: {
    'cache-revalidate': '1800' // 30 minutes
  }
});
```

### Cache Management
```typescript
// Get cache statistics
const stats = cache.getCacheStats();
console.log(`Hit ratio: ${(stats.hitRatio * 100).toFixed(1)}%`);
console.log(`Memory usage: ${(stats.memoryUsage / 1024 / 1024).toFixed(1)}MB`);

// Invalidate specific cache entry
await cache.invalidate('https://api.example.com/users/123');

// Invalidate multiple entries with pattern
await cache.invalidatePattern(/\/api\/users\//);

// Clear all cache
cache.reset();
```

### Cache Inspection
```typescript
// Get detailed cache information
const info = await cache.getCacheInfo('https://api.example.com/data');
if (info.exists) {
  console.log('Cache entry details:', info.entry);
  console.log('Cache key:', info.hash);
}
```

### Cache Warmup
```typescript
// Pre-populate cache with important URLs
await cache.warmup([
  { url: 'https://api.example.com/config' },
  { url: 'https://api.example.com/users', options: { method: 'GET' } },
  { url: 'https://api.example.com/posts?page=1' }
]);
```

### Persistence
```typescript
// Export cache data for persistence
const cacheData = cache.exportCache();
await saveToFile('cache-backup.json', JSON.stringify(cacheData));

// Import cache data on startup
const savedData = JSON.parse(await readFromFile('cache-backup.json'));
cache.importCache(savedData);
```

## Cache Statistics

The enhanced cache provides detailed statistics for monitoring:

```typescript
interface CacheStats {
  size: number;           // Current number of cached entries
  maxSize: number;        // Maximum allowed cache size
  hits: number;           // Number of cache hits
  misses: number;         // Number of cache misses
  hitRatio: number;       // Hit ratio (0-1)
  memoryUsage: number;    // Estimated memory usage in bytes
}
```

## Error Handling

The implementation includes comprehensive error handling:

- **Network Failures**: Falls back to original fetch behavior
- **Cache Corruption**: Graceful handling of invalid cache entries
- **Memory Pressure**: Automatic eviction of old entries
- **Configuration Errors**: Sensible defaults for invalid configurations

## Performance Characteristics

| Operation | Time Complexity | Notes |
|-----------|-----------------|-------|
| Cache Lookup | O(1) | Uses Map for constant-time access |
| Cache Insert | O(1) | Direct insertion with size checks |
| Cache Eviction | O(n) | LRU requires iteration over entries |
| Pattern Invalidation | O(n) | Must check all entries against pattern |
| Statistics Update | O(n) | Memory usage calculation |

## Compatibility

- ✅ **Server-side only**: Automatically disables on client
- ✅ **Bun Runtime**: Optimized for Bun's performance characteristics
- ✅ **Standard Fetch API**: Compatible with all fetch options
- ✅ **TypeScript**: Full type safety and IntelliSense support

## Migration from Previous Version

The enhanced version is backward compatible. Simply replace the import:

```typescript
// Old version
import fetchCaching from './fetch';

// New version (recommended)
import { BunextFetchCaching } from './fetch';
const cache = new BunextFetchCaching({
  enableLogging: 1,
  enableStats: true
});

// Or continue using the default instance
import fetchCaching from './fetch'; // Still works
```

## Testing

Run the comprehensive test suite:

```bash
bun test fetch.test.ts
```

The tests cover:
- Basic caching functionality
- Cache size limits and eviction
- TTL handling and expiration
- Error scenarios and fallbacks
- Statistics tracking
- Import/export functionality
- Pattern-based invalidation

## Best Practices

1. **Monitor Cache Performance**: Use `getCacheStats()` to track hit ratios
2. **Set Appropriate TTL**: Balance between freshness and performance
3. **Handle Large Responses**: Configure `maxResponseSize` for your use case
4. **Use Pattern Invalidation**: Efficiently invalidate related cache entries
5. **Enable Logging in Development**: Use `enableLogging: 1` for debugging
6. **Regular Cleanup**: The automatic cleanup handles most cases, but manual `reset()` may be needed for memory-intensive applications
