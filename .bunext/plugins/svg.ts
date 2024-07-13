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
        let elements: {
          svg: Record<string, string>;
          path: Record<string, string>;
        } = {
          svg: {},
          path: {},
        };

        new HTMLRewriter()
          .on("svg", {
            element(e) {
              for (const i of e.attributes) {
                elements.svg[i[0]] = i[1];
              }
            },
          })
          .on("path", {
            element(e) {
              for (const i of e.attributes) {
                elements.path[i[0]] = i[1];
              }
            },
          })
          .transform(svg);

        const propsForSvg = Object.keys(elements.svg)
          .map((e) => {
            if (e == "viewbox") e = "viewBox";
            return `${e}="${elements.svg[e]}"`;
          })
          .join(" ");

        const propsForPath = Object.keys(elements.path)
          .map((e) => `${e}="${elements.path[e]}"`)
          .join(" ");

        return {
          contents: `
          "use client";
          function Svg(props = {}){ 
            return (<svg ${propsForSvg} {...props}><path ${propsForPath} /></svg>);
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
