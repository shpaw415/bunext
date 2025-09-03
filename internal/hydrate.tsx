"use client";
import { hydrateRoot, type ErrorInfo } from "react-dom/client";
import { CreatePage, RouterHost } from "./router/index";
import { getRouteMatcher } from "./router/utils/get-route-matcher";
import type { _GlobalData } from "./types";
import React, { StrictMode, type JSX } from "react";
import { initBunextGlobal } from "internal/bunext_global";

await initBunextGlobal();

const match =
  typeof window == "undefined" ? () => { } : getRouteMatcher(globalThis.__ROUTES__);

export async function hydrate(
  {
    onRecoverableError = () => void 8,
    ...options
  }: Omit<
    React.ComponentPropsWithoutRef<typeof RouterHost>,
    "children"
  > & {
    onRecoverableError?: (error: unknown, errorInfo: ErrorInfo) => void;
  } = {}
) {
  const matched = match(globalThis.__INITIAL_ROUTE__.split("?")[0])!;
  const Initial = await import(matched.value) as { default: (args: { props: unknown; params: Record<string, unknown> }) => JSX.Element };

  const jsxPage = await CreatePage({
    matched,
    props: globalThis.__SERVERSIDE_PROPS__,
    module: Initial,
    currentVersion: 0,
  });

  return hydrateRoot(
    document,
    <StrictMode>
      <RouterHost {...options}>
        {jsxPage}
      </RouterHost>
    </StrictMode>,
    { onRecoverableError }
  );
}
