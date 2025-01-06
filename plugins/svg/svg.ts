import { transform } from "@svgr/core";
import type { BunPlugin } from "bun";
import { table, type cacheType } from "./init";

let cache: Array<cacheType> = table.select({}) as cacheType[];

const SVGPlugin: BunPlugin = {
  name: "svg-to-react-plugin",
  async setup(build) {
    build.onLoad({ filter: /\.svg$/ }, async ({ path }) => {
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

        table.insert([{ path, data }]);

        return data;
      };
      const Str = await reactCode();
      return {
        contents: Str,
        loader: "jsx",
      };
    });
  },
};

export default SVGPlugin;
