"server only";

import {
  type BunFile,
  type FileSystemRouter,
  type MatchedRoute,
  type Subprocess,
} from "bun";
import { NJSON } from "next-json";
import { extname, join, relative, sep, normalize } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import {
  renderToString,
} from "react-dom/server";
import { type JSX } from "react";

// Internal imports
import type {
  _GlobalData,
  ReactShellComponent,
  ServerConfig,
  ServerSideProps,
} from "../types";
import { Head, type _Head } from "../../features/head";
import { BunextRequest, BunextResponseNotSetError } from "./bunextRequest";
import { RequestContext } from "./context";
import { PluginLoader } from "./plugin-loader";
import { generateRandomString } from "../../features/utils";
import CacheManager from "../caching";

// Global imports
import "./server_global";
import "./bunext_global";
import type { JsxToStringWorkerMessage } from "../dev/types";
import { BunextError } from "./server_global";
import { makeServerSideProps } from "plugins/server-features/serverSideProps";
import { ErrorFallback } from "components/fallback";

type RouteEntry = [string, string];

const SUPPORTED_FILE_EXTENSIONS = [".tsx", ".ts", ".js", ".jsx"] as const;
const STATIC_FILE_SUFFIXES = [
  "",
  ".html",
  "index.html",
  ".js",
  "/index.js",
  ".css",
] as const;

/**
 * Custom error for client-only components
 */
class ClientOnlyError extends Error {
  constructor(message = "Component can only be rendered on the client side") {
    super(message);
    this.name = "ClientOnlyError";
  }
}



export class RouteNotFoundError extends BunextError { }
class ComponentNotFoundError extends BunextError { }
export class RenderingError extends BunextError { }

class FileSystemError extends BunextError { }

/**
 * Error for missing server-side routes
 */
class ServerRouteNotFoundError extends Error {
  constructor(pathname: string) {
    super(`No server-side script found for ${pathname}`);
    this.name = "ServerRouteNotFoundError";
  }
}

/**
 * Main router class that handles static and dynamic routing for Bunext applications
 * Extends PluginLoader to support routing plugins
 */
class StaticRouters extends PluginLoader {
  // Core routers
  public server: FileSystemRouter;
  public client: FileSystemRouter;

  // Route configuration
  public routes_dump: string;
  public layoutPaths: string[] = [];
  public cssPaths: string[] = [];
  public cssPathExists: string[] = [];
  public staticRoutes: Array<keyof FileSystemRouter["routes"]> = [];

  // Initialization state
  private readonly initPromise: Promise<boolean>;
  private initResolver?: (value: boolean | PromiseLike<boolean>) => void;
  private inited = false;

  // Directory configuration
  public readonly baseDir = process.cwd();
  public readonly buildDir = ".bunext/build" as const;
  public readonly pageDir = "src/pages" as const;
  public readonly staticDir = "static" as const;

  constructor() {
    super();

    try {
      this.server = this.createFileSystemRouter(this.pageDir);
      this.client = this.createFileSystemRouter(
        join(this.buildDir, this.pageDir),
      );

      this.routes_dump = this.generateServerSideRouteDump(this.server);
      this.layoutPaths = this.getLayoutPaths();

      this.initPromise = new Promise(
        (resolve) => (this.initResolver = resolve)
      );
    } catch (error) {
      throw new Error(`Failed to initialize StaticRouters: ${error}`);
    }
  }

  /**
   * Creates a FileSystemRouter with proper configuration
   */
  private createFileSystemRouter(
    directory: string,
  ): FileSystemRouter {
    const config = {
      dir: join(this.baseDir, directory),
      style: "nextjs" as const,
    };

    return new Bun.FileSystemRouter(config);
  }

  /**
   * Generates a route dump from server-side router for client hydration
   */
  private generateServerSideRouteDump(serverFileRouter: FileSystemRouter): string {
    try {
      const routes = Object.fromEntries(
        Object.entries(serverFileRouter.routes)
          .filter(([, filePath]) => this.isValidRouteFile(filePath))
          .map(([path, filePath]) => this.transformRouteEntry(path, filePath))
      );

      return NJSON.stringify(routes, { omitStack: true });
    } catch (error) {
      throw new Error(`Failed to generate route dump: ${error}`);
    }
  }

  /**
   * Checks if a file path represents a valid route file
   */
  private isValidRouteFile(filePath: string): boolean {
    const filename = filePath.split("/").at(-1);
    if (!filename) return false;

    return (
      filename === "index.tsx" ||
      filename === "layout.tsx" ||
      /\[[A-Za-z0-9]+\]\.[A-Za-z]sx/.test(filename) ||
      /\[\.\.\..*\]\.[A-Za-z]sx/.test(filename)
    );
  }

  /**
   * Transforms a route entry for client consumption
   */
  private transformRouteEntry(path: string, filePath: string): [string, string] {
    const filePathArray = filePath.split(this.baseDir).at(1)?.split(".");
    if (!filePathArray) {
      throw new Error(`Invalid file path: ${filePath}`);
    }

    filePathArray.pop();
    filePathArray.push("js");

    return [path, filePathArray.join(".")];
  }

  /**
   * Generates client-side route dump
   */
  private generateClientSideRouteDump(clientRouter: FileSystemRouter): string {
    const routes = Object.fromEntries(
      Object.entries(clientRouter.routes).map(([path, filePath]) => [
        path,
        "/" + relative(join(this.baseDir, this.buildDir), filePath),
      ])
    );

    return NJSON.stringify(routes, { omitStack: true });
  }

  /**
   * Gets layout paths from the pages directory
   */
  private getLayoutPaths(): string[] {
    try {
      return this.getFilesFromPageDir()
        .filter((file) => file.split("/").at(-1)?.includes("layout."))
        .map((layoutFile) =>
          normalize(`//${layoutFile}`.split("/").slice(0, -1).join("/"))
        );
    } catch (error) {
      console.warn(`Failed to get layout paths: ${error}`);
      return [];
    }
  }

  /**
   * Initializes the router with all necessary data
   * This method is idempotent and can be safely called multiple times
   */
  public async init(): Promise<void> {
    if (this.inited) return;

    try {
      await this.initPlugins();

      const [cssPathExists, staticRoutes] = await Promise.all([
        this.getCssPaths(),
        this.getUseStaticRoutes(),
      ]);

      this.cssPathExists = cssPathExists;
      this.staticRoutes = staticRoutes;
      this.inited = true;

      this.initResolver?.(true);
    } catch (error) {
      console.error("Router initialization failed:", error);
      this.initResolver?.(false);
      throw error;
    }
  }

  /**
   * Returns a promise that resolves when the router is initialized
   */
  public isInited(): Promise<boolean> {
    return this.initPromise;
  }

  /**
   * Gets routes excluding layout files
   */
  getRoutesWithoutLayouts(): RouteEntry[] {
    try {
      return Object.entries(this.server?.routes || {}).filter(
        ([route]) => !route.endsWith("/layout") && !route.endsWith(".d")
      ) as RouteEntry[];
    } catch (error) {
      console.warn("Failed to get routes without layouts:", error);
      return [];
    }
  }

  /**
   * Gets CSS file paths that exist in the build directory
   * @param clear - Whether to clear existing CSS paths before scanning
   */
  async getCssPaths(clear: boolean = false): Promise<string[]> {
    try {
      if (clear) this.cssPathExists = [];

      const possibleCssPaths = Object.values(this.server?.routes || {}).map(
        (path) => {
          const trimPath = path.replace(process.cwd(), "").split(".");
          trimPath.pop();
          return join(this.buildDir, trimPath.join(".") + ".css");
        }
      );

      const existingCssFiles: string[] = [];

      for (const path of possibleCssPaths) {
        try {
          if (await Bun.file(path).exists()) {
            existingCssFiles.push(path);
          }
        } catch (error) {
          // Silently skip files that can't be checked
          continue;
        }
      }

      return existingCssFiles.map((path) =>
        normalize(path.replace(this.buildDir, "/"))
      );
    } catch (error) {
      console.warn("Failed to get CSS paths:", error);
      return [];
    }
  }

  /**
   * Identifies routes that use static rendering
   */
  private async getUseStaticRoutes(): Promise<string[]> {
    const staticRoutes: string[] = [];
    // More robust regex that handles whitespace and optional semicolons
    const useStaticRegex = /^\s*(['"])use\s+static\1\s*;?\s*$/;

    try {
      await Promise.all(
        this.getRoutesWithoutLayouts().map(async ([route, path]) => {
          try {
            const fileContent = await Bun.file(path).text();
            // Check first few non-empty lines in case of comments or blank lines
            const lines = fileContent.split("\n");
            const firstNonEmptyLines = lines
              .filter(line => line.trim().length > 0)
              .slice(0, 3); // Check first 3 non-empty lines

            const hasUseStatic = firstNonEmptyLines.some(line =>
              useStaticRegex.test(line.trim())
            );

            if (hasUseStatic) {
              staticRoutes.push(route);
            }
          } catch (error) {
            console.warn(`Failed to check static route ${route}:`, error);
          }
        })
      );
    } catch (error) {
      console.warn("Failed to get static routes:", error);
    }

    return staticRoutes;
  }

  /**
   * Recreates and updates router instances
   * Used for hot reloading in development
   */
  public setRoutes(): void {
    try {
      this.server = this.createFileSystemRouter(this.pageDir);
      this.client = this.createFileSystemRouter(
        join(this.buildDir, this.pageDir)
      );

      this.routes_dump = this.generateClientSideRouteDump(this.client);
    } catch (error) {
      console.error("Failed to update routes:", error);
      throw error;
    }
  }

  private Logger(message: any, type: keyof typeof console = "log") {
    if (process.env.NODE_ENV === "development") {
      (console as any)[type](message);
    }
  }

  /**
   * Main entry point for handling HTTP requests
   */
  async serve(
    request: Request,
    request_header: Record<string, string>,
    data: FormData,
    { Shell }: { Shell: ReactShellComponent }
  ): Promise<Response> {
    await this.isInited();

    const manager = new RequestManager({
      request,
      client: this.client,
      server: this.server,
      data,
      request_header,
      router: this,
      Shell,
    })
    await manager.make();
    let response = await manager.bunextReq.toResponse();

    if (response instanceof BunextResponseNotSetError) return new Response(null, {
      headers: {
        "Content-Type": "text/plain",
      },
      status: 404,
    });


    if (response instanceof BunextError) {
      this.Logger(response, "error");
      return new Response(renderToString(ErrorFallback({ error: response })));
    }
    for await (const after_request of
      this.getSubPluginsByParentName("router", "after_request")) {
      const result = await after_request(manager, response);
      if (result instanceof Response) {
        response = result;
      }
    }
    return response;
  }

  public async CreateDynamicPage(
    module: string,
    props: { props: any; params: Record<string, unknown> },
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
   * Next.js like layout module stacking
   * @param route
   * @param pageElement The JSX Element to wrap layouts around
   */
  public async stackLayouts(route: MatchedRoute, pageElement: JSX.Element) {
    type _layout = ({
      children,
      params,
    }: {
      children: JSX.Element;
      params: Record<string, unknown>;
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
          params: formatParams(route.params),
        });
    }
    return currentJsx;
  }
  /**
   * Gets all files from the pages directory
   */
  public getFilesFromPageDir(): string[] {
    try {
      const glob = new Bun.Glob("**/*.{ts,tsx,js,jsx}");
      return Array.from(
        glob.scanSync({
          cwd: this.pageDir,
          onlyFiles: true,
        })
      );
    } catch (error) {
      console.warn("Failed to get files from page directory:", error);
      return [];
    }
  }

  /**
   * Static method to get files from a specific page directory
   */
  static getFileFromPageDir(pageDir?: string): string[] {
    try {
      const glob = new Bun.Glob("**/*.{ts,tsx,js,jsx}");
      return Array.from(
        glob.scanSync({
          cwd: pageDir,
          onlyFiles: true,
        })
      );
    } catch (error) {
      console.warn("Failed to get files from specified page directory:", error);
      return [];
    }
  }

  /**
   * Checks if a file contains 'use client' directive
   */
  isUseClient(fileData: string): boolean {
    try {
      const firstLine = fileData
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .at(0);

      if (!firstLine) return false;

      return (
        firstLine.startsWith("'use client'") ||
        firstLine.startsWith('"use client"')
      );
    } catch (error) {
      console.warn("Failed to check 'use client' directive:", error);
      return false;
    }
  }

  /**
   * Serves files from a specified directory with fallback suffixes
   */
  async serveFromDir(config: {
    directory: string;
    path: string;
    suffixes?: string[];
  }): Promise<BunFile | null> {
    try {
      const basePath = join(config.directory, normalize(decodeURI(config.path)));
      const suffixes = config.suffixes ?? [...STATIC_FILE_SUFFIXES];

      for (const suffix of suffixes) {
        try {
          const pathWithSuffix = basePath + suffix;
          const file = Bun.file(pathWithSuffix);

          if (await file.exists()) {
            return file;
          }
        } catch (error) {
          // Continue to next suffix
          continue;
        }
      }

      return null;
    } catch (error) {
      console.warn(`Failed to serve from directory ${config.directory}:`, error);
      return null;
    }
  }
}

type RequestManagerProps = {
  request: Request;
  request_header: Record<string, string>;
  data: FormData;
  server: FileSystemRouter;
  client: FileSystemRouter;
  router: StaticRouters;
  Shell: ReactShellComponent;
};

/**
 * Manages individual HTTP requests and routes them to appropriate handlers
 */
class RequestManager<ContextType extends Record<string, unknown> = {}> {
  // Request data
  public readonly request: Request;
  public readonly pathname: string;
  public readonly search: string;
  public readonly request_header: Record<string, string>;
  public readonly data: FormData;

  //cache
  private buildFileCache: Map<string, Uint8Array<ArrayBufferLike>> = new Map();

  // Routing
  public readonly server: FileSystemRouter;
  public readonly client: FileSystemRouter;
  public readonly serverSide: MatchedRoute | null;
  public readonly clientSide: MatchedRoute | null;
  public readonly router: StaticRouters;
  public relatedCssPaths: string[];

  // Components and state
  public readonly Shell: ReactShellComponent;
  public bunextReq: BunextRequest<ContextType>;

  constructor(init: RequestManagerProps) {
    // Basic request data
    this.request = init.request;
    this.request_header = init.request_header;
    this.data = init.data;

    // Router configuration
    this.server = init.server;
    this.client = init.client;
    this.router = init.router;
    this.Shell = init.Shell;

    // Parse URL
    const { pathname, search } = new URL(this.request.url);
    this.pathname = pathname;
    this.search = search;

    // Route matching
    this.serverSide = this.server.match(this.request);
    this.clientSide = this.client.match(this.request);

    // Initialize Bunext request
    this.bunextReq = new BunextRequest({
      request: this.request,
      response: new Response(),
      manager: this
    });

    this.relatedCssPaths = [];
  }

  /**
   * Main request processing method that routes requests through the middleware chain
   */
  async make(): Promise<void> {
    process.env.__SESSION_MUST_NOT_BE_INITED__ = "false";

    await this.checkPluginServing();

  }

  /**
   * Checks and applies plugin-based request handling
   */
  private async checkPluginServing(): Promise<void> {
    const plugins = this.router
      .getSubPluginsByParentName("router", "request");
    for await (const plugin of plugins) {
      await plugin(this);
      if (this.bunextReq.__BYPASS_RESPONSE__) break;
    }
  }
  /**
   * Creates an error for missing server-side routes
   */
  private createNoServerSideMatchError(): RouteNotFoundError {
    return new RouteNotFoundError(`No server-side script found for ${this.pathname}`);
  }


  private async makeDevDynamicJSXElement(serverSideProps?: ServerSideProps<unknown>) {
    let pageString = "";
    let proc: Subprocess<"ignore", "inherit", "inherit"> | undefined =
      undefined as unknown as Subprocess<"ignore", "inherit", "inherit">;

    await new Promise((resolve, reject) => {
      if (!this.serverSide) {
        reject(undefined);
        throw this.createNoServerSideMatchError();
      }
      proc = Bun.spawn({
        env: {
          ...process.env,
          module_path: this.serverSide.filePath,
          props: JSON.stringify({
            props: serverSideProps,
            params: formatParams(this.serverSide.params),
          }),
          url: this.request.url,
        },
        cwd: process.cwd(),
        cmd: ["bun", `${import.meta.dirname}/../dev/jsxToString.tsx`],
        stdout: "inherit",
        stderr: "inherit",
        ipc: (message: JsxToStringWorkerMessage) => {
          if (message.type == "jsxToString") {
            pageString = message.jsx;
            if (message.head) this.bunextReq.headData = message.head;
            resolve(true);

          } else (console[message.type] as any)(...message.message);

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
  private async makeProductionDynamicJSXElement(
    serverSideProps?: ServerSideProps<unknown>
  ) {
    if (!this.serverSide) return null;
    return this.router.CreateDynamicPage(
      this.serverSide.filePath,
      {
        props: serverSideProps,
        params: formatParams(this.serverSide.params),
      },
      this.serverSide,
      this.bunextReq
    );
  }
  /**
   * Creates a dynamic JSX element containing the page wrapped by all layouts from the current route
   * @param param0 - The server-side props for the page
   * @returns the page wrapped in layouts in JSX format
   */
  public makeDynamicJSXPage({
    serverSideProps,
  }: {
    serverSideProps?: ServerSideProps<{} | unknown>;
  }) {
    if (!this.serverSide) return null;

    if (process.env.NODE_ENV == "development")
      return this.makeDevDynamicJSXElement(serverSideProps);
    else return this.makeProductionDynamicJSXElement(serverSideProps);
  }

  /**
   * Wrapping Page and Layouts with the Shell
   * @param page layouts + page
   * @returns Shelled Page JSX
   */
  public async WrapPageWithShell(page: JSX.Element): Promise<JSX.Element> {
    const ShellJSX = (
      <RequestContext.Provider value={this.bunextReq}>
        <this.Shell
          route={this.serverSide?.pathname + this.search}
          props={(await makeServerSideProps(this))}
          request={this.bunextReq}
        >
          {page}
          <script src="/.bunext/react-ssr/hydrate.js" type="module"></script>
          <script id="_BUNEXT_BOOTSTRAP_SCRIPT_" />
        </this.Shell>
      </RequestContext.Provider>
    );
    return ShellJSX;
  }

  public JSXToString(page: JSX.Element): string {
    return renderToString(page);
  }
}

function formatParams(match: MatchedRoute["params"]): Record<string, unknown> {
  const params =
    Object.entries(match).map(([key, value]) => {
      const val = value.split("/");
      if (val.length > 1) {
        return [key, val];
      }
      return [key, val[0]];
    }) || [];

  return Object.fromEntries(params);
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

const router: StaticRouters = Boolean(globalThis.__INIT__)
  ? (undefined as any)
  : new StaticRouters();

export { router, StaticRouters, RequestManager, Init };
