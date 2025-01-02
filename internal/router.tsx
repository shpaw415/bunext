import type { FileSystemRouter, MatchedRoute } from "bun";
import { NJSON } from "next-json";
import { extname, join, relative } from "node:path";
import {
  renderToString,
  type RenderToReadableStreamOptions,
} from "react-dom/server";
import type {
  _DisplayMode,
  _SsrMode,
  ServerActionDataType,
  ServerActionDataTypeHeader,
  ServerConfig,
} from "./types";
import { normalize } from "path";
import React from "react";
import "./server_global";
import { mkdirSync, existsSync } from "node:fs";
import { builder } from "./build";
import { Head } from "../features/head";
import { BunextRequest } from "./bunextRequest";
import "./server_global";
import { rm } from "node:fs/promises";

class ClientOnlyError extends Error {
  constructor() {
    super("client only");
  }
}

type pathNames = "/bunextgetSessionData" | "/ServerActionGetter" | string;

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

    const bunextReq = new BunextRequest({
      request,
      response: new Response(),
    });

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
        if (staticAssets !== null)
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
        if (staticResponse !== null) {
          return bunextReq.__SET_RESPONSE__(
            new Response(staticResponse, {
              headers: {
                "Content-Type": "text/javascript",
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
    } as const;

    const preloadSriptsStrList = [
      ...Object.keys(preloadScriptObj)
        .map((i) => `${i}=${(preloadScriptObj as any)[i]}`)
        .filter(Boolean),
      "process={env: __PROCESS_ENV__};",
    ];

    const renderOptionData = {
      signal: request.signal,
      bootstrapScriptContent: preloadSriptsStrList.join(";"),
      bootstrapModules: ["/.bunext/react-ssr/hydrate.js", "/bunext-scripts"],
      onError,
    } as RenderToReadableStreamOptions;

    const makeJsx = async () => {
      if (process.env.NODE_ENV == "development") {
        const { stdout, stderr } = Bun.spawnSync({
          env: {
            module_path: serverSide.filePath,
            props: JSON.stringify({
              props: serverSidePropsResult,
              params: serverSide.params,
            }),
            url: request.url,
          },
          cwd: process.cwd(),
          cmd: ["bun", `${import.meta.dirname}/dev/jsxToString.tsx`],
        });
        const decoder = new TextDecoder();
        const decodedStdError = decoder.decode(stderr);
        const decodedStdOut = decoder.decode(stdout);
        const splited = decodedStdOut.split("<!BUNEXT_SEPARATOR!>");
        const pageString = splited[1] as string;

        splited.splice(1, 1);
        console.log(splited.join("\n"));

        if (decodedStdError && pageString.length == 0)
          throw Error(decodedStdError);
        else if (decodedStdError) console.error(decodedStdError);

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
            serverSide
          ))
        );
    };

    const jsxToServe: JSX.Element = await makeJsx();
    return (
      <Shell route={serverSide.pathname + search} {...serverSidePropsResult}>
        {jsxToServe}
        <script src="/.bunext/react-ssr/hydrate.js" type="module"></script>
        <script
          dangerouslySetInnerHTML={{
            __html: renderOptionData.bootstrapScriptContent || "",
          }}
        />
      </Shell>
    );
  }

  private async serverPrebuiltPage(
    serverSide: MatchedRoute,
    module: Record<string, Function>
  ) {
    const preBuiledPage = builder.ssrElement
      .find((e) => e.path == serverSide.filePath)
      ?.elements.find((e) =>
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
    serverSide: MatchedRoute
  ): Promise<JSX.Element> {
    const jsxToServe = (
      (await import(module)) as {
        default: ({
          props,
          params,
        }: {
          props: any;
          params: any;
        }) => Promise<JSX.Element>;
      }
    ).default({
      props: props.props,
      params: props.params,
    });

    return await this.stackLayouts(serverSide, await jsxToServe);
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
    const layouts = route.pathname == "/" ? [""] : route.pathname.split("/");
    type _layout = ({
      children,
    }: {
      children: JSX.Element;
    }) => JSX.Element | Promise<JSX.Element>;
    let layoutsJsxList: Array<_layout | string> = [];
    let index = 0;
    for await (const i of layouts) {
      const path = layouts.slice(0, index + 1).join("/");
      const pathToFile = normalize(
        `${this.baseDir}/${this.pageDir}/${path}/layout.tsx`
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
      if (typeof Layout == "string") continue;
      else
        currentJsx = await Layout({
          children: currentJsx,
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
