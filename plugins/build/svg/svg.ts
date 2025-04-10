import type { BunPlugin } from "bun";
import { get } from "./init";

const SVGPlugin: BunPlugin = {
  name: "svg-to-react-plugin",
  async setup(build) {
    build.onLoad({ filter: /\.svg$/ }, async ({ path }) => {
      return {
        contents: await get(path),
        loader: "jsx",
      };
    });
  },
};

export default SVGPlugin;
