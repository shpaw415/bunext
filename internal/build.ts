import type { BunPlugin } from "bun";
import { Builder } from "../bun-react-ssr/build";
import type { BuildFix } from "./buildFixes";
import "./server_global";

const buildDir = ".bunext/build" as const;

const files = (
  await Array.fromAsync(
    new Bun.Glob("*.ts").scan({
      cwd: import.meta.dirname + "/buildFixes",
      onlyFiles: true,
      absolute: true,
    })
  )
).filter((e) => !e.endsWith("index.ts"));
let fixes = (
  (await Promise.all(files.map((f) => import(f)))) as { default?: BuildFix }[]
).map((e) => e.default);

for await (const i of fixes) {
  if (i) {
    if (i.afterBuildCallback) globalThis.afterBuild.push(i.afterBuildCallback);
  }
}

const Plugins = fixes
  .filter((e) => e != undefined && e.plugin != undefined)
  .map((e) => e?.plugin) as BunPlugin[];

export const builder = new Builder({
  main: {
    baseDir: process.cwd(),
    buildDir: buildDir,
    pageDir: "src/pages",
    hydrate: ".bunext/react-ssr/hydrate.ts",
  },
  display: {
    nextjs: {
      layout: "layout.tsx",
    },
  },
});
if (import.meta.main) {
  await builder.preBuildAll();
  await builder.build();
}
