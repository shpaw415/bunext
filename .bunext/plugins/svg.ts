import { plugin, type BunPlugin } from "bun";

const SvgPlugin: BunPlugin = {
  name: "SVG loader",
  setup(runtime) {
    runtime.onLoad(
      {
        filter: /\.svg$/,
      },
      async (props) => {
        const svg = await Bun.file(props.path).text();

        let svgProps = "";
        const innerElement = new HTMLRewriter()
          .on("svg", {
            element(e) {
              for (const i of e.attributes) {
                let reactKeyElement = i[0];
                if (reactKeyElement == "viewbox") reactKeyElement = "viewBox";
                svgProps += `${reactKeyElement}="${i[1]}"`;
              }
              e.removeAndKeepContent();
            },
          })
          .transform(svg)
          .replaceAll('"', '\\"');

        return {
          contents: `
          "use client";
          function Svg(props = {}){ 
            return (<svg ${svgProps} {...props} dangerouslySetInnerHTML={{__html: "${innerElement}"}} />);
          }
          export default Svg;
          `,
          loader: "js",
        };
      }
    );
  },
};

plugin(SvgPlugin);
