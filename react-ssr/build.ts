import { Transpiler, type BunPlugin } from "bun";
import { build } from "bun-react-ssr/src/build";
import ReactDOMServer from "react-dom/server";
export async function doBuild() {
  const result = await build({
    baseDir: process.cwd(),
    buildDir: ".bunext/build",
    pageDir: "src/pages",
    hydrate: ".bunext/react-ssr/hydrate.ts",
    plugins: [useServerPlugin()],
  });
  if (result.logs.length) {
    console.log(...result.logs);
  } else if (result.success) {
    //console.log("built", new Date());
  }
}

if (import.meta.main) {
  doBuild();
}

function useServerPlugin() {
  return {
    name: "use-server",
    target: "bun",
    setup(build) {
      build.onLoad(
        {
          filter: /\.tsx$/,
        },
        async (props) => {
          const content = await Bun.file(props.path).text();
          let _content = content;
          let module: any;
          const lines = content.split("\n");
          for await (const line of lines) {
            const l = line.trim();
            if (l.length == 0) continue;
            else if (
              l.startsWith("'use client'") ||
              l.startsWith('"use client"')
            )
              break;
            else if (l.startsWith('"use server"')) {
              const transpiler = new Transpiler({
                target: "browser",
              });
              module = await import(props.path);
              const importList = transpiler.scan(content);

              const stringified = ReactDOMServer.renderToString(
                await module.default()
              );

              console.log(stringified);
              //_content = `export default Page() {}`;
            }
          }
          return {
            contents: _content,
            loader: "tsx",
          };
        }
      );
    },
  } as BunPlugin;
}

function getImports(content: string) {
  const lines = content.split("\n");
}
