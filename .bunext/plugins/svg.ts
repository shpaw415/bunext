import { plugin, type BunPlugin } from "bun";
import { get } from "@bunpmjs/bunext/plugins/svg/init.ts";

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
        ${await get(path)}
          `,
          loader: "js",
        };
      }
    );
  },
};

plugin(SvgPlugin);
