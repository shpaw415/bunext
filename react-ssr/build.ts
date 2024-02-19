import { build } from "bun-react-ssr/src/build";

export async function doBuild() {
  const result = await build({
    baseDir: process.cwd(),
    buildDir: ".bunext/build",
    pageDir: "src/pages",
    hydrate: ".bunext/react-ssr/hydrate.ts",
  });
  if (result.logs.length) {
    console.log(...result.logs);
  } else if (result.success) {
    //console.log("built", new Date());
  }
}

if (import.meta.main) {
  doBuild();
}
