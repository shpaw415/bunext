"use client";
import { hydrateRoot, type ErrorInfo } from "react-dom/client";
import { NextJsLayoutStacker, RouterHost } from "./router/index";
import { getRouteMatcher } from "./router/utils/get-route-matcher";
import type { ServerSideProps, _DisplayMode, _GlobalData } from "./types";
import React from "react";

const globalX = globalThis as unknown as _GlobalData;

const match =
  typeof window == "undefined" ? () => {} : getRouteMatcher(globalX.__ROUTES__);

export async function hydrate(
  Shell: React.ComponentType<
    { children: React.ReactElement } & ServerSideProps
  >,
  {
    onRecoverableError = () => void 8,
    ...options
  }: Omit<
    React.ComponentPropsWithoutRef<typeof RouterHost>,
    "Shell" | "children"
  > & {
    onRecoverableError?: (error: unknown, errorInfo: ErrorInfo) => void;
  } = {}
) {
  const matched = match(globalX.__INITIAL_ROUTE__.split("?")[0])!;
  const Initial = await import(matched.value);

  const JsxToDisplay: JSX.Element = await NextJsLayoutStacker({
    page: Initial.default({
      props: globalX.__SERVERSIDE_PROPS__,
      params: matched.params,
    }),
    currentVersion: 0,
    match: matched,
  });
  return hydrateRoot(
    document,
    <RouterHost Shell={Shell} {...options}>
      <Shell
        route={globalX.__INITIAL_ROUTE__}
        {...globalX.__SERVERSIDE_PROPS__}
      >
        {JsxToDisplay}
      </Shell>
    </RouterHost>,
    { onRecoverableError }
  );
}
