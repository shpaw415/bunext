import type { BunPlugin } from "bun";
import { Builder } from "../bun-react-ssr/build";
import type { BuildFix } from "./buildFixes";
import "./server_global";
import type { ssrElement } from "./server_global";
import { paths } from "./globals";

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

export async function makeBuild(path?: string) {
  const res = Bun.spawnSync({
    cmd: ["bun", `${paths.bunextModulePath}/internal/buildv2.ts`],
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV,
      ssrElement: JSON.stringify(globalThis.ssrElement || []),
      BuildPath: path || undefined,
    },
  });
  const decoded = (await new Response(res.stdout).text()).split("<!BUNEXT!>");
  console.log(decoded[0]);
  try {
    const strRes = JSON.parse(decoded[1]) as {
      ssrElement: ssrElement[];
      revalidates: Array<{
        path: string;
        time: number;
      }>;
    };
    globalThis.ssrElement = strRes.ssrElement;
    return {
      revalidates: strRes.revalidates,
      error: false,
    };
  } catch {
    throw new Error(decoded[0]);
  }
}

if (import.meta.main) makeBuild();
