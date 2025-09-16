"server only";

import {
  type BunFile,
  type FileSystemRouter,
  type MatchedRoute,
} from "bun";
import { NJSON } from "next-json";
import { join, relative, sep, normalize, resolve } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import {
  renderToString,
} from "react-dom/server";
import { type JSX } from "react";

// Internal imports
import type {
  _GlobalData,
  Params,
  ServerSideProps,
} from "../types";
import { BunextRequest } from "./bunextRequest";
import { RequestContext } from "./context";

// Global imports
import "./server_global";
import { BunextError } from "./server_global";
import { DirectiveTool, IPCManager } from "plugins/utils";
import { Shell } from "public/client/shell";
import { pluginLoader } from "./plugin-loader";

declare global {
  var __ROUTER__: StaticRouters;
}


type RouteEntry = [string, string];

const STATIC_FILE_SUFFIXES = [
  "",
  ".html",
  "index.html",
  ".js",
  "/index.js",
  ".css",
] as const;


export class RouteNotFoundError extends BunextError { }
export class RenderingError extends BunextError { }

class FileSystemError extends BunextError { }

/**
 * Main router class that handles static and dynamic routing for Bunext applications
 * Extends PluginLoader to support routing plugins
 */
class StaticRouters {
  // Core routers
  public server: FileSystemRouter;
  public client: FileSystemRouter;

  // Route configuration
  public routes_dump: string;
  public layoutPaths: string[] = [];
  public cssPaths: string[] = [];
  public cssPathExists: string[] = [];
  // Initialization state
  private readonly initPromise: Promise<boolean>;
  private initResolver?: (value: boolean | PromiseLike<boolean>) => void;
  private inited = false;

  public fileDirectives!: DirectiveTool;

  // Directory configuration
  public readonly baseDir = process.cwd();
  public readonly buildDir = ".bunext/build" as const;
  public readonly pageDir = "src/pages" as const;
  public readonly staticDir = "static" as const;

  constructor() {
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

  private async initFileDirectives() {
    const [cssPathExists, fileDirective] = await Promise.all([
      this.getCssPaths(),
      await DirectiveTool.getInstance(Object.entries(this.server.routes).map(([route, path]) => ({ path, route })))
    ]);

    this.cssPathExists = cssPathExists;
    this.fileDirectives = fileDirective;

  }

  /**
   * Initializes the router with all necessary data
   * This method is idempotent and can be safely called multiple times
   */
  public async init(): Promise<void> {
    if (this.inited) return;

    try {
      await this.initFileDirectives();

      this.inited = true;
      if (!this.initResolver) throw new Error("Router initResolver is not set");
      this.initResolver(true);
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
  ): Promise<Response> {
    await this.isInited();

    const manager = new RequestManager({
      request,
      client: this.client,
      server: this.server,
      data,
      request_header,
      router: this,
    })

    const ipc = IPCManager.getInstanceForCurrentProcess() as IPCManager<"main" | "cluster">;

    manager.bunextReq.currentState = "before_request";
    for (const plugin of pluginLoader.getSubPluginsByParentName("router", "before_request")) {
      try {
        await plugin.subPlugin(manager, ipc);
      } catch (e) {
        console.error(`Error occurred in before_request plugin, name: ${plugin.name}:`, e);
        manager.bunextReq.__ERROR__ = new Error(`Error occurred in plugin before_request ${plugin.name}`, { cause: e as Error });
      }
    }

    manager.bunextReq.currentState = "request";
    const plugins = pluginLoader.getSubPluginsByParentName("router", "request");
    for await (const plugin of plugins) {
      try {
        await plugin.subPlugin(manager, ipc);
        if (manager.bunextReq.isSendNowEnabled === true) {
          break;
        }
      } catch (e) {
        console.error(`Error occurred in request plugin, name: ${plugin.name}:`, e);
        manager.bunextReq.__ERROR__ = new Error(`Error occurred in plugin request ${plugin.name}`, { cause: e as Error });
        break;
      }
    }
    if (manager.bunextReq.isSendNowEnabled || manager.bunextReq.__ERROR__) return manager.bunextReq.toResponse();


    await manager.bunextReq._formatResponseBeforeSending();


    manager.bunextReq.currentState = "after_request";
    for await (const after_request of
      pluginLoader.getSubPluginsByParentName("router", "after_request")) {
      try {
        const result = await after_request.subPlugin(manager, ipc);
        if (result instanceof Response) return result;
      } catch (e) {
        console.error(`Error occurred in after_request plugin, name: ${after_request.name}:`, e);
        manager.bunextReq.__ERROR__ = new Error(`Error occurred in plugin after_request ${after_request.name}`, { cause: e as Error });
        break;
      }
    }

    if (manager.bunextReq.__ERROR__) {
      return manager.bunextReq.toResponse();
    } else {
      manager.bunextReq._triggerAwaitingCookies();
    }

    return manager.bunextReq.response as Response;

  }
  /**
   * Create a page wrapped in layouts from module path
   * @param param0 Module path, server-side props, route name, and request manager
   * @returns JSX page wrapped in layouts 
   */
  public async CreateDynamicPage({
    module,
    props,
    routeName,
    manager
  }: {
    module: string,
    props: { props?: ServerSideProps<{}>; params: Params },
    routeName: string,
    manager?: RequestManager
  }): Promise<JSX.Element> {
    const ModuleDefault = (
      (await import(module)) as {
        default: ({
          props,
          params,
        }: {
          props?: ServerSideProps<{}>;
          params: Params;
          manager?: RequestManager;
        }) => Promise<JSX.Element>;
      }
    ).default;

    const JSXElement = async () => (
      <RequestContext.Provider value={manager?.bunextReq}>
        {await this.stackLayouts({
          pageElement: await ModuleDefault({ ...props, manager: manager }),
          routeName,
          params: props.params
        })}
      </RequestContext.Provider>
    );

    return JSXElement();
  }

  /**
   * Next.js like layout module stacking
   * @param route
   * @param pageElement The JSX Element to wrap layouts around
   */
  public async stackLayouts({
    routeName,
    pageElement,
    params,
  }: {
    routeName: string;
    pageElement: JSX.Element;
    params?: Record<string, unknown>;
  }): Promise<JSX.Element> {
    type _layout = ({
      children,
      params,
    }: {
      children: JSX.Element;
      params: Record<string, unknown>;
    }) => JSX.Element | Promise<JSX.Element>;

    const layouts = routeName == "/" ? [""] : routeName.split("/");
    const layoutImports: Array<Promise<{ default: _layout }>> = [];
    layouts.reduce((prev, current) => {
      const pathFromPageDir = join(prev || sep, current);
      if (this.layoutPaths.includes(pathFromPageDir)) {
        layoutImports.push(
          import(
            join(this.baseDir, this.pageDir, pathFromPageDir, `layout.tsx${process.env.NODE_ENV == "development" ? `?t=${Date.now()}` : ""}`)
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
          params: params || {},
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
   * Serves files from a specified directory with fallback suffixes
   */
  async serveFromDir(config: {
    directory: string;
    path: string;
    suffixes?: string[];
  }): Promise<BunFile | null> {
    try {
      const suffixes = config.suffixes ?? [...STATIC_FILE_SUFFIXES];

      const baseDir = resolve(config.directory);
      const decoded = decodeURI(config.path);
      const normalized = normalize(decoded);
      // Resolve against baseDir. Prefix with "." to keep normalized absolute-style inputs inside baseDir.
      const basePath = resolve(baseDir, "." + normalized);
      // Ensure the resolved path stays within baseDir
      if (relative(baseDir, basePath).startsWith("..")) {
        throw new FileSystemError(
          `Rejected path outside of base directory: ${decoded}`
        );
      }

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

  // Routing
  public readonly server: FileSystemRouter;
  public readonly client: FileSystemRouter;
  public readonly serverSide: MatchedRoute | null;
  public readonly clientSide: MatchedRoute | null;
  public readonly router: StaticRouters;
  public relatedCssPaths: string[];

  // Components and state
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
      manager: this,
      directivesTools: this.router.fileDirectives
    });

    this.relatedCssPaths = [];
  }

  /**
   * Creates a dynamic JSX element containing the page wrapped by all layouts from the current route
   * @param param0 - The server-side props for the page
   * @returns the page wrapped in layouts in JSX format
   */
  public makeDynamicJSXPage({
    serverSideProps,
    modulePath,
    params,
    routeName
  }: {
    modulePath: string;
    serverSideProps?: ServerSideProps<{}>;
    params: Params;
    routeName: string;
  }) {
    return this.router.CreateDynamicPage({
      module: modulePath,
      manager: this,
      props: { props: serverSideProps, params },
      routeName
    });
  }

  /**
   * Wrapping Page and Layouts with the Shell
   * @param page layouts + page
   * @returns Shelled Page JSX
   */
  public async WrapPageWithShell(page: JSX.Element, bunextReq: BunextRequest): Promise<JSX.Element> {
    const ShellJSX = (
      <RequestContext.Provider value={bunextReq}>
        <Shell request={bunextReq}>
          {page}
          <script src="/.bunext/react-ssr/hydrate.js" type="module" />
          <script id="_BUNEXT_BOOTSTRAP_SCRIPT_" />
        </Shell>
      </RequestContext.Provider>
    );
    return ShellJSX;
  }

  public JSXToString(page: JSX.Element): string {
    return renderToString(page);
  }
}





if (!existsSync(".bunext/build/src/pages"))
  mkdirSync(".bunext/build/src/pages", { recursive: true });

globalThis.__ROUTER__ ??= new StaticRouters();
const router = globalThis.__ROUTER__;

export { router, StaticRouters, RequestManager };
