import { plugin, type BunPlugin } from "bun";

const ToAdd = `
globalThis.jsxDEV_7x81h0kn = (await import("react/jsx-dev-runtime")).jsxDEV;
globalThis.jsx_w77yafs4 = (await import("react/jsx-runtime")).jsx;
globalThis.jsxs_eh6c78nj = (await import("react/jsx-runtime")).jsxs;
globalThis.Fragment_8vg9x3sq = (await import("react/jsx-dev-runtime")).Fragment;
`;

const reactImportFix: BunPlugin = {
  name: "SVG loader",
  setup(runtime) {
    runtime.onLoad(
      {
        filter: /\.tsx$/,
      },
      async (props) => {
        const tsx = await Bun.file(props.path).text();

        return {
          contents: tsx + ToAdd,
        };
      }
    );
  },
};
plugin(reactImportFix);
