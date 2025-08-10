"use client";
import { hydrateRoot, type ErrorInfo } from "react-dom/client";
import { CreatePage, RouterHost } from "./router/index";
import { getRouteMatcher } from "./router/utils/get-route-matcher";
import type { ReactShellComponent, ServerSideProps, _GlobalData } from "./types";
import React, { type JSX } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";

const globalX = globalThis as unknown as _GlobalData;

const match =
  typeof window == "undefined" ? () => { } : getRouteMatcher(globalX.__ROUTES__);

export async function hydrate(
  Shell: ReactShellComponent,
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
  const Initial = await import(matched.value) as { default: (args: { props: unknown; params: Record<string, unknown> }) => JSX.Element };

  /*const JsxToDisplay: JSX.Element = await NextJsLayoutStacker({
    page: Initial.default({
      props: globalX.__SERVERSIDE_PROPS__,
      params: matched.params,
    }),
    currentVersion: 0,
    match: matched,
  });*/

  const jsxPage = await CreatePage({
    matched,
    props: globalX.__SERVERSIDE_PROPS__,
    module: Initial,
    currentVersion: 0,
  });

  return hydrateRoot(
    document,
    <RouterHost Shell={Shell} {...options}>
      <Shell
        route={globalX.__INITIAL_ROUTE__}
        {...globalX.__SERVERSIDE_PROPS__ as ServerSideProps}
      >
        <ErrorBoundary>
          {jsxPage}
        </ErrorBoundary>
      </Shell>
    </RouterHost>,
    { onRecoverableError }
  );
}
