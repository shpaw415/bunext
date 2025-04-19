import { get } from "./init";
import type { BunextPlugin } from "../types";

export default {
  build: {
    plugin: {
      name: "svg-to-react-plugin",
      async setup(build) {
        build.onLoad({ filter: /\.svg$/ }, async ({ path }) => {
          return {
            contents: await get(path),
            loader: "jsx",
          };
        });
      },
    },
  },
} as BunextPlugin;
