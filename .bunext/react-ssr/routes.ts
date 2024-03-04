import { StaticRouters } from "@bunpmjs/bunext/bun-react-ssr";

export const router = new StaticRouters(
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

await router.InitServerActions();
