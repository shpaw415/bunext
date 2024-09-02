import { plugin, type BunPlugin } from "bun";

const CssPlugin: BunPlugin = {
  name: "css_loader",
  setup(runtime) {
    runtime.onLoad(
      {
        filter: /\.css$/,
      },
      ({ path }) => {
        const cwd = process.cwd();
        const makePath = () => {
          if (
            !process.env?.__SUPPRESS_CSS_LOADER_WARNING__ &&
            !path.startsWith(cwd + "/static")
          )
            console.error({
              bunext_loader: "loading css is only supported in /static ",
              suppress:
                'to suppress this message set env varaible __SUPPRESS_CSS_LOADER_WARNING__="true"',
            });
          return path.replace(cwd + "/static", "");
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
