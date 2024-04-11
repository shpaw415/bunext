import { BuildFix } from ".";
import { cpSync, existsSync, unlinkSync } from "node:fs";
async function makeFile(filepath: string) {
  const _module = await import(filepath);
  const clientSidePath = filepath.split("@mui")[1];
  const moduleExports = Object.keys(_module);

  return `
  const _modulePath = "/@mui${clientSidePath}";
  const _module = await import(_modulePath);

  ${moduleExports.map((n) => `const _${n} = _module.${n}`).join(";\n")}

  ${moduleExports.includes("default") && `export default _default;`}
  export {${moduleExports
    .filter((n) => n != "default")
    .map((n) => `_${n}`)
    .join(", ")}};
  `;
}

const muiFix = new BuildFix({
  dependencyName: "@mui/material",
  plugin: {
    name: "mui-material",
    target: "browser",
    async setup(build) {
      build.onLoad(
        {
          filter: /\.js$/,
        },
        async ({ path }) => {
          const target = "/node_modules/@mui/";
          if (!path.includes(target)) {
            return {
              contents: await Bun.file(path).text(),
              loader: "js",
            };
          }
          const fileContent = await makeFile(path);
          return {
            contents: fileContent,
            loader: "js",
          };
        }
      );
    },
  },
  async afterBuild({ buildPath, tmpPath }) {
    const fulltmpPath = `${tmpPath}/@mui`;
    const fullbuildPath = `${buildPath}/@mui`;
    if (existsSync(fulltmpPath)) {
      //cpSync(fulltmpPath, fullbuildPath);
      //return;
    }
    cpSync(`node_modules/@mui`, fulltmpPath, {
      recursive: true,
    });

    const everyFiles = await Array.fromAsync(
      new Bun.Glob("**/*").scan({ cwd: fulltmpPath, onlyFiles: true })
    );
    for (const file of everyFiles) {
      if (file.endsWith(".js")) continue;
      unlinkSync(`${fulltmpPath}/${file}`);
    }
    const globs = new Bun.Glob("**/*.js");
    const jsFiles = await Array.fromAsync(
      globs.scan({ cwd: fulltmpPath, onlyFiles: true, absolute: true })
    );
    for await (const file of jsFiles) {
      const bunFile = Bun.file(file);
      await Bun.write(
        bunFile,
        BuildFix.convertImportsToBrowser(await bunFile.text())
      );
    }
  },
});

export default muiFix;
