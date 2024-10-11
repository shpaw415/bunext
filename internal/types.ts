import type { BunFile, BunPlugin } from "bun";
import type { _Head } from "../features/head";

export interface ServerSideProps {
  props?: any;
  redirect?: string;
}

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
  __PAGES_DIR__: string;
  __INITIAL_ROUTE__: string;
  __ROUTES__: Record<string, string>;
  __SERVERSIDE_PROPS__?: any;
  __DISPLAY_MODE__: keyof _DisplayMode;
  __LAYOUT_NAME__: string;
  __LAYOUT_ROUTE__: string[];
  __DEV_MODE__: boolean;
};

export type _globalThis = _GlobalData & {
  __HEAD_DATA__: Record<string, _Head>;
};

/**
 * HTTPServer
 *  - port: HTTP server port
 *  - threads: Http worker (multi-threading)
 *    - **only avalable on Linux with Bun ^1.1.25**
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
 *      - database:hard : session keept on a database on the hard drive ( good for big session data but slower then memory)
 *      - database:memory : session keept on a database in memory ( good for big session data but must have enough RAM )
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

export type ServerActionDataType = File | string | Blob | Object | BunFile;

export type ServerActionDataTypeHeader = "json" | "file" | "blob";

export type ClusterMessageType =
  | {
      task: "revalidate";
      data: {
        path: string;
      };
    }
  | {
      task: "udpate_build";
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
        id?: string;
        sessionData: any;
      };
    };
