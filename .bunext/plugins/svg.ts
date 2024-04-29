import { plugin, type BunPlugin } from "bun";

const SvgPlugin: BunPlugin = {
  name: "SVG loader",
  setup(runtime) {
    runtime.onLoad(
      {
        filter: /\.svg$/,
      },
      async (props) => {
        return {
          contents: `const Svg = () => ${await Bun.file(props.path).text()};
          export default Svg;
          `,
          loader: "js",
        };
      }
    );
  },
};

plugin(SvgPlugin);
