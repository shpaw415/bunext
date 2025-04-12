import type { BunPlugin } from "bun";
import { get } from "./init";
import type { Build_Plugins } from "../types";

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

const _SVGPlugin: Build_Plugins = {
  plugin: SVGPlugin,
};

export default _SVGPlugin;
