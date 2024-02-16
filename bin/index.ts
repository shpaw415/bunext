#!/bin/env bun

import { paths } from "../globals";

type _cmd = "init" | "build" | "dev";
const cmd = process.argv[2] as _cmd;

switch (cmd) {
  case "init":
    await import("./init");
    break;
  case "build":
    Bun.spawn({
      cmd: ["bun", `${paths.bunextDirName}/react-ssr/build.ts`],
      stdout: "inherit",
    });
    break;
  case "dev":
    Bun.spawn({
      cmd: [
        "bun",
        "--watch",
        `${paths.bunextDirName}/react-ssr/server.ts`,
        "dev",
      ],
      stdout: "inherit",
    });
    break;
  default:
    console.log(`Bunext: '${cmd}' is not a function`);
}
