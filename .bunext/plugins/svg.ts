import { plugin, type BunPlugin } from "bun";
import { SVGCache } from "bunext-js/plugins/svg/init.ts"; // must be absolute

const SvgPlugin: BunPlugin = {
  name: "SVG loader",
  setup(runtime) {
    runtime.onLoad(
      {
        filter: /\.svg$/,
      },
      async ({ path }) => {
        return {
          contents: `
          "use client";
        ${await SVGCache.get(path)}
          `,
          loader: "js",
        };
      }
    );
  },
};

plugin(SvgPlugin);
