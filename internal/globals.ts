import type { HeadData } from "public/head";
import { jsxDEV, Fragment, type JSXSource } from "react/jsx-dev-runtime";
import { jsxs, jsx } from "react/jsx-runtime";
import React from "react";
import type { _GlobalData, ServerConfig } from "./types";


declare global {
  var MakeServerActionRequest: (
    props: Array<any>,
    serverActionID: string
  ) => Promise<any>;

  var jsx_w77yafs4: (
    type: React.ElementType,
    props: unknown,
    key?: React.Key
  ) => React.ReactElement;
  var jsx: (
    type: React.ElementType,
    props: unknown,
    key?: React.Key
  ) => React.ReactElement;
  var jsxDEV_7x81h0kn: (
    type: React.ElementType,
    props: unknown,
    key: React.Key | undefined,
    isStatic: boolean,
    source?: JSXSource,
    self?: unknown
  ) => React.ReactElement;
  var jsxDEV: (
    type: React.ElementType,
    props: unknown,
    key: React.Key | undefined,
    isStatic: boolean,
    source?: JSXSource,
    self?: unknown
  ) => React.ReactElement;
  var jsxs_eh6c78nj: (
    type: React.ElementType,
    props: unknown,
    key?: React.Key
  ) => React.ReactElement;
  var jsxs: (
    type: React.ElementType,
    props: unknown,
    key?: React.Key
  ) => React.ReactElement;
  var Fragment_8vg9x3sq: React.ExoticComponent<{
    children?: React.ReactNode | undefined;
  }>;
  var Fragment: React.ExoticComponent<{
    children?: React.ReactNode | undefined;
  }>;

  var __ROUTES__: Record<string, string>;
  var __DEV_ROUTE_PREFETCH__: Array<string>;
  var __PAGES_DIR__: "src/pages";
  var __INITIAL_ROUTE__: string;
  var __LAYOUT_ROUTE__: string[];
  var __CSS_PATHS__: string[];
  var __HEAD_DATA__: HeadData;
  var serverConfig: ServerConfig;
  var __PROCESS_ENV__: Record<string, string>;
  var Context: React.Context<any>;
}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: "development" | "production";
    }
  }
}

globalThis.React = React;
globalThis.jsx_w77yafs4 = jsx;
globalThis.jsx = jsx;
globalThis.jsxDEV_7x81h0kn = jsxDEV;
globalThis.jsxDEV = jsxDEV;
globalThis.jsxs_eh6c78nj = jsxs;
globalThis.jsxs = jsxs;
globalThis.Fragment_8vg9x3sq = Fragment;
globalThis.Fragment = Fragment;
globalThis.__ROUTES__ ??= {};
globalThis.Context ??= React.createContext(undefined);


export const paths = {
  bunextDirName: ".bunext",
  bunextModulePath: process.env.__BUNEXT_DEV__ ? "" : "node_modules/bunext-js",
  basePagePath: "src/pages",
  basePath: "src",
  staticPath: "static",
} as const;

export const names = {
  bunextModuleName: "bunext",
  loadScriptPath: "/bunext-scripts",
} as const;

