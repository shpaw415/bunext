"use client";
import { hydrateRoot, type ErrorInfo } from "react-dom/client";
import { RouterHost } from "./router/index";
import { getRouteMatcher } from "./router/utils/get-route-matcher";
import type { ServerSideProps, _DisplayMode, _GlobalData } from "./types";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  _Session,
  SessionContext,
  SessionDidUpdateContext,
} from "../features/session";
import { AddServerActionCallback } from "./globals";

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

  let JsxToDisplay: JSX.Element = await NextJsLayoutStacker({
    PageJsx: Initial.default,
    global: globalX,
    matched: matched,
  });

  return hydrateRoot(
    document,
    <RouterHost Shell={Shell} {...options}>
      <Shell
        route={globalX.__INITIAL_ROUTE__}
        {...globalX.__SERVERSIDE_PROPS__}
      >
        <SessionProvider>{JsxToDisplay}</SessionProvider>
      </Shell>
    </RouterHost>,
    { onRecoverableError }
  );
}

type _MatchedStruct = {
  path: string;
  value: string;
  params: {
    [paramName: string]: string | string[];
  };
};

async function NextJsLayoutStacker({
  PageJsx,
  global,
  matched,
}: {
  PageJsx: ({
    props,
    params,
  }: {
    props: any;
    params: any;
  }) => JSX.Element | Promise<JSX.Element>;
  global: _GlobalData;
  matched: _MatchedStruct;
}) {
  type _layout = ({
    children,
  }: {
    children: JSX.Element;
  }) => Promise<JSX.Element>;

  const layoutPath = global.__ROUTES__["/layout"];

  let pageJSX = await PageJsx({
    props: globalX.__SERVERSIDE_PROPS__,
    params: matched.params,
  });

  if (matched.path == "/" && typeof layoutPath != "undefined") {
    const Layout__ = await import(layoutPath);
    return await Layout__.default({
      children: pageJSX,
    });
  }
  const splitedRoute = matched.path.split("/");
  let index = 1;
  let defaultImports: Array<_layout> = [];
  const formatedRoutes = Object.keys(global.__ROUTES__)
    .map((e) => `/${global.__PAGES_DIR__}${e}`)
    .filter((e) => e.includes("layout"));
  for await (const i of splitedRoute) {
    const request = `/${global.__PAGES_DIR__}${splitedRoute
      .slice(0, index)
      .join("/")}/layout`;
    if (!formatedRoutes.includes(request)) continue;
    defaultImports.push((await import(request + ".js")).default);
    index++;
  }

  for (const layout of defaultImports.reverse()) {
    pageJSX = await layout({
      children: pageJSX,
    });
  }
  return pageJSX;
}

function SessionProvider({ children }: { children: any }) {
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

  useEffect(() => {
    AddServerActionCallback((res) => {
      session.update();
      session.setSessionTimeout(
        JSON.parse(
          res.headers.get("__bunext_session_timeout__") as string
        ) as number
      );
      timerSetter();
    }, "update_session_callback");

    if (session.getSessionTimeout() > 0) timerSetter();
    session.__DATA__.public = globalThis.__PUBLIC_SESSION_DATA__;
    session.update();
  }, []);
  return (
    <SessionContext.Provider value={session}>
      <SessionDidUpdateContext.Provider value={updater}>
        {children}
      </SessionDidUpdateContext.Provider>
    </SessionContext.Provider>
  );
}
