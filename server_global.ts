import type { ServerWebSocket } from "bun";

declare global {
  var socketList: ServerWebSocket<unknown>[];
  var mode: "dev" | "prod";
  var dryRun: boolean;
}
globalThis.mode ??= "dev";
globalThis.dryRun ??= true;
globalThis.socketList ??= [];
