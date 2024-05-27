import type { ServerWebSocket } from "bun";
import type { _Head } from "../componants/head";
import type { afterBuildCallback } from "./buildFixes";

export type ssrElement = {
  path: string;
  elements: Array<{
    tag: string;
    reactElement: string;
    htmlElement: string;
  }>;
};
declare global {
  var socketList: ServerWebSocket<unknown>[];
  var dryRun: boolean;
  var ssrElement: ssrElement[];
  var serverActions: Array<{
    path: string;
    actions: Array<Function>;
  }>;
  var revalidates: Array<{
    path: string;
    time: number;
  }>;
  var __HEAD_DATA__: { [key: string]: _Head };

  var afterBuild: Array<afterBuildCallback>;
}
globalThis.ssrElement ??= JSON.parse(process.env.ssrElement ?? "[]");
globalThis.dryRun ??= true;
globalThis.socketList ??= [];
globalThis.serverActions ??= [];
globalThis.__HEAD_DATA__ ??= JSON.parse(process.env.__HEAD_DATA__ ?? "{}");
globalThis.afterBuild ??= [];
globalThis.revalidates ??= [];
//DEV globals
interface devConsole {
  servePort: number;
  hostName: string;
  error?: string;
  message?: any;
}
declare global {
  var __BUNEXT_DEV_INIT: boolean;
  var webSocket: undefined | WebSocket;
  var devConsole: devConsole;
  var dev: {
    clientOnly: boolean;
  };
}
globalThis.dev ??= {
  clientOnly: false,
};
globalThis.devConsole ??= {
  servePort: 3000,
  hostName: "localhost",
};
