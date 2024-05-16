import { BuildFix } from ".";
import { generateRandomString } from "../../features/utils";
import { relative, normalize } from "path";

const DevHotReload = new BuildFix({
  afterBuild: async ({ outputs, builder }) => {
    if (process.env.NODE_ENV == "production") return;
    for await (const file of outputs.outputs) {
      if (file.path.includes("chunk-")) continue;
      const excludes = [".bunext/react-ssr/hydrate.js"];
      const isExcluded =
        excludes.map((e) => file.path.endsWith(e)).filter((e) => e == true)
          .length > 0;
      if (isExcluded) continue;
      let content = await file.text();
      const { imports } = new Bun.Transpiler({ loader: "js" }).scan(content);
      let paths: {
        path: string;
        key: string;
      }[] = [];
      for await (const imp of imports) {
        const pathsRel = {
          from: normalize(
            `${builder.options.baseDir}/${builder.options.buildDir}/${builder.options.pageDir}`
          ),
          to: normalize(
            `${file.path.split("/").slice(0, -1).join("/")}/${imp.path}`
          ),
        };
        const path = relative(pathsRel.from, pathsRel.to);
        let key = generateRandomString(5);
        const foundedPath = paths.find((e) => e.path == path);
        if (foundedPath) key = foundedPath.key;
        else paths.push({ path, key });
        imp.path = imp.path.split("?")[0];
        if (imp.path.includes("chunk-")) continue;
        content = content.replace(imp.path, imp.path + `?${key}`);
      }
      await Bun.write(Bun.file(file.path), content);
    }
    return;
  },
});

export default DevHotReload;
