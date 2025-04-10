import type { ServerWebSocket } from "bun";
import type { BunextType, ServerConfig } from "../types.ts";
import type { BunextServer } from "./index.ts";
import "./global_init.ts";

declare global {
  var socketList: ServerWebSocket<unknown>[];
  var dryRun: boolean;
  var __BUNEXT_DEV_INIT: boolean;
  var webSocket: undefined | WebSocket;
  //@ts-ignore
  var Server: undefined | BunextServer;
  var clusterStatus: boolean;
  var serverConfig: ServerConfig;
  var dev: {
    current_dev_path?: string;
  };
  //@ts-ignore
  var Bunext: BunextType;
}
globalThis.socketList ??= [];
globalThis.dryRun ??= true;
globalThis.dev ??= {
  current_dev_path: undefined,
};
