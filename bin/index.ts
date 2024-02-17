#!/bin/env bun

import { paths } from "../globals";

type _cmd = "init" | "build" | "dev";
const cmd = process.argv[2] as _cmd;

switch (cmd) {
  case "init":
    await init();
    break;
  case "build":
    build();
    break;
  case "dev":
    await init();
    build();
    dev();
    break;
  default:
    console.log(`Bunext: '${cmd}' is not a function`);
}

function build() {
  Bun.spawn({
    cmd: ["bun", `${paths.bunextDirName}/react-ssr/build.ts`],
    stdout: "inherit",
  });
}
function dev() {
  Bun.spawn({
    cmd: ["bun", "--hot", `${paths.bunextDirName}/react-ssr/server.ts`, "dev"],
    stdout: "inherit",
  });
}
function init() {
  return import("./init");
}
