import { transform } from "@svgr/core";
import type { BunPlugin } from "bun";

const SVGPlugin: BunPlugin = {
  name: "svg-to-react-plugin",
  async setup(build) {
    build.onLoad({ filter: /\.svg$/ }, async ({ path }) => {
      const reactCode = await transform(
        await Bun.file(path).text(),
        {
          icon: true,
          plugins: ["@svgr/plugin-svgo", "@svgr/plugin-jsx"],
          jsxRuntime: "automatic",
        },
        {
          componentName: "SVG",
        }
      );

      return {
        contents: reactCode,
        loader: "jsx",
      };
    });
  },
};

export default SVGPlugin;
