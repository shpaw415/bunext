import type { ServerWebSocket, Subprocess } from "bun";
import type { _Head } from "../componants/head";

declare global {
  var socketList: ServerWebSocket<unknown>[];
  var dryRun: boolean;
  var __HEAD_DATA__: { [key: string]: _Head };

  var socketList: ServerWebSocket<unknown>[];
  var HotServer: Subprocess<"ignore", "inherit", "inherit">;
}
globalThis.dryRun ??= true;
globalThis.socketList ??= [];
globalThis.__HEAD_DATA__ ??= JSON.parse(process.env.__HEAD_DATA__ ?? "{}");
globalThis.socketList ??= [];
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
}
globalThis.devConsole ??= {
  servePort: 3000,
  hostName: "localhost",
};
