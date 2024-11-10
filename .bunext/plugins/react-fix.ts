import { plugin, type BunPlugin } from "bun";

const reactFix: BunPlugin = {
  name: "React-import-tmp-fix",
  setup(runtime) {
    runtime.onLoad(
      {
        filter: /\.tsx$/,
      },
      async (props) => {
        const file = await Bun.file(props.path).text();

        return {
          contents:
            `
            import { jsxDEV as jsxDEV_7x81h0kn } from "react/jsx-dev-runtime";
          ` +
            file +
            "\n global.jsxDEV_7x81h0kn = jsxDEV_7x81h0kn;",
        };
      }
    );
  },
};
if (process.env.NODE_ENV == "production") plugin(reactFix);
