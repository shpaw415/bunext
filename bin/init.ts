#!/bin/env bun

import { lstatSync, cpSync, mkdirSync, rmSync } from "fs";
import { names, paths } from "../globals";
import { $ } from "bun";
await (async () => {
  try {
    lstatSync(paths.bunextDirName).isDirectory();
  } catch {
    try {
      await install();
    } catch {}
  }
})();

interface packageJson {
  scripts: { [key: string]: string };
  dependencies: { [key: string]: string };
  devDependencies: { [key: string]: string };
}

async function install() {
  /*rmSync(paths.bunextDirName, {
    recursive: true,
    force: true,
  });*/
  mkdirSync(paths.bunextDirName);
  mkdirSync(paths.basePagePath, {
    recursive: true,
  });
  cpSync(
    `${paths.bunextModulePath}/componants/exemple.tsx`,
    `${paths.basePagePath}/index.tsx`
  );
  cpSync(
    `${paths.bunextModulePath}/react-ssr`,
    `${paths.bunextDirName}/react-ssr`,
    {
      recursive: true,
    }
  );

  const packageJson = (await Bun.file("package.json").json()) as packageJson;
  packageJson.scripts = {
    ...packageJson.scripts,
    bunext: "bunext",
    build: "bunext build",
    dev: "bunext dev",
  };
  packageJson.dependencies = {
    ...packageJson.dependencies,
    "bun-react-ssr": "^0.2.2",
    react: "18.2.0",
    "react-dom": "18.2.0",
    "@bunpmjs/json-webtoken": "latest",
  };
  packageJson.devDependencies = {
    ...packageJson.devDependencies,
    "@types/react": "18.2.55",
    "@types/react-dom": "18.2.19",
  };
  const beautify = require("json-beautify");
  await Bun.write("package.json", beautify(packageJson, null, 2, 80));
  await $`bun i`;
}
