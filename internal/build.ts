import { Builder } from "../bun-react-ssr/build";
import "./server_global";

export const builder = new Builder({
  main: {
    baseDir: process.cwd(),
    buildDir: ".bunext/build",
    pageDir: "src/pages",
    hydrate: ".bunext/react-ssr/hydrate.ts",
  },
  display: {
    nextjs: {
      layout: "layout.tsx",
    },
  },
});

if (import.meta.main) await builder.build();
