#!/bin/env bun

import { __setHead__ } from "../componants/internal_head";
import { paths } from "../globals";
import { ConvertShemaToType } from "../database/schema";
type _cmd = "init" | "build" | "dev" | "database_schema";
const cmd = (process.argv[2] as _cmd) ?? "bypass";
const args = process.argv[3] as undefined | string;
declare global {
  var pages: {
    page: Blob;
    path: string;
  }[];
}

globalThis.pages ??= [];

if (import.meta.main)
  switch (cmd) {
    case "init":
      await init();
      break;
    case "build":
      Build();
      break;
    case "dev":
      await __setHead__();
      Build();
      dev();
      break;
    case "database_schema":
      ConvertShemaToType("../componants/config/database.ts");
      break;
    default:
      console.log(`Bunext: '${cmd}' is not a function`);
      break;
  }

export function Build() {
  return Bun.spawnSync({
    cmd: [`bun`, `${paths.bunextModulePath}/internal/build.ts`],
    stdout: "inherit",
    env: {
      ...process.env,
      __PAGE__: JSON.stringify(
        globalThis.pages.map((e) => {
          return { page: "", path: e.path };
        })
      ),
    },
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
