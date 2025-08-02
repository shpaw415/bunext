#!/bin/env bun
import "../internal/server/server_global.ts";
import { exit } from "node:process";
import { handleDev, handleProduction } from "./servers.ts";
import { handleDatabaseBackup, handleDatabaseCreate, handleDatabaseMerge, handleDatabaseRestore } from "./db.ts";

// Command types
type BunextCommand =
  | "init"
  | "build"
  | "dev"
  | "database:create"
  | "database:merge"
  | "database:backup"
  | "database:restore"
  | "production"
  | "help"
  | "--help"
  | "-h";



// Global type declarations
declare global {
  var __INIT__: boolean | undefined;
}

// Initialize global variables safely
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
    exit(0);
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
      await handleDatabaseMerge(args);
      break;

    case "database:backup":
      await handleDatabaseBackup(args);
      break;

    case "database:restore":
      await handleDatabaseRestore(args);
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

Usage: bun bunext <command> [options]

Commands:
  init                      Initialize a new Bunext project
  build                     Build the project for production
  dev                       Start development server with hot reloading
  production                Start production server
  database:create           Create database and generate schema types
  database:backup <path>    Create a backup of the current database
  database:restore <path>   Restore database from a backup file
  database:merge <path>     Merge data from another database file
  help, --help, -h          Show this help message

Examples:
  bun bunext init
  bun bunext dev
  bun bunext build
  bun bunext database:create
  bun bunext database:backup ./backups/my-backup.db.gz
  bun bunext database:restore ./backups/my-backup.db.gz
  bun bunext database:merge ./backup/old-database.db

Database Management Features:
  • Backup: Full or schema-only, with optional compression
  • Restore: Clean or merge restore with pre-restore backup option
  • Merge: Interactive conflict resolution with selective table merging
  • All operations include progress tracking and detailed statistics
  • Safe error handling and validation for all operations
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
    console.log("Build completed successfully:", result);
  } catch (error) {
    throw new Error(`Build failed: ${error}`);
  }
}

// Start the application
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
