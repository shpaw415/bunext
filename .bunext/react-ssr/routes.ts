import { StaticRouters } from "@bunpmjs/bunext/bun-react-ssr";
import { mkdirSync } from "node:fs";
import "@bunpmjs/bunext/internal/server_global";

export let router = undefined as unknown as StaticRouters;

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
