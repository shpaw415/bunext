"use client";
import React, {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type JSX,
  type ComponentType,
} from "react";
import { unstable_batchedUpdates } from "react-dom";
import { getRouteMatcher, type Match } from "./utils/get-route-matcher";
import type { _GlobalData } from "../types";
import {
  BunextSession,
  SessionContext,
  SessionDidUpdateContext,
} from "../../features/session/session";
import { AddServerActionCallback, GetSessionFromResponse } from "../globals";
import { RequestContext } from "../server/context";
import type { RoutesType } from "../../plugins/typed-route/type";
import { preloadModule } from "react-dom";

/**
 * Enhanced type definitions for better type safety
 */
interface RouterConfig {
  normalizeUrl?: (url: string) => string;
  onRouteUpdated?: (path: string) => void;
  errorBoundary?: ComponentType<{ error: Error; retry: () => void }>;
  loadingComponent?: ComponentType;
  enablePreloading?: boolean;
  sessionConfig?: {
    enableLogging?: boolean;
    timeout?: number;
  };
}

interface RouteParams {
  [key: string]: string | string[];
}

interface ServerSideProps {
  redirect?: string;
  [key: string]: any;
}

interface LayoutComponent {
  (props: { children: JSX.Element; params: RouteParams }): JSX.Element | Promise<JSX.Element>;
}

interface RouteCache {
  [path: string]: {
    module: any;
    props?: ServerSideProps;
    timestamp: number;
  };
}

/**
 * Router error types for better error handling
 */
class RouteError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "RouteError";
  }
}

class RouteNotFoundError extends RouteError {
  constructor(path: string) {
    super(`Route not found: ${path}`, "ROUTE_NOT_FOUND");
  }
}

class ServerSidePropsError extends RouteError {
  constructor(message: string) {
    super(`Server-side props error: ${message}`, "SSR_ERROR");
  }
}

class NetworkError extends RouteError {
  constructor(message: string) {
    super(`Network error: ${message}`, "NETWORK_ERROR");
  }
}

/**
 * Logger utility for better debugging
 */
class RouterLogger {
  private static shouldLog(): boolean {
    // Only log when development environment variables are set
    return typeof window !== "undefined"
      ? process.env.PUBLIC_BUNEXT_DEV === "true"
      : process.env.__BUNEXT_DEV__ === "true";
  }

  static log(message: string, data?: any): void {
    if (this.shouldLog()) {
      console.log(`[Router] ${message}`, data);
    }
  }

  static warn(message: string, data?: any): void {
    if (this.shouldLog()) {
      console.warn(`[Router] ${message}`, data);
    }
  }

  static error(message: string, error?: any): void {
    // Always log errors
    console.error(`[Router] ${message}`, error);
  }
}

const globalX = globalThis as unknown as _GlobalData;

/**
 * Route matcher function that matches URL paths against defined routes.
 * Returns route information including matched parameters and module path.
 * 
 * @param path - The URL path to match against routes
 * @returns Match object with route details or null if no match found
 * 
 * @example
 * // Match a simple route
 * const result = match('/dashboard');
 * // Returns: { path: '/dashboard', params: {}, value: '/pages/dashboard/index.js' }
 * 
 * // Match a dynamic route
 * const userResult = match('/users/123');
 * // Returns: { path: '/users/[id]', params: { id: '123' }, value: '/pages/users/[id]/index.js' }
 * 
 * // No match returns null
 * const noMatch = match('/nonexistent');
 * // Returns: null
 */
export const match = globalX.__ROUTES__
  ? getRouteMatcher(globalX.__ROUTES__)
  : () => null;

const __MAIN_ROUTE__ = match(`${globalX.__INITIAL_ROUTE__}`)?.path;

/**
 * Enhanced server-side props fetching with caching and retry logic
 */
const propsCache = new Map<string, { data: ServerSideProps; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchServerSideProps(
  pathname: string,
  options: { useCache?: boolean; retries?: number } = {}
): Promise<ServerSideProps | undefined> {
  const { useCache = true, retries = 2 } = options;

  // Check cache first
  if (useCache) {
    const cached = propsCache.get(pathname);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      RouterLogger.log("Using cached server-side props", { pathname });
      return cached.data;
    }
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      RouterLogger.log(`Fetching server-side props (attempt ${attempt + 1})`, { pathname });

      const response = await fetch(pathname, {
        headers: {
          Accept: "application/vnd.server-side-props",
          "Cache-Control": "no-cache",
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (response.ok) {
        const props = ParseServerSideProps(await response.text());

        // Cache successful response
        if (useCache && props) {
          propsCache.set(pathname, { data: props, timestamp: Date.now() });
        }

        return props;
      }

      throw new ServerSidePropsError(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < retries) {
        RouterLogger.warn(`Retrying server-side props fetch in ${(attempt + 1) * 500}ms`, { pathname, error });
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 500));
      }
    }
  }

  if (lastError) {
    if (lastError instanceof ServerSidePropsError) {
      throw lastError;
    }
    throw new NetworkError(lastError.message);
  }

  return undefined;
}

/**
 * Parses server-side props from a JSON string with validation and error handling.
 * Used internally by the router to deserialize props sent from the server.
 * 
 * @param props - JSON string containing server-side props
 * @returns Parsed props object or undefined if parsing fails
 * 
 * @example
 * // Parse props from server response
 * const props = ParseServerSideProps('{"userId": "123", "theme": "dark"}');
 * console.log(props); // { userId: "123", theme: "dark" }
 * 
 * // Handle redirect props  
 * const redirectProps = ParseServerSideProps('{"redirect": "/login"}');
 * if (redirectProps?.redirect) {
 *   // Router will automatically navigate to redirect URL
 * }
 * 
 * // Invalid JSON returns undefined
 * const invalid = ParseServerSideProps('invalid json');
 * console.log(invalid); // undefined
 */
export function ParseServerSideProps(props: string): ServerSideProps | undefined {
  if (!props?.trim()) return undefined;

  try {
    const parsed = JSON.parse(props) as ServerSideProps;

    // Basic validation
    if (typeof parsed !== 'object' || parsed === null) {
      RouterLogger.warn("Invalid server-side props format", { props });
      return undefined;
    }

    return parsed;
  } catch (error) {
    RouterLogger.error("Failed to parse server-side props", error);
    return undefined;
  }
}

const VersionContext = createContext(0);

/**
 * Hook that returns a version number incremented on each route change or reload.
 * Useful for tracking route transitions and triggering side effects based on navigation.
 * 
 * @returns The current version number (incremented on each route change or reload)
 * 
 * @example
 * function MyComponent() {
 *   const version = useLoadingVersion();
 *   return React.createElement('div', null, `Current route version: ${version}`);
 * }
 */
export const useLoadingVersion = () => useContext(VersionContext);

/**
 * Hook that runs an effect when the route version changes (on navigation or reload).
 * Similar to useEffect but automatically includes the loading version as a dependency.
 * 
 * @param effect - The effect callback to run when version changes
 * @param deps - Additional dependencies for the effect
 * 
 * @example
 * function Analytics() {
 *   const pathname = usePathname();
 *   
 *   useLoadingEffect(() => {
 *     // Track page view on every route change
 *     analytics.track('page_view', { path: pathname });
 *   }, [pathname]);
 *   
 *   return null;
 * }
 */
export const useLoadingEffect = (
  effect: React.EffectCallback,
  deps: React.DependencyList = []
) => {
  useEffect(effect, [useContext(VersionContext), ...deps]);
};

/**
 * Hook that runs an effect when the route version changes, but skips the first run.
 * Useful for handling navigation changes without triggering on initial mount.
 * 
 * @param effect - The effect callback to run when version changes
 * @param deps - Additional dependencies for the effect
 * 
 * @example
 * function NavigationTracker() {
 *   useReloadEffect(() => {
 *     // This won't run on initial mount, only on navigation
 *     console.log('User navigated to a new page');
 *     // Send analytics event, update breadcrumbs, etc.
 *   });
 *   
 *   return null;
 * }
 */
export const useReloadEffect = (
  effect: React.EffectCallback,
  deps: React.DependencyList = []
) => {
  const [once, setOnce] = useState(true);
  useEffect(() => {
    if (once) {
      setOnce(false);
      return;
    }
    return effect();
  }, [useContext(VersionContext), ...deps]);
};

/**
 * Context that provides a function to programmatically reload the current page.
 * Used internally by the router to trigger page reloads and navigation.
 * Access this via the useReload() hook instead of using directly.
 */
export const ReloadContext = createContext(async (): Promise<void> => { });

/**
 * Hook that provides a function to programmatically reload the current page.
 * Uses the ReloadContext to access the router's reload functionality.
 * 
 * @returns A function that reloads the current page or navigates to a specific path
 * 
 * @example
 * // Basic page reload
 * function RefreshButton() {
 *   const reload = useReload();
 *   return React.createElement('button', { onClick: () => reload() }, 'Refresh Page');
 * }
 * 
 * // Navigate to specific path
 * function NavigateButton() {
 *   const reload = useReload();
 *   const handleClick = async () => {
 *     await reload('/dashboard'); // Navigate to specific route
 *   };
 *   return React.createElement('button', { onClick: handleClick }, 'Go to Dashboard');
 * }
 */
export function useReload() {
  const reload = useContext(ReloadContext);
  return reload;
}

/**
 * Hook that maintains state tied to the current route using browser history state.
 * The state persists across page reloads but is scoped to the current route.
 * Note: The value won't be synchronized across different components.
 * Use this hook only in top-level components to avoid state inconsistencies.
 * 
 * @param key - Unique identifier for the state value in history
 * @param initial - Initial value to use if no state exists
 * @returns A tuple containing [current value, setter function]
 * 
 * @example
 * function ProductPage() {
 *   const [selectedTab, setSelectedTab] = useRouteState('selectedTab', 'details');
 *   const [filters, setFilters] = useRouteState('filters', { category: 'all' });
 *   
 *   // State will persist when user navigates back/forward
 *   // State is automatically cleaned up when navigating to different routes
 *   return ProductPageContent({ selectedTab, setSelectedTab, filters, setFilters });
 * }
 */
export function useRouteState<T extends Record<string, any>>(key: string, initial: T): [T, (value: T) => void] {
  return useReducer((_old: T, newvalue: T) => {
    const routeState = history.state ?? {};
    if (routeState[key] !== newvalue) {
      history.replaceState({ ...routeState, [key]: newvalue }, "");
    }
    return newvalue;
  }, (globalThis.history?.state?.[key] ?? initial) as T);
}

/**
 * Enhanced module preloading with intelligent caching and performance optimization
 */
const preloadedPaths = new Set<string>();
const preloadPromises = new Map<string, Promise<void>>();

/**
 * Preloads a route module for faster navigation performance.
 * Intelligently caches preloaded modules and prevents duplicate requests.
 * Only works in production - skipped in development for hot reloading.
 * 
 * @param path - The route path to preload
 * @returns Promise that resolves when the module is preloaded
 * 
 * @example
 * function ProductLink({ productId }) {
 *   const handleMouseEnter = () => {
 *     // Preload the product page when user hovers over the link
 *     PreLoadPath(`/products/${productId}`);
 *   };
 *   
 *   return createElement('a', { 
 *     href: `/products/${productId}`,
 *     onMouseEnter: handleMouseEnter 
 *   }, 'View Product');
 * }
 * 
 * // Preload critical routes on app startup
 * useEffect(() => {
 *   PreLoadPath('/dashboard');
 *   PreLoadPath('/profile');
 * }, []);
 */
export function PreLoadPath(path: string): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return Promise.resolve();
  }

  if (preloadedPaths.has(path)) {
    return Promise.resolve();
  }

  // Return existing promise if already preloading
  if (preloadPromises.has(path)) {
    return preloadPromises.get(path)!;
  }

  const preloadPromise = (async () => {
    try {
      const matched = match(path.split("?")[0] as string);
      if (!matched) {
        throw new RouteNotFoundError(path);
      }

      await preloadModule(matched.value, { as: "script" });
      preloadedPaths.add(path);
      RouterLogger.log("Preloaded path", { path });
    } catch (error) {
      RouterLogger.warn(`Failed to preload path "${path}"`, error);
      throw error;
    } finally {
      preloadPromises.delete(path);
    }
  })();

  preloadPromises.set(path, preloadPromise);
  return preloadPromise;
}

/**
 * Batch preload multiple paths for better performance.
 * Preloads multiple route modules concurrently and returns settled promises.
 * 
 * @param paths - Array of route paths to preload
 * @returns Promise that resolves with results of all preload attempts
 * 
 * @example
 * // Preload multiple related routes
 * const preloadResults = await PreLoadPaths([
 *   '/products',
 *   '/products/featured',
 *   '/cart'
 * ]);
 * 
 * // Check which preloads succeeded
 * preloadResults.forEach((result, index) => {
 *   if (result.status === 'fulfilled') {
 *     console.log(`Preloaded ${paths[index]} successfully`);
 *   } else {
 *     console.warn(`Failed to preload ${paths[index]}:`, result.reason);
 *   }
 * });
 */
export function PreLoadPaths(paths: string[]): Promise<PromiseSettledResult<void>[]> {
  return Promise.allSettled(paths.map(PreLoadPath));
}

/**
 * Main router component that manages application routing and navigation.
 * Provides comprehensive features including error boundaries, loading states,
 * server-side props fetching, and preloading capabilities.
 * 
 * @param children - Initial children to render
 * @param normalizeUrl - Function to normalize URLs (optional)
 * @param Shell - Component that wraps each page (required)
 * @param onRouteUpdated - Callback when route changes (optional)
 * @param errorBoundary - Error boundary component for route errors (optional)
 * @param loadingComponent - Component to show during navigation (optional)
 * @param enablePreloading - Whether to enable route preloading (default: true)
 * 
 * @example
 * // Basic setup
 * function App() {
 *   return (
 *     <RouterHost Shell={AppShell}>
 *       <HomePage />
 *     </RouterHost>
 *   );
 * }
 * 
 * // With error handling and loading
 * function AppWithFeatures() {
 *   return (
 *     <RouterHost
 *       Shell={AppShell}
 *       errorBoundary={ErrorPage}
 *       loadingComponent={LoadingSpinner}
 *       onRouteUpdated={(path) => analytics.track('route_change', { path })}
 *     >
 *       <HomePage />
 *     </RouterHost>
 *   );
 * }
 */
export const RouterHost = ({
  children,
  normalizeUrl = (url: string) => url,
  Shell,
  onRouteUpdated,
  errorBoundary: ErrorBoundary,
  loadingComponent: LoadingComponent,
  enablePreloading = true,
}: {
  children: React.ReactElement;
  normalizeUrl?: (url: string) => string;
  Shell: React.ComponentType<{ children: React.ReactElement; route?: string }>;
  onRouteUpdated?: (path: string) => void;
  errorBoundary?: ComponentType<{ error: Error; retry: () => void }>;
  loadingComponent?: ComponentType;
  enablePreloading?: boolean;
}) => {
  const pathname = useLocationProperty(
    () => normalizeUrl(location.pathname + location.search),
    () => globalX.__INITIAL_ROUTE__
  );

  const [current, setCurrent] = useState(children);
  const [version, setVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const versionRef = useRef<number>(version);
  const abortControllerRef = useRef<AbortController | null>(null);

  const reload = useCallback(
    async (target: string = location.pathname + location.search): Promise<void> => {
      if (typeof target !== "string") {
        throw new Error(`Invalid target: ${target}`);
      }

      const currentVersion =
        process.env.NODE_ENV === "development"
          ? ++versionRef.current
          : versionRef.current;

      try {
        setIsLoading(true);
        setError(null);

        const matched = match(target.split("?")[0] as string);
        if (!matched) {
          throw new RouteNotFoundError(target);
        }

        await OnDevRouterUpdate(matched);

        const [props, module] = await Promise.all([
          fetchServerSideProps(target),
          import(
            `${matched.value}${process.env.NODE_ENV === "development" ? `?${currentVersion}` : ""
            }`
          ),
        ]);

        globalThis.__SERVERSIDE_PROPS__ = props;

        const JsxToDisplay = await NextJsLayoutStacker({
          page: await module.default({
            props,
            params: matched.params,
          }),
          currentVersion,
          match: matched,
        });

        if (currentVersion === versionRef.current) {
          if (props?.redirect) {
            navigate(props.redirect as RoutesType);
          } else {
            startTransition(() => {
              onRouteUpdated?.(target);
              setVersion(currentVersion);
              setIsLoading(false);

              setCurrent(
                <Shell route={target} {...props}>
                  {JsxToDisplay}
                </Shell>
              );
            });
          }
        }
      } catch (error) {
        const routeError = error instanceof RouteError ? error : new RouteError(
          error instanceof Error ? error.message : "Unknown routing error",
          "ROUTING_ERROR"
        );

        console.error("Router error:", routeError);
        setError(routeError);
        setIsLoading(false);

        if (!ErrorBoundary) {
          // Fallback to location.href if no error boundary
          location.href = target;
        }
      }
    },
    [ErrorBoundary, onRouteUpdated]
  );
  useEffect(() => {
    if (pathname === globalX.__INITIAL_ROUTE__) {
      onRouteUpdated?.(pathname);
      // @ts-ignore
      delete globalX.__INITIAL_ROUTE__;
    } else {
      reload(pathname).catch((error) => {
        console.error("Failed to reload route:", error);
        if (!ErrorBoundary) {
          location.href = pathname;
        }
      });
    }
  }, [pathname, reload, onRouteUpdated, ErrorBoundary]);

  // Render error boundary if error exists and ErrorBoundary component is provided
  if (error && ErrorBoundary) {
    return (
      <ErrorBoundary
        error={error}
        retry={() => {
          setError(null);
          reload(pathname);
        }}
      />
    );
  }

  // Render loading component if loading and LoadingComponent is provided
  if (isLoading && LoadingComponent) {
    return <LoadingComponent />;
  }

  return (
    <ReloadContext.Provider value={reload}>
      <VersionContext.Provider value={version}>
        {current}
      </VersionContext.Provider>
    </ReloadContext.Provider>
  );
};

const onDevRouteUpdateCallbacks: Map<string, () => Promise<void> | void> = new Map();

export function AddOnDevRouteUpdateCallback(callback: () => Promise<void> | void, id: string): void {
  if (process.env.NODE_ENV !== "development") return;
  if (typeof callback !== "function") {
    throw new TypeError("Callback must be a function");
  }
  onDevRouteUpdateCallbacks.set(id, callback);
}

/**
 * Enhanced development router update with better error handling
 */
async function OnDevRouterUpdate(matched: Exclude<Match, null>): Promise<void> {
  if (process.env.NODE_ENV !== "development") return;
  if (matched.path === __MAIN_ROUTE__) return;

  try {
    await fetch(window.location.href);
  } catch (error) {
    console.warn("Failed to update dev router:", error);
  }
  const callbacks = Array.from(onDevRouteUpdateCallbacks.values());
  if (callbacks.length === 0) return;
  await Promise.all(callbacks.map((cb) => cb()?.catch((err) => {
    console.warn("Error in onDevRouteUpdate callback:", err);
  })));

}

/**
 * Enhanced SessionProvider with intelligent session management and performance optimizations.
 * Manages user sessions with automatic cleanup, timeout handling, and sync across server actions.
 * 
 * @param children - React components to wrap with session context
 * @param config - Configuration options for session management
 * @param config.enableLogging - Enable debug logging (default: true in development)
 * @param config.autoCleanup - Automatically clean up expired sessions (default: true)
 * @param config.syncInterval - Interval for checking session updates in ms (default: 1000)
 * 
 * @example
 * // Basic usage
 * function App() {
 *   return (
 *     <SessionProvider>
 *       <RouterHost Shell={AppShell}>
 *         <HomePage />
 *       </RouterHost>
 *     </SessionProvider>
 *   );
 * }
 * 
 * // With custom configuration
 * function AppWithCustomSession() {
 *   return (
 *     <SessionProvider config={{
 *       enableLogging: false,
 *       autoCleanup: true,
 *       syncInterval: 2000
 *     }}>
 *       <App />
 *     </SessionProvider>
 *   );
 * }
 */
export function SessionProvider({
  children,
  config = {}
}: {
  children: React.ReactNode;
  config?: {
    enableLogging?: boolean;
    autoCleanup?: boolean;
    syncInterval?: number;
  };
}) {
  const {
    enableLogging = process.env.NODE_ENV === "development",
    autoCleanup = true,
    syncInterval = 1000
  } = config;

  const [updater, setUpdater] = useState(false);
  const session = useMemo(
    () => new BunextSession({
      updateFunction: setUpdater,
      enableLogging
    }),
    [enableLogging]
  );

  const [sessionTimer, setSessionTimer] = useState<Timer>();
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const mountedRef = useRef(true);

  const timerSetter = useCallback(() => {
    if (!mountedRef.current) return;

    setSessionTimer((currentTimer) => {
      if (currentTimer) {
        clearTimeout(currentTimer);
      }

      // Priority 1: Use global session timeout from server response (it's a timestamp)
      const globalSessionTimeout = globalThis.__SESSION_TIMEOUT__;
      if (globalSessionTimeout && globalSessionTimeout > Date.now()) {
        const timeoutDuration = globalSessionTimeout - Date.now();

        RouterLogger.log("Setting session timer using global timeout", {
          timeoutDuration,
          globalTimeout: globalSessionTimeout,
          currentTime: Date.now()
        });

        return setTimeout(() => {
          if (mountedRef.current && autoCleanup) {
            try {
              RouterLogger.log("Session expired (global timeout), cleaning up");
              session.delete();
            } catch (error) {
              RouterLogger.error("Failed to delete expired session", error);
            }
          }
        }, timeoutDuration);
      }

      // Priority 2: Fallback to calculated expiration using session metadata
      const sessionTimeoutSeconds = session.getExpiration();
      const sessionCreatedAt = session.getMetadata().created;

      if (!sessionCreatedAt || sessionTimeoutSeconds <= 0) {
        RouterLogger.log("Session has no valid creation time or timeout, skipping timer", {
          sessionCreatedAt,
          sessionTimeoutSeconds,
          globalTimeout: globalSessionTimeout
        });
        return undefined;
      }

      const expirationTime = sessionCreatedAt + (sessionTimeoutSeconds * 1000);
      const currentTime = Date.now();
      const timeoutDuration = expirationTime - currentTime;

      // Only set timer if session has a valid future expiration
      if (timeoutDuration > 0) {
        RouterLogger.log("Setting session timer using calculated expiration", {
          timeoutDuration,
          expirationTime,
          sessionTimeoutSeconds
        });

        return setTimeout(() => {
          if (mountedRef.current && autoCleanup) {
            try {
              RouterLogger.log("Session expired (calculated), cleaning up");
              session.delete();
            } catch (error) {
              RouterLogger.error("Failed to delete expired session", error);
            }
          }
        }, timeoutDuration);
      } else {
        RouterLogger.log("Session already expired, skipping timer", {
          expirationTime,
          timeoutDuration,
          globalTimeout: globalSessionTimeout
        });
        return undefined;
      }
    });
  }, [session, autoCleanup]);

  const addToServerActionCallback = useCallback(
    () =>
      AddServerActionCallback((res) => {
        if (!mountedRef.current) return;

        try {
          RouterLogger.log("Received server response for session update");

          // Get session data from response headers
          const sessionData = GetSessionFromResponse(res);

          // Get timeout from response headers
          const timeoutHeader = res.headers.get("__bunext_session_timeout__");
          let sessionTimeout: number | undefined;

          if (timeoutHeader) {
            try {
              sessionTimeout = JSON.parse(timeoutHeader) as number;
              RouterLogger.log("Received session timeout from server", {
                timeout: sessionTimeout,
                currentTime: Date.now()
              });
            } catch (error) {
              RouterLogger.warn("Failed to parse session timeout header", { timeoutHeader, error });
            }
          }

          // Use the enhanced updateFromServerAction method
          if (sessionData && Object.keys(sessionData).length > 0) {
            session.updateFromServerAction(sessionData, {
              updateTimeout: sessionTimeout,
              triggerRerender: true
            });

            // Reset timer if we have a valid timeout
            if (sessionTimeout && sessionTimeout > Date.now()) {
              // Convert timestamp to seconds for setExpiration
              const timeoutInSeconds = Math.floor((sessionTimeout - Date.now()) / 1000);
              session.setExpiration(timeoutInSeconds);
              timerSetter();
            } else if (sessionTimeout) {
              RouterLogger.warn("Received expired session timeout from server", {
                timeout: sessionTimeout,
                currentTime: Date.now()
              });
            }
          } else {
            RouterLogger.log("No session data received from server action");
          }

        } catch (error) {
          RouterLogger.error("Failed to update session from server response", error);
        }
      }, "update_session_callback"),
    [session, timerSetter]
  );

  useEffect(() => {
    mountedRef.current = true;
    addToServerActionCallback();

    // Immediate check for session data that might already be available
    if (globalThis.__PUBLIC_SESSION_DATA__ && Object.keys(globalThis.__PUBLIC_SESSION_DATA__).length > 0) {
      RouterLogger.log("Session data immediately available from script tag", {
        keys: Object.keys(globalThis.__PUBLIC_SESSION_DATA__)
      });

      const sessionData = globalThis.__PUBLIC_SESSION_DATA__;
      const sessionTimeout = globalThis.__SESSION_TIMEOUT__;

      // Update session and trigger rerender
      session.updateFromServerAction(sessionData, {
        updateTimeout: sessionTimeout,
        triggerRerender: true
      });

      // Synchronize session metadata with global timeout
      session.synchronizeWithGlobalTimeout();

      // Set up timer if we have a valid timeout
      if (sessionTimeout && sessionTimeout > Date.now()) {
        RouterLogger.log("Setting up session timer from immediately available data", {
          timeout: sessionTimeout,
          currentTime: Date.now()
        });
        timerSetter();
      }

      // Skip the polling since we already have data
      return () => {
        mountedRef.current = false;
        if (sessionTimer) {
          clearTimeout(sessionTimer);
        }
      };
    }

    // Initial session synchronization - check for session data from script tag
    let initialSessionCheckCount = 0;
    const maxInitialChecks = 10; // Maximum number of checks
    const initialCheckInterval = 100; // Check every 100ms for faster detection

    const initialSessionChecker = setInterval(() => {
      if (!mountedRef.current) {
        clearInterval(initialSessionChecker);
        return;
      }

      initialSessionCheckCount++;

      try {
        // Check if session data is available from script tag
        if (globalThis.__PUBLIC_SESSION_DATA__ && Object.keys(globalThis.__PUBLIC_SESSION_DATA__).length > 0) {
          RouterLogger.log("Session data found from script tag, initializing client session", {
            keys: Object.keys(globalThis.__PUBLIC_SESSION_DATA__)
          });

          // Get session data and timeout
          const sessionData = globalThis.__PUBLIC_SESSION_DATA__;
          const sessionTimeout = globalThis.__SESSION_TIMEOUT__;

          // Update session and trigger rerender
          session.updateFromServerAction(sessionData, {
            updateTimeout: sessionTimeout,
            triggerRerender: true
          });

          // Synchronize session metadata with global timeout
          session.synchronizeWithGlobalTimeout();

          // Set up timer if we have a valid timeout
          if (sessionTimeout && sessionTimeout > Date.now()) {
            RouterLogger.log("Setting up session timer from script tag data", {
              timeout: sessionTimeout,
              currentTime: Date.now()
            });
            timerSetter();
          }

          // Stop checking since we found session data
          clearInterval(initialSessionChecker);
          return;
        }

        // Stop checking after max attempts - no session available
        if (initialSessionCheckCount >= maxInitialChecks) {
          RouterLogger.log("Completed initial session checks, no session data in script tag");
          clearInterval(initialSessionChecker);
        }

      } catch (error) {
        RouterLogger.warn("Error during initial session check", { error });

        // Stop checking on error after a few attempts
        if (initialSessionCheckCount >= 5) {
          clearInterval(initialSessionChecker);
        }
      }
    }, initialCheckInterval);

    // Enhanced session data synchronization for ongoing updates
    const sessionDataTimer = setInterval(() => {
      if (!mountedRef.current) return;

      try {
        // Only process if we have session data from script tag or server actions
        if (globalThis.__PUBLIC_SESSION_DATA__ && Object.keys(globalThis.__PUBLIC_SESSION_DATA__).length > 0) {
          RouterLogger.log("Processing session data from global state");

          // Update session data first
          const publicData = globalThis.__PUBLIC_SESSION_DATA__;
          session.setData(publicData, true); // Set as public data

          // Synchronize session metadata with global timeout
          session.synchronizeWithGlobalTimeout();

          session.update();

          // Check if session has valid expiration
          const globalSessionTimeout = globalThis.__SESSION_TIMEOUT__;
          const sessionTimeoutSeconds = session.getExpiration();
          const sessionCreatedAt = session.getMetadata().created;

          if (globalSessionTimeout && globalSessionTimeout > Date.now()) {
            // Use the global session timeout from server response (it's a timestamp)
            RouterLogger.log("Valid session data found using global timeout, setting up timer", {
              globalTimeout: globalSessionTimeout,
              currentTime: Date.now()
            });
            timerSetter();
          } else if (sessionCreatedAt && sessionTimeoutSeconds > 0) {
            // Fallback to calculated expiration time
            const expirationTime = sessionCreatedAt + (sessionTimeoutSeconds * 1000);
            if (expirationTime > Date.now()) {
              RouterLogger.log("Valid session data found using calculated expiration, setting up timer", {
                expirationTime,
                sessionTimeoutSeconds
              });
              timerSetter();
            } else {
              RouterLogger.log("Session data found but calculated expiration is expired", {
                expirationTime,
                sessionTimeoutSeconds
              });
            }
          } else {
            RouterLogger.log("Session data found but no valid expiration", {
              globalTimeout: globalSessionTimeout,
              sessionTimeoutSeconds,
              sessionCreatedAt,
              currentTime: Date.now()
            });
          }

          // Clear the interval after successful processing to prevent unnecessary polling
          clearInterval(sessionDataTimer);
          syncIntervalRef.current = undefined;
        }
      } catch (error) {
        RouterLogger.error("Failed to process session data", error);
      }
    }, syncInterval);

    syncIntervalRef.current = sessionDataTimer;

    return () => {
      mountedRef.current = false;

      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = undefined;
      }

      if (sessionTimer) {
        clearTimeout(sessionTimer);
      }
    };
  }, [addToServerActionCallback, timerSetter, session, syncInterval]);

  return (
    <SessionContext.Provider value={session}>
      <SessionDidUpdateContext.Provider value={updater}>
        {children}
      </SessionDidUpdateContext.Provider>
    </SessionContext.Provider>
  );
}

/**
 * Enhanced layout stacker with better error handling and type safety.
 * Stacks layout components from parent directories to wrap the current page.
 * 
 * @param page - The page JSX element to wrap with layouts
 * @param currentVersion - Version number for cache busting in development
 * @param match - The matched route object containing path and params
 * @returns Promise that resolves to the final JSX element with all layouts applied
 * 
 * @example
 * // This function is used internally by RouterHost
 * const wrappedPage = await NextJsLayoutStacker({
 *   page: <MyPage />,
 *   currentVersion: 1,
 *   match: { path: '/dashboard/users', params: {} }
 * });
 * // Result: <RootLayout><DashboardLayout><MyPage /></DashboardLayout></RootLayout>
 */
export async function NextJsLayoutStacker({
  page,
  currentVersion,
  match,
}: {
  page: JSX.Element;
  currentVersion: number;
  match: Exclude<Match, null>;
}): Promise<JSX.Element> {
  let currentPath = "/";
  const layoutStack: Array<LayoutComponent> = [];
  const formattedPath = match.path === "/" ? [""] : match.path.split("/");

  for (const pathSegment of formattedPath) {
    currentPath += pathSegment.length > 0 ? pathSegment : "";

    if (globalX.__LAYOUT_ROUTE__.includes(currentPath)) {
      try {
        const layoutModule = await import(
          normalize(
            `/${globalX.__PAGES_DIR__}${currentPath}/layout.js${process.env.NODE_ENV === "development" ? "?" + currentVersion : ""
            }`
          )
        );

        if (layoutModule.default) {
          layoutStack.push(layoutModule.default);
        }
      } catch (error) {
        console.warn(`Failed to load layout for path "${currentPath}":`, error);
      }
    }

    if (pathSegment.length > 0) {
      currentPath += "/";
    }
  }

  layoutStack.reverse();
  let currentJsx = page;

  for (const Layout of layoutStack) {
    try {
      currentJsx = await Layout({
        children: currentJsx,
        params: match.params,
      });
    } catch (error) {
      console.error("Layout rendering error:", error);
      // Continue with previous JSX if layout fails
    }
  }

  return currentJsx;
}

/**
 * Enhanced path normalization with better edge case handling
 */
function normalize(path: string): string {
  if (!path) return "/";

  // Remove multiple slashes
  path = path.replace(/\/+/g, "/");

  // Remove leading slash, will be added later
  if (path.startsWith("/")) {
    path = path.substring(1);
  }

  // Remove trailing slash
  if (path.endsWith("/") && path.length > 1) {
    path = path.slice(0, -1);
  }

  const segments = path.split("/");
  let normalizedPath = "/";

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
    const segment = segments[segmentIndex];

    if (segment === "." || segment === "") {
      // Skip single dots and empty segments
      continue;
    }

    if (segment === "..") {
      // Go up one level if possible
      const lastSlashIndex = normalizedPath.lastIndexOf("/");
      if (lastSlashIndex > 0) {
        normalizedPath = normalizedPath.substring(0, lastSlashIndex);
      } else {
        normalizedPath = "/";
      }
      continue;
    }

    // Append path segment
    if (!normalizedPath.endsWith("/")) {
      normalizedPath += "/";
    }
    normalizedPath += segment;
  }

  return normalizedPath === "" ? "/" : normalizedPath;
}

/**
 * Enhanced location subscription with better performance
 */
const subscribeToLocationUpdates = (callback: () => void) => {
  const abort = new AbortController();
  const options = { signal: abort.signal, passive: true };

  for (const event of events) {
    window.addEventListener(event, callback, options);
  }

  return () => abort.abort();
};

/**
 * Hook that synchronizes with browser location changes for accessing location properties.
 * Uses React's useSyncExternalStore for efficient location state management.
 * 
 * @param fn - Function that extracts a property from the location object
 * @param ssrFn - Optional function for server-side rendering fallback
 * @returns The current value of the location property
 * 
 * @example
 * // Get current pathname
 * const pathname = useLocationProperty(() => location.pathname);
 * 
 * // Get search params with SSR fallback
 * const search = useLocationProperty(
 *   () => location.search,
 *   () => ''
 * );
 * 
 * // Get full URL
 * const fullUrl = useLocationProperty(() => location.href);
 */
export function useLocationProperty<S extends Location[keyof Location]>(
  fn: () => S,
  ssrFn?: () => S
): S {
  return useSyncExternalStore(subscribeToLocationUpdates, fn, ssrFn);
}

/**
 * Hook that returns the current pathname from the URL.
 * Works both on client-side (using window.location) and server-side (using request context).
 * 
 * @returns The current pathname (e.g., '/dashboard/users')
 * 
 * @example
 * function MyComponent() {
 *   const pathname = usePathname();
 *   
 *   return (
 *     <div>
 *       <p>Current path: {pathname}</p>
 *       {pathname.startsWith('/admin') && <AdminToolbar />}
 *     </div>
 *   );
 * }
 * 
 * // Use in conditional rendering
 * function Navigation() {
 *   const pathname = usePathname();
 *   
 *   return (
 *     <nav>
 *       <Link href="/" className={pathname === '/' ? 'active' : ''}>Home</Link>
 *       <Link href="/about" className={pathname === '/about' ? 'active' : ''}>About</Link>
 *     </nav>
 *   );
 * }
 */
export function usePathname(): string {
  const requestContext = useContext(RequestContext);

  if (typeof window !== "undefined") {
    return location.pathname;
  }

  try {
    const url = requestContext?.request?.url;
    if (url) {
      return new URL(url).pathname;
    }
  } catch (error) {
    console.warn("Failed to get pathname from request context:", error);
  }

  return "/";
}

/**
 * Programmatically navigate to a different route with type safety.
 * Updates browser history and triggers route changes in the application.
 * 
 * @param to - The route path to navigate to (typed with RoutesType)
 * @param options - Navigation options
 * @param options.replace - Whether to replace current history entry instead of pushing new one
 * 
 * @example
 * // Basic navigation
 * navigate('/dashboard');
 * 
 * // Replace current history entry
 * navigate('/login', { replace: true });
 * 
 * // Navigate with query parameters
 * navigate('/search?q=react');
 * 
 * // Navigate in event handlers
 * function LoginButton() {
 *   const handleLogin = async () => {
 *     await loginUser();
 *     navigate('/dashboard');
 *   };
 *   
 *   return <button onClick={handleLogin}>Login</button>;
 * }
 */
export const navigate = (
  to: RoutesType,
  options: { replace?: boolean } = {}
): void => {
  const { replace = false } = options;
  const method = replace ? eventReplaceState : eventPushState;

  try {
    history[method](null, "", to);
  } catch (error) {
    console.error("Navigation failed:", error);
    // Fallback to location assignment
    if (replace) {
      location.replace(to);
    } else {
      location.assign(to);
    }
  }
};

// Event constants for better maintainability
const eventPopstate = "popstate" as const;
const eventPushState = "pushState" as const;
const eventReplaceState = "replaceState" as const;
const events = [eventPopstate, eventPushState, eventReplaceState] as const;

/**
 * Enhanced history patching with better error handling
 */
if (typeof history !== "undefined") {
  for (const type of [eventPushState, eventReplaceState] as const) {
    const original = history[type];

    history[type] = function (...args: Parameters<typeof original>) {
      try {
        const result = original.apply(this, args);
        const event = new Event(type);

        unstable_batchedUpdates(() => {
          dispatchEvent(event);
        });

        return result;
      } catch (error) {
        console.error(`History ${type} failed:`, error);
        throw error;
      }
    };
  }
}
