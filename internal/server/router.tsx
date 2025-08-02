import {
  type BunFile,
  type FileSystemRouter,
  type MatchedRoute,
  type Subprocess,
} from "bun";
import { NJSON } from "next-json";
import { extname, join, relative, sep, resolve, normalize } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import {
  renderToString,
  type RenderToReadableStreamOptions,
} from "react-dom/server";
import React, { type JSX } from "react";

// Internal imports
import type {
  _DisplayMode,
  _GlobalData,
  _SsrMode,
  getServerSidePropsFunction,
  ReactShellComponent,
  ServerActionDataType,
  ServerActionDataTypeHeader,
  ServerConfig,
  ServerSideProps,
} from "../types";
import { Head, type _Head } from "../../features/head";
import { BunextRequest } from "./bunextRequest";
import { RequestContext } from "./context";
import { PluginLoader } from "./plugin-loader";
import { generateRandomString } from "../../features/utils";
import CacheManager from "../caching";

// Global imports
import "./server_global";
import "./bunext_global";

// Types and constants
type SpecialPathNames =
  | "/bunextgetSessionData"
  | "/ServerActionGetter"
  | "/bunextDeleteSession"
  | "/favicon.ico";

type RouteEntry = [string, string];

interface ServerAction {
  path: string;
  actions: Array<Function>;
}

interface LayoutModule {
  default: ({
    children,
    params,
  }: {
    children: JSX.Element;
    params: Record<string, string>;
  }) => JSX.Element | Promise<JSX.Element>;
}

interface PageModule {
  default?: ({
    props,
    params,
    request,
  }: {
    props: any;
    params: any;
    request?: BunextRequest;
  }) => Promise<JSX.Element>;
  getServerSideProps?: getServerSidePropsFunction;
}

const HTML_DOCTYPE = "<!DOCTYPE html>";
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

/**
 * Base error class for Bunext-specific errors
 */
class BunextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

class RouteNotFoundError extends BunextError { }
class ComponentNotFoundError extends BunextError { }
class RenderingError extends BunextError { }
class ServerSidePropsError extends BunextError { }
class APIEndpointError extends BunextError { }
class RedirectError extends BunextError { }
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
  public serverActions: ServerAction[] = [];
  public layoutPaths: string[] = [];
  public cssPaths: string[] = [];
  public cssPathExists: string[] = [];
  public staticRoutes: Array<keyof FileSystemRouter["routes"]> = [];
  public ssrAsDefaultRoutes: Array<keyof FileSystemRouter["routes"]> = [];

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
      this.server = this.createFileSystemRouter(this.pageDir, true);
      this.client = this.createFileSystemRouter(
        join(this.buildDir, this.pageDir),
        false
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
    isServerSide: boolean
  ): FileSystemRouter {
    const config = {
      dir: join(this.baseDir, directory),
      style: "nextjs" as const,
      ...(isServerSide && { fileExtensions: [...SUPPORTED_FILE_EXTENSIONS] }),
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
      /\[[A-Za-z0-9]+\]\.[A-Za-z]sx/.test(filename)
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

      const [cssPathExists, staticRoutes, ssrAsDefaultRoutes] = await Promise.all([
        this.getCssPaths(),
        this.getUseStaticRoutes(),
        this.getSSRDefaultRoutes(),
      ]);

      this.cssPathExists = cssPathExists;
      this.staticRoutes = staticRoutes;
      this.ssrAsDefaultRoutes = ssrAsDefaultRoutes;
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
  private getRoutesWithoutLayouts(): RouteEntry[] {
    try {
      return Object.entries(this.server?.routes || {}).filter(
        ([route]) => !route.endsWith("/layout")
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
    const useStaticRegex = /(['"])use static\1/;

    try {
      await Promise.all(
        this.getRoutesWithoutLayouts().map(async ([route, path]) => {
          try {
            const fileContent = await Bun.file(path).text();
            const firstLine = fileContent.split("\n").at(0);

            if (firstLine && useStaticRegex.test(firstLine)) {
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
   * Identifies routes that should use SSR as default (no props required)
   */
  private async getSSRDefaultRoutes(): Promise<string[]> {
    try {
      const routes = this.getRoutesWithoutLayouts();

      const moduleChecks = await Promise.all(
        routes.map(async ([route, path]) => {
          try {
            const module = (await import(path)) as PageModule;
            return {
              route,
              hasNoProps: module.default?.length === 0,
            };
          } catch (error) {
            console.warn(`Failed to import module for route ${route}:`, error);
            return { route, hasNoProps: false };
          }
        })
      );

      return moduleChecks
        .filter(({ hasNoProps }) => hasNoProps)
        .map(({ route }) => route);
    } catch (error) {
      console.warn("Failed to get SSR default routes:", error);
      return [];
    }
  }

  /**
   * Recreates and updates router instances
   * Used for hot reloading in development
   */
  public setRoutes(): void {
    try {
      this.server = this.createFileSystemRouter(this.pageDir, true);
      this.client = this.createFileSystemRouter(
        join(this.buildDir, this.pageDir),
        false
      );

      this.routes_dump = this.generateClientSideRouteDump(this.client);
    } catch (error) {
      console.error("Failed to update routes:", error);
      throw error;
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
  ): Promise<BunextRequest | null> {
    try {
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
    } catch (error) {
      console.error("Request serving failed:", error);
      throw error;
    }
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
   * Next.js like layout module stacking
   * @param route
   * @param pageElement The JSX Element to wrap layouts around
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
   * Initializes server actions from page files
   */
  async InitServerActions(): Promise<this> {
    try {
      const files = this.getFilesFromPageDir();
      this.serverActions = [];

      for (const file of files) {
        try {
          const filePath = normalize(`${this.pageDir}/${file}`);
          const moduleImport = normalize(`${process.cwd()}/${filePath}`);
          const moduleExports = await import(moduleImport);

          const serverActionNames = Object.keys(moduleExports).filter((name) =>
            name.startsWith("Server")
          );

          if (serverActionNames.length > 0) {
            this.serverActions.push({
              path: file,
              actions: serverActionNames.map((name) => moduleExports[name]),
            });
          }
        } catch (error) {
          console.warn(`Failed to process server actions for ${file}:`, error);
        }
      }

      return this;
    } catch (error) {
      console.error("Failed to initialize server actions:", error);
      throw error;
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

/**
 * Manages individual HTTP requests and routes them to appropriate handlers
 */
class RequestManager {
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

  // Components and state
  public readonly Shell: ReactShellComponent;
  public bunextReq: BunextRequest;
  public serverSideProps?: {
    value: any;
    toString: () => string;
  };

  constructor(init: {
    request: Request;
    request_header: Record<string, string>;
    data: FormData;
    server: FileSystemRouter;
    client: FileSystemRouter;
    router: StaticRouters;
    Shell: ReactShellComponent;
  }) {
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
    });
  }

  /**
   * Main request processing method that routes requests through the middleware chain
   */
  async make(): Promise<null | BunextRequest> {
    process.env.__SESSION_MUST_NOT_BE_INITED__ = "false";

    try {
      return (
        (await this.checkPluginServing()) ||
        (await this.checkStaticServing()) ||
        (await this.checkFeatureServing()) ||
        (await this.servePage())
      );
    } catch (error) {
      console.error('Error in request processing:', error);

      if (error instanceof BunextError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new RenderingError(`Request processing failed: ${message}`);
    }
  }

  /**
   * Checks and applies plugin-based request handling
   */
  private async checkPluginServing(): Promise<BunextRequest | null> {
    try {
      const plugins = this.router
        .getPlugins()
        .map((p) => p.router?.request)
        .filter((p) => p !== undefined);

      for await (const plugin of plugins) {
        const res = await plugin(this.bunextReq, this);
        if (res) {
          return res;
        }
      }

      // Update CSS paths in development mode
      if (process.env.NODE_ENV === "development") {
        this.router.cssPathExists = await this.router.getCssPaths();
      }

      return null;
    } catch (error) {
      console.error('Error in plugin serving:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new RenderingError(`Plugin serving failed: ${message}`);
    }
  }
  /**
   * Apply HTML rewrite plugins on html
   * @param html full page html
   * @returns the transformed html ready to set to a Response
   */
  public async formatPage(html: string) {
    const rewriter = new HTMLRewriter();
    const plugins = this.router
      .getPlugins()
      .map((p) => p.router?.html_rewrite)
      .filter((p) => p != undefined);
    const afters = await Promise.all(
      plugins.map(async (plugin) => {
        const context: unknown = plugin.initContext?.(this.bunextReq);
        await plugin.rewrite?.(rewriter, this.bunextReq, context);
        return {
          after: plugin.after,
          context: context,
        };
      })
    );

    const transformedText = rewriter.transform(html);

    await Promise.all(
      afters.map(({ context, after }) => after?.(context, this.bunextReq))
    );

    return [HTML_DOCTYPE, transformedText].join("\n");
  }
  /**
   * Apply HTML rewrite plugins and gZip result
   * @param jsx the full page JSX (layouts + page)
   * @returns a Response with Gzipped html string body
   */
  public async makeStream(jsx: JSX.Element): Promise<Response> {
    return new Response(
      Buffer.from(Bun.gzipSync(await this.formatPage(renderToString(jsx)))),
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Encoding": "gzip",
        },
      }
    );
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
      await this.bunextReq.setCookie(new Response())
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

  private MakeTextRes(content: BunFile | string, mimeType?: string) {
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
        return this.MakeTextRes(nodeModuleFile);
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
          return this.MakeTextRes(buildedFile);
        const res = await buildFile(`.${path}`);
        if (res.success) {
          return this.MakeTextRes(getBuildedFile(formatedExt));
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

  /**
   * Loads and caches server-side props for the matched route
   */
  async makeServerSideProps(options?: {
    disableSession?: boolean
  }): Promise<{
    value: ServerSideProps;
    toString: () => string | undefined;
  }> {
    if (options?.disableSession) {
      process.env.__SESSION_MUST_NOT_BE_INITED__ = "true";
    }

    // Return cached props if available
    if (this.serverSideProps) {
      return this.serverSideProps;
    }

    // Ensure we have a server-side route
    if (!this.serverSide) {
      throw new RouteNotFoundError(`No server-side script found for ${this.pathname}`);
    }

    try {
      const module = (await import(this.serverSide.filePath)) as {
        getServerSideProps?: getServerSidePropsFunction;
      };

      // Return empty props if no getServerSideProps function
      if (!module?.getServerSideProps) {
        return {
          toString: () => undefined,
          value: undefined,
        };
      }

      // Initialize session if needed
      if (!options?.disableSession) {
        await this.bunextReq.session.initData();
      }

      // Call the getServerSideProps function
      const result = await module.getServerSideProps(
        {
          request: this.request,
          params: this.serverSide.params,
        },
        this.bunextReq
      );

      // Cache and return the result
      const props = {
        toString: () => result ? JSON.stringify(result) : "",
        value: result,
      };

      this.serverSideProps = props;
      return props;

    } catch (error) {
      console.error('Error in makeServerSideProps:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new ServerSidePropsError(
        `Failed to load server-side props for ${this.pathname}: ${message}`
      );
    }
  }

  /**
   * @deprecated Use makeServerSideProps instead
   * Backward compatibility method for external plugins
   */
  async MakeServerSideProps(options?: {
    disableSession?: boolean
  }): Promise<{
    value: ServerSideProps;
    toString: () => string | undefined;
  }> {
    return this.makeServerSideProps(options);
  }

  /**
   * Serves server-side props as a JSON response
   */
  private async serveServerSideProps(): Promise<null | BunextRequest> {
    if (this.request_header?.accept !== "application/vnd.server-side-props") {
      return null;
    }

    try {
      const props = await this.makeServerSideProps();
      return this.bunextReq.__SET_RESPONSE__(
        new Response(props.toString(), {
          headers: {
            ...this.bunextReq.response.headers,
            "Content-Type": "application/vnd.server-side-props",
            "Cache-Control": "no-store",
          },
        })
      );
    } catch (error) {
      console.error('Error serving server-side props:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new ServerSidePropsError(`Failed to serve server-side props: ${message}`);
    }
  }

  /**
   * Serves API endpoint responses
   */
  private async serveAPIEndpoint(): Promise<null | BunextRequest> {
    if (this.clientSide || !this.serverSide) {
      return null;
    }

    try {
      const ApiModule = await import(this.serverSide.filePath);
      const method = this.bunextReq.request.method.toUpperCase();

      if (typeof ApiModule[method] === "undefined") {
        return null;
      }

      await this.bunextReq.session.initData();

      const res = await ApiModule[method](this.bunextReq) as
        BunextRequest | Response | undefined;

      if (res instanceof BunextRequest) {
        this.bunextReq = res;
        await this.bunextReq.setCookie(res.response);
      } else if (res instanceof Response) {
        this.bunextReq.response = res;
        await this.bunextReq.setCookie(res);
      } else {
        throw new APIEndpointError(
          `API Endpoint ${this.serverSide.filePath} did not return a BunextRequest or Response object`
        );
      }

      return this.bunextReq;
    } catch (error) {
      if (error instanceof BunextError) {
        throw error;
      }
      console.error('Error serving API endpoint:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new APIEndpointError(`Failed to serve API endpoint: ${message}`);
    }
  }

  /**
   * Handles redirects from server-side props
   */
  private async serveRedirectFromServerSideProps(): Promise<null | BunextRequest> {
    try {
      const props = await this.makeServerSideProps();

      if (typeof props.value !== "object" || !props.value?.redirect) {
        return null;
      }

      return this.bunextReq.__SET_RESPONSE__(
        new Response(null, {
          status: 302,
          headers: { Location: props.value.redirect },
        })
      );
    } catch (error) {
      console.error('Error processing redirect:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new RedirectError(`Failed to process redirect: ${message}`);
    }
  }
  /**
   * Serves a complete page with server-side rendering
   */
  private async servePage(): Promise<BunextRequest | null> {
    process.env.__SESSION_MUST_NOT_BE_INITED__ = "true";

    if (!this.serverSide) {
      return null;
    }

    // Skip favicon requests
    if (this.serverSide.pathname === "/favicon.ico") {
      return null;
    }

    try {
      const serverSideProps = (await this.makeServerSideProps()).value;
      const pageJSX = await this.MakeDynamicJSXElement({ serverSideProps });

      if (!pageJSX) {
        return null;
      }

      const page = await this.makePage(pageJSX);
      if (!page) {
        return null;
      }

      return this.bunextReq.__SET_RESPONSE__(await this.makeStream(page));
    } catch (error) {
      console.error('Error serving page:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new RenderingError(`Failed to serve page: ${message}`);
    }
  }

  /**
   * Checks and serves static content and special routes
   */
  private async checkStaticServing(): Promise<BunextRequest | null> {
    switch (this.pathname as SpecialPathNames) {
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

  /**
   * Checks and serves feature-specific content (SSR, API, redirects)
   */
  private async checkFeatureServing(): Promise<BunextRequest | null> {
    if (!this.serverSide) {
      return null;
    }

    return (
      (await this.serveServerSideProps()) ||
      (await this.serveAPIEndpoint()) ||
      (await this.serveRedirectFromServerSideProps())
    );
  }

  /**
   * Creates an error for missing server-side routes
   */
  private createNoServerSideMatchError(): RouteNotFoundError {
    return new RouteNotFoundError(`No server-side script found for ${this.pathname}`);
  }

  /**
   * Creates the preload object for client-side hydration
   */
  private async makePreLoadObject(): Promise<Record<keyof _GlobalData, string>> {
    if (!this.serverSide) {
      throw this.createNoServerSideMatchError();
    }

    try {
      await this.bunextReq.session.initData();

      const createdAt =
        this.bunextReq.session.__DATA__.private?.__BUNEXT_SESSION_CREATED_AT__ || 0;

      const sessionTimeout =
        createdAt === 0
          ? 0
          : createdAt +
          this.bunextReq.session.sessionTimeoutFromNow * 1000 -
          (new Date().getTime() - createdAt);

      return {
        __DEV_ROUTE_PREFETCH__: "[]",
        __PAGES_DIR__: JSON.stringify(this.router.pageDir),
        __INITIAL_ROUTE__: JSON.stringify(this.serverSide.pathname + this.search),
        __ROUTES__: this.router.routes_dump,
        __SERVERSIDE_PROPS__:
          (await this.makeServerSideProps()).toString() ?? "undefined",
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
              .map(([key, value]) => ({ [key]: value }))
          ),
        }),
        __CSS_PATHS__: JSON.stringify(this.router.cssPathExists),
      };
    } catch (error) {
      console.error('Error creating preload object:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new RenderingError(`Failed to create preload object: ${message}`);
    }
  }

  /**
   * Converts preload object to string array for script injection
   */
  private preloadToStringArray(
    preload: Record<keyof _GlobalData & string, string>
  ): string[] {
    return Object.entries(preload)
      .map(([key, value]) => `${key}=${value}`)
      .filter(Boolean);
  }

  private async makeDevDynamicJSXElement(serverSideProps: ServerSideProps) {
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
            params: this.serverSide.params,
          }),
          url: this.request.url,
        },
        cwd: process.cwd(),
        cmd: ["bun", `${import.meta.dirname}/../dev/jsxToString.tsx`],
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
  private async makeProductionDynamicJSXElement(
    serverSideProps: ServerSideProps
  ) {
    if (!this.serverSide) return null;
    return this.router.CreateDynamicPage(
      this.serverSide.filePath,
      {
        props: serverSideProps,
        params: this.serverSide.params,
      },
      this.serverSide,
      this.bunextReq
    );
  }

  MakeDynamicJSXElement({
    serverSideProps,
  }: {
    serverSideProps: ServerSideProps;
  }) {
    if (!this.serverSide) return null;

    if (process.env.NODE_ENV == "development")
      return this.makeDevDynamicJSXElement(serverSideProps);
    else return this.makeProductionDynamicJSXElement(serverSideProps);
  }

  /**
   * Wrapping Page with the Shell
   * @param page layouts + page
   * @returns Shelled Page JSX ( null if no route is found for the request path )
   */
  async makePage(page: JSX.Element) {
    if (!this.serverSide) return null;

    const preloadScriptObj = await this.makePreLoadObject();
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
          {...(await this.makeServerSideProps()).value}
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
