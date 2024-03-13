"use client";
import React, {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { unstable_batchedUpdates } from "react-dom";
import { getRouteMatcher } from "./utils/get-route-matcher";
import type { _GlobalData } from "../types";
export * from "./components/Link";
export * from "./hooks/useLink";

const globalX = globalThis as unknown as _GlobalData;

const match = globalX.__ROUTES__
  ? getRouteMatcher(globalX.__ROUTES__)
  : () => null;

async function fetchServerSideProps(pathname: string) {
  const response = await fetch(pathname, {
    headers: {
      Accept: "application/vnd.server-side-props",
      "Cache-Control": "no-cache",
    },
  });
  if (response.ok) {
    const text = await response.text();
    return eval(`(${text})`);
  }
  throw new Error("Failed to fetch");
}

const VersionContext = createContext(0);

/**
 * a hook that returns a version number that is incremented on each route change or reload
 * @returns the current version (incremented on each route change or reload)
 */
export const useLoadingVersion = () => useContext(VersionContext);

/**
 * a hook that runs an effect when the version changes, which is incremented on each route change or reload
 * @param effect the effect to run
 * @param deps the dependencies
 */
export const useLoadingEffect = (
  effect: React.EffectCallback,
  deps: React.DependencyList = []
) => {
  useEffect(effect, [useContext(VersionContext), ...deps]);
};

/**
 * a hook that runs an effect when the version changes, which is incremented on each route change or reload.
 * and skips the first run.
 * @param effect the effect to run
 * @param deps the dependencies
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
 * a context that can be used to reload the current page
 */
export const ReloadContext = createContext(async (): Promise<void> => {});

/**
 * Returns a stateful value which bounded to route, and a function to update it.
 * Note that the value won't be updated across components.
 * So you should use this only in top-most component
 * @param key unique key
 * @param initial initial value
 * @returns value and setter
 */
export function useRouteState<T extends {}>(key: string, initial: T) {
  return useReducer((_old: T, newvalue: T) => {
    const routeState = history.state ?? {};
    if (routeState[key] !== newvalue)
      history.replaceState({ ...routeState, [key]: newvalue }, "");
    return newvalue;
  }, (globalThis.history?.state?.[key] ?? initial) as unknown as T);
}

export const RouterHost = ({
  children,
  normalizeUrl = (url: string) => url,
  Shell,
  onRouteUpdated,
}: {
  children: React.ReactElement;
  normalizeUrl?: (url: string) => string;
  Shell: React.ComponentType<{ children: React.ReactElement; route?: string }>;
  onRouteUpdated?: (path: string) => void;
}) => {
  const pathname = useLocationProperty(
    () => normalizeUrl(location.pathname + location.search),
    () => globalX.__INITIAL_ROUTE__
  );
  const [current, setCurrent] = useState(children);
  const [version, setVersion] = useState(0);
  const versionRef = useRef<number>(version);
  const reload = useCallback(
    async (target = location.pathname + location.search) => {
      if (typeof target !== "string") throw new Error("invalid target", target);
      const currentVersion = ++versionRef.current;
      const [module, props] = await Promise.all([
        import(
          `${match(target.split("?")[0])!.value}${
            globalX.__DEV_MODE__ ? `?${currentVersion}` : ""
          }`
        ),
        fetchServerSideProps(target),
      ]);
      let JsxToDisplay = <module.default {...props?.props} />;
      switch (globalX.__DISPLAY_MODE__) {
        case "nextjs":
          JsxToDisplay = await NextJsLayoutStacker(
            JsxToDisplay,
            target,
            currentVersion
          );
          break;
      }
      if (currentVersion === versionRef.current) {
        if (props?.redirect) {
          navigate(props.redirect);
        } else {
          startTransition(() => {
            onRouteUpdated?.(target);
            setVersion(currentVersion);

            setCurrent(
              <Shell route={target} {...props}>
                {JsxToDisplay}
              </Shell>
            );
          });
        }
      }
    },
    []
  );
  useEffect(() => {
    if (pathname === globalX.__INITIAL_ROUTE__) {
      onRouteUpdated?.(pathname);
      // @ts-ignore
      delete globalX.__INITIAL_ROUTE__;
    } else {
      reload(pathname).catch((e) => {
        console.log(e);
        location.href = pathname;
      });
    }
  }, [pathname]);
  return (
    <ReloadContext.Provider value={reload}>
      <VersionContext.Provider value={version}>
        {current}
      </VersionContext.Provider>
    </ReloadContext.Provider>
  );
};

async function NextJsLayoutStacker(
  page: JSX.Element,
  path: string,
  currentVersion: number
) {
  let currentPath = "/";
  type _layout = ({ children }: { children: JSX.Element }) => JSX.Element;
  let layoutStack: Array<_layout> = [];
  const formatedPath = path == "/" ? [""] : path.split("/");
  for await (const p of formatedPath) {
    currentPath += p.length > 0 ? p : "";
    if (globalX.__LAYOUT_ROUTE__.includes(normalize(currentPath))) {
      layoutStack.push(
        (
          await import(
            normalize(
              `${globalX.__PAGES_DIR__}${currentPath}/${globalX.__LAYOUT_NAME__}.js?${currentVersion}`
            )
          )
        ).default
      );
    }
    if (p.length > 0) currentPath += "/";
  }
  layoutStack.push(() => page);
  layoutStack = layoutStack.reverse();
  let currentJsx = <></>;
  for (const Element of layoutStack) {
    currentJsx = <Element children={currentJsx} />;
  }
  return currentJsx;
}

function normalize(path: string) {
  // remove multiple slashes
  path = path.replace(/\/+/g, "/");
  // remove leading slash, will be added further
  if (path.startsWith("/")) path = path.substring(1);
  // remove trailing slash
  if (path.endsWith("/")) path = path.slice(0, -1);
  let segments = path.split("/");
  let normalizedPath = "/";
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
    if (segments[segmentIndex] === "." || segments[segmentIndex] === "") {
      // skip single dots and empty segments
      continue;
    }
    if (segments[segmentIndex] === "..") {
      // go up one level if possible
      normalizedPath = normalizedPath.substring(
        0,
        normalizedPath.lastIndexOf("/") + 1
      );
      continue;
    }
    // append path segment
    if (!normalizedPath.endsWith("/")) normalizedPath = normalizedPath + "/";
    normalizedPath = normalizedPath + segments[segmentIndex];
  }
  return normalizedPath;
}

const subscribeToLocationUpdates = (callback: () => void) => {
  const abort = new AbortController();
  for (const event of events) {
    window.addEventListener(event, callback, { signal: abort.signal });
  }
  return () => abort.abort();
};

export function useLocationProperty<S extends Location[keyof Location]>(
  fn: () => S,
  ssrFn?: () => S
) {
  return useSyncExternalStore(subscribeToLocationUpdates, fn, ssrFn);
}

/**
 * a hook that returns the current pathname
 * @returns the current pathname
 */
export function usePathname() {
  return useLocationProperty(
    () => location.pathname,
    () => globalX.__INITIAL_ROUTE__
  );
}

/**
 * a function that navigates/replaces to a path
 * @param to the path to navigate to
 * @param param1 the options, which can include `replace`
 */
export const navigate = (to: string, { replace = false } = {}) =>
  history[replace ? eventReplaceState : eventPushState](null, "", to);

const eventPopstate = "popstate";
const eventPushState = "pushState";
const eventReplaceState = "replaceState";
const events = [eventPopstate, eventPushState, eventReplaceState];

if (typeof history !== "undefined") {
  for (const type of [eventPushState, eventReplaceState] as const) {
    const original = history[type];
    history[type] = function (...args: Parameters<typeof original>) {
      const result = original.apply(this, args);
      const event = new Event(type);
      unstable_batchedUpdates(() => {
        dispatchEvent(event);
      });
      return result;
    };
  }
}
