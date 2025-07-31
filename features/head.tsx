"use client";
import { match, useReloadEffect } from "../internal/router/index";
import type { _GlobalData, _globalThis } from "../internal/types";
import { router } from "../internal/server/router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  Component,
} from "react";
import type { ErrorInfo } from "react";
import type { Match } from "../internal/router/utils/get-route-matcher";
import { generateRandomString, normalize } from "./utils";
import { RequestContext } from "../internal/server/context";
import { useRequest } from "./request/hooks";

export type HeadData = {
  title?: string;
  author?: string;
  publisher?: string;
  meta?: React.DetailedHTMLProps<
    React.MetaHTMLAttributes<HTMLMetaElement>,
    HTMLMetaElement
  >[];
  link?: React.DetailedHTMLProps<
    React.LinkHTMLAttributes<HTMLLinkElement>,
    HTMLLinkElement
  >[];
};

// Legacy type alias for backward compatibility
export type _Head = HeadData;

class HeadDataClass {
  public head: Record<string, HeadData> = {};
  public currentPath?: string;

  /**
   * Sets head data for a specific path
   * @param data - The head data to set
   * @param path - The route path (e.g., "/users", "/")
   * @example
   * Head.setHead({
   *   data: { title: "My Page" },
   *   path: "/"
   * });
   */
  public setHead({ data, path }: { data: HeadData; path: string }): void {
    if (!path || typeof path !== 'string') {
      console.warn('[Bunext Head] Invalid path provided to setHead:', path);
      return;
    }
    this.head[path] = data;
  }

  /**
   * Gets head data for a specific path
   * @param path - The route path
   * @returns Head data for the path or undefined
   */
  public getHead(path: string): HeadData | undefined {
    return this.head[path];
  }

  /**
   * Merges head data with existing data for a path
   * @param data - The head data to merge
   * @param path - The route path
   */
  public mergeHead({ data, path }: { data: HeadData; path: string }): void {
    if (!path || typeof path !== 'string') {
      console.warn('[Bunext Head] Invalid path provided to mergeHead:', path);
      return;
    }

    const existing = this.head[path] || {};
    this.head[path] = deepMerge(existing, data);
  }

  /**
   * Removes head data for a specific path
   * @param path - The route path
   */
  public removeHead(path: string): void {
    if (this.head[path]) {
      delete this.head[path];
    }
  }

  /**
   * Clears all head data
   */
  public clearAll(): void {
    this.head = {};
  }

  /**
   * Gets all registered paths
   * @returns Array of registered paths
   */
  public getPaths(): string[] {
    return Object.keys(this.head);
  }

  /**
   * Internal method - sets the current path based on file system structure
   * @private
   * @param path - The file system path
   */
  public _setCurrentPath(path: string): void {
    if (!path || typeof path !== 'string') {
      this.currentPath = '/';
      return;
    }

    this.currentPath = path
      .split("pages")
      .slice(1)
      .join("pages")
      .replace("/index.tsx", "");

    if (this.currentPath.length === 0) {
      this.currentPath = "/";
    }
  }
}

const Head = new HeadDataClass();

/**
 * Error boundary for head management system
 */
class HeadErrorBoundary extends Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Bunext Head] Error in head management:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <head suppressHydrationWarning>
          <title>Error - Bunext</title>
          <meta name="description" content="An error occurred while loading page metadata" />
        </head>
      );
    }

    return this.props.children;
  }
}

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
        if (copy[key]) copy[key].push(...(assign[key] as any));
        else copy[key] = assign[key] as any;
        break;
    }
  }
  return copy;
}

function setParamOnDevMode(): string {
  if (process.env.NODE_ENV === "development") {
    return `?${generateRandomString(5)}`;
  }
  return "";
}

function GlobalDataFromServerSide(): _GlobalData {
  return {
    __CSS_PATHS__: router.cssPathExists,
    __LAYOUT_ROUTE__: router.layoutPaths,
    __PAGES_DIR__: router.pageDir,
  } as any;
}

// CSS path cache for performance optimization
const cssPathCache = new Map<string, string[]>();
const CSS_CACHE_MAX_SIZE = 100;

function GetCssPaths(match: Match, options?: { onlyFilePath?: boolean }): string[] {
  if (!match) return [];

  // Create cache key
  const cacheKey = `${match.path}-${match.value}-${JSON.stringify(options)}`;

  // Check cache first
  if (cssPathCache.has(cacheKey)) {
    return cssPathCache.get(cacheKey)!;
  }

  const globalX =
    typeof window !== "undefined"
      ? (globalThis as unknown as _GlobalData)
      : (GlobalDataFromServerSide() as _GlobalData);

  let currentPath = "/";
  const cssPaths: Array<string> = [];
  const formattedPath = match.path === "/" ? [""] : match.path.split("/");

  for (const pathSegment of formattedPath) {
    currentPath += pathSegment.length > 0 ? pathSegment : "";

    if (globalX.__LAYOUT_ROUTE__.includes(currentPath)) {
      const normalizedPath = normalize(
        `/${globalX.__PAGES_DIR__}${currentPath}/layout.css`
      );

      if (globalX.__CSS_PATHS__.includes(normalizedPath)) {
        cssPaths.push(
          normalizedPath + (options?.onlyFilePath ? "" : setParamOnDevMode())
        );
      }
    }

    if (pathSegment.length > 0) currentPath += "/";
  }

  const cssPath = match.value.split(".");
  cssPath.pop();
  const cssFilePath = normalize(`${cssPath.join(".")}.css`);

  if (globalX.__CSS_PATHS__.includes(cssFilePath)) {
    cssPaths.push(
      normalize(
        `${cssFilePath}${options?.onlyFilePath ? "" : setParamOnDevMode()}`
      )
    );
  }

  // Cache the result with size limit
  if (cssPathCache.size >= CSS_CACHE_MAX_SIZE) {
    const firstKey = cssPathCache.keys().next().value;
    if (firstKey) {
      cssPathCache.delete(firstKey);
    }
  }
  cssPathCache.set(cacheKey, cssPaths);

  return cssPaths;
}

type headProviderType = [(data: HeadData) => void, string];
const HeadContext = createContext<headProviderType>([() => { }, "/"]);

function HeadProvider({
  currentPath,
  children,
}: {
  currentPath: string;
  children: React.ReactNode;
}) {
  const globalX = globalThis as unknown as _globalThis;
  const [reload, setReload] = useState(false);
  const request = useContext(RequestContext);

  useReloadEffect(() => {
    if (process.env.NODE_ENV === "development") {
      setReload(true);
    }
  }, []);

  useEffect(() => {
    setReload(false);
  }, [reload]);

  // Clean up query parameters from the path
  const cleanPath = useMemo(() => currentPath.split("?")[0], [currentPath]);

  const path = useMemo(() => {
    try {
      if (typeof window !== "undefined") {
        return match(cleanPath)?.path;
      } else {
        return router.server?.match(cleanPath)?.name;
      }
    } catch (error) {
      console.error('[Bunext Head] Error matching path:', cleanPath, error);
      return undefined;
    }
  }, [cleanPath]);

  // Memoized CSS paths to avoid recalculation
  const cssPaths = useMemo(() => {
    try {
      const matchData = match(cleanPath);
      return matchData ? GetCssPaths(matchData) : [];
    } catch (error) {
      console.error('[Bunext Head] Error getting CSS paths:', error);
      return [];
    }
  }, [cleanPath]);

  if (!path) {
    throw new Error(`[Bunext Head] Route not found: ${cleanPath}`);
  }

  const PreloadedHeadData = useMemo(
    () =>
      typeof window !== "undefined"
        ? deepMerge(
          globalX.__HEAD_DATA__["*"] || {},
          globalX.__HEAD_DATA__[path]
        )
        : deepMerge(Head.head["*"] || {}, {
          ...Head.head[path],
          ...request?.headData?.[path],
        }),
    [path]
  );

  const [data, setData] = useState<HeadData>({});

  // Reset data when path changes - use useEffect instead of useMemo for side effects
  useEffect(() => {
    setData({});
  }, [path]);

  const dataSetter = useCallback(
    (data: HeadData) => {
      setData(
        typeof window !== "undefined"
          ? deepMerge(globalX.__HEAD_DATA__["*"] || {}, {
            ...globalX.__HEAD_DATA__[path],
            ...data,
          })
          : deepMerge(Head.head["*"] || {}, { ...Head.head[path], ...data })
      );
    },
    [path]
  );

  const providerData: headProviderType = useMemo(
    () => [dataSetter, path],
    [dataSetter, path]
  );

  return (
    <HeadErrorBoundary>
      <HeadContext.Provider value={providerData}>
        {!reload && (
          <HeadElement
            path={path}
            data={{
              ...PreloadedHeadData,
              ...data,
              link: [...(data?.link ?? [])],
            }}
            style={cssPaths.map((link) => ({
              rel: "stylesheet",
              href: link,
            }))}
          />
        )}
        {children}
      </HeadContext.Provider>
    </HeadErrorBoundary>
  );
}

function HeadElement({
  data,
  path,
  style,
}: {
  data: HeadData;
  path: string;
  style: HeadData["link"];
}) {
  const getPaths = () => {
    try {
      return GetCssPaths(
        {
          value: normalize(
            `/${router.pageDir}/${path === "/" ? "index" : path}.js`
          ),
          params: {},
          path: path,
        },
        {
          onlyFilePath: true,
        }
      ).map((path) => `${router.buildDir}${path}`);
    } catch (error) {
      console.error('[Bunext Head] Error getting paths:', error);
      return [];
    }
  };

  const getStringData = (filePath: string) => {
    try {
      const fs = require("fs");
      if (!fs.existsSync(filePath)) {
        console.warn(`[Bunext Head] CSS file not found: ${filePath}`);
        return '';
      }
      const buffer = fs.readFileSync(filePath);
      return buffer.toString("utf-8") as string;
    } catch (error) {
      console.error(`[Bunext Head] Error reading CSS file ${filePath}:`, error);
      return '';
    }
  };

  return (
    <head suppressHydrationWarning>
      {data?.title && <title>{data.title}</title>}
      {data?.author && <meta name="author" content={data.author} />}
      {data?.publisher && <meta name="publisher" content={data.publisher} />}
      {data?.meta?.map((e, index) => (
        <meta key={index} {...e} />
      ))}
      {data?.link?.map((e, index) => (
        <link key={index} {...e} />
      ))}
      {typeof window === "undefined" &&
        getPaths().map((cssPath, i) => {
          const cssContent = getStringData(cssPath);
          return cssContent ? (
            <style
              key={i}
              dangerouslySetInnerHTML={{
                __html: cssContent,
              }}
            />
          ) : null;
        })}
      {typeof window !== "undefined" &&
        style?.map((props, i) => <link key={i} rel="stylesheet" {...props} />)}
    </head>
  );
}
/**
 * Utility functions for head management
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
   * Preloads CSS paths for given routes
   */
  preloadCssPaths(routes: string[]): void {
    routes.forEach(route => {
      try {
        const matchData = match(route);
        if (matchData) {
          GetCssPaths(matchData);
        }
      } catch (error) {
        console.warn(`[Bunext Head] Failed to preload CSS for route: ${route}`, error);
      }
    });
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
  }
};

/**
 * Hook for managing head data within components
 * @param data - Default head data to set
 * @returns updater function for updating head data
 */
function useHead({ data }: { data?: HeadData } = {}) {
  const [updater, path] = useContext(HeadContext);
  const request = useRequest();

  // Validate data if provided
  const validatedData = useMemo(() => {
    if (data && !HeadUtils.validateHeadData(data)) {
      console.warn('[Bunext Head] Invalid head data provided to useHead:', data);
      return undefined;
    }
    return data;
  }, [data]);

  // Set head data on server-side request if available
  useEffect(() => {
    if (request && validatedData) {
      try {
        request.setHead(validatedData);
      } catch (error) {
        console.error('[Bunext Head] Error setting head data on request:', error);
      }
    }
  }, [request, validatedData]);

  // Update head data on client-side
  useEffect(() => {
    if (validatedData) {
      try {
        updater(validatedData);
      } catch (error) {
        console.error('[Bunext Head] Error updating head data:', error);
      }
    }
  }, [validatedData, updater]);

  // Return a safe updater function
  const safeUpdater = useCallback((newData: HeadData) => {
    if (!HeadUtils.validateHeadData(newData)) {
      console.warn('[Bunext Head] Invalid head data provided to updater:', newData);
      return;
    }

    try {
      updater(newData);
    } catch (error) {
      console.error('[Bunext Head] Error in head updater:', error);
    }
  }, [updater]);

  return safeUpdater;
}

function HeadComponent({ ...props }: HeadData) {
  useHead({ data: props });
  return <></>;
}

export {
  Head,
  HeadComponent,
  useHead,
  HeadProvider,
  HeadUtils,
  HeadErrorBoundary
};
