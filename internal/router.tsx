import {
  file,
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
import { createContext } from "react";
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
  server?: FileSystemRouter;
  client?: FileSystemRouter;
  #routes_dump: string;

  serverActions: {
    path: string;
    actions: Array<Function>;
  }[] = [];
  layoutPaths: string[];
  cssPaths: string[] = [];
  cssPathExists: string[] = [];

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
    this.#routes_dump = NJSON.stringify(
      Object.fromEntries(
        Object.entries(this.client.routes).map(([path, filePath]) => [
          path,
          "/" + relative(join(this.baseDir, this.buildDir), filePath),
        ])
      ),
      { omitStack: true }
    );
    this.layoutPaths = this.getlayoutPaths();
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
  async serve(
    request: Request,
    request_header: Record<string, string>,
    data: FormData,
    {
      Shell,
      onError = (error, errorInfo) => {
        if (error instanceof ClientOnlyError) return;
        console.error(error, errorInfo);
      },
    }: {
      Shell: React.ComponentType<{ children: React.ReactElement }>;
      preloadScript?: Record<string, string>;
      bootstrapModules?: string[];
      onError?(error: unknown, errorInfo: React.ErrorInfo): string | void;
    }
  ): Promise<BunextRequest | null> {
    const { pathname, search } = new URL(request.url);
    const serverSide = this.server?.match(request);
    const clientSide = this.client?.match(request);

    await this.SetCssPathsExists(serverSide);

    const bunextReq = new BunextRequest({
      request,
      response: new Response(),
    });
    if (serverSide) bunextReq.path = serverSide.name;

    switch (pathname as pathNames) {
      case "/ServerActionGetter":
        await bunextReq.session.initData();
        return bunextReq.__SET_RESPONSE__(
          await this.serverActionGetter(request_header, data, bunextReq)
        );
      case "/bunextgetSessionData":
        await bunextReq.session.initData();
        return bunextReq.__SET_RESPONSE__(
          new Response(JSON.stringify(bunextReq.session.__DATA__.public))
        );
      case "/bunextDeleteSession":
        await bunextReq.session.initData();
        bunextReq.session.delete();
        return bunextReq.__SET_RESPONSE__(bunextReq.setCookie(new Response()));

      default:
        const staticAssets = await this.serveFromDir({
          directory: this.staticDir,
          path: pathname,
        });
        if (staticAssets == null && pathname == "/favicon.ico") {
          return bunextReq.__SET_RESPONSE__(new Response());
        } else if (staticAssets !== null)
          return bunextReq.__SET_RESPONSE__(
            new Response(staticAssets, {
              headers: {
                "Content-Type": staticAssets.type,
              },
            })
          );

        const staticResponse = await this.serveFromDir({
          directory: this.buildDir,
          path: pathname,
        });
        const d = new Date();
        d.setTime(d.getTime() + 360000);
        if (staticResponse !== null) {
          const DevHeader = {
            "Cache-Control":
              "public, max-age=0, must-revalidate, no-store, no-cache",
            "Last-Modified": d.toUTCString(),
            Expires: new Date("2000/01/01").toUTCString(),
            Pragma: "no-cache",
            ETag: generateRandomString(5),
          };

          const ProductionHeader = {
            "Cache-Control": "public max-age=3600",
          };

          return bunextReq.__SET_RESPONSE__(
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
        const nodeModuleFile = await this.serveFromDir({
          directory: "node_modules",
          path: normalize(pathname.replace("node_modules", "")),
          suffixes: ["", ".js", ".jsx", ".ts", ".tsx"],
        });
        if (nodeModuleFile !== null) {
          return await this.serveFileFromNodeModule(
            pathname,
            await nodeModuleFile.text(),
            bunextReq
          );
        }
        break;
    }

    if (!serverSide) return null;
    if (!clientSide) {
      const apiEndpointResult = await this.VerifyApiEndpoint(
        bunextReq,
        serverSide
      );
      if (!apiEndpointResult)
        throw new TypeError(
          "No client-side script found for server-side component: " +
            serverSide.filePath
        );
      else return bunextReq.__SET_RESPONSE__(apiEndpointResult);
    }

    const module = await import(serverSide.filePath);
    if (typeof module.getServerSideProps != "undefined")
      await bunextReq.session.initData();
    const result = await module?.getServerSideProps?.(
      {
        params: serverSide.params,
        req: request,
        query: serverSide.query,
      },
      bunextReq
    );
    const stringified = NJSON.stringify(result, { omitStack: true });
    if (
      typeof request_header.accept != "undefined" &&
      request_header.accept == "application/vnd.server-side-props"
    ) {
      return bunextReq.__SET_RESPONSE__(
        new Response(stringified, {
          headers: {
            ...bunextReq.response.headers,
            "Content-Type": "application/vnd.server-side-props",
            "Cache-Control": "no-store",
          },
        })
      );
    }

    if (result?.redirect) {
      return bunextReq.__SET_RESPONSE__(
        new Response(null, {
          status: 302,
          headers: { Location: result.redirect },
        })
      );
    }

    const stream = this.makeStream(
      await this.makeJSXPage({
        Shell,
        module: serverSide.filePath,
        onError,
        serverSidePropsString: stringified,
        request,
        search,
        serverSide,
        serverSidePropsResult: result,
        bunextReq: bunextReq,
      })
    );

    return bunextReq.__SET_RESPONSE__(stream);
  }

  private async serveFileFromNodeModule(
    _path: string,
    content: string,
    req: BunextRequest
  ) {
    let mimeType = "";
    let parsedContent = content;

    const MakeTextRes = () =>
      req.__SET_RESPONSE__(
        new Response(parsedContent, {
          headers: {
            "Content-Type": "text/" + mimeType,
          },
        })
      );
    const MakeCustomRes = (contentType: string) =>
      req.__SET_RESPONSE__(
        new Response(parsedContent, {
          headers: {
            "Content-Type": contentType,
          },
        })
      );

    const foundedModule = LoadedNodeModule.find((e) => e.path == path);
    if (foundedModule) {
      mimeType = foundedModule.mimeType;
      parsedContent = foundedModule.content;
      return MakeTextRes();
    }
    //@ts-ignore
    const path = Bun.fileURLToPath(import.meta.resolve(_path));
    const ext = extname(path).replace(".", "");

    const buildedFile = Bun.file(
      normalize(
        `.bunext/build/node_modules/${path.split("node_modules").at(-1)}`
      )
    );

    if (await buildedFile.exists()) {
      mimeType = "javascript";
      parsedContent = await buildedFile.text();
      return MakeTextRes();
    }

    switch (ext) {
      case "css":
      case "csv":
      case "html":
      case "xml":
        mimeType = ext;
        break;
      case "ts":
        mimeType = "javascript";
        parsedContent = await new Bun.Transpiler({
          target: "browser",
          loader: "ts",
        }).transform(parsedContent);
        await Bun.write(buildedFile, parsedContent);
        break;
      case "tsx":
        mimeType = "javascript";
        parsedContent = await new Bun.Transpiler({
          target: "browser",
          loader: "tsx",
        }).transform(parsedContent);
        await Bun.write(buildedFile, parsedContent);
        break;
      case "jsx":
        mimeType = "javascript";
        parsedContent = await new Bun.Transpiler({
          target: "browser",
          loader: "jsx",
        }).transform(parsedContent);
        await Bun.write(buildedFile, parsedContent);
        break;
      case "js":
        mimeType = "javascript";
        break;
      case "json":
        return MakeCustomRes("application/json");
      default:
        return req.__SET_RESPONSE__(
          new Response(null, {
            status: 404,
          })
        );
    }

    return MakeTextRes();
  }

  private async makeJSXPage({
    request,
    serverSidePropsString,
    onError,
    serverSide,
    module,
    serverSidePropsResult,
    search,
    Shell,
    bunextReq,
  }: {
    request: Request;
    serverSidePropsString: string;
    onError: (error: unknown, errorInfo: React.ErrorInfo) => string | void;
    serverSide: MatchedRoute;
    module: string;
    serverSidePropsResult: any;
    search: string;
    Shell: React.ComponentType<{
      children: React.ReactElement;
    }>;
    bunextReq: BunextRequest;
  }) {
    await bunextReq.session.initData();
    const CreatedAt =
      bunextReq.session.__DATA__.private?.__BUNEXT_SESSION_CREATED_AT__ || 0;

    const sessionTimeout =
      CreatedAt == 0
        ? 0
        : CreatedAt +
          bunextReq.session.sessionTimeoutFromNow * 1000 -
          (new Date().getTime() - CreatedAt);

    const preloadScriptObj = {
      __PAGES_DIR__: JSON.stringify(this.pageDir),
      __INITIAL_ROUTE__: JSON.stringify(serverSide.pathname + search),
      __ROUTES__: this.#routes_dump,
      __SERVERSIDE_PROPS__: serverSidePropsString,
      __LAYOUT_ROUTE__: JSON.stringify(this.layoutPaths),
      __HEAD_DATA__: JSON.stringify(Head.head),
      __PUBLIC_SESSION_DATA__: JSON.stringify(bunextReq.session.getData(true)),
      __SESSION_TIMEOUT__: JSON.stringify(sessionTimeout),
      serverConfig: JSON.stringify({
        Dev: globalThis.serverConfig.Dev,
        HTTPServer: globalThis.serverConfig.HTTPServer,
      } as Partial<ServerConfig>),
      __PROCESS_ENV__: JSON.stringify(
        Object.assign(
          {},
          ...[
            ...Object.keys(process.env)
              .filter((k) => k.startsWith("PUBLIC"))
              .map((k) => {
                return { [k]: process.env[k] };
              }),
            {
              NODE_ENV: process.env.NODE_ENV,
            },
          ]
        )
      ),
      __CSS_PATHS__: JSON.stringify(this.cssPathExists),
    } as Record<keyof _GlobalData, string>;

    const preloadSriptsStrList = () => [
      ...Object.keys(preloadScriptObj)
        .map((i) => `${i}=${(preloadScriptObj as any)[i]}`)
        .filter(Boolean),
      "process={env: __PROCESS_ENV__};",
    ];

    const renderOptionData = {
      signal: request.signal,
      bootstrapScriptContent: preloadSriptsStrList().join(";"),
      bootstrapModules: ["/.bunext/react-ssr/hydrate.js"],
      onError,
    } as RenderToReadableStreamOptions;

    const makeJsx = async (bunext_request: BunextRequest) => {
      if (process.env.NODE_ENV == "development") {
        let pageString = "";
        let proc: Subprocess<"ignore", "inherit", "inherit"> | undefined =
          undefined as unknown as Subprocess<"ignore", "inherit", "inherit">;

        await new Promise((resolve) => {
          proc = Bun.spawn({
            env: {
              ...process.env,
              module_path: serverSide.filePath,
              props: JSON.stringify({
                props: serverSidePropsResult,
                params: serverSide.params,
              }),
              url: request.url,
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
              if (head) bunext_request.headData = head;
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
      } else
        return (
          (await this.serverPrebuiltPage(serverSide, await import(module))) ||
          (await this.CreateDynamicPage(
            module,
            {
              props: serverSidePropsResult,
              params: serverSide.params,
            },
            serverSide,
            bunext_request
          ))
        );
    };

    const jsxToServe: JSX.Element = await makeJsx(bunextReq);
    if (bunextReq.headData) {
      preloadScriptObj.__HEAD_DATA__ = JSON.stringify(bunextReq.headData);
      renderOptionData.bootstrapScriptContent =
        preloadSriptsStrList().join(";");
    }
    return (
      <RequestContext.Provider value={bunextReq}>
        <Shell route={serverSide.pathname + search} {...serverSidePropsResult}>
          {jsxToServe}
          <script src="/.bunext/react-ssr/hydrate.js" type="module"></script>
          <script
            dangerouslySetInnerHTML={{
              __html: renderOptionData.bootstrapScriptContent || "",
            }}
          />
        </Shell>
      </RequestContext.Provider>
    );
  }

  private async SetCssPathsExists(match: MatchedRoute | null | undefined) {
    if (!match) return [];
    let currentPath = "/";
    const cssPaths: Array<string> = [];
    const formatedPath = match.name == "/" ? [""] : match.name.split("/");

    for await (const p of formatedPath) {
      currentPath += p.length > 0 ? p : "";
      if (this.layoutPaths.includes(currentPath)) {
        cssPaths.push(normalize(`/${this.pageDir}${currentPath}/layout.css`));
      }
      if (p.length > 0) currentPath += "/";
    }

    await Promise.all(
      [
        ...cssPaths,
        normalize(`/${this.pageDir}${currentPath}/index.css`),
      ].filter(async (p) => {
        if (this.cssPathExists.includes(p)) return true;
        const exists = await file(normalize(`${this.buildDir}/${p}`)).exists();
        if (exists) this.cssPathExists.push(p);
        return exists;
      })
    );
  }

  private async serverPrebuiltPage(
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

  private async VerifyApiEndpoint(
    bunextreq: BunextRequest,
    route: MatchedRoute
  ) {
    const ApiModule = await import(route.filePath);
    if (typeof ApiModule[bunextreq.request.method.toUpperCase()] == "undefined")
      return;
    await bunextreq.session.initData();
    const res = (await ApiModule[bunextreq.request.method](bunextreq)) as
      | BunextRequest
      | undefined;
    if (res instanceof BunextRequest) {
      return bunextreq.setCookie(res.response);
    }
    throw new Error(
      `Api Endpoint ${route.filePath} did not returned a BunextRequest Object`
    );
  }

  private makeStream(jsx: JSX.Element): Response {
    const rewriter = new HTMLRewriter().on("#BUNEXT_INNER_PAGE_INSERTER", {
      element(element) {
        element.removeAndKeepContent();
      },
    });

    const page = HTMLDocType + rewriter.transform(renderToString(jsx));

    return new Response(page, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
  private getlayoutPaths() {
    return this.getFilesFromPageDir()
      .filter((f) => f.split("/").at(-1)?.includes("layout."))
      .map((l) => normalize(`//${l}`.split("/").slice(0, -1).join("/")));
  }

  private async serverActionGetter(
    request_header: Record<string, string>,
    data: FormData,
    bunextReq: BunextRequest
  ): Promise<Response> {
    const reqData = this.extractServerActionHeader(request_header);

    if (!reqData) throw new Error(`no request Data for ServerAction`);
    const props = this.extractPostData(data);
    const module = this.serverActions.find(
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
      ...[...props, ...fillUndefinedParams, bunextReq]
    );

    let dataType: ServerActionDataTypeHeader = "json";
    if (result instanceof Blob) {
      dataType = "blob";
    } else if (result instanceof File) {
      dataType = "file";
    } else {
      result = JSON.stringify({ props: result });
    }

    return bunextReq.setCookie(
      new Response(result as Exclude<ServerActionDataType, object>, {
        headers: {
          ...bunextReq.response.headers,
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

async function Init() {
  await rm(".bunext/build/node_modules", {
    recursive: true,
    force: true,
  });
}

if (!existsSync(".bunext/build/src/pages"))
  mkdirSync(".bunext/build/src/pages", { recursive: true });
const router = new StaticRouters();

await Init();
export { router, StaticRouters };
