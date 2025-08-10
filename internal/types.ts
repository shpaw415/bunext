import type { BunFile, BunPlugin } from "bun";
import type { _Head, HeadData } from "../features/head";
import type { BunextRequest } from "./server/bunextRequest.ts";
import type { revalidate } from "../features/router/revalidate.ts";
import type { Plugins } from "../plugins/bunext_object/type.ts";
import type { Router } from "../features/router/bunext_object/types.ts";
import type { Database } from "../database/bunext_object/types.ts";
import type { Session } from "../features/session/bunext_object/types.ts";
import type { _Request } from "../features/request/bunext_object/types.ts";
import type { BunextPlugin } from "../plugins/types.ts";
import type { ComponentType } from "../features/components/bunext_global/types.ts";
import type { RequestManager } from "./server/router.tsx";
import type { JSX } from "react";
import type React from "react";

export type ServerSideProps<T extends Record<string, unknown> = {}> =
  {
    redirect?: string;
  } & T
  | undefined;

export type ErrorFallbackComponent = ({ error, requestManager }: { error: Error, requestManager: RequestManager }) => JSX.Element | Promise<JSX.Element>;

export const URLpaths = {
  serverAction: "/ServerActionGetter" as const,
};

export type _GlobalData = {
  __ROUTES__: Record<string, string>;
  __SERVERSIDE_PROPS__: ServerSideProps;
  __DEV_ROUTE_PREFETCH__: Array<string>;
  __PAGES_DIR__: string;
  __INITIAL_ROUTE__: string;
  __LAYOUT_ROUTE__: string[];
  __CSS_PATHS__: string[];
  __HEAD_DATA__: Record<string, HeadData>;
  __PUBLIC_SESSION_DATA__: unknown | undefined;
  __SESSION_TIMEOUT__: number;
  serverConfig: {
    Dev: {
      hotServerPort: number;
    };
    HTTPServer: {
      port: number;
      threads: number;
    };
    session?: {
      type: "cookie" | "database:hard" | "database:memory";
      timeout: number;
    }
  };
  __PROCESS_ENV__: Record<string, string>;
};

export type _globalThis = _GlobalData & {
  __HEAD_DATA__: Record<string, _Head>;
};

/**
 * Server configuration options for Bunext application
 * 
 * HTTPServer:
 *  - port: Port number for the HTTP server to listen on
 *  - threads: Number of worker threads for multi-threading (optional)
 *    - Can be a specific number or "all_cpu_core" to use all available CPU cores
 *    - **Only available on Linux with Bun ^1.1.25**
 *  - config: Additional Bun.serve configuration options to pass through (optional)
 * 
 * Dev:
 *  - hotServerPort: Port number for the hot reload development server
 *  - devtoolPanel: Enable/disable client-side development tool panel (optional)
 * 
 * build:
 *  - plugins: Array of custom Bun plugins to use during the build process
 * 
 * session (optional):
 *  - timeout: Session invalidation time in seconds after idle period (default: 3600)
 *  - type: Session storage strategy:
 *    - "cookie": Store in browser cookies (max 4096 chars, good for small session data)
 *    - "database:hard": Store in persistent database on disk (good for large data, slower than memory)
 *    - "database:memory": Store in in-memory database (good for large data, requires sufficient RAM)
 * 
 * router (optional):
 *  - dynamicPaths: Array of base paths for dynamically loaded modules
 * 
 * bunext_plugins (optional):
 *  - Array of Bunext-specific plugins to enhance functionality
 * 
 * robots_txt (optional):
 *  - BunFile containing the robots.txt content to be served
 * 
 * html_lang (optional):
 *  - Sets the HTML lang attribute for the <html> element
 *  - Can be a static string (e.g., "en", "fr", "es") or a function that receives the request
 *  - Defaults to "en" if not specified
 *  - Use empty string to omit the lang attribute entirely
 *  - Important for SEO and accessibility compliance
 */
export type ServerConfig = {
  HTTPServer: {
    port: number;
    threads?: number | "all_cpu_core";
    config?: Bun.ServeFunctionOptions<unknown, {}>;
  };
  Dev: {
    hotServerPort: number;
    /**
     * Client side DevTool panel showing useful information and action
     */
    devtoolPanel?: boolean;
  };
  build: {
    plugins: BunPlugin[];
  };
  session?: {
    timeout: number;
    type: "cookie" | "database:hard" | "database:memory";
  };
  router?: {
    /**
     * Array of base path of Dynamic loaded module
     */
    dynamicPaths: Array<string>;
  };
  bunext_plugins?: Array<BunextPlugin>;
  /**
   * Robots.txt file to be served
   */
  robots_txt?: BunFile;
  /**
   * Sets the HTML lang attribute for the <html> element.
   * 
   * @default "en"
   * @param string - Static language code (e.g., "en", "fr", "es")
   * @param function - Dynamic function receiving the request object to determine language
   * 
   * Use empty string to omit the lang attribute entirely.
   * Important for SEO and accessibility compliance.
   */
  html_lang?: string | ((request: BunextRequest) => (string | Promise<string> | undefined));
};

export type OnRequestType = (
  request: Request
) => Response | void | Promise<Response | void>;

export type ssrElement = {
  path: string;
  elements: Array<{
    tag: string;
    reactElement: string;
    htmlElement: string;
    name: string;
  }>;
};

export type staticPage = {
  pathname: string;
  page: string;
  /**
   * must be json decode
   */
  props?: string | Record<string, any> | { redirect: string };
};

export type SSRPage = {
  route: string;
  content: string;
};

export type revalidate = {
  path: string;
  time: number;
};

export type ServerActionDataType = File | string | Blob | Object | BunFile;

export type ServerActionDataTypeHeader = "json" | "file" | "blob";

export type ClusterMessageType =
  | {
    task: "revalidate";
    data: {
      path: string[];
    };
  }
  | {
    task: "update_build";
    data: {
      path?: string;
    };
  }
  | {
    task: "getSession";
    data: {
      id: string;
      data?: any;
    };
  }
  | {
    task: "setSession";
    data: {
      id: string;
      sessionData: any;
      type: "insert" | "update";
    };
  }
  | {
    task: "deleteSession";
    data: {
      id: string;
    };
  };

export type Params = Record<string, unknown> | undefined;

export type getServerSidePropsFunction<T extends Record<string, unknown> = {}> = (
  request_data: { params: Params; request: Request },
  bunextRequest: BunextRequest
) => Promise<ServerSideProps<T>>;

/**
 * Route page function type
 * 
 */
export type routePageFunction = ({ params, props }: { params?: Params, props?: ServerSideProps }) => Promise<JSX.Element> | JSX.Element;

export type ReactShellComponent = React.ComponentType<{
  children: React.ReactNode;
  props?: ServerSideProps;
  params?: Params;
  route: string;
  request?: BunextRequest;
}>;

export type BunextType = {
  version: string;
  request: _Request;
  router: Router;
  session: Session;
  plugins: Plugins;
  database: Database;
  components: ComponentType;
};
