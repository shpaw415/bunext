import { StaticRouters } from "@bunpmjs/bunext/bun-react-ssr";
import { normalize } from "node:path";

export let router = undefined as unknown as StaticRouters;

export async function doPreBuild(filePath?: string) {
  if (filePath) return await router.preBuild(import.meta.resolveSync(filePath));
  for await (const i of router.getFilesFromPageDir()) {
    const path = normalize([router.baseDir, router.pageDir, i].join("/"));
    await router.preBuild(path);
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
  }
}
resetRouter();
await router?.InitServerActions();
