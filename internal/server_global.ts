import type { ServerWebSocket } from "bun";

declare global {
  var socketList: ServerWebSocket<unknown>[];
  var dryRun: boolean;
  var __BUNEXT_DEV_INIT: boolean;
  var webSocket: undefined | WebSocket;
}
globalThis.socketList ??= [];
globalThis.dryRun ??= true;
