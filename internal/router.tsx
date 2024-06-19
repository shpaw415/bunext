import type { FileSystemRouter, MatchedRoute } from "bun";
import { readFileSync } from "fs";
import { NJSON } from "next-json";
import { join, relative } from "node:path";
import {
  renderToString,
  type RenderToReadableStreamOptions,
} from "react-dom/server";
import type { _DisplayMode, _SsrMode } from "./types";
import { normalize } from "path";
import React from "react";
import "./server_global";
import { __GET_PUBLIC_SESSION_DATA__ } from "../features/session";
import { mkdirSync, existsSync } from "node:fs";
import { builder } from "./build";

class ClientOnlyError extends Error {
  constructor() {
    super("client only");
  }
}

class StaticRouters {
  server?: FileSystemRouter;
  client?: FileSystemRouter;
  #routes_dump: string;

  serverActions: {
    path: string;
    actions: Array<Function>;
  }[] = [];

  baseDir = process.cwd();
  buildDir = ".bunext/build";
  pageDir = "src/pages";
  options = {
    displayMode: {
      nextjs: {
        layout: "layout.tsx",
      },
      ssrMode: "nextjs",
    },
  };

  constructor() {
    this.server = new Bun.FileSystemRouter({
      dir: join(this.baseDir, this.pageDir),
      style: "nextjs",
    });
    this.client = new Bun.FileSystemRouter({
      dir: join(this.baseDir, this.buildDir, this.pageDir),
      style: "nextjs",
    });
    this.#routes_dump = NJSON.stringify(
      Object.fromEntries(
        Object.entries(this.client.routes).map(([path, filePath]) => [
          path,
          "/" + relative(join(this.baseDir, this.buildDir), filePath),
        ])
      ),
      { omitStack: true }
    );
  }
  public setRoutes() {
    this.server = new Bun.FileSystemRouter({
      dir: join(this.baseDir, this.pageDir),
      style: "nextjs",
    });
    this.client = new Bun.FileSystemRouter({
      dir: join(this.baseDir, this.buildDir, this.pageDir),
      style: "nextjs",
    });
    this.#routes_dump = NJSON.stringify(
      Object.fromEntries(
        Object.entries(this.client.routes).map(([path, filePath]) => [
          path,
          "/" + relative(join(this.baseDir, this.buildDir), filePath),
        ])
      ),
      { omitStack: true }
    );
  }

  async serve<T = void>(
    request: Request,
    request_header: Record<string, string>,
    response: Response,
    data: FormData,
    {
      Shell,
      preloadScript,
      bootstrapModules,
      context,
      onError = (error, errorInfo) => {
        if (error instanceof ClientOnlyError) return;
        console.error(error, errorInfo);
      },
    }: {
      Shell: React.ComponentType<{ children: React.ReactElement }>;
      preloadScript?: Record<string, string>;
      bootstrapModules?: string[];
      context?: T;
      onError?(error: unknown, errorInfo: React.ErrorInfo): string | void;
    }
  ): Promise<Response | null> {
    const { pathname, search } = new URL(request.url);
    const serverAction = await this.serverActionGetter(
      request,
      request_header,
      response,
      data
    );
    if (serverAction) return serverAction;

    const staticResponse = await this.serveFromDir({
      directory: this.buildDir,
      path: pathname,
    });
    if (staticResponse) {
      return new Response(staticResponse, {
        headers: {
          ...response.headers,
          "Content-Type": "text/javascript",
        },
      });
    }
    const serverSide = this.server?.match(request);
    if (!serverSide) return null;
    const clientSide = this.client?.match(request);
    if (!clientSide) {
      const apiEndpointResult = await this.VerifyApiEndpoint(
        request,
        serverSide
      );
      if (!apiEndpointResult)
        throw new TypeError(
          "No client-side script found for server-side component: " +
            serverSide.filePath
        );
      else return apiEndpointResult;
    }

    const module = await import(serverSide.filePath);
    const result = await module.getServerSideProps?.({
      params: serverSide.params,
      req: request,
      query: serverSide.query,
      context,
    });
    const stringified = NJSON.stringify(result, { omitStack: true });
    if (
      typeof request_header.accept != "undefined" &&
      request_header.accept == "application/vnd.server-side-props"
    ) {
      return new Response(stringified, {
        headers: {
          ...response.headers,
          "Content-Type": "application/vnd.server-side-props",
          "Cache-Control": "no-store",
        },
      });
    }

    const isNextJs = Boolean(this.options.displayMode?.nextjs);

    const preloadScriptObj = {
      __PAGES_DIR__: JSON.stringify(this.pageDir),
      __INITIAL_ROUTE__: JSON.stringify(serverSide.pathname + search),
      __ROUTES__: this.#routes_dump,
      __SERVERSIDE_PROPS__: stringified,
      __DISPLAY_MODE__: JSON.stringify(
        Object.keys(this.options.displayMode)[0]
      ),
      __LAYOUT_NAME__: isNextJs
        ? JSON.stringify(
            this.options?.displayMode?.nextjs?.layout.split(".").at(0)
          )
        : "",
      __LAYOUT_ROUTE__: isNextJs
        ? JSON.stringify(await this.getlayoutPaths())
        : "",
      __DEV_MODE__: Boolean(process.env.NODE_ENV == "development"),
      ...preloadScript,
    } as const;

    const preloadSriptsStrList = Object.keys(preloadScriptObj)
      .map((i) => `${i}=${(preloadScriptObj as any)[i]}`)
      .filter(Boolean);

    const renderOptionData = {
      signal: request.signal,
      bootstrapScriptContent: preloadSriptsStrList.join(";"),
      bootstrapModules,
      onError,
    } as RenderToReadableStreamOptions;

    if (result?.redirect) {
      return new Response(null, {
        status: 302,
        headers: { Location: result.redirect },
      });
    }
    const preBuiledPage = builder.ssrElement
      .find((e) => e.path == serverSide.filePath)
      ?.elements.find((e) =>
        e.tag.endsWith(`${module.default.name}!>`)
      )?.htmlElement;
    let jsxToServe: JSX.Element;
    if (preBuiledPage) {
      jsxToServe = (
        <div
          id="BUNEXT_INNER_PAGE_INSERTER"
          dangerouslySetInnerHTML={{ __html: preBuiledPage }}
        />
      );
    } else jsxToServe = await module.default({ ...result?.props });
    switch (Object.keys(this.options.displayMode)[0] as keyof _DisplayMode) {
      case "nextjs":
        jsxToServe = await this.stackLayouts(serverSide, jsxToServe);
        break;
    }

    const FinalJSX = (
      <Shell route={serverSide.pathname + search} {...result}>
        {jsxToServe}
        <script src="/.bunext/react-ssr/hydrate.js" type="module"></script>
        <script
          dangerouslySetInnerHTML={{
            __html: renderOptionData.bootstrapScriptContent || "",
          }}
        />
      </Shell>
    );

    return this.makeStream({
      jsx: FinalJSX,
      response,
    });
  }

  private async VerifyApiEndpoint(request: Request, route: MatchedRoute) {
    const ApiModule = await import(route.filePath);
    if (typeof ApiModule[request.method.toUpperCase()] == "undefined") return;
    const res = (await ApiModule[request.method](request)) as
      | Response
      | undefined;

    if (res instanceof Response) return res;
    else
      throw new Error(
        `Api Endpoint ${route.filePath} did not returned a Response Object`
      );
  }

  private async makeStream({
    jsx,
    response,
  }: {
    jsx: JSX.Element;
    response: Response;
  }): Promise<Response | null> {
    const rewriter = new HTMLRewriter().on("#BUNEXT_INNER_PAGE_INSERTER", {
      element(element) {
        element.removeAndKeepContent();
      },
    });
    const page = rewriter.transform(renderToString(jsx));
    return new Response(page, {
      headers: {
        ...response.headers,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
  private async getlayoutPaths() {
    return this.getFilesFromPageDir()
      .filter((f) => f.split("/").at(-1)?.includes("layout."))
      .map((l) => normalize(`//${l}`.split("/").slice(0, -1).join("/")));
  }

  private async serverActionGetter(
    request: Request,
    request_header: Record<string, string>,
    response: Response,
    data: FormData
  ): Promise<Response | null> {
    const { pathname } = new URL(request.url);
    if (pathname !== "/ServerActionGetter") return null;
    const reqData = this.extractServerActionHeader(request_header);

    if (!reqData) return null;
    const props = this.extractPostData(data);
    const module = this.serverActions.find(
      (s) => s.path === reqData.path.slice(1)
    );
    if (!module) return null;
    const call = module.actions.find((f) => f.name === reqData.call);
    if (!call) return null;
    const res = await call(...props);

    const result = JSON.stringify({
      props: typeof res == "undefined" ? undefined : res,
      session: __GET_PUBLIC_SESSION_DATA__(),
    });
    return new Response(result, {
      headers: response.headers,
    });
  }
  private extractServerActionHeader(header: Record<string, string>) {
    if (!header.serveractionid) return null;
    const serverActionData = header.serveractionid.split(":");

    if (!serverActionData) return null;
    return {
      path: serverActionData[0],
      call: serverActionData[1],
    };
  }
  private extractPostData(data: FormData) {
    return (
      JSON.parse(decodeURI(data.get("props") as string)) as Array<any>
    ).map((prop) => {
      if (typeof prop == "string" && prop.startsWith("BUNEXT_FILE_")) {
        return data.get(prop) as File;
      }
      return prop;
    });
  }

  /**
   * Next.js like module stacking
   */
  async stackLayouts(route: MatchedRoute, pageElement: JSX.Element) {
    const layouts = route.pathname == "/" ? [""] : route.pathname.split("/");
    type _layout = ({ children }: { children: JSX.Element }) => JSX.Element;
    let layoutsJsxList: Array<_layout | string> = [];
    let index = 0;
    for await (const i of layouts) {
      const path = layouts.slice(0, index + 1).join("/");
      const pathToFile = normalize(
        `${this.baseDir}/${this.pageDir}/${path}/${
          this.options.displayMode.nextjs?.layout as string
        }`
      );
      if (!(await Bun.file(pathToFile).exists())) continue;
      const defaultExport = (await import(pathToFile)).default;
      if (!defaultExport)
        throw new Error(
          `no default export in ${relative(process.cwd(), route.filePath)}`
        );
      if (defaultExport) layoutsJsxList.push(defaultExport);
      index += 1;
    }
    layoutsJsxList.push(() => pageElement);
    layoutsJsxList = layoutsJsxList.reverse();
    let currentJsx: JSX.Element = <></>;
    for await (const Layout of layoutsJsxList) {
      currentJsx = <Layout children={currentJsx} />;
    }
    return currentJsx;
  }
  public getFilesFromPageDir() {
    const glob = new Bun.Glob("**/*.{ts,tsx,js,jsx}");
    return Array.from(
      glob.scanSync({
        cwd: this.pageDir,
        onlyFiles: true,
      })
    );
  }
  static getFileFromPageDir(pageDir?: string) {
    const glob = new Bun.Glob("**/*.{ts,tsx,js,jsx}");
    return Array.from(
      glob.scanSync({
        cwd: pageDir,
        onlyFiles: true,
      })
    );
  }
  async InitServerActions() {
    const files = this.getFilesFromPageDir();

    for await (const f of files) {
      const filePath = normalize(`${this.pageDir}/${f}`);
      const _module = await import(normalize(`${process.cwd()}/${filePath}`));
      const ServerActions = Object.keys(_module).filter((f) =>
        f.startsWith("Server")
      );
      this.serverActions.push({
        path: f,
        actions: ServerActions.map((name) => _module[name]),
      });
    }
    return this;
  }

  isUseClient(fileData: string) {
    const line = fileData
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .at(0);
    if (!line) return false;
    if (line.startsWith("'use client'") || line.startsWith('"use client"'))
      return true;
    return false;
  }

  async serveFromDir(config: {
    directory: string;
    path: string;
    suffixes?: string[];
  }) {
    const basePath = join(config.directory, config.path);
    const suffixes = config.suffixes ?? [
      "",
      ".html",
      "index.html",
      ".js",
      "/index.js",
    ];
    for await (const suffix of suffixes) {
      const pathWithSuffix = basePath + suffix;
      let file = Bun.file(pathWithSuffix);
      if (await file.exists()) {
        const content = readFileSync(pathWithSuffix, {
          encoding: "ascii",
        });
        return content;
      }
    }

    return null;
  }
}

if (!existsSync(".bunext/build/src/pages"))
  mkdirSync(".bunext/build/src/pages", { recursive: true });
const router = new StaticRouters();

export { router, StaticRouters };
