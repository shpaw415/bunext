"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type JSX,
  type ComponentType,
  type ReactNode,
} from "react";
import { getRouteMatcher, type Match } from "./utils/get-route-matcher";
import type { _GlobalData, ServerSideProps } from "../types";
import { RequestContext } from "../server/context";
import type { RoutesType } from "../../plugins/typed-route/type";
import { preloadModule } from "react-dom";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { Shell } from "bunext-js/client/shell";
import { events, navigate } from "./client";
import { SessionProvider } from "plugins/session/provider";
import { ErrorFallback } from "components/fallback";


/**
 * Enhanced type definitions for better type safety
 */
export type RouterConfig = {
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

type RouteParams = Record<string, string | string[]>;

type LayoutComponent = (props: { children: JSX.Element; params: RouteParams }) => JSX.Element;

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
export class RouterLogger {
  private static shouldLog(): boolean {
    // Only log when development environment variables are set
    if (process.env.NODE_ENV == "production" && typeof window != "undefined") return false;
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

/**
 * Enhanced server-side props fetching with caching and retry logic
 */
const propsCache = new Map<string, { data: ServerSideProps; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchServerSideProps(
  pathname: string,
  options: { useCache?: boolean; retries?: number } = {}
): Promise<ServerSideProps<{}> | undefined | null> {
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
        if (props?.redirect) {
          navigate(props.redirect as RoutesType);
        }
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
export function ParseServerSideProps<Props extends Record<string, unknown>>(props: string): ServerSideProps<Props> | undefined {
  if (!props?.trim()) return undefined;

  try {
    const parsed = JSON.parse(props) as ServerSideProps<Props>;

    // Basic validation
    if (parsed === null) {
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
  const pathname = usePathname();
  useEffect(() => {
    if (once) {
      setOnce(false);
      return;
    }
    return effect();
  }, [pathname, ...deps]);
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

      preloadModule(matched.value, { as: "script" });
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

function formatSameLevelPath(fileName: string, basePath: string): string {
  const pathArray = basePath.split("/");
  pathArray.pop();
  pathArray.push(fileName);
  console.log("Formatted same level path:", pathArray.join("/"));
  return pathArray.join("/");
}

function importIfExists<T>(path: string, checkList: string[]): Promise<{ default: T }> | null {
  console.log(`Checking import for:s ${path}`, { checkList });
  if (checkList.includes(path)) {
    return import(path);
  }
  return null;
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
  onRouteUpdated,
}: {
  children: React.ReactNode;
  normalizeUrl?: (url: string) => string;
  onRouteUpdated?: (path: string) => void;
  enablePreloading?: boolean;
}) => {
  const pathname = useLocationProperty(
    () => normalizeUrl(location.pathname + location.search),
    () => globalThis.__INITIAL_ROUTE__
  );

  const [current, setCurrent] = useState(children);
  const componentsRef = useRef<{
    ErrorComponent: ((error: Error) => ReactNode) | null;
    LoadingComponent: (() => JSX.Element) | null
  }>({
    ErrorComponent: null,
    LoadingComponent: null
  });

  useEffect(() => {
    Promise.all([
      importIfExists<(error: Error) => ReactNode>(formatSameLevelPath("error.js", "/" + globalThis.__PAGES_DIR__ + location.pathname), globalThis.__ERROR_COMPONENTS__),
      importIfExists<() => JSX.Element>(formatSameLevelPath("loading.js", "/" + globalThis.__PAGES_DIR__ + location.pathname), globalThis.__LOADING_COMPONENTS__)
    ]).then(([errorComponent, loadingComponent]) => {
      componentsRef.current = {
        ErrorComponent: errorComponent?.default || null,
        LoadingComponent: loadingComponent?.default || null
      };
    });
  }, []);

  const [version, setVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const versionRef = useRef<number>(version);
  const firstLoad = useRef(true);

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

        const matched = match(target.split("?")[0] as string);
        if (!matched) {
          throw new RouteNotFoundError(target);
        }

        const awaitDev = OnDevRouterUpdate();

        const props = await fetchServerSideProps(target, {
          useCache: process.env.NODE_ENV == "production",
        });

        if (typeof props == "object" && props?.redirect) {
          navigate(props.redirect as RoutesType);
          return;
        }

        await awaitDev;

        const [module, loadingComponent, errorComponent] = await Promise.all([
          import(
            firstLoad.current ? matched.value : [
              matched.value,
              "?__BUNEXT_NAVIGATE__=true",
              `&__BUNEXT_PATHNAME__=${encodeURI(target)}`,
              (process.env.NODE_ENV === "development" ? `&__BUNEXT_VERSION__=${currentVersion}` : "")
            ].join("")
          ),
          importIfExists<() => JSX.Element>(formatSameLevelPath("loading.js", matched.value), globalThis.__LOADING_COMPONENTS__),
          importIfExists<(error: Error) => ReactNode>(formatSameLevelPath("error.js", matched.value), globalThis.__ERROR_COMPONENTS__)
        ]);

        componentsRef.current = {
          LoadingComponent: loadingComponent?.default || null,
          ErrorComponent: errorComponent?.default || null
        };

        firstLoad.current = false;

        if (currentVersion === versionRef.current) {
          onRouteUpdated?.(target);
          setVersion(currentVersion);
          setIsLoading(false);
          setCurrent(await CreatePage({
            module,
            props,
            currentVersion,
            matched,
          }));
        }
      } catch (error) {
        const routeError = error instanceof RouteError ? error : new RouteError(
          error instanceof Error ? error.message : "Unknown routing error",
          "ROUTING_ERROR"
        );

        console.error("Router error:", routeError);
        setIsLoading(false);

        setCurrent(componentsRef.current.ErrorComponent?.(routeError) || ErrorFallback({ error: routeError }) || null);
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
          if (process.env?.PUBLIC_BUNEXT_DEV !== "true") location.href = pathname;
        }
      });
    }
  }, [pathname, reload, onRouteUpdated, ErrorBoundary]);

  console.log("Loading component:", componentsRef.current.LoadingComponent);
  return (
    <ReloadContext.Provider value={reload}>
      <VersionContext.Provider value={version}>
        <SessionProvider>
          <ErrorBoundary fallback={componentsRef.current.ErrorComponent || undefined}>
            <Shell>
              {isLoading && componentsRef.current.LoadingComponent ? <componentsRef.current.LoadingComponent /> : current}
            </Shell>
          </ErrorBoundary>
        </SessionProvider>
      </VersionContext.Provider>
    </ReloadContext.Provider >
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
async function OnDevRouterUpdate(): Promise<void> {
  if (process.env.NODE_ENV !== "development") return;
  //if (matched.path === __MAIN_ROUTE__) return;

  try {
    await fetch(window.location.href, {
      method: "PATCH",
      headers: {
        "cache-control": "no-store",
        "x-bunext-dev-router-update": "true",
      },
    });
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
 * Layout cache for performance optimization
 */
const layoutCache = new Map<string, LayoutComponent | null>();

/**
 * Build all possible layout paths from a route path.
 * For a path like '/dashboard/users/[id]', this generates:
 * ['/', '/dashboard', '/dashboard/users', '/dashboard/users/[id]']
 * 
 * @param routePath - The route path to build layout paths from
 * @returns Array of all possible layout paths in hierarchical order
 */
function buildLayoutPaths(routePath: string): string[] {
  if (routePath === '/') return ['/'];

  const segments = routePath.split('/').filter(Boolean);
  const paths: string[] = ['/'];

  let currentPath = '';
  for (const segment of segments) {
    currentPath += `/${segment}`;
    paths.push(currentPath);
  }

  return paths;
}

/**
 * Load a single layout component with caching and error handling.
 * 
 * @param layoutPath - The path to check for a layout
 * @param currentVersion - Version for cache busting in development
 * @returns Promise that resolves to the layout component or null if not found
 */
async function loadLayoutComponent(
  layoutPath: string,
  currentVersion: number
): Promise<LayoutComponent | null> {
  const cacheKey = `${layoutPath}:${currentVersion}`;

  // Check cache first (skip cache in development for hot reloading)
  if (process.env.NODE_ENV === 'production' && layoutCache.has(cacheKey)) {
    return layoutCache.get(cacheKey) || null;
  }

  // Check if this path has a layout
  if (!globalX.__LAYOUT_ROUTE__.includes(layoutPath)) {
    layoutCache.set(cacheKey, null);
    return null;
  }

  try {
    const layoutModulePath = normalize(
      `/${globalX.__PAGES_DIR__}${layoutPath}/layout.js${process.env.NODE_ENV === "development" ? `?${currentVersion}` : ""
      }`
    );

    RouterLogger.log(`Loading layout for path: ${layoutPath}`, { modulePath: layoutModulePath });

    const layoutModule = await import(layoutModulePath) as { default?: LayoutComponent };

    const layoutComponent = layoutModule.default || null;
    layoutCache.set(cacheKey, layoutComponent);

    if (layoutComponent) {
      RouterLogger.log(`Successfully loaded layout for path: ${layoutPath}`);
    } else {
      RouterLogger.warn(`Layout module found but no default export for path: ${layoutPath}`);
    }

    return layoutComponent;
  } catch (error) {
    RouterLogger.error(`Failed to load layout for path "${layoutPath}"`, error);
    layoutCache.set(cacheKey, null);
    return null;
  }
}

async function LayoutGetter(match: Exclude<Match, null>, currentVersion: number) {
  // Build all possible layout paths in hierarchical order
  const layoutPaths = buildLayoutPaths(match.path);

  // Load all layout components concurrently
  const layoutPromises = layoutPaths.map(path =>
    loadLayoutComponent(path, currentVersion)
  );

  const loadedLayouts = await Promise.all(layoutPromises);

  // Filter out null layouts and reverse for correct nesting order
  const layoutStack = loadedLayouts
    .filter((layout): layout is LayoutComponent => layout !== null)
    .reverse(); // Reverse so outermost layout is first

  return layoutStack;
}

/**
 * Recursively renders layout components in a nested structure.
 * Each layout component wraps its children with the next layout in the stack.
 * 
 * @param layoutList - Array of layout components to render (outermost first)
 * @param children - The JSX element to wrap with layouts (typically the page component)
 * @param params - Route parameters to pass to each layout component
 * @returns The nested layout structure with the children at the center
 * 
 * @example
 * // With layouts [RootLayout, DashboardLayout] and children <Page />
 * // Returns: <RootLayout><DashboardLayout><Page /></DashboardLayout></RootLayout>
 */
function LayoutStack({
  layoutList,
  children,
  params
}: {
  layoutList: LayoutComponent[];
  children: JSX.Element;
  params: RouteParams;
}): JSX.Element {
  if (layoutList.length === 0) {
    return children;
  }

  const [CurrentLayout, ...remainingLayouts] = layoutList;

  return (
    <CurrentLayout params={params}>
      <LayoutStack layoutList={remainingLayouts} params={params}>
        {children}
      </LayoutStack>
    </CurrentLayout>
  );
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
  const pathname = requestContext?.match?.pathname || "/";
  return pathname;

}



export async function CreatePage({
  matched,
  props,
  module,
  currentVersion,
}: {
  matched: Exclude<Match, null>,
  props?: ServerSideProps<{}> | null,
  currentVersion: number,
  module: { default: (args: { props: unknown; params: Record<string, unknown> }) => JSX.Element },
}): Promise<JSX.Element> {

  if (typeof window != "undefined") globalThis.__SERVERSIDE_PROPS__ = props;

  const layoutStack = await LayoutGetter(matched, currentVersion);

  return (
    <ErrorBoundary resetOnPropsChange={true}>
      <LayoutStack layoutList={layoutStack} params={matched.params}>
        {module.default({
          props,
          params: matched.params,
        })}
      </LayoutStack>
    </ErrorBoundary>
  );
}



