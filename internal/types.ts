import type { BunFile, BunPlugin } from "bun";
import type { _Head } from "../features/head";
import type { BunextRequest } from "./bunextRequest";

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
 *
 * Dev
 *  - hotServerPort: Hot reload Server port
 *
 * build
 *  - plugins: custom plugins for the build
 *
 * session
 *  - timeout: Invalidate session after X seconds of Idle
 *  - type:
 *      - cookie  : max of 4096 chars ( good for small session data )
 *      - database:hard : session kept on a database on the hard drive ( good for big session data but slower then memory)
 *      - database:memory : session kept on a database in memory ( good for big session data but must have enough RAM )
 */
export type ServerConfig = {
  HTTPServer: {
    port: number;
    threads?: number | "all_cpu_core";
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
  experimental?: Partial<{
    removeDuplicateExports: boolean;
  }>;
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
