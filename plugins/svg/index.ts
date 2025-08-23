import { SVGCache } from "./init";
import type { BunextPlugin } from "plugins/types";

export default {
  priority: 11,
  build: {
    plugin: {
      name: "svg-to-react-plugin",
      async setup(build) {
        build.onLoad({ filter: /\.svg$/ }, async ({ path }) => {
          return {
            contents: await SVGCache.get(path),
            loader: "jsx",
          };
        });
      },
    },
  },
} as BunextPlugin;
