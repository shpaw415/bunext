import { BuildFix } from ".";
import { generateRandomString } from "../../features/utils";

const DevHotReload = new BuildFix({
  afterBuild: async ({ outputs }) => {
    if (process.env.NODE_ENV == "production") return;
    for await (const file of outputs.outputs) {
      const excludes = [".bunext/react-ssr/hydrate.js"];
      const isExcluded =
        excludes.map((e) => file.path.endsWith(e)).filter((e) => e == true)
          .length > 0;
      if (isExcluded) continue;
      let content = await file.text();
      const { imports } = new Bun.Transpiler({ loader: "js" }).scan(content);

      for await (const imp of imports) {
        content = content.replace(
          imp.path,
          imp.path + `?${generateRandomString(5)}`
        );
      }
      await Bun.write(Bun.file(file.path), content);
    }
    return;
  },
});

export default DevHotReload;
