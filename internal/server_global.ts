import type { ServerWebSocket } from "bun";
import type { ServerConfig } from "./types";

declare global {
  var socketList: ServerWebSocket<unknown>[];
  var dryRun: boolean;
  var __BUNEXT_DEV_INIT: boolean;
  var webSocket: undefined | WebSocket;
  var serverConfig: ServerConfig;
}
globalThis.socketList ??= [];
globalThis.dryRun ??= true;
