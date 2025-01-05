import { transform } from "@svgr/core";
import { plugin, type BunPlugin } from "bun";

const SvgPlugin: BunPlugin = {
  name: "SVG loader",
  setup(runtime) {
    runtime.onLoad(
      {
        filter: /\.svg$/,
      },
      async ({ path }) => {
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
          contents: `
          "use client";
          ${reactCode}
          `,
          loader: "js",
        };
      }
    );
  },
};

plugin(SvgPlugin);
