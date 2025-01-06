import { transform } from "@svgr/core";
import { plugin, type BunPlugin } from "bun";

let cache: { data: string; path: string }[] = [];

export function clearCache() {
  cache = [];
}

const SvgPlugin: BunPlugin = {
  name: "SVG loader",
  setup(runtime) {
    runtime.onLoad(
      {
        filter: /\.svg$/,
      },
      async ({ path }) => {
        const reactCode = async () => {
          const cached = cache.find((e) => e.path == path);
          if (cached) {
            return cached.data;
          }

          const data = transform.sync(
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
          cache.push({ data, path });
          return data;
        };
        const Str = await reactCode();
        return {
          contents: `
          "use client";
          ${Str}
          `,
          loader: "js",
        };
      }
    );
  },
};

plugin(SvgPlugin);
