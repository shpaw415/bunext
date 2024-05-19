import { StaticRouters } from "@bunpmjs/bunext/bun-react-ssr";
import { Builder } from "@bunpmjs/bunext/bun-react-ssr/build";
import { normalize } from "node:path";
import { mkdirSync } from "node:fs";
import "@bunpmjs/bunext/internal/server_global";
const pageDir = "src/pages" as const;
const baseDir = process.cwd();

export let router = undefined as unknown as StaticRouters;

export async function doPreBuild(filePath?: string) {
  if (filePath)
    return await Builder.preBuild(
      import.meta.resolve(filePath).replace("file://", "")
    );
  for await (const i of StaticRouters.getFileFromPageDir(pageDir)) {
    await Builder.preBuild(normalize([baseDir, pageDir, i].join("/")));
  }
}

export function resetRouter() {
  try {
    const route = new StaticRouters(
      process.cwd(),
      ".bunext/build",
      "src/pages",
      {
        displayMode: {
          nextjs: {
            layout: "layout.tsx",
          },
        },
        ssrMode: "nextjs",
      }
    );
    router = route;
  } catch {
    console.log("cannot set static router");
    mkdirSync(".bunext/build", { recursive: true });
  }
}
resetRouter();
await router?.InitServerActions();
