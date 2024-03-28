import type { ServerWebSocket } from "bun";

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
}
globalThis.ssrElement ??= [];
globalThis.mode ??= "dev";
globalThis.dryRun ??= true;
globalThis.socketList ??= [];
