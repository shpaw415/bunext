import { plugin, type BunPlugin } from "bun";


function fixReactImport(fileContent: string) {
  return [
    "import { jsxDEV as jsxDEV_7x81h0kn } from \"react/jsx-dev-runtime\";",
    fileContent,
    "global.jsxDEV_7x81h0kn = jsxDEV_7x81h0kn;"
  ].join("\n");
}
/*
async function BunextPlaceHolderServerComponentName() {
  const cacheManager = (await import("bunext-js/internal/caching/index.ts")).default;
  const SSRElements = cacheManager.getSSR("<PATH_PLACEHOLDER>")?.elements.find((el) => el.name === "<NAME_PLACEHOLDER>");
}
async function ServerComponentToStaticResponse(path: string, fileContent: string) {
  if (!path.endsWith(".tsx")) return fileContent;


  const elements = (await import("bunext-js/internal/caching/index.ts")).default.getSSR(path)?.elements;
  const SSRElementsFormated = elements?.map((el) => [el.name, BunextPlaceHolderServerComponentName.toString().replace("BunextPlaceHolderServerComponentName", el.name).replace("<PLACEHOLDER>", path).replace("<NAME_PLACEHOLDER>", el.name)]) ?? [];
  const transpiler = new Bun.Transpiler({
    exports: {
      replace: {
        ...Object.fromEntries(SSRElementsFormated)
      }
    }
  });
  const transformed = await transpiler.transform(fileContent, "tsx");
  await Bun.file(`log/${path}`).write(transformed);
  return transformed;
}
*/

const reactFix: BunPlugin = {
  name: "tsx-fixes",
  async setup(runtime) {
    runtime.onLoad(
      {
        filter: /\.tsx$/,
      },
      async (props) => {
        const file = await Bun.file(props.path).text();
        const formated = fixReactImport(file);
        return {
          contents: formated
        };
      }
    );
  },
};

if (process.env.NODE_ENV == "production") plugin(reactFix);