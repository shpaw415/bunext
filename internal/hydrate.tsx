"use client";
import { hydrateRoot, type ErrorInfo } from "react-dom/client";
import { RouterHost } from "./router/index";
import { getRouteMatcher } from "./router/utils/get-route-matcher";
import type { ServerSideProps, _DisplayMode, _GlobalData } from "./types";

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

  console.log("tester");

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
