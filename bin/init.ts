#!/bin/env bun

import { cpSync } from "fs";
import { paths } from "../internal/globals";
import { generateUuid } from "../features/utils";

await install(false);

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
      `${paths.bunextModulePath}/components/exemple`,
      `${paths.basePagePath}`,
      {
        recursive: true,
        force: true,
      }
    );
  if (total || !(await Bun.file(`static/favicon.ico`).exists()))
    cpSync(`${paths.bunextModulePath}/components/static`, "static", {
      recursive: true,
      force: true,
    });
  if (total || !(await Bun.file(`config/database.ts`).exists())) {
    cpSync(`${paths.bunextModulePath}/config`, "config", {
      recursive: true,
      force: true,
    });
  }
  if (true || total || !(await Bun.file(`bunfig.toml`).exists())) {
    cpSync(`${paths.bunextModulePath}/bin/bunfig.toml`, "bunfig.toml", {
      force: true,
      recursive: true,
    });
  }

  const packageJson = (await Bun.file("package.json").json()) as packageJson;
  packageJson.scripts = {
    bunext: "bunext",
    build: "bunext build",
    dev: "bunext dev",
    "db:create": "bunext database:create",
    start: "bunext production",
    ...packageJson.scripts,
  };
  packageJson.dependencies = {
    react: "19.0.0",
    "react-dom": "19.0.0",
    ...packageJson.dependencies,
  };
  packageJson.devDependencies = {
    "@types/react": "19.0.0",
    "@types/react-dom": "19.0.0",
    ...packageJson.devDependencies,
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

    await Bun.write("tsconfig.json", beautify(tsConfig(), null, 2, 50));
  }
  Bun.spawnSync({
    cmd: ["bun", "i"],
  });
}

function tsConfig() {
  return {
    compilerOptions: {
      lib: ["ESNext", "DOM", "DOM.Iterable"],
      target: "ESNext",
      module: "ESNext",
      moduleDetection: "force",
      jsx: "react-jsx",
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
        "@static/*": ["./static/*"],
      },
    },
    exclude: ["node_modules"],
    include: [".bunext/custom.d.ts", "src"],
  };
}
