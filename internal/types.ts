import type { BunPlugin } from "bun";
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
 *
 * Dev
 *  - hotServerPort: Hot reload Server port
 *
 * build
 *  - plugins: custom plugins for the build
 */
export type ServerConfig = {
  HTTPServer: {
    port: number;
  };
  Dev: {
    hotServerPort: number;
  };
  build: {
    plugins: BunPlugin[];
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
