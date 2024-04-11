import { BuildFix } from ".";
import { existsSync, cpSync } from "fs";
const ReactExternal = new BuildFix({
  dependencyName: "react",
  async afterBuild({ buildPath, tmpPath }) {
    const basePath = "node_modules/react";
    const tmpFullPath = `${tmpPath}/react`;
    const buildFullPath = `${buildPath}/react`;
    const makeBuild = () =>
      Bun.build({
        publicPath: "./",
        outdir: tmpFullPath,
        entrypoints: [
          `${basePath}/index.js`,
          `${basePath}/jsx-dev-runtime.js`,
          `${basePath}/jsx-runtime.js`,
          `${basePath}/react.shared-subset.js`,
        ],
      });
    if (!existsSync(tmpFullPath) || process.env.NODE_ENV != "development") {
      await makeBuild();
    }

    cpSync(tmpFullPath, buildFullPath, {
      force: true,
      recursive: true,
    });
  },
});

export default ReactExternal;
