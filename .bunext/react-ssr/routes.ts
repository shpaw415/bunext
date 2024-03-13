import { StaticRouters } from "@bunpmjs/bunext/bun-react-ssr";

export let router = undefined as unknown as StaticRouters;

export function resetRouter() {
  const route = new StaticRouters(process.cwd(), ".bunext/build", "src/pages", {
    displayMode: {
      nextjs: {
        layout: "layout.tsx",
      },
    },
    ssrMode: "nextjs",
  });
  router = route;
}
resetRouter();
await router?.InitServerActions();
