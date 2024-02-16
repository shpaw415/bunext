#!/bin/env bun

import { lstatSync, cpSync, mkdirSync } from "fs";
import { names, paths } from "../globals";
import { $ } from "bun";
await (async () => {
  try {
    lstatSync(paths.bunextDirName).isDirectory();
  } catch {
    console.log("install");
    await install();
  }
})();

interface packageJson {
  scripts: { [key: string]: string };
  dependencies: { [key: string]: string };
}

async function install() {
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
  };
  await Bun.write("package.json", JSON.stringify(packageJson));
  await $`bun i`;
  //await modShell();
}
async function modShell() {
  const shellpath = `${paths.bunextDirName}/react-ssr/shell.tsx`;
  const fileContent = (await Bun.file(shellpath).text()).replace(
    "../componants/head",
    `${names.bunextModuleName}/componants/head`
  );
  await Bun.write(shellpath, fileContent);
}
