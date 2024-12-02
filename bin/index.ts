#!/bin/env bun

import { exitCodes, paths } from "../internal/globals.ts";
import { ConvertShemaToType, type DBSchema } from "../database/schema";
import { type Subprocess } from "bun";

type _cmd =
  | "init"
  | "build"
  | "dev"
  | "database:create"
  | "database:merge"
  | "production";
const cmd = (process.argv[2] as _cmd) ?? "bypass";
const args = process.argv[3] as undefined | string;

const DBPath = (process.env.DATABASE_NAME || "bunext") + ".sqlite";
const DBShemaPath = "database.ts";

declare global {
  var processes: Subprocess[];
}
globalThis.processes ??= [];
globalThis.head ??= {};
if (import.meta.main)
  switch (cmd) {
    case "init":
      await init();
      break;
    case "build":
      const res = await (await import("../internal/build.ts")).builder.build();
      console.log(res);
      break;
    case "dev":
      await (await import("../internal/build.ts")).builder.build();
      dev();
      break;
    case "production":
      production();
      break;
    case "database:create":
      await databaseSchemaMaker();
      await databaseCreator();
      break;
    default:
      console.log(`Bunext: '${cmd}' is not a function`);
      break;
  }

function CheckDbExists() {
  return Bun.file(`${process.cwd()}/config/${DBPath}`).exists();
}

async function databaseSchemaMaker() {
  if (await CheckDbExists()) {
    console.log(
      `config/${DBPath} already exists the new Database Schema may not fit\n`,
      "Database Merging will be in a next release"
    );
  }
  const Importseparator = '("<Bunext_TypeImposts>");';
  const ExportSeparator = '("<Bunext_DBExport>");';
  const types = ConvertShemaToType(
    require(`${process.cwd()}/config/${DBShemaPath}`).default
  );
  await Bun.write(
    `${paths.bunextModulePath}/database/database_types.ts`,
    [...types.types, ...types.typesWithDefaultAsRequired].map((type) => `export ${type}`).join("\n")
  );
  const dbFile = Bun.file(`${paths.bunextModulePath}/database/index.ts`);
  let dbFileContent: string | string[] = await dbFile.text();

  dbFileContent = dbFileContent.split(Importseparator);
  dbFileContent[1] = `\nimport type { ${types.tables
    .map((t) => `_${t}, SELECT_${t}`)
    .join(", ")} } from "./database_types.ts";\n`;
  dbFileContent = dbFileContent.join(Importseparator);

  dbFileContent = dbFileContent.split(ExportSeparator);

  dbFileContent[1] = `\nreturn {\n ${types.tables
    .map((t) => `${t}: new Table<_${t}, SELECT_${t}>({ name: "${t}" })`)
    .join(",\n ")} \n} as const;\n`;
  dbFileContent = dbFileContent.join(ExportSeparator);
  await Bun.write(dbFile, dbFileContent);
}
async function databaseCreator() {
  const schema = (await import(`${process.cwd()}/config/${DBShemaPath}`))
    .default as DBSchema;
  const db = new (await import("../database/class"))._Database();
  schema.map((table) => {
    db.create(table);
  });
}

function dev() {
  process.env.NODE_ENV = "development";
  Bun.spawn({
    cmd: ["bun", "--hot", `${paths.bunextDirName}/react-ssr/server.ts`],
    stdout: "inherit",
    env: {
      ...process.env,
      __HEAD_DATA__: JSON.stringify(globalThis.head),
      NODE_ENV: process.env.NODE_ENV,
    },
    onExit() {
      dev();
    },
  });
}

function production() {
  process.env.NODE_ENV = "production";
  const proc = Bun.spawn({
    cmd: [
      "bun",
      "--production",
      `${paths.bunextDirName}/react-ssr/server.ts`,
      "production",
    ],
    env: {
      ...process.env,
      __HEAD_DATA__: JSON.stringify(globalThis.head),
      NODE_ENV: process.env.NODE_ENV,
    },
    stdout: "inherit",
    onExit(subprocess, exitCode, signalCode, error) {
      if (exitCode == exitCodes.runtime || exitCode == exitCodes.build) {
        production();
      } else {
        console.log("Bunext Exited.");
      }
    },
  });
  globalThis.processes.push(proc);
}

function init() {
  return import("./init");
}
