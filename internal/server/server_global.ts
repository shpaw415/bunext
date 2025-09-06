"server only";

import type { ServerWebSocket } from "bun";
import type { ServerConfig } from "../types.ts";
import type { BunextServer } from "./index.ts";
import { type BunextType } from "internal/bunext_global";



if (typeof process.env.NODE_ENV == "undefined") {
  if (process.argv[2] === "dev") {
    process.env.NODE_ENV = "development";
  } else {
    process.env.NODE_ENV = "production";
  }
}

declare global {
  var socketList: ServerWebSocket<unknown>[];
  var dryRun: boolean;
  var __BUNEXT_DEV_INIT: boolean;
  var webSocket: undefined | WebSocket;
  var Server: void | BunextServer;
  var serverConfig: ServerConfig;
  var Bunext: BunextType;
}

/**
 * Base error class for Bunext-specific errors
 */
export class BunextError extends Error {
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = this.constructor.name;
    this.cause = cause;
  }
}

globalThis.socketList ??= [];
globalThis.dryRun ??= true;

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


export const baseDir = process.cwd();
export const pageDir = "src/pages" as const;
export const buildDir = ".bunext/build" as const;

await InitGlobalServerConfig();
