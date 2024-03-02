#!/bin/env bun

import { paths } from "../globals";
import { $ } from "bun";
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
    await build();
    dev();
    break;
  default:
    console.log(`Bunext: '${cmd}' is not a function`);
}

async function build() {
  await $`bun ${paths.bunextModulePath}/internal/build.ts`;
}
function dev() {
  const process = Bun.spawnSync({
    cmd: ["bun", "--hot", `${paths.bunextDirName}/react-ssr/server.ts`, "dev"],
    stdout: "inherit",
  });
  console.log(process.stderr.toString("ascii"));
}
function init() {
  return import("./init");
}
