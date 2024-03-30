#!/bin/env bun

import { __setHead__ } from "../componants/internal_head";
import { exitCodes, paths } from "../globals";
import { ConvertShemaToType, type DBSchema } from "../database/schema";
import { sendSignal } from "../dev/hotServer";
import type { Subprocess } from "bun";
import { doBuild } from "../internal/build-watch";
type _cmd =
  | "init"
  | "build"
  | "dev"
  | "database_create"
  | "database_merge"
  | "devTest";
const cmd = (process.argv[2] as _cmd) ?? "bypass";
const args = process.argv[3] as undefined | string;

const DBShemaPath = "database.ts";
const DBPath = (process.env.DATABASE_NAME || "database") + ".sqlite";

declare global {
  var pages: {
    page: Blob;
    path: string;
  }[];
  var processes: Subprocess[];
}
globalThis.processes ??= [];
globalThis.pages ??= [];
globalThis.head ??= {};
if (import.meta.main)
  switch (cmd) {
    case "init":
      await init();
      break;
    case "build":
      doBuild();
      break;
    case "devTest":
      await __setHead__();
      dev(false, true);
      break;
    case "dev":
      await __setHead__();
      dev(false);
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

function dev(showBuildError: boolean, hotServerDisable?: boolean) {
  const proc = Bun.spawn({
    cmd: [
      "bun",
      hotServerDisable ? "" : "--hot",
      `${paths.bunextDirName}/react-ssr/server.ts`,
      "dev",
      showBuildError ? "showError" : "",
    ],
    env: {
      ...process.env,
      __HEAD_DATA__: JSON.stringify(globalThis.head),
    },
    ipc(message, subprocess) {
      if (message == "signal") sendSignal();
    },
    stdout: "inherit",
    onExit(subprocess, exitCode, signalCode, error) {
      if (exitCode == exitCodes.runtime) {
        dev(false);
      } else if (exitCode == exitCodes.build) {
        dev(true);
      } else {
        console.log("Bunext Dev Exited.");
      }
    },
  });
  globalThis.processes.push(proc);
}
function init() {
  return import("./init");
}
