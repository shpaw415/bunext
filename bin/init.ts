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
      await install(false);
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
  if (total || !(await Bun.file(`${paths.basePagePath}/index.tsx`).exists()))
    cpSync(
      `${paths.bunextModulePath}/componants/exemple`,
      `${paths.basePagePath}`,
      {
        recursive: true,
        force: true,
      }
    );
  if (total || !(await Bun.file(`static/favicon.ico`).exists()))
    cpSync(`${paths.bunextModulePath}/componants/static`, "static", {
      recursive: true,
      force: true,
    });
  if (total || !(await Bun.file(`config/database.ts`).exists())) {
    cpSync(`${paths.bunextModulePath}/componants/config`, "config", {
      recursive: true,
      force: true,
    });
  }

  const packageJson = (await Bun.file("package.json").json()) as packageJson;
  packageJson.scripts = {
    ...packageJson.scripts,
    bunext: "bunext",
    build: "bunext build",
    dev: "bunext dev",
    databaseCreate: "bunext database_create",
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

  if (total || !(await Bun.file(`.env`).exists())) {
    const envFile = Bun.file(".env");
    let envFileContent = (await envFile.exists()) ? await envFile.text() : "";

    envFileContent.includes("WEB_TOKEN_SECRET=") === false &&
      (await Bun.write(
        ".env",
        `${envFileContent}\nWEB_TOKEN_SECRET="${generateUuid()}"`
      ));

    Bun.write("tsconfig.json", beautify(tsConfig(), null, 2, 50));
  }
  await $`bun i`;
}

function tsConfig() {
  return {
    compilerOptions: {
      lib: ["ESNext", "DOM"],
      target: "ESNext",
      module: "ESNext",
      moduleDetection: "force",
      jsx: "react-jsxdev",
      allowJs: true,

      /* Bundler mode */
      moduleResolution: "bundler",
      allowImportingTsExtensions: true,
      verbatimModuleSyntax: true,
      noEmit: true,
      incremental: true,
      isolatedModules: true,
      resolveJsonModule: true,

      /* Linting */
      strict: true,
      skipLibCheck: true,
      noFallthroughCasesInSwitch: true,

      paths: {
        "@/*": ["./src/*"],
      },
    },
    exclude: ["node_modules"],
  };
}
