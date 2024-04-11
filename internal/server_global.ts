import type { ServerWebSocket } from "bun";
import type { _Head } from "../componants/head";
import type { afterBuildCallback } from "./buildFixes";

declare global {
  var socketList: ServerWebSocket<unknown>[];
  var mode: "dev" | "prod";
  var dryRun: boolean;
  var ssrElement: Array<{
    path: string;
    elements: Array<{
      tag: string;
      reactElement: string;
    }>;
  }>;
  var pages: {
    page: Blob;
    path: string;
  }[];
  var pages: Array<{
    page: Blob;
    path: string;
  }>;
  var serverActions: Array<{
    path: string;
    actions: Array<Function>;
  }>;
  var __HEAD_DATA__: { [key: string]: _Head };

  var afterBuild: Array<afterBuildCallback>;
}
globalThis.pages ??= JSON.parse(process.env.__PAGE__ ?? "[]");
globalThis.ssrElement ??= JSON.parse(process.env.ssrElement ?? "[]");
globalThis.mode ??= "dev";
globalThis.dryRun ??= true;
globalThis.socketList ??= [];
globalThis.serverActions ??= [];
globalThis.pages ??= [];
globalThis.__HEAD_DATA__ ??= JSON.parse(process.env.__HEAD_DATA__ ?? "{}");
globalThis.afterBuild ??= [];
//DEV globals
interface devConsole {
  servePort: number;
  hostName: string;
  error?: string;
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
