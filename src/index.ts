#!/bin/env bun
import { startServer } from "./server";
import { sendSignal, startHotServer, setDevEnvironement } from "../dev";
import { _fileRouter } from "./fileRouter";

import init from "../shared/shared";

init();

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
