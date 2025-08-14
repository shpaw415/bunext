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

  const jsxPage = await CreatePage({
    matched,
    props: globalThis.__SERVERSIDE_PROPS__,
    module: Initial,
    currentVersion: 0,
  });

  return hydrateRoot(
    document,
    <RouterHost Shell={Shell} {...options}>
      <Shell
        route={globalX.__INITIAL_ROUTE__}
        props={globalThis.__SERVERSIDE_PROPS__}
      >
        <ErrorBoundary>
          {jsxPage}
        </ErrorBoundary>
      </Shell>
    </RouterHost>,
    { onRecoverableError }
  );
}
