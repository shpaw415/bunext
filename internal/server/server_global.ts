import type { ServerWebSocket } from "bun";
import type { BunextType, ServerConfig } from "../types.ts";
import type { BunextServer } from "./index.ts";

declare global {
  var socketList: ServerWebSocket<unknown>[];
  var dryRun: boolean;
  var __BUNEXT_DEV_INIT: boolean;
  var webSocket: undefined | WebSocket;
  //@ts-ignore
  var Server: undefined | BunextServer;
  var clusterStatus: boolean;
  //@ts-ignore
  var serverConfig: ServerConfig;
  var dev: {
    current_dev_path?: string;
    pathname?: string;
  };
  //@ts-ignore
  var Bunext: BunextType;
}
globalThis.socketList ??= [];
globalThis.dryRun ??= true;
globalThis.dev ??= {
  current_dev_path: undefined,
  pathname: undefined,
};

if (process.argv[2] == "init") {
  globalThis.__INIT__ = true;
}

export async function InitGlobalServerConfig() {
  if (globalThis?.serverConfig) return;
  if (globalThis.__INIT__) {
    globalThis.serverConfig ??= (await import("../../config/server")).default;
    return;
  }

  const config: ServerConfig = (
    await import(
      process.env?.__BUNEXT_DEV__
        ? `${process.cwd()}/config.dev/server.ts`
        : `${process.cwd()}/config/server.ts`
    )
  ).default as ServerConfig;
  //@ts-ignore
  globalThis.serverConfig ??= config;
}

await InitGlobalServerConfig();
