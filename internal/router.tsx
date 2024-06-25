import type { FileSystemRouter, MatchedRoute } from "bun";
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
import { mkdirSync, existsSync } from "node:fs";
import { builder } from "./build";
import { Head } from "../features/head";
import { BunextRequest } from "./bunextRequest";
import "./server_global";
class ClientOnlyError extends Error {
  constructor() {
    super("client only");
  }
}

type pathNames = "/bunextgetSessionData" | "/ServerActionGetter" | string;

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
  optionst = {
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
        return bunextReq.__SET_RESPONSE__(
          await this.serverActionGetter(request_header, data, bunextReq)
        );
      case "/bunextgetSessionData":
        return bunextReq.__SET_RESPONSE__(
          new Response(JSON.stringify(bunextReq.session.__DATA__.public))
        );
      default:
        const staticResponse = await this.serveFromDir({
          directory: this.buildDir,
          path: pathname,
        });
        if (staticResponse) {
          return bunextReq.__SET_RESPONSE__(
            new Response(staticResponse, {
              headers: {
                "Content-Type": "text/javascript",
              },
            })
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
    const result = await module?.getServerSideProps?.({
      params: serverSide.params,
      req: request,
      query: serverSide.query,
    });
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
      })
    );

    return bunextReq.__SET_RESPONSE__(stream);
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
  }) {
    const preloadScriptObj = {
      __PAGES_DIR__: JSON.stringify(this.pageDir),
      __INITIAL_ROUTE__: JSON.stringify(serverSide.pathname + search),
      __ROUTES__: this.#routes_dump,
      __SERVERSIDE_PROPS__: serverSidePropsString,
      __DISPLAY_MODE__: JSON.stringify("nextjs"),
      __LAYOUT_NAME__: JSON.stringify("layout"),
      __LAYOUT_ROUTE__: JSON.stringify(await this.getlayoutPaths()),
      __DEV_MODE__: Boolean(process.env.NODE_ENV == "development"),
      __HEAD_DATA__: JSON.stringify(Head.head),
      __PUBLIC_SESSION_DATA__: "undefined",
      __NODE_ENV__: `"${process.env.NODE_ENV}"`,
    } as const;

    const preloadSriptsStrList = Object.keys(preloadScriptObj)
      .map((i) => `${i}=${(preloadScriptObj as any)[i]}`)
      .filter(Boolean);

    const renderOptionData = {
      signal: request.signal,
      bootstrapScriptContent: preloadSriptsStrList.join(";"),
      bootstrapModules: ["/.bunext/react-ssr/hydrate.js", "/bunext-scripts"],
      onError,
    } as RenderToReadableStreamOptions;
    const jsxToServe: JSX.Element =
      (await this.serverPrebuiltPage(serverSide, await import(module))) ||
      (await this.CreateDynamicPage(
        module,
        {
          props: serverSidePropsResult,
          params: serverSide.params,
        },
        serverSide
      ));
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
    if (process.env.NODE_ENV == "production") {
      const jsxToServe = (await import(module)).default({
        props: props.props,
        params: props.params,
      }) as Promise<JSX.Element>;

      return await this.stackLayouts(serverSide, await jsxToServe);
    } else {
      if (!import.meta.main) {
        const processResponse = Bun.spawnSync({
          cmd: ["bun", import.meta.filename, "--makeJSX"],
          env: {
            ...process.env,
            __PROPS__: JSON.stringify(props),
            __MODULE_PATTH__: module,
            __MATCHED_ROUTE__: serverSide.pathname,
          },
        });
        const responseText = (
          await new Response(processResponse.stdout).text()
        ).split("<!BUNEXT_RESPONSE>")[1];
        return (
          <div
            id="BUNEXT_INNER_PAGE_INSERTER"
            dangerouslySetInnerHTML={{ __html: responseText }}
          />
        );
      } else {
        const jsxToServe = (await import(module)).default({
          props: props.props,
          params: props.params,
        }) as Promise<JSX.Element>;

        const stacked = await this.stackLayouts(serverSide, await jsxToServe);
        return stacked;
      }
    }
  }

  private async VerifyApiEndpoint(
    bunextreq: BunextRequest,
    route: MatchedRoute
  ) {
    const ApiModule = await import(route.filePath);
    if (typeof ApiModule[bunextreq.request.method.toUpperCase()] == "undefined")
      return;
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
    const page = rewriter.transform(renderToString(jsx));
    return new Response(page, {
      headers: {
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
    const agrsNbr = call.length - props.length - 1;
    const fillUndefinedParams =
      agrsNbr > 0
        ? (Array.apply(null, Array(agrsNbr)) as Array<undefined>)
        : [];
    const res = await call(...[...props, ...fillUndefinedParams, bunextReq]);

    const result = JSON.stringify({
      props: typeof res == "undefined" ? undefined : res,
      session: bunextReq.session.__DATA__.public,
    });
    return bunextReq.setCookie(
      new Response(result, {
        headers: bunextReq.response.headers,
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
      if (await file.exists()) return await file.text();
    }

    return null;
  }
}

if (!existsSync(".bunext/build/src/pages"))
  mkdirSync(".bunext/build/src/pages", { recursive: true });
const router = new StaticRouters();

if (import.meta.main) {
  const taskID = process.argv[2] as "--makeJSX";
  switch (taskID) {
    case "--makeJSX":
      const jsxElement = await router.CreateDynamicPage(
        process.env.__MODULE_PATTH__ as string,
        JSON.parse(process.env.__PROPS__ as string) as {
          props: any;
          params: Record<string, string>;
        },
        router.server?.match(
          process.env.__MATCHED_ROUTE__ as string
        ) as MatchedRoute
      );
      process.stdout.write(
        "<!BUNEXT_RESPONSE>" + renderToString(jsxElement) + "<!BUNEXT_RESPONSE>"
      );
      break;
  }
}

export { router, StaticRouters };
