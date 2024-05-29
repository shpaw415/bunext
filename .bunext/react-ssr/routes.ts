import { StaticRouters } from "@bunpmjs/bunext/bun-react-ssr";
import { mkdirSync } from "node:fs";
import "@bunpmjs/bunext/internal/server_global";

export let router = resetRouter() as StaticRouters;

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
    return route;
  } catch {
    console.log("cannot set static router");
    mkdirSync(".bunext/build/src/pages", { recursive: true });
    Bun.sleepSync(1000);
    resetRouter();
  }
}
await router?.InitServerActions();
