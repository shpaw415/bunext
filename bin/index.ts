#!/bin/env bun

import { __setHead__ } from "../componants/internal_head";
import { paths } from "../globals";
import { ConvertShemaToType, type DBSchema } from "../database/schema";
import { _Database } from "../database/class";
type _cmd = "init" | "build" | "dev" | "database_create" | "database_merge";
const cmd = (process.argv[2] as _cmd) ?? "bypass";
const args = process.argv[3] as undefined | string;
declare global {
  var pages: {
    page: Blob;
    path: string;
  }[];
}

globalThis.pages ??= [];

if (import.meta.main)
  switch (cmd) {
    case "init":
      await init();
      break;
    case "build":
      Build();
      break;
    case "dev":
      await __setHead__();
      Build();
      dev();
      break;
    case "database_create":
      await databaseSchemaMaker();
      await databaseCreator();
      break;
    default:
      console.log(`Bunext: '${cmd}' is not a function`);
      break;
  }

export function Build() {
  return Bun.spawnSync({
    cmd: [`bun`, `${paths.bunextModulePath}/internal/build.ts`],
    stdout: "inherit",
    env: {
      ...process.env,
      __PAGE__: JSON.stringify(
        globalThis.pages.map((e) => {
          return { page: "", path: e.path };
        })
      ),
    },
  }).exitCode;
}

async function databaseSchemaMaker() {
  const Importseparator = '("<Bunext_TypeImposts>");';
  const ExportSeparator = '("<Bunext_DBExport>");';
  const types = await ConvertShemaToType(`${process.cwd()}/config/database.ts`);
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
  const schema = (await import(`${process.cwd()}/config/database.ts`))
    .default as DBSchema;
  const db = new _Database();
  schema.map((table) => {
    db.create(table);
  });
}

function dev() {
  const proc = Bun.spawnSync({
    cmd: ["bun", "--hot", `${paths.bunextDirName}/react-ssr/server.ts`, "dev"],
    env: {
      ...process.env,
      __HEAD_DATA__: JSON.stringify(globalThis.head),
    },
    stdout: "inherit",
  });
  if (proc.exitCode === 101) dev();
}
function init() {
  return import("./init");
}
