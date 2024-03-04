#!/bin/env bun

import { __setHead__ } from "../componants/internal_head";
import { paths } from "../globals";
type _cmd = "init" | "build" | "dev";
const cmd = process.argv[2] as _cmd;

switch (cmd) {
  case "init":
    await init();
    break;
  case "build":
    await build();
    break;
  case "dev":
    //await init();
    await __setHead__();
    await build();
    dev();
    break;
  default:
    console.log(`Bunext: '${cmd}' is not a function`);
}

async function build() {
  Bun.spawnSync({
    cmd: ["bun", `${paths.bunextModulePath}/internal/build.ts`],
    stdout: "inherit",
  });
}

function dev() {
  const proc = Bun.spawnSync({
    cmd: ["bun", "--hot", `${paths.bunextDirName}/react-ssr/server.ts`, "dev"],
    env: {
      ...process.env,
      __HEAD_DATA__: JSON.stringify(globalThis.head),
    },
    stdout: "inherit",
  });
  console.log(proc.stderr.toString("ascii"));
}
function init() {
  return import("./init");
}
