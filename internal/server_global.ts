import type { ServerWebSocket } from "bun";
import type { ServerConfig } from "./types";
import type { BunextServer } from "../.bunext/react-ssr/server";

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
}
globalThis.socketList ??= [];
globalThis.dryRun ??= true;
globalThis.dev ??= {
  current_dev_path: undefined,
};
