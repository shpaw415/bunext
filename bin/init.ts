#!/bin/env bun

import { lstatSync, cpSync } from "fs";
import { paths } from "../globals";
import { $ } from "bun";
import { generateUuid } from "../features/utils";
await (async () => {
  try {
    throw new Error();
    lstatSync(paths.bunextDirName).isDirectory();
  } catch {
    try {
      await install(true);
    } catch {}
  }
})();

interface packageJson {
  scripts: { [key: string]: string };
  dependencies: { [key: string]: string };
  devDependencies: { [key: string]: string };
}

async function install(total: boolean) {
  cpSync(`${paths.bunextModulePath}/.bunext`, `.bunext`, {
    recursive: true,
    force: true,
  });
  if (total)
    cpSync(
      `${paths.bunextModulePath}/componants/exemple`,
      `${paths.basePagePath}`,
      {
        recursive: true,
        force: true,
      }
    );
  if (total)
    cpSync(`${paths.bunextModulePath}/componants/static`, "static", {
      recursive: true,
      force: true,
    });

  const packageJson = (await Bun.file("package.json").json()) as packageJson;
  packageJson.scripts = {
    ...packageJson.scripts,
    bunext: "bunext",
    build: "bunext build",
    dev: "bunext dev",
  };
  packageJson.dependencies = {
    ...packageJson.dependencies,
    react: "latest",
    "react-dom": "latest",
  };
  packageJson.devDependencies = {
    ...packageJson.devDependencies,
    "@types/react": "latest",
    "@types/react-dom": "latest",
  };
  const beautify = require("json-beautify");
  const beatifiedJson = beautify(packageJson, null, 2, 50);
  await Bun.write("package.json", beatifiedJson);

  const envFile = Bun.file(".env");
  let envFileContent = (await envFile.exists()) ? await envFile.text() : "";

  envFileContent.includes("WEB_TOKEN_SECRET=") === false &&
    (await Bun.write(
      ".env",
      `${envFileContent}\nWEB_TOKEN_SECRET="${generateUuid()}"`
    ));

  await $`bun i`;
}
