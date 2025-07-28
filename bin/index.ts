#!/bin/env bun
import "../internal/server/server_global.ts";
import { exitCodes, paths } from "../internal/globals.ts";
import { ConvertShemaToType, type DBSchema } from "../database/schema";
import { type Subprocess } from "bun";
import { getStartLog } from "../internal/server/logs.ts";
import { resolve } from "node:path";

// Command types
type BunextCommand =
  | "init"
  | "build"
  | "dev"
  | "database:create"
  | "database:merge"
  | "production"
  | "help"
  | "--help"
  | "-h";

// Configuration constants
const CONFIG = {
  DATABASE_PATH: (process.env.DATABASE_NAME || "bunext") + ".sqlite",
  DATABASE_SCHEMA_PATH: "database.ts",
  SEPARATORS: {
    IMPORT: '("<Bunext_TypeImposts>");',
    EXPORT: '("<Bunext_DBExport>");',
  },
} as const;

// Global type declarations
declare global {
  var processes: Subprocess[];
  var __INIT__: boolean | undefined;
}

// Initialize global variables safely
globalThis.processes ??= [];
globalThis.head ??= {};

/**
 * Main CLI handler - processes command line arguments and executes appropriate commands
 */
async function main(): Promise<void> {
  if (!import.meta.main) return;

  const command = (process.argv[2] as BunextCommand) ?? "bypass";
  const args = process.argv[3] as string | undefined;

  try {
    await executeCommand(command, args);
  } catch (error) {
    console.error(`Error executing command '${command}':`, error);
    process.exit(1);
  }
}

/**
 * Routes commands to their respective handlers
 */
async function executeCommand(command: BunextCommand, args?: string): Promise<void> {
  switch (command) {
    case "init":
      await handleInit();
      break;

    case "build":
      await handleBuild();
      break;

    case "dev":
      await handleDev();
      break;

    case "production":
      await handleProduction();
      break;

    case "database:create":
      await handleDatabaseCreate();
      break;

    case "database:merge":
      console.warn("Database merge functionality is not yet implemented");
      break;

    case "help":
    case "--help":
    case "-h":
      showHelp();
      break;

    default:
      console.error(`Unknown command: '${command}'.`);
      showHelp();
      process.exit(1);
  }
}

/**
 * Displays help information about available commands
 */
function showHelp(): void {
  console.log(`
Bunext CLI - A modern web framework for Bun

Usage: bun bin/index.ts <command> [options]

Commands:
  init                Initialize a new Bunext project
  build               Build the project for production
  dev                 Start development server with hot reloading
  production          Start production server
  database:create     Create database and generate schema types
  database:merge      Merge database schemas (coming soon)
  help, --help, -h    Show this help message

Examples:
  bun bin/index.ts init
  bun bin/index.ts dev
  bun bin/index.ts build
  bun bin/index.ts database:create
  `);
}

/**
 * Command handlers
 */

/**
 * Handles the 'init' command - initializes a new Bunext project
 */
async function handleInit(): Promise<void> {
  try {
    await import("./init");
  } catch (error) {
    throw new Error(`Failed to initialize project: ${error}`);
  }
}

/**
 * Handles the 'build' command - builds the project for production
 */
async function handleBuild(): Promise<void> {
  try {
    const { builder } = await import("../internal/server/build.ts");
    await builder.preBuildAll();
    const result = await builder.build();
    console.log("Build completed:", result);
  } catch (error) {
    throw new Error(`Build failed: ${error}`);
  }
}

/**
 * Handles the 'dev' command - starts development server with hot reloading
 */
async function handleDev(): Promise<void> {
  try {
    process.env.NODE_ENV = "development";
    startDevServer();
  } catch (error) {
    throw new Error(`Failed to start development server: ${error}`);
  }
}

/**
 * Handles the 'production' command - starts production server
 */
async function handleProduction(): Promise<void> {
  try {
    process.env.NODE_ENV = "production";
    console.log(getStartLog());
    startProductionServer();
  } catch (error) {
    throw new Error(`Failed to start production server: ${error}`);
  }
}

/**
 * Handles the 'database:create' command - creates database and schema
 */
async function handleDatabaseCreate(): Promise<void> {
  try {
    await createDatabaseSchema();
    await createDatabase();
    console.log("Database and schema created successfully");
  } catch (error) {
    throw new Error(`Database creation failed: ${error}`);
  }
}

// Utility functions

/**
 * Checks if the database file already exists
 */
function checkDatabaseExists(): Promise<boolean> {
  const dbPath = resolve(process.cwd(), "config", CONFIG.DATABASE_PATH);
  return Bun.file(dbPath).exists();
}

/**
 * Starts the development server with hot reloading
 */
function startDevServer(): void {
  const serverProcess = Bun.spawn({
    cmd: ["bun", "--hot", `${paths.bunextDirName}/react-ssr/server.ts`],
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      __HEAD_DATA__: JSON.stringify(globalThis.head),
      NODE_ENV: process.env.NODE_ENV,
    },
    onExit() {
      console.log("Development server restarting...");
      startDevServer();
    },
  });

  globalThis.processes.push(serverProcess);
}

/**
 * Starts the production server with automatic restart on certain exit codes
 */
function startProductionServer(): void {
  const serverProcess = Bun.spawn({
    cmd: ["bun", `${paths.bunextDirName}/react-ssr/server.ts`, "production"],
    env: {
      ...process.env,
      __HEAD_DATA__: JSON.stringify(globalThis.head),
      NODE_ENV: "production",
    },
    stdout: "inherit",
    onExit(subprocess, exitCode, signalCode, error) {
      if (exitCode === exitCodes.runtime || exitCode === exitCodes.build) {
        console.log("Production server restarting due to runtime/build error...");
        startProductionServer();
      } else {
        console.log("Bunext server exited.");
        process.exit(exitCode || 0);
      }
    },
  });

  globalThis.processes.push(serverProcess);
}

/**
 * Creates the database schema and type definitions
 */
async function createDatabaseSchema(): Promise<void> {
  if (await checkDatabaseExists()) {
    console.warn(
      `config/${CONFIG.DATABASE_PATH} already exists. The new Database Schema may not fit.\n` +
      "Database merging will be available in a future release."
    );
  }

  try {
    const schemaPath = resolve(process.cwd(), "config", CONFIG.DATABASE_SCHEMA_PATH);
    const schemaModule = require(schemaPath);

    if (!schemaModule?.default) {
      throw new Error(`No default export found in ${CONFIG.DATABASE_SCHEMA_PATH}`);
    }

    const typeDefinitions = ConvertShemaToType(schemaModule.default);

    // Write type definitions
    const typesContent = [
      ...typeDefinitions.types,
      ...typeDefinitions.typesWithDefaultAsRequired
    ]
      .map((type) => `export ${type}`)
      .join("\n");

    await Bun.write(
      resolve(paths.bunextModulePath, "database", "database_types.ts"),
      typesContent
    );

    // Update database index file
    await updateDatabaseIndexFile(typeDefinitions);

  } catch (error) {
    throw new Error(`Schema generation failed: ${error}`);
  }
}

/**
 * Updates the database index file with generated types and table exports
 */
async function updateDatabaseIndexFile(typeDefinitions: { tables: string[] }): Promise<void> {
  const dbIndexPath = resolve(paths.bunextModulePath, "database", "index.ts");
  const dbFile = Bun.file(dbIndexPath);

  if (!await dbFile.exists()) {
    throw new Error(`Database index file not found: ${dbIndexPath}`);
  }

  let content = await dbFile.text();

  // Update import section
  const importContent = `\nimport type { ${typeDefinitions.tables
    .map((table) => `_${table}, SELECT_${table}`)
    .join(", ")} } from "./database_types.ts";\n`;

  content = replaceContentBetweenSeparators(
    content,
    CONFIG.SEPARATORS.IMPORT,
    importContent
  );

  // Update export section
  const exportContent = `\nreturn {\n ${typeDefinitions.tables
    .map((table) => `${table}: new Table<_${table}, SELECT_${table}>({ name: "${table}" })`)
    .join(",\n ")} \n} as const;\n`;

  content = replaceContentBetweenSeparators(
    content,
    CONFIG.SEPARATORS.EXPORT,
    exportContent
  );

  await Bun.write(dbFile, content);
}

/**
 * Helper function to replace content between separators
 */
function replaceContentBetweenSeparators(
  content: string,
  separator: string,
  newContent: string
): string {
  const parts = content.split(separator);

  if (parts.length !== 2) {
    throw new Error(`Invalid separator format in database index file: ${separator}`);
  }

  parts[1] = newContent;
  return parts.join(separator);
}

/**
 * Creates the database tables from the schema
 */
async function createDatabase(): Promise<void> {
  try {
    const schemaPath = resolve(process.cwd(), "config", CONFIG.DATABASE_SCHEMA_PATH);
    const schemaModule = await import(schemaPath);

    if (!schemaModule?.default) {
      throw new Error(`No default export found in ${CONFIG.DATABASE_SCHEMA_PATH}`);
    }

    const schema = schemaModule.default as DBSchema;
    const { _Database } = await import("../database/class");
    const db = new _Database();

    schema.forEach((table) => {
      db.create(table);
    });

  } catch (error) {
    throw new Error(`Database creation failed: ${error}`);
  }
}

// Start the application
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
