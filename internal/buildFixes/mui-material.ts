import { BuildFix } from ".";

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

async function makeMui(fileContent: string) {
  return fileContent;
}

const muiFix = new BuildFix({
  plugin: {
    name: "mui-material",
    target: "browser",
    async setup(build) {
      build.onLoad(
        {
          filter: /\@mui\/system\/createStyled.js$/,
        },
        async ({ path }) => {
          let fileContent = await Bun.file(path).text();
          fileContent = `${fileContent}\ncreateStyled.default = createStyled.default.default;`;
          console.log("test");
          return {
            contents: fileContent,
            loader: "js",
          };
        }
      );
    },
  },
});

export default muiFix;
