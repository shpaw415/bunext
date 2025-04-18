import type { BunFile, BunPlugin } from "bun";
import type { _Head } from "../features/head";
import type { BunextRequest } from "./server/bunextRequest.ts";
import type { revalidate } from "../features/router/revalidate.ts";
import type { Plugins } from "../plugins/bunext_object/type.ts";
import type { Router } from "../features/router/bunext_object/types.ts";
import type { Database } from "../database/bunext_object/types.ts";
import type { Session } from "../features/session/bunext_object/types.ts";
import type { _Request } from "../features/request/bunext_object/types.ts";
import type { BunextPlugin } from "../plugins/user/index.ts";

export type ServerSideProps =
  | {
      redirect?: string;
    }
  | Record<string, any>
  | undefined;

export type _DisplayMode = {
  nextjs?: {
    layout: string;
  };
  none?: "none";
};
export type _SsrMode = "nextjs" | "none";

export const URLpaths = {
  serverAction: "/ServerActionGetter" as const,
};

export type _GlobalData = {
  __DEV_ROUTE_PREFETCH__: Array<string>;
  __PAGES_DIR__: string;
  __INITIAL_ROUTE__: string;
  __ROUTES__: Record<string, string>;
  __SERVERSIDE_PROPS__?: any;
  __LAYOUT_ROUTE__: string[];
  __CSS_PATHS__: string[];
  __HEAD_DATA__: string;
  __PUBLIC_SESSION_DATA__: string;
  __SESSION_TIMEOUT__: string;
  serverConfig: {
    Dev: {
      hotServerPort: number;
    };
    HTTPServer: {
      port: number;
      threads: number;
    };
  };
  __PROCESS_ENV__: Record<string, string>;
};

export type _globalThis = _GlobalData & {
  __HEAD_DATA__: Record<string, _Head>;
};

/**
 * HTTPServer
 *  - port: HTTP server port
 *  - threads: Http worker (multi-threading)
 *    - **only available on Linux with Bun ^1.1.25**
 *  - config: Bun.serve config to pass
 * Dev
 *  - hotServerPort: Hot reload Server port
 *
 * build
 *  - plugins: custom plugins for the build
 *
 * session
 *  - timeout: Invalidate session after X seconds of Idle ( default to 3600 )
 *  - type:
 *      - cookie  : max of 4096 chars ( good for small session data )
 *      - database:hard : session kept on a database on the hard drive ( good for big session data but slower then memory)
 *      - database:memory : session kept on a database in memory ( good for big session data but must have enough RAM )
 *
 * router:
 *   - dynamicPaths: Array of base path of Dynamic loaded module
 */
export type ServerConfig = {
  HTTPServer: {
    port: number;
    threads?: number | "all_cpu_core";
    config?: Partial<
      Bun.ServeFunctionOptions<unknown, {} | undefined> & {
        static?: {} | undefined;
      }
    >;
  };
  Dev: {
    hotServerPort: number;
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
  bunext_plugins: Array<BunextPlugin>;
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

export type getServerSidePropsFunction = (
  request_data: { params: Record<string, string>; request: Request },
  bunextRequest: BunextRequest
) => Promise<undefined | {}> | undefined | {};

export type ReactShellComponent = React.ComponentType<{
  children: Array<React.ReactElement>;
  props?: ServerSideProps;
  params?: Record<string, string>;
  route: string;
}>;

export type BunextType = {
  version: string;
  request: _Request;
  router: Router;
  session: Session;
  plugins: Plugins;
  database: Database;
};
