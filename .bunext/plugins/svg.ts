import { plugin, type BunPlugin } from "bun";

const SvgPlugin: BunPlugin = {
  name: "SVG loader",
  setup(runtime) {
    runtime.onLoad(
      {
        filter: /\.svg$/,
      },
      async (props) => {
        const content = await Bun.file(props.path).text();
        const transpiled = new Bun.Transpiler({
          loader: "jsx",
          autoImportJSX: true,
        }).transformSync(
          `
          const Def = () => ${content};
          export default Def;
          `
        );
        return {
          contents: transpiled,
          loader: "js",
        };
      }
    );
  },
};

plugin(SvgPlugin);
