import { plugin, type BunPlugin } from "bun";

const CssPlugin: BunPlugin = {
  name: "css_loader",
  setup(runtime) {
    runtime.onLoad(
      {
        filter: /\.css$/,
      },
      ({ path }: { path: string }) => {
        const cwd = process.cwd();
        const makePath = () => {
          const mainPath = path.replace(cwd, "");
          if (mainPath && mainPath.startsWith("/static"))
            return mainPath.replace("/static", "");
          return mainPath;
        };

        return {
          contents: `
          const path = "${makePath()}";
          export default path;
          `,
          loader: "js",
        };
      }
    );
  },
  target: "browser",
};

plugin(CssPlugin);
