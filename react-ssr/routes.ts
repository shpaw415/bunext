import { StaticRouters } from "bun-react-ssr";

export const router = new StaticRouters(
  process.cwd(),
  ".bunext/build",
  "src/pages",
  {
    displayMode: "nextjs",
    layoutName: "layout.tsx",
  }
);
