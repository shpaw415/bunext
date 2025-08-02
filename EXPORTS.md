# Bunext Exports Guide

This document explains all the available exports from the `bunext-js` package and how to use them effectively.

## 📦 Export Categories

### Core Framework

```typescript
import { /* types */ } from 'bunext-js/types';
import { /* globals */ } from 'bunext-js/globals';
```

**Core framework types and global utilities for advanced usage.**

---

### Database

```typescript
// Main database functionality
import { Database } from 'bunext-js/database';

// Database schema definitions
import { DBSchema } from 'bunext-js/database/schema';

// Generated database types
import type { Users, Posts } from 'bunext-js/database/types';

// Database class for advanced usage
import { DatabaseClass } from 'bunext-js/database/class';
```

**Complete database integration with type-safe operations and schema management.**

---

### Session Management

```typescript
// Main session functionality (client & server)
import { useSession, GetSession } from 'bunext-js/session';

// Server-side session utilities
import { ServerSession } from 'bunext-js/session/server';

// Client-side session utilities  
import { ClientSession } from 'bunext-js/session/client';

// Session type definitions
import type { SessionData } from 'bunext-js/session/types';
```

**Secure session handling for authentication and state management.**

---

### Router & Navigation

```typescript
// Main router functionality
import { Router } from 'bunext-js/router';

// Navigation functions
import { navigate, revalidate } from 'bunext-js/router/navigate';
// or
import { navigate, revalidate } from 'bunext-js/router/revalidate';

// React components (Link, etc.)
import { Link } from 'bunext-js/router/components';
// or
import { Link } from 'bunext-js/router/link';

// Preloading utilities
import { PreLoadPath } from 'bunext-js/router/preload';
```

**File-based routing with client-side navigation and preloading.**

---

### Components

```typescript
// Head component for managing document head
import { Head } from 'bunext-js/head';

// Optimized Image component
import { Image } from 'bunext-js/image';

// Link component (same as router/link)
import { Link } from 'bunext-js/link';

// General components
import { /* components */ } from 'bunext-js/components';
```

**Pre-built React components optimized for Bunext.**

---

### Request Handling

```typescript
// Main request object
import type { BunextRequest } from 'bunext-js/request';

// Request type definitions
import type { RequestTypes } from 'bunext-js/request/types';

// Request hooks
import { useRequest } from 'bunext-js/request/hooks';
```

**Server request handling and client-side request utilities.**

---

### Utilities

```typescript
// General utilities
import { generateRandomString, /* others */ } from 'bunext-js/utils';

// Utility type definitions
import type { UtilityTypes } from 'bunext-js/utils/types';
```

**Helper functions and utilities for common tasks.**

---

### Caching

```typescript
// Main caching functionality
import { CacheManager } from 'bunext-js/cache';

// Fetch caching utilities
import { CachedFetch } from 'bunext-js/cache/fetch';

// Server-side cache utilities
import { ServerCache } from 'bunext-js/cache/server';

// Client-side cache utilities
import { ClientCache } from 'bunext-js/cache/client';

// Cache type definitions
import type { CacheTypes } from 'bunext-js/cache/types';
```

**Built-in caching system for improved performance.**

---

### Plugin System

```typescript
// Plugin type definitions
import type { BunextPlugin } from 'bunext-js/plugins';
// or
import type { BunextPlugin } from 'bunext-js/plugins/types';

// Built-in plugins
import { ImagePlugin } from 'bunext-js/plugins/image';
import { SVGPlugin } from 'bunext-js/plugins/svg';
import { StaticPagePlugin } from 'bunext-js/plugins/static-page';
import { DevPlugin } from 'bunext-js/plugins/dev';
import { TypedRoutePlugin } from 'bunext-js/plugins/typed-route';
```

**Extensible plugin system for customizing framework behavior.**

---

### Server Internals (Advanced)

```typescript
// Server request handling
import { BunextRequest } from 'bunext-js/server/request';

// Server router
import { ServerRouter } from 'bunext-js/server/router';

// Build system
import { Builder } from 'bunext-js/server/build';

// Server context
import { ServerContext } from 'bunext-js/server/context';

// Server globals
import { ServerGlobal } from 'bunext-js/server/global';
```

**Advanced server-side functionality for custom integrations.**

---

### Client Internals (Advanced)

```typescript
// Client globals
import { ClientGlobal } from 'bunext-js/client/global';

// Hydration utilities
import { Hydrate } from 'bunext-js/client/hydrate';
```

**Advanced client-side functionality for custom integrations.**

---

### Development Tools

```typescript
// JSX to string conversion (development)
import { jsxToString } from 'bunext-js/dev/jsx-to-string';
```

**Development utilities and debugging tools.**

---

## 🚀 Common Usage Patterns

### Basic Web Application

```typescript
// Essential imports for most applications
import { Database } from 'bunext-js/database';
import { useSession } from 'bunext-js/session';
import { Link, navigate } from 'bunext-js/router/components';
import { Head } from 'bunext-js/head';
import { Image } from 'bunext-js/image';
```

### Plugin Development

```typescript
import type { BunextPlugin } from 'bunext-js/plugins';
import type { BunextRequest } from 'bunext-js/request';

export const myPlugin: BunextPlugin = {
  router: {
    request: (req: BunextRequest) => {
      // Plugin logic here
      return req;
    }
  }
};
```

### Advanced Server Operations

```typescript
import { Database } from 'bunext-js/database';
import { GetSession } from 'bunext-js/session';
import { revalidate } from 'bunext-js/router/revalidate';

export async function ServerMyAction() {
  "use server";
  
  const db = Database();
  const session = GetSession();
  
  // Your server logic here
  
  await revalidate('/path-to-revalidate');
}
```

### Type-Safe Development

```typescript
import type { Users, Posts } from 'bunext-js/database/types';
import type { SessionData } from 'bunext-js/session/types';
import type { BunextRequest } from 'bunext-js/request';

function MyComponent({ user }: { user: Users }) {
  const session = useSession<SessionData>();
  return <div>Hello {user.name}!</div>;
}
```

## 📖 Migration from Previous Versions

If you were using the old export patterns, here are the mappings to the new structured exports:

| Old Import | New Import |
|------------|------------|
| `bunext-js/internal/router` | `bunext-js/router` |
| `bunext-js/features/session` | `bunext-js/session` |
| `bunext-js/plugins` | `bunext-js/plugins/types` |
| `bunext-js/database/database_types` | `bunext-js/database/types` |

The old patterns still work for backward compatibility, but it's recommended to use the new structured exports for better organization and IDE support.

## 🎯 Best Practices

1. **Use specific imports**: Instead of importing everything, import only what you need:
   ```typescript
   // ✅ Good
   import { Link } from 'bunext-js/router/components';
   
   // ❌ Avoid
   import { Link } from 'bunext-js/router/*';
   ```

2. **Separate client and server utilities**: Use the appropriate imports for your context:
   ```typescript
   // Server-side
   import { GetSession } from 'bunext-js/session';
   
   // Client-side  
   import { useSession } from 'bunext-js/session';
   ```

3. **Type safety**: Always import types for better TypeScript support:
   ```typescript
   import type { BunextPlugin } from 'bunext-js/plugins';
   import type { Users } from 'bunext-js/database/types';
   ```

4. **Plugin organization**: Keep plugin imports separate:
   ```typescript
   // Plugin types
   import type { BunextPlugin } from 'bunext-js/plugins';
   
   // Specific plugins
   import { ImagePlugin } from 'bunext-js/plugins/image';
   ```

This structured export system makes Bunext features more discoverable and easier to use while maintaining backward compatibility.
