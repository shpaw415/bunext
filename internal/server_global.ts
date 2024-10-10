import type { ServerWebSocket } from "bun";
import type { ServerConfig } from "./types";
import type { BunextServer } from "../.bunext/react-ssr/server";

declare global {
  var socketList: ServerWebSocket<unknown>[];
  var dryRun: boolean;
  var __BUNEXT_DEV_INIT: boolean;
  var webSocket: undefined | WebSocket;
  var Server: undefined | BunextServer;
  var clusterStatus: boolean;
  var serverConfig: ServerConfig;
}
globalThis.socketList ??= [];
globalThis.dryRun ??= true;
