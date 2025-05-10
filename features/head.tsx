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
} from "react";
import type { Match } from "../internal/router/utils/get-route-matcher";
import { generateRandomString, normalize } from "./utils";
import { RequestContext } from "../internal/server/context";
import { useRequest } from "./request/hooks";

export type _Head = {
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

class HeadDataClass {
  public head: Record<string, _Head> = {};
  public currentPath?: string;

  /**
   * @description
   * \<head\> data to be set
   * To be set in the page file
   * @example
   * setHead({data: {title: "my title"}});
   * "OR"
   *setHead({data: {
   *  title: "my title"
   * },
   *  path: "/"
   * }); // for other path (must be called within the src/pages folder)
   * @param path not mandatory but can be used to set head data for a page Ex: /users
   * @param data to be set
   */
  public setHead({ data, path }: { data: _Head; path: string }) {
    this.head[path] = data;
  }
  /**
   * DO NOT USE THIS FUNCTION
   * @param path path to the module index
   */
  public _setCurrentPath(path: string) {
    this.currentPath = path
      .split("pages")
      .slice(1)
      .join("pages")
      .replace("/index.tsx", "");
    if (this.currentPath.length == 0) this.currentPath = "/";
  }
}

const Head = new HeadDataClass();

function deepMerge(obj: _Head, assign: _Head): _Head {
  const copy = structuredClone(obj || {});
  for (const key of Object.keys(assign || {}) as Array<keyof _Head>) {
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

function setParamOnDevMode() {
  if (process.env.NODE_ENV == "development")
    return `?${generateRandomString(5)}`;
  else return "";
}

function GlobalDataFromServerSide(): _GlobalData {
  return {
    __CSS_PATHS__: router.cssPathExists,
    __LAYOUT_ROUTE__: router.layoutPaths,
    __PAGES_DIR__: router.pageDir,
  } as any;
}

function GetCssPaths(match: Match, options?: { onlyFilePath?: boolean }) {
  if (!match) return [];
  const globalX =
    typeof window != "undefined"
      ? (globalThis as unknown as _GlobalData)
      : (GlobalDataFromServerSide() as _GlobalData);
  let currentPath = "/";

  const cssPaths: Array<string> = [];
  const formatedPath = match.path == "/" ? [""] : match.path.split("/");

  for (const p of formatedPath) {
    currentPath += p.length > 0 ? p : "";
    if (globalX.__LAYOUT_ROUTE__.includes(currentPath)) {
      const normailizePath = normalize(
        `/${globalX.__PAGES_DIR__}${currentPath}/layout.css`
      );
      if (globalX.__CSS_PATHS__.includes(normailizePath))
        cssPaths.push(
          normailizePath + (options?.onlyFilePath ? "" : setParamOnDevMode())
        );
    }
    if (p.length > 0) currentPath += "/";
  }
  const cssPath = match.value.split(".");
  cssPath.pop();
  if (globalX.__CSS_PATHS__.includes(normalize(`${cssPath.join(".")}.css`))) {
    cssPaths.push(
      normalize(
        `${cssPath.join(".")}.css${
          options?.onlyFilePath ? "" : setParamOnDevMode()
        }`
      )
    );
  }

  return cssPaths;
}

type headProviderType = [(data: _Head) => void, string];
const HeadContext = createContext<headProviderType>([() => {}, "/"]);
function HeadProvider({
  currentPath,
  children,
}: {
  currentPath: string;
  children: any;
}) {
  const globalX = globalThis as unknown as _globalThis;

  const [reload, setReload] = useState(false);
  const request = useContext(RequestContext);

  useReloadEffect(() => {
    process.env.NODE_ENV == "development" && setReload(true);
  }, []);
  useEffect(() => {
    setReload(false);
  }, [reload]);
  currentPath = currentPath.split("?")[0];

  const path = useMemo(() => {
    if (typeof window != "undefined") {
      return match(currentPath)?.path;
    } else {
      return router.server?.match(currentPath)?.name;
    }
  }, [currentPath]);

  const [cssPaths, setCssPaths] = useState<string[]>([]);
  useEffect(() => {
    setCssPaths(GetCssPaths(match(currentPath)));
  }, [currentPath]);

  if (!path) throw new Error(currentPath + " not found");

  const PreloadedHeadData = useMemo(
    () =>
      typeof window != "undefined"
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

  const [data, setData] = useState<_Head>({});

  useMemo(() => setData({}), [path]);

  const dataSetter = useCallback(
    (data: _Head) => {
      setData(
        typeof window != "undefined"
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
  );
}

function HeadElement({
  data,
  path,
  style,
}: {
  data: _Head;
  path: string;
  style: _Head["link"];
}) {
  const getPaths = () =>
    GetCssPaths(
      {
        value: normalize(
          `/${router.pageDir}/${path == "/" ? "index" : path}.js`
        ),
        params: {},
        path: path,
      },
      {
        onlyFilePath: true,
      }
    ).map((path) => `${router.buildDir}${path}`);

  const getStringData = (filePath: string) => {
    const buffer = require("fs").readFileSync(filePath);
    return buffer.toString("utf-8") as string;
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
      {typeof window == "undefined" &&
        getPaths().map((path, i) => (
          <style
            key={i}
            dangerouslySetInnerHTML={{
              __html: getStringData(path),
            }}
          />
        ))}
      {typeof window != "undefined" &&
        style?.map((props, i) => <link key={i} rel="stylesheet" {...props} />)}
    </head>
  );
}
/**
 *
 * @param data default value
 * @returns updater function for updating headValue
 */
function useHead({ data }: { data?: _Head }) {
  const [updater, path] = useContext(HeadContext);
  const request = useRequest();
  if (request && data) request.setHead(data);

  useEffect(() => {
    data && updater(data);
  }, []);
  return updater;
}

function HeadComponent({ ...props }: _Head) {
  useHead({ data: props });
  return <></>;
}

export { Head, HeadComponent, useHead, HeadProvider };
