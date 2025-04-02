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
} from "react";
import { unstable_batchedUpdates } from "react-dom";
import { getRouteMatcher, type Match } from "./utils/get-route-matcher";
import type { _GlobalData } from "../types";
import {
  _Session,
  SessionContext,
  SessionDidUpdateContext,
} from "../../features/session";
import { AddServerActionCallback } from "../globals";
import { RequestContext } from "../context";
const globalX = globalThis as unknown as _GlobalData;

export const match = globalX.__ROUTES__
  ? getRouteMatcher(globalX.__ROUTES__)
  : () => null;

const __MAIN_ROUTE__ = match(`${globalX.__INITIAL_ROUTE__}`)?.path;

async function fetchServerSideProps(pathname: string) {
  const response = await fetch(pathname, {
    headers: {
      Accept: "application/vnd.server-side-props",
      "Cache-Control": "no-cache",
    },
  });
  if (response.ok) {
    return ParseServerSideProps(await response.text());
  }
  throw new Error("Failed to fetch");
}

export function ParseServerSideProps(props: string) {
  if (props?.length > 0) return JSON.parse(props) as Record<string, any>;
  else return undefined;
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

export function useReload() {
  const reload = useContext(ReloadContext);
  return reload;
}

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
      try {
        const matched = match(target.split("?").at(0) as string);
        if (!matched) throw new Error("no match found");
        await OnDevRouterUpdate(matched);
        const [props, module] = await Promise.all([
          fetchServerSideProps(target),
          import(
            `${matched.value}${
              process.env.NODE_ENV == "development" ? `?${currentVersion}` : ""
            }`
          ),
        ]);
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
      } catch (e) {
        console.log(e);
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

async function OnDevRouterUpdate(matched: Exclude<Match, null>) {
  if (process.env.NODE_ENV != "development") return;
  if (matched.path == __MAIN_ROUTE__) return;
  window.location.href = window.location.href;
  return new Promise(() => {});
}

export function SessionProvider({ children }: { children: any }) {
  const [updater, setUpdater] = useState(false);
  const session = useMemo(
    () => new _Session({ update_function: setUpdater }),
    []
  );
  const [sessionTimer, setSessionTimer] = useState<Timer>();

  const timerSetter = useCallback(() => {
    setSessionTimer((c) => {
      clearTimeout(c);
      return setTimeout(() => {
        session.__DATA__.public = {};
        session.setSessionTimeout(0);
        session.update();
      }, session.getSessionTimeout() - new Date().getTime());
    });
  }, []);

  const addToServerActionCallback = useCallback(
    () =>
      AddServerActionCallback((res) => {
        session.update();
        session.setSessionTimeout(
          JSON.parse(
            res.headers.get("__bunext_session_timeout__") as string
          ) as number
        );
        timerSetter();
      }, "update_session_callback"),
    []
  );
  useEffect(() => {
    addToServerActionCallback();
    const sessionDataTimer = setInterval(() => {
      if (globalThis.__PUBLIC_SESSION_DATA__) {
        if (session.getSessionTimeout() > 0) timerSetter();
        session.__DATA__.public = globalThis.__PUBLIC_SESSION_DATA__;
        clearInterval(sessionDataTimer);
        session.update();
      }
    }, 1000);
  }, []);

  return (
    <SessionContext.Provider value={session}>
      <SessionDidUpdateContext.Provider value={updater}>
        {children}
      </SessionDidUpdateContext.Provider>
    </SessionContext.Provider>
  );
}

type _layout = ({
  children,
}: {
  children: JSX.Element;
  params: Record<string, string | string[]>;
}) => JSX.Element | Promise<JSX.Element>;

export async function NextJsLayoutStacker({
  page,
  currentVersion,
  match,
}: {
  page: JSX.Element;
  currentVersion: number;
  match: Exclude<Match, null>;
}) {
  let currentPath = "/";

  let layoutStack: Array<_layout> = [];
  const formatedPath = match.path == "/" ? [""] : match.path.split("/");

  for await (const p of formatedPath) {
    currentPath += p.length > 0 ? p : "";
    if (globalX.__LAYOUT_ROUTE__.includes(currentPath)) {
      layoutStack.push(
        (
          await import(
            normalize(
              `/${globalX.__PAGES_DIR__}${currentPath}/layout.js${
                process.env.NODE_ENV == "development"
                  ? "?" + currentVersion
                  : ""
              }`
            )
          )
        ).default
      );
    }
    if (p.length > 0) currentPath += "/";
  }

  layoutStack = layoutStack.reverse();
  let currentJsx = page;
  for await (const Layout of layoutStack) {
    currentJsx = await Layout({
      children: currentJsx,
      params: match.params,
    });
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
  const requestContext = useContext(RequestContext);
  if (typeof window != "undefined") return location.pathname;
  return new URL(requestContext?.request.url as string).pathname;
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
