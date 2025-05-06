// not a plugin

import { builder } from "../../internal/server/build";
import { basename, join, normalize } from "node:path";

export function clientNameSpaceTo(build: Bun.PluginBuilder) {
  build.onLoad(
    {
      filter: new RegExp(
        "^" +
          builder.escapeRegExp(
            normalize(
              join(builder.options.baseDir, builder.options.pageDir as string)
            )
          ) +
          "/.*" +
          "\\.(ts|tsx|jsx)$"
      ),
    },
    async ({ path, loader }) => {
      const fileText = await Bun.file(path).text();
      const exports = new Bun.Transpiler({
        loader: loader as "tsx" | "ts",
        exports: {
          eliminate: ["getServerSideProps"],
        },
      }).scan(fileText).exports;

      console.log(path);

      return {
        contents: `export { ${exports.join(", ")} } from 
            ${JSON.stringify("./" + basename(path) + "?client")}`,
        loader: "ts",
      };
    }
  );
  build.onResolve(
    { filter: /\.(ts|tsx)\?client$/ },
    async ({ importer, path }) => {
      const url = Bun.pathToFileURL(importer);
      const filePath = Bun.fileURLToPath(new URL(path, url));
      console.log(filePath);
      return {
        path: filePath,
        namespace: "client",
      };
    }
  );
}
