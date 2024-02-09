#!/bin/env bun
import { type Server, type ServerWebSocket } from "bun";
import { startServer } from "./server";
import { sendSignal, startHotServer } from "./hot-reload";
import { _fileRouter } from "./fileRouter";
import { setDevEnvironement } from "./dev";

declare global {
  var server: Server | undefined;
  var hotServer: Server | undefined;
  var wsList: ServerWebSocket<unknown>[];
  var mode: "dev" | "debug";
  // response data
  var responseData: JSX.Element;
  var scripts: JSX.Element[];
}

globalThis.server ??= undefined;
globalThis.hotServer ??= undefined;
globalThis.wsList ??= [];
globalThis.mode ??= "dev";
globalThis.scripts ??= [];

await sendSignal();
_fileRouter.reload();

type cmdType = "dev";
const cmd = process.argv.slice(2);
switch (cmd[0]) {
  case "dev":
    if (!globalThis.hotServer) startHotServer();
    if (!globalThis.server) startServer();
    setDevEnvironement();
    globalThis.mode = "dev";
    break;
}
