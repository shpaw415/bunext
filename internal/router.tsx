import {
  type BunFile,
  type FileSystemRouter,
  type MatchedRoute,
  type Subprocess,
} from "bun";
import { NJSON } from "next-json";
import { extname, join, relative, sep } from "node:path";
import {
  renderToString,
  type RenderToReadableStreamOptions,
} from "react-dom/server";
import type {
  _DisplayMode,
  _GlobalData,
  _SsrMode,
  ServerActionDataType,
  ServerActionDataTypeHeader,
  ServerConfig,
} from "./types";
import { normalize } from "path";
import React, { type JSX } from "react";
import "./server_global";
import { mkdirSync, existsSync } from "node:fs";
import { Head, type _Head } from "../features/head";
import { BunextRequest } from "./bunextRequest";
import "./server_global";
import { rm } from "node:fs/promises";
import CacheManager from "./caching";
import { generateRandomString } from "../features/utils";
import { RequestContext } from "./context";

class ClientOnlyError extends Error {
  constructor() {
    super("client only");
  }
}

type pathNames =
  | "/bunextgetSessionData"
  | "/ServerActionGetter"
  | "/bunextDeleteSession"
  | "/favicon.ico";

let LoadedNodeModule: Array<{
  path: string;
  mimeType: string;
  content: string;
}> = [];

const HTMLDocType = "<!DOCTYPE html>";

class StaticRouters {
  server: FileSystemRouter;
  client: FileSystemRouter;
  routes_dump: string;
  serverActions: {
    path: string;
    actions: Array<Function>;
  }[] = [];
  layoutPaths: string[];
  cssPaths: string[] = [];
  cssPathExists: string[] = [];
  staticRoutes: Array<keyof FileSystemRouter["routes"]> = [];
  ssrAsDefaultRoutes: Array<keyof FileSystemRouter["routes"]> = [];

  initPromise: Promise<boolean>;
  initResolver?: (value: boolean | PromiseLike<boolean>) => void;
  inited = false;

  baseDir = process.cwd();
  buildDir = ".bunext/build";
  pageDir = "src/pages";
  staticDir = "static";

  constructor() {
    this.server = new Bun.FileSystemRouter({
      dir: join(this.baseDir, this.pageDir),
      style: "nextjs",
    });
    this.client = new Bun.FileSystemRouter({
      dir: join(this.baseDir, this.buildDir, this.pageDir),
      style: "nextjs",
    });
    this.routes_dump = NJSON.stringify(
      Object.fromEntries(
        Object.entries(this.client.routes).map(([path, filePath]) => [
          path,
          "/" + relative(join(this.baseDir, this.buildDir), filePath),
        ])
      ),
      { omitStack: true }
    );
    this.layoutPaths = this.getlayoutPaths();
    this.initPromise = new Promise((resolve) => (this.initResolver = resolve));
  }
  public async init() {
    if (this.inited) return;
    await Promise.all([
      this.getCssPaths(),
      this.getUseStaticRoutes(),
      this.getSSRDefaultRoutes(),
    ]).then(([css, staticPath, ssr]) => {
      this.cssPathExists = css;
      this.staticRoutes = staticPath;
      this.ssrAsDefaultRoutes = ssr;

      this.inited = true;
      this.initResolver?.(true);
    });
  }
  public isInited() {
    return this.initPromise;
  }

  private getRoutesWithoutLayouts() {
    type Route = string;
    type Path = string;
    return Object.entries(this.server?.routes || {}).filter(
      ([route]) => !route.endsWith("/layout")
    ) as [Route, Path][];
  }

  private async getCssPaths() {
    const cwd = process.cwd();
    const possible_css_path = Object.values(this.server?.routes || {}).map(
      (path) => {
        const trimPath = path.replace(cwd, "").split(".");
        trimPath.pop();
        return normalize(`${this.buildDir}${trimPath.join(".")}.css`);
      }
    );
    const cssFilesPath: string[] = [];
    for await (const path of possible_css_path) {
      if (await Bun.file(path).exists()) cssFilesPath.push(path);
    }
    return cssFilesPath.map((path) =>
      normalize(path.replace(this.buildDir, "/"))
    );
  }
  private async getUseStaticRoutes() {
    const useStaticRoute: string[] = [];
    const regex = /(['"])use static\1/;
    await Promise.all(
      this.getRoutesWithoutLayouts().map(async ([route, path]) => {
        const fileContent = await Bun.file(path).text();
        if (regex.test(fileContent.split("\n").at(0) as string))
          useStaticRoute.push(route);
      })
    );
    return useStaticRoute;
  }

  private async getSSRDefaultRoutes() {
    const routes = this.getRoutesWithoutLayouts();
    const defaultsExports = await Promise.all(
      routes.map(async ([route, path]) => ({
        module: (await import(path)) as {
          default?: () => JSX.Element | Promise<JSX.Element>;
        },
        route,
      }))
    );
    return defaultsExports
      .filter((module) => module.module.default?.length == 0)
      .map(({ route }) => route);
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
    this.routes_dump = NJSON.stringify(
      Object.fromEntries(
        Object.entries(this.client.routes).map(([path, filePath]) => [
          path,
          "/" + relative(join(this.baseDir, this.buildDir), filePath),
        ])
      ),
      { omitStack: true }
    );
  }

  async serve(
    request: Request,
    request_header: Record<string, string>,
    data: FormData,
    {
      Shell,
    }: {
      Shell: React.ComponentType<{ children: React.ReactElement }>;
    }
  ): Promise<BunextRequest | null> {
    if (process.env.NODE_ENV == "development")
      this.cssPathExists = await this.getCssPaths();
    await this.isInited();
    return new RequestManager({
      request,
      client: this.client,
      server: this.server,
      data,
      request_header,
      router: this,
      Shell,
    }).make();
  }

  async serverPrebuiltPage(
    serverSide: MatchedRoute,
    module: Record<string, Function>
  ) {
    const preBuiledPage = CacheManager.getSSR(
      serverSide.filePath
    )?.elements.find((e) =>
      e.tag.endsWith(`${module.default.name}!>`)
    )?.htmlElement;

    if (preBuiledPage) {
      return await this.stackLayouts(
        serverSide,
        <div
          id="BUNEXT_INNER_PAGE_INSERTER"
          dangerouslySetInnerHTML={{ __html: preBuiledPage }}
        />
      );
    }
  }

  public async CreateDynamicPage(
    module: string,
    props: { props: any; params: Record<string, string> },
    serverSide: MatchedRoute,
    bunextRequest: BunextRequest
  ): Promise<JSX.Element> {
    const ModuleDefault = (
      (await import(module)) as {
        default: ({
          props,
          params,
        }: {
          props: any;
          params: any;
          request?: BunextRequest;
        }) => Promise<JSX.Element>;
      }
    ).default;

    const JSXElement = async () => (
      <RequestContext.Provider value={bunextRequest}>
        {await this.stackLayouts(
          serverSide,
          await ModuleDefault({ ...props, request: bunextRequest })
        )}
      </RequestContext.Provider>
    );

    return JSXElement();
  }

  private getlayoutPaths() {
    return this.getFilesFromPageDir()
      .filter((f) => f.split("/").at(-1)?.includes("layout."))
      .map((l) => normalize(`//${l}`.split("/").slice(0, -1).join("/")));
  }

  /**
   * Next.js like module stacking
   */
  async stackLayouts(route: MatchedRoute, pageElement: JSX.Element) {
    type _layout = ({
      children,
      params,
    }: {
      children: JSX.Element;
      params: Record<string, string>;
    }) => JSX.Element | Promise<JSX.Element>;

    const layouts = route.name == "/" ? [""] : route.name.split("/");
    const layoutImports: Array<Promise<{ default: _layout }>> = [];
    layouts.reduce((prev, current) => {
      const pathFromPageDir = join(prev || sep, current);
      if (this.layoutPaths.includes(pathFromPageDir)) {
        layoutImports.push(
          import(
            join(this.baseDir, this.pageDir, pathFromPageDir, "layout.tsx")
          )
        );
      }
      return pathFromPageDir;
    }, "" as string);

    const layoutsJsxList: Array<_layout | string> = [
      ...(await Promise.all(layoutImports)).map((module) => module.default),
      () => pageElement,
    ].reverse();

    let currentJsx: JSX.Element = <></>;
    for await (const Layout of layoutsJsxList) {
      if (typeof Layout == "string") continue;
      else
        currentJsx = await Layout({
          children: currentJsx,
          params: route.params,
        });
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
    this.serverActions = [];
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
    const basePath = join(config.directory, normalize(decodeURI(config.path)));
    const suffixes = config.suffixes ?? [
      "",
      ".html",
      "index.html",
      ".js",
      "/index.js",
      ".css",
    ];
    for await (const suffix of suffixes) {
      const pathWithSuffix = basePath + suffix;
      let file = Bun.file(pathWithSuffix);
      if (await file.exists()) return file;
    }

    return null;
  }
}

class RequestManager {
  request: Request;
  server: FileSystemRouter;
  serverSide: MatchedRoute | null;
  client: FileSystemRouter;
  clientSide: MatchedRoute | null;
  request_header: Record<string, string>;
  data: FormData;
  bunextReq: BunextRequest;
  pathname: string;
  search: string;
  router: StaticRouters;
  serverSideProps?: {
    value: any;
    toString: () => string;
  };
  Shell: React.ComponentType<{
    children: React.ReactElement;
  }>;

  constructor(init: {
    request: Request;
    request_header: Record<string, string>;
    data: FormData;
    server: FileSystemRouter;
    client: FileSystemRouter;
    router: StaticRouters;
    Shell: React.ComponentType<{
      children: React.ReactElement;
    }>;
  }) {
    this.request = init.request;
    this.request_header = init.request_header;
    this.data = init.data;
    this.server = init.server;
    this.client = init.client;
    this.router = init.router;
    this.Shell = init.Shell;

    this.serverSide = this.server.match(this.request);
    this.clientSide = this.client.match(this.request);

    const { pathname, search } = new URL(this.request.url);
    this.pathname = pathname;
    this.search = search;
    this.bunextReq = new BunextRequest({
      request: this.request,
      response: new Response(),
    });
  }

  async make(): Promise<null | BunextRequest> {
    return (
      (await this.checkStaticServing()) ||
      (await this.checkFeatureServing()) ||
      (await this.servePage())
    );
  }

  private formatPage(html: string) {
    const rewriter = new HTMLRewriter().on("#BUNEXT_INNER_PAGE_INSERTER", {
      element(element) {
        element.removeAndKeepContent();
      },
    });
    return [HTMLDocType, rewriter.transform(html)].join("\n");
  }

  private makeStream(jsx: JSX.Element): Response {
    return new Response(this.formatPage(renderToString(jsx)), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  private async serveServerAction() {
    await this.bunextReq.session.initData();
    return this.bunextReq.__SET_RESPONSE__(await this.serverActionGetter());
  }
  private async serveSessionData() {
    await this.bunextReq.session.initData();
    return this.bunextReq.__SET_RESPONSE__(
      new Response(JSON.stringify(this.bunextReq.session.__DATA__.public))
    );
  }
  private async serveDeleteSession() {
    await this.bunextReq.session.initData();
    this.bunextReq.session.delete();
    return this.bunextReq.__SET_RESPONSE__(
      this.bunextReq.setCookie(new Response())
    );
  }
  private async serveStaticAssets() {
    const staticAssets = await this.router.serveFromDir({
      directory: this.router.staticDir,
      path: this.pathname,
    });
    if (staticAssets == null && this.pathname == "/favicon.ico") {
      return this.bunextReq.__SET_RESPONSE__(new Response());
    } else if (staticAssets !== null)
      return this.bunextReq.__SET_RESPONSE__(
        new Response(staticAssets, {
          headers: {
            "Content-Type": staticAssets.type,
          },
        })
      );
    return null;
  }
  private async serveFromBuildDirectory() {
    const staticResponse = await this.router.serveFromDir({
      directory: router.buildDir,
      path: this.pathname,
    });
    if (!staticResponse) return null;

    const date = new Date();
    date.setTime(date.getTime() + 360000);
    const DevHeader = {
      "Cache-Control": "public, max-age=0, must-revalidate, no-store, no-cache",
      "Last-Modified": date.toUTCString(),
      Expires: new Date("2000/01/01").toUTCString(),
      Pragma: "no-cache",
      ETag: generateRandomString(5),
    };

    const ProductionHeader = {
      "Cache-Control": "public max-age=3600",
    };

    return this.bunextReq.__SET_RESPONSE__(
      new Response(staticResponse, {
        headers: {
          "Content-Type": staticResponse.type,
          ...(process.env.NODE_ENV == "production"
            ? ProductionHeader
            : DevHeader),
        },
      })
    );
  }
  private async serveFromNodeModule(): Promise<BunextRequest | null> {
    const nodeModuleFile = await this.router.serveFromDir({
      directory: "node_modules",
      path: normalize(this.pathname.replace("node_modules", "")),
      suffixes: [
        "",
        ".js",
        ".jsx",
        ".ts",
        ".tsx",
        ".css",
        ".json",
        ".xml",
        ".csv",
        ".html",
      ],
    });
    if (!nodeModuleFile || !(await nodeModuleFile.exists())) return null;

    const MakeTextRes = (content: BunFile | string, mimeType?: string) => {
      if (content instanceof Blob) {
        this.bunextReq.__SET_RESPONSE__(new Response(content));
      } else {
        this.bunextReq.__SET_RESPONSE__(
          new Response(content, {
            headers: {
              "Content-Type": `text/${mimeType}`,
            },
          })
        );
      }
      return this.bunextReq;
    };
    const buildFile = (path: string) =>
      Bun.build({
        entrypoints: [path],
        outdir: this.router.buildDir + "/node_modules",
        root: "node_modules",
        splitting: false,
        minify: process.env.NODE_ENV == "production",
      });
    const path = Bun.fileURLToPath(import.meta.resolve(this.pathname));
    const ext = extname(path).replace(".", "");

    const getBuildedFile = (ext: "css" | "js") => {
      let formatedFileName = this.pathname.split(".");
      formatedFileName.pop();
      formatedFileName.push(ext);
      return Bun.file(
        normalize(`${this.router.buildDir}/${formatedFileName.join(".")}`)
      );
    };

    switch (ext) {
      case "csv":
      case "html":
      case "xml":
      case "json":
        return MakeTextRes(nodeModuleFile);
      case "ts":
      case "tsx":
      case "jsx":
      case "js":
      case "css":
        const formatedExt = ext == "css" ? "css" : "js";
        const buildedFile = getBuildedFile(formatedExt);
        if (
          process.env.NODE_ENV == "production" &&
          (await buildedFile.exists())
        )
          return MakeTextRes(buildedFile);
        const res = await buildFile(`.${path}`);
        if (res.success) {
          return MakeTextRes(getBuildedFile(formatedExt));
        }

        return this.bunextReq.__SET_RESPONSE__(
          new Response(null, {
            status: 500,
          })
        );
      default:
        return this.bunextReq.__SET_RESPONSE__(
          new Response(null, {
            status: 404,
          })
        );
    }
  }
  private async MakeServerSideProps(): Promise<{
    value: any;
    toString: () => string;
  }> {
    if (this.serverSideProps) return this.serverSideProps;

    if (!this.serverSide)
      throw new Error(`no serverSide script found for ${this.pathname}`);

    if (this.isUseStaticPath(true)) {
      const props = CacheManager.getStaticPageProps(this.serverSide.pathname);
      if (props) {
        this.serverSideProps = {
          toString: () => props,
          value: JSON.parse(props),
        };
        return this.serverSideProps;
      }
    }

    const module = await import(this.serverSide.filePath);
    if (typeof module.getServerSideProps == "undefined")
      return {
        toString: () => JSON.stringify(undefined),
        value: undefined,
      };

    await this.bunextReq.session.initData();
    const result = await module?.getServerSideProps?.(
      {
        ...this.serverSide,
        request: this.request,
      },
      this.bunextReq
    );

    const res = {
      toString: () => NJSON.stringify(result, { omitStack: true }),
      value: result,
    };

    this.serverSideProps = res;

    return res;
  }
  private async serveServerSideProps(): Promise<null | BunextRequest> {
    if (this.request_header?.accept != "application/vnd.server-side-props")
      return null;

    return this.bunextReq.__SET_RESPONSE__(
      new Response((await this.MakeServerSideProps()).toString(), {
        headers: {
          ...this.bunextReq.response.headers,
          "Content-Type": "application/vnd.server-side-props",
          "Cache-Control": "no-store",
        },
      })
    );
  }
  private async serveAPIEndpoint(): Promise<null | BunextRequest> {
    if (this.clientSide || !this.serverSide) return null;

    const ApiModule = await import(this.serverSide.filePath);
    if (
      typeof ApiModule[this.bunextReq.request.method.toUpperCase()] ==
      "undefined"
    )
      return null;
    await this.bunextReq.session.initData();
    const res = (await ApiModule[this.bunextReq.request.method](
      this.bunextReq
    )) as BunextRequest | Response | undefined;
    if (res instanceof BunextRequest) {
      this.bunextReq.setCookie(res.response);
    } else if (res instanceof Response) {
      this.bunextReq.setCookie(res);
    } else {
      throw new Error(
        `Api Endpoint ${this.serverSide.filePath} did not returned a BunextRequest or Response Object`
      );
    }
    return this.bunextReq;
  }
  private async serveRedirectFromServerSideProps() {
    const props = await this.MakeServerSideProps();
    if (typeof props.value != "object" || !props.value?.redirect) return null;
    return this.bunextReq.__SET_RESPONSE__(
      new Response(null, {
        status: 302,
        headers: { Location: props.value.redirect },
      })
    );
  }
  private async servePage() {
    if (!this.serverSide) return null;
    else if (this.serverSide.pathname == "/favicon.ico") return null;

    if (this.isUseStaticPath(true)) {
      const stringPage = await this.getStaticPage();
      return this.bunextReq.__SET_RESPONSE__(
        new Response(stringPage, {
          headers: {
            "content-type": "text/html; charset=utf-8",
          },
        })
      );
    } else if (this.isSSRDefaultExportPath(true)) {
      const stringPage = await this.getSSRDefaultPage();
      if (stringPage)
        return this.bunextReq.__SET_RESPONSE__(
          new Response(stringPage, {
            headers: {
              "content-type": "text/html; charset=utf-8",
            },
          })
        );
    }

    const pageJSX = await this.MakeDynamicJSXElement();
    if (!pageJSX) return null;

    const page = await this.makePage(pageJSX);
    if (!page) return null;

    return this.bunextReq.__SET_RESPONSE__(this.makeStream(page));
  }

  private async checkStaticServing(): Promise<BunextRequest | null> {
    switch (this.pathname as pathNames) {
      case "/ServerActionGetter":
        return this.serveServerAction();
      case "/bunextgetSessionData":
        return this.serveSessionData();
      case "/bunextDeleteSession":
        return this.serveDeleteSession();
      default:
        return (
          (await this.serveStaticAssets()) ||
          (await this.serveFromBuildDirectory()) ||
          (await this.serveFromNodeModule())
        );
    }
  }
  private async checkFeatureServing(): Promise<BunextRequest | null> {
    if (!this.serverSide) return null;

    return (
      (await this.serveServerSideProps()) ||
      (await this.serveAPIEndpoint()) ||
      (await this.serveRedirectFromServerSideProps())
    );
  }

  private ErrorOnNoServerSideMatch() {
    return new Error(`no serverSideScript found for ${this.pathname}`);
  }

  private async MakePreLoadObject(): Promise<
    Record<keyof _GlobalData, string>
  > {
    if (!this.serverSide) throw this.ErrorOnNoServerSideMatch();
    await this.bunextReq.session.initData();
    const CreatedAt =
      this.bunextReq.session.__DATA__.private?.__BUNEXT_SESSION_CREATED_AT__ ||
      0;

    const sessionTimeout =
      CreatedAt == 0
        ? 0
        : CreatedAt +
          this.bunextReq.session.sessionTimeoutFromNow * 1000 -
          (new Date().getTime() - CreatedAt);

    return {
      __PAGES_DIR__: JSON.stringify(this.router.pageDir),
      __INITIAL_ROUTE__: JSON.stringify(this.serverSide.pathname + this.search),
      __ROUTES__: this.router.routes_dump,
      __SERVERSIDE_PROPS__: (await this.MakeServerSideProps()).toString(),
      __LAYOUT_ROUTE__: JSON.stringify(this.router.layoutPaths),
      __HEAD_DATA__: JSON.stringify(Head.head),
      __PUBLIC_SESSION_DATA__: JSON.stringify(
        this.bunextReq.session.getData(true)
      ),
      __SESSION_TIMEOUT__: JSON.stringify(sessionTimeout),
      serverConfig: JSON.stringify({
        Dev: globalThis.serverConfig.Dev,
        HTTPServer: globalThis.serverConfig.HTTPServer,
      } as Partial<ServerConfig>),
      __PROCESS_ENV__: JSON.stringify({
        NODE_ENV: process.env.NODE_ENV,
        ...Object.assign(
          {},
          ...Object.entries(process.env)
            .filter(([key]) => key.startsWith("PUBLIC"))
            .map(([key, value]) => {
              return { [key]: value };
            })
        ),
      }),
      __CSS_PATHS__: JSON.stringify(this.router.cssPathExists),
    };
  }

  private preloadToStringArray(
    preload: Record<keyof _GlobalData & string, string>
  ) {
    return Object.entries(preload)
      .map(([key, value]) => `${key}=${value}`)
      .filter(Boolean);
  }

  private async makeDevDynamicJSXElement() {
    let pageString = "";
    let proc: Subprocess<"ignore", "inherit", "inherit"> | undefined =
      undefined as unknown as Subprocess<"ignore", "inherit", "inherit">;

    const serverSideProps = (await this.MakeServerSideProps()).value;
    await new Promise((resolve, reject) => {
      if (!this.serverSide) {
        reject(undefined);
        throw this.ErrorOnNoServerSideMatch();
      }
      proc = Bun.spawn({
        env: {
          ...process.env,
          module_path: this.serverSide.filePath,
          props: JSON.stringify({
            props: serverSideProps,
            params: this.serverSide.params,
          }),
          url: this.request.url,
        },
        cwd: process.cwd(),
        cmd: ["bun", `${import.meta.dirname}/dev/jsxToString.tsx`],
        stdout: "inherit",
        stderr: "inherit",
        ipc: ({
          jsx,
          head,
          error,
        }: {
          jsx?: string;
          head?: Record<string, _Head>;
          error?: Error;
        }) => {
          if (jsx) pageString = jsx;
          if (head) this.bunextReq.headData = head;
          if (error) throw error;

          resolve(true);
        },
      });
    });

    await proc.exited;

    return (
      <div
        id="BUNEXT_INNER_PAGE_INSERTER"
        dangerouslySetInnerHTML={{ __html: pageString }}
      />
    );
  }
  //TODO: investigate why it's breaking the build once in a while
  private async makeProductionDynamicJSXElement() {
    if (!this.serverSide) return null;
    return this.router.CreateDynamicPage(
      this.serverSide.filePath,
      {
        props: (await this.MakeServerSideProps()).value,
        params: this.serverSide.params,
      },
      this.serverSide,
      this.bunextReq
    );
  }

  private MakeDynamicJSXElement() {
    if (!this.serverSide) return null;

    if (process.env.NODE_ENV == "development")
      return this.makeDevDynamicJSXElement();
    else return this.makeProductionDynamicJSXElement();
  }
  /**
   * get static page or add it to the cache if it does not exists
   */
  private async getStaticPage() {
    if (!this.isUseStaticPath(true) || !this.serverSide) return null;

    const cache = CacheManager.getStaticPage(this.request.url);
    if (!cache) {
      const pageJSX = await this.MakeDynamicJSXElement();
      if (!pageJSX)
        throw Error(
          `Error Caching page JSX from path: ${this.serverSide.pathname}`
        );
      const PageWithLayouts = await this.router.stackLayouts(
        this.serverSide,
        pageJSX
      );
      const pageString = renderToString(await this.makePage(PageWithLayouts));
      CacheManager.addStaticPage(
        this.serverSide.pathname,
        pageString,
        (await this.MakeServerSideProps()).toString()
      );
      return pageString;
    }

    return cache.page;
  }
  private isUseStaticPath(andProduction?: boolean): boolean {
    if (andProduction && process.env.NODE_ENV != "production") return false;
    return Boolean(
      this.serverSide &&
        this.router.staticRoutes.includes(this.serverSide?.name)
    );
  }
  private async getSSRDefaultPage() {
    if (!this.isSSRDefaultExportPath(true) || !this.serverSide) return null;
    const cache = CacheManager.getSSRDefaultPage(this.serverSide.pathname);
    if (cache) return cache;

    const preRenderedPage = await this.getPreRenderedPage();
    if (!preRenderedPage) return null;

    const PageWithLayouts = await this.router.stackLayouts(
      this.serverSide,
      preRenderedPage
    );

    const shelledPage = await this.makePage(PageWithLayouts);
    if (!shelledPage) return null;
    const stringifiedShelledPage = this.formatPage(renderToString(shelledPage));

    CacheManager.addSSRDefaultPage(
      this.serverSide.pathname,
      stringifiedShelledPage
    );

    return stringifiedShelledPage;
  }
  private isSSRDefaultExportPath(andProduction?: boolean) {
    if (andProduction && process.env.NODE_ENV != "production") return false;
    return Boolean(
      this.serverSide &&
        this.router.ssrAsDefaultRoutes.includes(this.serverSide?.name)
    );
  }

  private HTMLJSXWrapper(html: string) {
    return (
      <div
        id="BUNEXT_INNER_PAGE_INSERTER"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  private async getPreRenderedPage() {
    if (!this.serverSide) throw this.ErrorOnNoServerSideMatch();
    const module = await import(this.serverSide.filePath);
    const preBuiledPage = CacheManager.getSSR(
      this.serverSide.filePath
    )?.elements.find((e) =>
      e.tag.endsWith(`${module.default.name}!>`)
    )?.htmlElement;

    if (!preBuiledPage) return null;

    return await this.router.stackLayouts(
      this.serverSide,
      this.HTMLJSXWrapper(preBuiledPage)
    );
  }

  private async makePage(page: JSX.Element) {
    if (!this.serverSide) return null;

    const preloadScriptObj = await this.MakePreLoadObject();
    const preloadSriptsStrList = [
      ...this.preloadToStringArray(preloadScriptObj),
      "process={env: __PROCESS_ENV__};",
    ].join(";");

    const renderOptionData = {
      signal: this.request.signal,
      bootstrapScriptContent: preloadSriptsStrList,
      bootstrapModules: ["/.bunext/react-ssr/hydrate.js"],
      onError: (error, errorInfo) => {
        if (error instanceof ClientOnlyError) return;
        console.error(error, errorInfo);
      },
    } as RenderToReadableStreamOptions;

    const ShellJSX = (
      <RequestContext.Provider value={this.bunextReq}>
        <this.Shell
          route={this.serverSide?.pathname + this.search}
          {...(await this.MakeServerSideProps()).value}
        >
          {page}
          <script src="/.bunext/react-ssr/hydrate.js" type="module"></script>
          <script
            dangerouslySetInnerHTML={{
              __html: renderOptionData.bootstrapScriptContent || "",
            }}
          />
        </this.Shell>
      </RequestContext.Provider>
    );
    return ShellJSX;
  }

  private async serverActionGetter(): Promise<Response> {
    const reqData = this.extractServerActionHeader(this.request_header);

    if (!reqData) throw new Error(`no request Data for ServerAction`);
    const props = this.extractPostData(this.data);
    const module = this.router.serverActions.find(
      (s) => s.path === reqData.path.slice(1)
    );
    if (!module)
      throw new Error(`no module found for ServerAction ${reqData.path}`);
    const call = module.actions.find((f) => f.name === reqData.call);
    if (!call)
      throw new Error(
        `no function founded for ServerAction ${reqData.path}/${reqData.call}`
      );
    const fillUndefinedParams = (
      Array.apply(null, Array(call.length)) as Array<null>
    ).map(() => undefined);
    let result: ServerActionDataType = await call(
      ...[...props, ...fillUndefinedParams, this.bunextReq]
    );

    let dataType: ServerActionDataTypeHeader = "json";
    if (result instanceof Blob) {
      dataType = "blob";
    } else if (result instanceof File) {
      dataType = "file";
    } else {
      result = JSON.stringify({ props: result });
    }

    return this.bunextReq.setCookie(
      new Response(result as Exclude<ServerActionDataType, object>, {
        headers: {
          ...this.bunextReq.response.headers,
          dataType,
          fileData:
            result instanceof File
              ? JSON.stringify({
                  name: result.name,
                  lastModified: result.lastModified,
                })
              : undefined,
        },
      })
    );
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
      } else if (
        Array.isArray(prop) &&
        prop.length > 0 &&
        typeof prop[0] == "string" &&
        prop[0].startsWith("BUNEXT_BATCH_FILES_")
      ) {
        return data.getAll(prop[0]);
      } else if (typeof prop == "string" && prop == "BUNEXT_FORMDATA") {
        return data;
      } else return prop;
    });
  }
}

async function Init() {
  await rm(".bunext/build/node_modules", {
    recursive: true,
    force: true,
  });
  await router.init();
}

if (!existsSync(".bunext/build/src/pages"))
  mkdirSync(".bunext/build/src/pages", { recursive: true });
const router = new StaticRouters();

export { router, StaticRouters, RequestManager, Init };
