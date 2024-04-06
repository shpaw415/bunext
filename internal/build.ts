import { Builder } from "../bun-react-ssr/build";
import "./server_global";

const buildDir = ".bunext/build" as const;

export const builder = new Builder({
  main: {
    baseDir: process.cwd(),
    buildDir: buildDir,
    pageDir: "src/pages",
    hydrate: ".bunext/react-ssr/hydrate.ts",
    plugins: [(await import("./buildFixes/mui-material")).default.plugin],
  },
  display: {
    nextjs: {
      layout: "layout.tsx",
    },
  },
});

if (import.meta.main) await builder.build();
