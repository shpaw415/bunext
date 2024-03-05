#!/bin/env bun

import { $ } from "bun";
import { __setHead__ } from "../componants/internal_head";
import { paths } from "../globals";
type _cmd = "init" | "build" | "dev";
const cmd = process.argv[2] as _cmd;

if (import.meta.main)
  switch (cmd) {
    case "init":
      await init();
      break;
    case "build":
      Build();
      break;
    case "dev":
      //await init();
      await __setHead__();
      Build();
      dev();
      break;
    default:
      console.log(`Bunext: '${cmd}' is not a function`);
  }

export function Build() {
  return Bun.spawnSync({
    cmd: [`bun`, `${paths.bunextModulePath}/internal/build.ts`],
  }).exitCode;
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
  if (proc.exitCode === 101) dev();
}
function init() {
  return import("./init");
}
