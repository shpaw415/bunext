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
        let pathProps = "";

        new HTMLRewriter()
          .on("svg", {
            element(e) {
              for (const i of e.attributes) {
                let reactKeyElement = i[0];
                if (reactKeyElement == "viewbox") reactKeyElement = "viewBox";
                svgProps += `${reactKeyElement}="${i[1]}"`;
              }
            },
          })
          .on("path", {
            element(e) {
              for (const i of e.attributes) {
                pathProps += `${i[0]}="${i[1]}"`;
              }
            },
          })
          .transform(svg);

        return {
          contents: `
          "use client";
          function Svg(props = {}){ 
            return (<svg ${svgProps} {...props}>${
            pathProps.length > 0 && `<path ${pathProps} />`
          }</svg>);
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
