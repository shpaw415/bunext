import { BuildFix } from ".";
import { cpSync } from "node:fs";
async function makeFile(filepath: string) {
  const _module = await import(filepath);
  const clientSidePath = filepath.split("@mui")[1];
  const moduleExports = Object.keys(_module);

  return `
  const _modulePath = "/@mui${clientSidePath}";
  const _module = import(_modulePath);

  ${moduleExports.map((n) => `const _${n} = _module.${n}`).join(";\n")}

  ${moduleExports.includes("default") && `export default _default;`}
  export {${moduleExports
    .filter((n) => n != "default")
    .map((n) => `_${n}`)
    .join(", ")}};
  `;
}

const muiFix = new BuildFix({
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
  afterBuild(buildPath) {
    const basePath = process.cwd();
    const nodeModulePath = `${basePath}/node_modules`;
    const copies = [
      {
        from: nodeModulePath + "/@mui",
        to: `${basePath}/${buildPath}/@mui`,
      },
    ] as Array<{ from: string; to: string }>;
    console.log(copies);
    for (const i of copies) {
      cpSync(i.from, i.to, {
        recursive: true,
      });
    }
  },
});

export default muiFix;
