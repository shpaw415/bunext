#!/bin/env bun

import { exitCodes, paths } from "../internal/globals.ts";
import { ConvertShemaToType, type DBSchema } from "../database/schema";
import { type Subprocess } from "bun";

type _cmd =
  | "init"
  | "build"
  | "dev"
  | "database_create"
  | "database_merge"
  | "production";
const cmd = (process.argv[2] as _cmd) ?? "bypass";
const args = process.argv[3] as undefined | string;

const DBShemaPath = "database.ts";
const DBPath = (process.env.DATABASE_NAME || "database") + ".sqlite";

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
      const builder = (await import("../internal/build.ts")).builder;
      const res = await builder.build();
      console.log(res);
      break;
    case "dev":
      dev();
      break;
    case "production":
      production();
      break;
    case "database_create":
      await databaseSchemaMaker();
      await databaseCreator();
      break;
    default:
      console.log(`Bunext: '${cmd}' is not a function`);
      break;
  }

function CheckDbExists() {
  return Bun.file(`config/${DBPath}`).exists();
}

async function databaseSchemaMaker() {
  if (await CheckDbExists()) {
    console.log(
      `config/${DBShemaPath} already exists the new Database Schema may not fit\n`,
      "Database Merging will be in a next release"
    );
  }
  const Importseparator = '("<Bunext_TypeImposts>");';
  const ExportSeparator = '("<Bunext_DBExport>");';
  const types = await ConvertShemaToType(
    `${process.cwd()}/config/${DBShemaPath}`
  );
  await Bun.write(
    `${paths.bunextModulePath}/database/database_types.ts`,
    types.types.map((type) => `export ${type}`).join("\n")
  );
  const dbFile = Bun.file(`${paths.bunextModulePath}/database/index.ts`);
  let dbFileContent: string | string[] = await dbFile.text();

  dbFileContent = dbFileContent.split(Importseparator);
  dbFileContent[1] = `\nimport type { ${types.tables
    .map((t) => `_${t}`)
    .join(", ")} } from "./database_types.ts";\n`;
  dbFileContent = dbFileContent.join(Importseparator);

  dbFileContent = dbFileContent.split(ExportSeparator);

  dbFileContent[1] = `\nreturn {\n ${types.tables
    .map((t) => `${t}: new Table<_${t}>({ name: "${t}" })`)
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
  Bun.spawnSync({
    cmd: ["bun", "--hot", `${paths.bunextDirName}/react-ssr/server.ts`],
    stdout: "inherit",
    env: {
      ...process.env,
      __HEAD_DATA__: JSON.stringify(globalThis.head),
      NODE_ENV: process.env.NODE_ENV,
    },
  });
  dev();
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
