import { ConvertShemaToType, type DBSchema } from "../database/schema";
import { paths } from "../internal/globals";
import { resolve } from "node:path";
import { CONFIG } from "./globals";
import { terminal } from "terminal-kit";


/**
 * Handles the 'database:merge' command - merges data from another database
 */
export async function handleDatabaseMerge(sourcePath?: string): Promise<void> {
    if (!sourcePath) {
        console.error("Error: Source database path is required for merge operation");
        console.log("Usage: bun bunext database:merge <source-database-path>");
        console.log("Example: bun bunext database:merge ./backup/old-database.db");
        process.exit(1);
    }

    try {
        // Check if source database exists
        const sourceFile = Bun.file(sourcePath);
        if (!await sourceFile.exists()) {
            throw new Error(`Source database file not found: ${sourcePath}`);
        }

        // Check if target database exists
        const targetExists = await checkDatabaseExists();
        if (!targetExists) {
            console.log("Target database doesn't exist. Creating it first...");
            await createDatabaseSchema();
            await createDatabase();
        }

        console.log(`🔄 Starting database merge from: ${sourcePath}`);
        console.log("This operation will merge data from the source database into the current database.");

        // Ask for confirmation
        const shouldProceed = await promptForConfirmation(
            "Do you want to proceed with the merge? This may overwrite existing data. (y/N): "
        );

        if (!shouldProceed) {
            console.log("Database merge cancelled.");
            return;
        }

        // Ask if user wants to create a backup first
        const shouldBackup = await promptForConfirmation(
            "Would you like to create a backup of the current database before merging? (Y/n): "
        );

        if (shouldBackup) {
            const backupPath = `./config/bunext-backup-${Date.now()}.db`;
            console.log(`📦 Creating backup at: ${backupPath}`);

            const { DatabaseManager } = await import("../database/class");
            const backupManager = new DatabaseManager();
            backupManager.backup(backupPath, { compress: true, includeData: true });
            console.log("✅ Backup created successfully!");
        }

        // Ask for conflict resolution strategy
        const conflictResolution = await promptForConflictResolution();

        // Ask for table filtering
        const shouldFilterTables = await promptForConfirmation(
            "Do you want to merge only specific tables? (y/N): "
        );

        let tablesFilter: string[] | undefined;
        if (shouldFilterTables) {
            tablesFilter = await promptForTableSelection(sourcePath);
        }

        // Perform the merge
        console.log("🚀 Starting merge operation...");
        const { DatabaseManager } = await import("../database/class");
        const dbManager = new DatabaseManager();

        await dbManager.mergeDatabase(sourcePath, {
            conflictResolution,
            tablesFilter,
            onConflict: (tableName, existingRecord, newRecord) => {
                console.log(`⚠️  Conflict in table '${tableName}' - using ${conflictResolution} strategy`);
                return conflictResolution === 'replace' ? 'use_new' : 'keep_existing';
            }
        });

        console.log("✅ Database merge completed successfully!");
        console.log("Your database now contains merged data from both sources.");

        // Show merge statistics
        const stats = dbManager.getDatabaseStats();
        console.log(`📊 Current database: ${stats.tables} tables, ${stats.totalRecords} total records`);

    } catch (error) {
        throw new Error(`Database merge failed: ${error}`);
    }
}

/**
 * Handles the 'database:backup' command - creates a backup of the current database
 */
export async function handleDatabaseBackup(backupPath?: string): Promise<void> {
    if (!backupPath) {
        console.error("Error: Backup path is required for backup operation");
        console.log("Usage: bun bunext database:backup <backup-file-path>");
        console.log("Examples:");
        console.log("  bun bunext database:backup ./backups/my-backup.db");
        console.log("  bun bunext database:backup ./backups/compressed-backup.db.gz");
        process.exit(1);
    }

    try {
        // Check if target database exists
        const targetExists = await checkDatabaseExists();
        if (!targetExists) {
            throw new Error("No database found to backup. Run 'bun bunext database:create' first.");
        }

        console.log(`📦 Creating database backup...`);

        // Determine if compression should be used based on file extension
        const shouldCompress = backupPath.endsWith('.gz');

        // Ask for backup options
        console.log("\nBackup Options:");
        const includeData = await promptForConfirmation(
            "Include table data in backup? (Y/n): "
        );

        if (!includeData) {
            console.log("Creating schema-only backup...");
        }

        // Ensure backup directory exists
        const backupDir = backupPath.substring(0, backupPath.lastIndexOf('/'));
        if (backupDir && backupDir !== backupPath) {
            try {
                const fs = require('fs');
                fs.mkdirSync(backupDir, { recursive: true });
            } catch (error) {
                // Directory might already exist, that's fine
            }
        }

        // Create the backup
        const { DatabaseManager } = await import("../database/class");
        const dbManager = new DatabaseManager();

        const startTime = Date.now();
        dbManager.backup(backupPath, {
            compress: shouldCompress,
            includeData: includeData
        });
        const duration = Date.now() - startTime;

        console.log("✅ Database backup completed successfully!");
        console.log(`📁 Backup saved to: ${backupPath}`);
        console.log(`⏱️  Backup took: ${duration}ms`);
        console.log(`🗜️  Compression: ${shouldCompress ? 'enabled' : 'disabled'}`);
        console.log(`📊 Content: ${includeData ? 'schema + data' : 'schema only'}`);

        // Show backup file size
        const backupFile = Bun.file(backupPath);
        if (await backupFile.exists()) {
            const size = backupFile.size;
            console.log(`📏 Backup size: ${formatBytes(size)}`);
        }

    } catch (error) {
        throw new Error(`Database backup failed: ${error}`);
    }
}

/**
 * Handles the 'database:restore' command - restores database from a backup file
 */
export async function handleDatabaseRestore(backupPath?: string): Promise<void> {
    if (!backupPath) {
        console.error("Error: Backup path is required for restore operation");
        console.log("Usage: bun bunext database:restore <backup-file-path>");
        console.log("Examples:");
        console.log("  bun bunext database:restore ./backups/my-backup.db");
        console.log("  bun bunext database:restore ./backups/compressed-backup.db.gz");
        console.log("  bun bunext database:restore ./backups/schema-only.json");
        process.exit(1);
    }

    try {
        // Check if backup file exists
        const backupFile = Bun.file(backupPath);
        if (!await backupFile.exists()) {
            throw new Error(`Backup file not found: ${backupPath}`);
        }

        console.log(`🔄 Preparing to restore from: ${backupPath}`);

        // Check if target database exists and warn user
        const targetExists = await checkDatabaseExists();
        if (targetExists) {
            console.log("⚠️  Warning: Current database will be affected by this restore operation.");

            // Ask for backup before restore
            const shouldBackupFirst = await promptForConfirmation(
                "Create a backup of current database before restore? (Y/n): "
            );

            if (shouldBackupFirst) {
                const preRestoreBackupPath = `./config/pre-restore-backup-${Date.now()}.db.gz`;
                console.log(`📦 Creating pre-restore backup: ${preRestoreBackupPath}`);

                const { DatabaseManager } = await import("../database/class");
                const backupManager = new DatabaseManager();
                backupManager.backup(preRestoreBackupPath, { compress: true, includeData: true });
                console.log("✅ Pre-restore backup created!");
            }
        }

        // Ask for restore strategy
        const dropExisting = await promptForConfirmation(
            "Drop existing tables before restore? (recommended for clean restore) (Y/n): "
        );

        // Final confirmation
        const shouldProceed = await promptForConfirmation(
            `Proceed with restore from ${backupPath}? This will modify your current database. (y/N): `
        );

        if (!shouldProceed) {
            console.log("Database restore cancelled.");
            return;
        }

        // Perform the restore
        console.log("🚀 Starting restore operation...");
        const { DatabaseManager } = await import("../database/class");
        const dbManager = new DatabaseManager();

        const startTime = Date.now();
        dbManager.restore(backupPath, { dropExisting });
        const duration = Date.now() - startTime;

        console.log("✅ Database restore completed successfully!");
        console.log(`⏱️  Restore took: ${duration}ms`);
        console.log(`🗂️  Strategy: ${dropExisting ? 'clean restore (dropped existing)' : 'merge restore'}`);

        // Show current database statistics
        const stats = dbManager.getDatabaseStats();
        console.log(`📊 Current database: ${stats.tables} tables, ${stats.totalRecords} total records`);

        // Recommend schema regeneration if needed
        if (!targetExists || dropExisting) {
            console.log("\n💡 Tip: You may want to run 'bun bunext database:create' to regenerate schema types.");
        }

    } catch (error) {
        throw new Error(`Database restore failed: ${error}`);
    }
}

/**
 * Handles the 'database:create' command - creates database and schema
 * Enhanced to handle existing tables with backup, recreation, and merge functionality
 */
export async function handleDatabaseCreate(): Promise<void> {
    try {
        // Animated header
        terminal.clear();
        terminal.magenta.bold('\n🚀 Bunext Database Creator\n');
        terminal('═'.repeat(50) + '\n\n');

        const progressBar = terminal.progressBar({
            width: 40,
            title: 'Initializing...',
            eta: true,
            percent: true
        });

        progressBar.update(0.1);
        await new Promise(resolve => setTimeout(resolve, 300));

        const dbExists = await checkDatabaseExists();
        progressBar.update(0.3);
        const hasExistingTables = dbExists ? await checkExistingTables() : false;
        progressBar.update(0.5);

        if (hasExistingTables) {
            progressBar.stop();
            terminal('\n');
            terminal.yellow.bold('⚠️  Warning: Database already exists with tables.\n');
            terminal.cyan('To ensure compatibility with the new schema, the following process will occur:\n\n');

            const steps = [
                '📦 Create a temporary backup of existing data',
                '🗑️  Drop existing tables and recreate with new schema',
                '🔄 Attempt to merge back compatible data',
                '⚙️  Handle any conflicts with configurable resolution'
            ];

            steps.forEach((step, index) => {
                terminal.dim(`${index + 1}. `);
                terminal.cyan(step + '\n');
            });

            terminal('\n');
            const shouldProceed = await promptForConfirmation(
                "Do you want to proceed with schema migration? This will modify your database.",
                false
            );

            if (!shouldProceed) {
                terminal.red('❌ Database creation cancelled.\n');
                return;
            }

            // Ask for conflict resolution strategy upfront
            const conflictResolution = await promptForConflictResolution();

            // Ask if user wants to keep a permanent backup
            const shouldKeepBackup = await promptForConfirmation(
                "Create a permanent backup before migration? (recommended)",
                true
            );

            await performDatabaseMigration(conflictResolution, shouldKeepBackup);
        } else {
            progressBar.update(0.8);
            await createDatabaseSchema();
            progressBar.update(0.9);
            await createDatabase();
            progressBar.update(1.0);
            progressBar.stop();

            terminal('\n');
            terminal.green.bold('✅ Database and schema created successfully!\n');
            terminal.cyan('🎉 Your database is ready to use!\n');
        }
    } catch (error) {
        terminal.red(`\n❌ Database creation failed: ${error}\n`);
        throw new Error(`Database creation failed: ${error}`);
    }
}

/**
 * Checks if the database has existing user tables
 */
async function checkExistingTables(): Promise<boolean> {
    try {
        const { DatabaseManager } = await import("../database/class");
        const dbManager = new DatabaseManager();
        const tables = dbManager.listTables();
        return tables.length > 0;
    } catch (error) {
        // If we can't check tables, assume none exist
        return false;
    }
}

/**
 * Performs the complete database migration process with animated progress
 */
async function performDatabaseMigration(
    conflictResolution: 'replace' | 'ignore' | 'fail',
    shouldKeepBackup: boolean
): Promise<void> {
    const { DatabaseManager } = await import("../database/class");
    const dbManager = new DatabaseManager();

    // Step 1: Create temporary backup
    const tempBackupPath = `./config/temp-migration-backup-${Date.now()}.db.gz`;
    const permanentBackupPath = shouldKeepBackup
        ? `./config/pre-migration-backup-${new Date().toISOString().split('T')[0]}-${Date.now()}.db.gz`
        : null;

    terminal('\n');
    terminal.cyan('📦 Creating temporary backup of existing data...\n');

    try {
        dbManager.backup(tempBackupPath, { compress: true, includeData: true });

        if (permanentBackupPath) {
            terminal.cyan(`📦 Creating permanent backup: ${permanentBackupPath}\n`);
            dbManager.backup(permanentBackupPath, { compress: true, includeData: true });
        }

        terminal.green('✅ Backup created successfully\n');

        // Step 2: Get statistics before migration
        const existingTables = dbManager.listTables();
        const existingStats = dbManager.getDatabaseStats();

        terminal.blue(`📊 Current database: ${existingStats.tables} tables, ${existingStats.totalRecords} total records\n`);

        // Progress bar for migration steps
        const migrationProgress = terminal.progressBar({
            width: 50,
            title: 'Migration Progress',
            eta: true,
            percent: true
        });

        // Step 3: Drop existing tables
        migrationProgress.update(0.2);
        terminal.yellow('🗑️  Dropping existing tables...\n');
        for (const tableName of existingTables) {
            dbManager.databaseInstance.exec(`DROP TABLE IF EXISTS ${tableName}`);
        }

        // Step 4: Create new schema and database
        migrationProgress.update(0.5);
        terminal.blue('🔨 Creating new database schema...\n');
        await createDatabaseSchema();
        await createDatabase();

        // Step 5: Attempt to merge back data from backup
        migrationProgress.update(0.7);
        terminal.cyan('🔄 Analyzing backup data for compatibility...\n');

        const newTables = dbManager.listTables();
        const mergeableData = await analyzeMergeableData(tempBackupPath, newTables);

        migrationProgress.update(0.9);

        if (mergeableData.compatibleTables.length > 0) {
            migrationProgress.stop();
            terminal('\n');
            terminal.green.bold(`📋 Found ${mergeableData.compatibleTables.length} compatible tables to merge:\n`);

            mergeableData.compatibleTables.forEach(table => {
                terminal.cyan(`   📊 ${table.name} `);
                terminal.green(`(${table.compatibleColumns}/${table.totalColumns} columns compatible)\n`);
            });

            const shouldMergeData = await promptForConfirmation(
                "\nProceed with merging compatible data?",
                true
            );

            if (shouldMergeData) {
                terminal('\n');
                const mergeProgress = terminal.progressBar({
                    width: 40,
                    title: 'Merging Data',
                    eta: true,
                    percent: true
                });

                await performSelectiveMerge(tempBackupPath, mergeableData.compatibleTables, conflictResolution);
                mergeProgress.update(1.0);
                mergeProgress.stop();

                // Show final statistics
                const finalStats = dbManager.getDatabaseStats();
                terminal('\n');
                terminal.green.bold(`📊 Final database: ${finalStats.tables} tables, ${finalStats.totalRecords} total records\n`);

                if (mergeableData.incompatibleTables.length > 0) {
                    terminal('\n');
                    terminal.yellow.bold('⚠️  The following tables had incompatible schemas and were not merged:\n');
                    mergeableData.incompatibleTables.forEach(table => {
                        terminal.red(`   ❌ ${table} `);
                        terminal.dim('(check backup for this data)\n');
                    });
                }
            } else {
                terminal.yellow('⏭️  Data merge skipped. Your backup contains the original data.\n');
            }
        } else {
            migrationProgress.stop();
            terminal('\n');
            terminal.yellow.bold('⚠️  No compatible tables found for automatic merging.\n');
            terminal.cyan('Your original data is preserved in the backup file.\n');
        }

        terminal('\n');
        terminal.green.bold('🎉 Database migration completed successfully!\n');

        if (permanentBackupPath) {
            terminal.cyan(`📁 Permanent backup saved: ${permanentBackupPath}\n`);
        }

        terminal.cyan(`📁 Temporary backup: ${tempBackupPath} `);
        terminal.dim('(you can delete this after verifying)\n');

    } catch (error) {
        terminal('\n');
        terminal.red.bold('❌ Migration failed! Attempting to restore from backup...\n');

        try {
            // Restore from backup on failure
            dbManager.restore(tempBackupPath);
            terminal.green('✅ Database restored from backup\n');
        } catch (restoreError) {
            terminal.red(`❌ Failed to restore from backup: ${restoreError}\n`);
            terminal.yellow(`Your backup is available at: ${tempBackupPath}\n`);
        }

        throw error;
    } finally {
        // Clean up temporary backup if not needed
        try {
            const fs = require('fs');
            if (!shouldKeepBackup && fs.existsSync(tempBackupPath)) {
                const shouldDeleteTemp = await promptForConfirmation(
                    `Delete temporary backup file ${tempBackupPath}?`,
                    false
                );
                if (shouldDeleteTemp) {
                    fs.unlinkSync(tempBackupPath);
                    terminal.green('🗑️  Temporary backup file deleted\n');
                }
            }
        } catch (error) {
            terminal.yellow(`⚠️  Could not clean up temporary backup file: ${error}\n`);
        }
    }
}

/**
 * Analyzes which tables can be merged between backup and new schema
 */
async function analyzeMergeableData(backupPath: string, newTables: string[]): Promise<{
    compatibleTables: Array<{ name: string; compatibleColumns: number; totalColumns: number; }>;
    incompatibleTables: string[];
}> {
    try {
        const fs = require('fs');
        const { Database: BunDB } = require('bun:sqlite');

        // Decompress and read backup
        const compressedData = fs.readFileSync(backupPath);
        const decompressed = Bun.gunzipSync(compressedData);
        const tempBackupPath = backupPath.replace('.gz', '.tmp');
        fs.writeFileSync(tempBackupPath, decompressed);

        const backupDb = new BunDB(tempBackupPath, { readonly: true });
        const { DatabaseManager } = await import("../database/class");
        const dbManager = new DatabaseManager();

        const compatibleTables: Array<{ name: string; compatibleColumns: number; totalColumns: number; }> = [];
        const incompatibleTables: string[] = [];

        try {
            // Get tables from backup
            const backupTables = backupDb.prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            ).all() as { name: string }[];

            for (const { name: tableName } of backupTables) {
                if (newTables.includes(tableName)) {
                    // Compare schemas
                    const backupSchema = backupDb.prepare(`PRAGMA table_info(${tableName})`).all();
                    const currentSchema = dbManager.databaseInstance.prepare(`PRAGMA table_info(${tableName})`).all();

                    const backupColumns = new Set(backupSchema.map((col: any) => col.name));
                    const currentColumns = new Set(currentSchema.map((col: any) => col.name));

                    // Find compatible columns (intersection)
                    const compatibleColumns = [...backupColumns].filter(col => currentColumns.has(col));

                    if (compatibleColumns.length > 0) {
                        compatibleTables.push({
                            name: tableName,
                            compatibleColumns: compatibleColumns.length,
                            totalColumns: backupColumns.size
                        });
                    } else {
                        incompatibleTables.push(tableName);
                    }
                } else {
                    incompatibleTables.push(tableName);
                }
            }
        } finally {
            backupDb.close();
            fs.unlinkSync(tempBackupPath);
        }

        return { compatibleTables, incompatibleTables };
    } catch (error) {
        console.warn("Could not analyze backup data:", error);
        return { compatibleTables: [], incompatibleTables: [] };
    }
}

/**
 * Performs selective merge of compatible tables
 */
async function performSelectiveMerge(
    backupPath: string,
    compatibleTables: Array<{ name: string; compatibleColumns: number; totalColumns: number; }>,
    conflictResolution: 'replace' | 'ignore' | 'fail'
): Promise<void> {
    try {
        const fs = require('fs');
        const { Database: BunDB } = require('bun:sqlite');
        const { DatabaseManager } = await import("../database/class");

        // Decompress backup
        const compressedData = fs.readFileSync(backupPath);
        const decompressed = Bun.gunzipSync(compressedData);
        const tempBackupPath = backupPath.replace('.gz', '.merge-tmp');
        fs.writeFileSync(tempBackupPath, decompressed);

        const dbManager = new DatabaseManager();

        try {
            // Attach backup database
            dbManager.databaseInstance.exec(`ATTACH DATABASE '${tempBackupPath}' AS backup_db`);

            for (const table of compatibleTables) {
                console.log(`🔄 Merging table: ${table.name}...`);

                // Get compatible columns for both databases
                const currentSchema = dbManager.databaseInstance.prepare(`PRAGMA table_info(${table.name})`).all();
                const backupSchema = dbManager.databaseInstance.prepare(`PRAGMA backup_db.table_info(${table.name})`).all();

                const currentColumns = new Set(currentSchema.map((col: any) => col.name));
                const backupColumns = new Set(backupSchema.map((col: any) => col.name));
                const compatibleColumns = [...backupColumns].filter(col => currentColumns.has(col));

                if (compatibleColumns.length > 0) {
                    const columnsList = compatibleColumns.join(', ');
                    const conflictAction = conflictResolution === 'replace' ? 'REPLACE' :
                        conflictResolution === 'ignore' ? 'IGNORE' : 'ABORT';

                    try {
                        const query = `INSERT OR ${conflictAction} INTO ${table.name} (${columnsList}) 
                                     SELECT ${columnsList} FROM backup_db.${table.name}`;
                        dbManager.databaseInstance.exec(query);

                        // Count merged records
                        const count = dbManager.databaseInstance.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get() as { count: number };
                        console.log(`   ✅ Merged ${table.name}: ${count.count} records`);

                        if (table.compatibleColumns < table.totalColumns) {
                            console.log(`   ⚠️  Note: ${table.totalColumns - table.compatibleColumns} columns were not compatible and were skipped`);
                        }
                    } catch (error) {
                        if (conflictResolution === 'fail') {
                            throw new Error(`Merge conflict in table ${table.name}: ${error}`);
                        }
                        console.warn(`   ⚠️  Warning: Some records in ${table.name} were skipped due to conflicts`);
                    }
                }
            }

        } finally {
            try {
                dbManager.databaseInstance.exec("DETACH DATABASE backup_db");
            } catch { }

            if (fs.existsSync(tempBackupPath)) {
                fs.unlinkSync(tempBackupPath);
            }
        }

    } catch (error) {
        throw new Error(`Selective merge failed: ${error}`);
    }
}

/**
 * Checks if the database file already exists
 */
function checkDatabaseExists(): Promise<boolean> {
    const dbPath = resolve(process.cwd(), "config", CONFIG.DATABASE_PATH);
    return Bun.file(dbPath).exists();
}

/**
 * Creates the database schema and type definitions
 */
async function createDatabaseSchema(): Promise<void> {
    if (await checkDatabaseExists()) {
        console.warn(
            `config/${CONFIG.DATABASE_PATH} already exists. The new Database Schema may not fit.\n`
        );
    }

    try {
        const schemaPath = resolve(process.cwd(), "config", CONFIG.DATABASE_SCHEMA_PATH);
        const schemaModule = (await import(schemaPath))?.default as DBSchema | undefined;

        if (!schemaModule) {
            throw new Error(`No default export found in ${CONFIG.DATABASE_SCHEMA_PATH}`);
        }

        const typeDefinitions = ConvertShemaToType(schemaModule);

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
    // Update export section

    const exportContent = `\nreturn {\n ${typeDefinitions.tables
        .map((table) => `${table}: new Table<_${table}, SELECT_${table}>({ name: "${table}" })`)
        .join(",\n ")} \n} as const;\n`;

    content = `"use client";
        ${importContent}
        import { Table } from "./class";

        export function Database() {
            ${exportContent}
        };
    `

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

/**
 * Prompts user for confirmation with beautiful terminal-kit UI
 */
async function promptForConfirmation(message: string, defaultValue: boolean = false): Promise<boolean> {
    terminal('\n');
    terminal.cyan(message);
    terminal(' ');

    if (defaultValue) {
        terminal.dim('(Y/n)');
    } else {
        terminal.dim('(y/N)');
    }

    terminal(' ');

    const result = await terminal.yesOrNo({
        yes: ['y', 'yes', 'Y', 'YES'],
        no: ['n', 'no', 'N', 'NO']
    }).promise;

    terminal('\n');
    return result ?? defaultValue;
}

/**
 * Prompts user to select conflict resolution strategy with beautiful terminal-kit UI
 */
async function promptForConflictResolution(): Promise<'replace' | 'ignore' | 'fail'> {
    terminal('\n');
    terminal.magenta.bold('🔧 Conflict Resolution Strategy\n');
    terminal.cyan('When merging data back after schema changes, conflicts may occur.\n');
    terminal.cyan('Choose how to handle records that conflict:\n\n');

    const items = [
        '🔄 Replace - Overwrite existing records with backup data (recommended for most cases)',
        '⏭️  Ignore - Keep new schema records, skip conflicting backup data',
        '🛑 Fail - Stop migration on first conflict (safest, but may require manual intervention)'
    ];

    const result = await terminal.singleColumnMenu(items, {
        selectedIndex: 0,
        style: terminal.cyan,
        selectedStyle: terminal.green.bold,
        cancelable: false,
        exitOnUnexpectedKey: false
    }).promise;

    const strategies: ('replace' | 'ignore' | 'fail')[] = ['replace', 'ignore', 'fail'];
    const selectedStrategy = strategies[result.selectedIndex];

    terminal('\n');
    terminal.green(`📝 Selected: ${items[result.selectedIndex]}\n`);

    return selectedStrategy;
}

/**
 * Prompts user to select which tables to merge with interactive terminal-kit UI
 */
async function promptForTableSelection(sourcePath: string): Promise<string[]> {
    try {
        // Create a temporary connection to the source database to list tables
        const tempDb = new (await import("bun:sqlite")).Database(sourcePath, { readonly: true });
        const tables = tempDb.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).all() as { name: string }[];
        tempDb.close();

        if (tables.length === 0) {
            terminal.yellow('\n⚠️  No user tables found in source database.\n');
            return [];
        }

        terminal('\n');
        terminal.magenta.bold('📋 Table Selection\n');
        terminal.cyan('Available tables in source database:\n\n');

        const menuItems = [
            '✅ All tables (merge everything)',
            ...tables.map(table => `📊 ${table.name}`)
        ];

        const result = await terminal.singleColumnMenu(menuItems, {
            style: terminal.cyan,
            selectedStyle: terminal.green.bold,
            cancelable: false,
            exitOnUnexpectedKey: false,
            leftPadding: '  '
        }).promise;

        if (result.selectedIndex === 0) {
            terminal.green('\n📝 Selected: All tables\n');
            return tables.map(t => t.name);
        } else {
            const selectedTable = tables[result.selectedIndex - 1];
            terminal.green(`\n📝 Selected: ${selectedTable.name}\n`);
            return [selectedTable.name];
        }

    } catch (error) {
        terminal.red(`\n❌ Could not list tables from source database: ${error}\n`);
        return [];
    }
}

/**
 * Formats bytes to human readable format
 */
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}