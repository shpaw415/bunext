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
      await Build();
      break;
    case "dev":
      //await init();
      await __setHead__();
      await Build();
      dev();
      break;
    default:
      console.log(`Bunext: '${cmd}' is not a function`);
  }

export function Build() {
  return $`bun ${paths.bunextModulePath}/internal/build.ts`;
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
}
function init() {
  return import("./init");
}
