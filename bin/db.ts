import { ConvertShemaToType, type DBSchema } from "../database/schema";
import { paths } from "../internal/globals";
import { resolve } from "node:path";
import { CONFIG } from "./globals";



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
 */
export async function handleDatabaseCreate(): Promise<void> {
    try {
        await createDatabaseSchema();
        await createDatabase();
        console.log("Database and schema created successfully");
    } catch (error) {
        throw new Error(`Database creation failed: ${error}`);
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

/**
 * Prompts user for confirmation with y/N input
 */
async function promptForConfirmation(message: string): Promise<boolean> {
    process.stdout.write(message);

    for await (const line of console) {
        const input = line.toString().trim().toLowerCase();
        if (input === 'y' || input === 'yes') {
            return true;
        } else if (input === 'n' || input === 'no' || input === '') {
            return false;
        } else {
            process.stdout.write("Please enter 'y' for yes or 'n' for no: ");
        }
    }

    return false;
}

/**
 * Prompts user to select conflict resolution strategy
 */
async function promptForConflictResolution(): Promise<'replace' | 'ignore' | 'fail'> {
    console.log("\nConflict Resolution Strategy:");
    console.log("1. replace - Overwrite existing records with new data");
    console.log("2. ignore  - Keep existing records, skip conflicting new data");
    console.log("3. fail    - Stop merge operation on first conflict");

    process.stdout.write("Choose strategy (1-3) [default: 2]: ");

    for await (const line of console) {
        const input = line.toString().trim();

        switch (input) {
            case '1':
                return 'replace';
            case '2':
            case '':
                return 'ignore';
            case '3':
                return 'fail';
            default:
                process.stdout.write("Please enter 1, 2, or 3: ");
        }
    }

    return 'ignore'; // Default fallback
}

/**
 * Prompts user to select which tables to merge from the source database
 */
async function promptForTableSelection(sourcePath: string): Promise<string[]> {
    try {
        // Get list of tables from source database
        const { DatabaseManager } = await import("../database/class");

        // Create a temporary connection to the source database to list tables
        const tempDb = new (await import("bun:sqlite")).Database(sourcePath, { readonly: true });
        const tables = tempDb.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).all() as { name: string }[];
        tempDb.close();

        if (tables.length === 0) {
            console.log("No user tables found in source database.");
            return [];
        }

        console.log("\nAvailable tables in source database:");
        tables.forEach((table, index) => {
            console.log(`${index + 1}. ${table.name}`);
        });

        console.log("\nEnter table numbers to merge (comma-separated), or 'all' for all tables:");
        process.stdout.write("Tables to merge [all]: ");

        for await (const line of console) {
            const input = line.toString().trim();

            if (input === '' || input.toLowerCase() === 'all') {
                return tables.map(t => t.name);
            }

            try {
                const selectedIndices = input.split(',').map(s => parseInt(s.trim()) - 1);
                const invalidIndices = selectedIndices.filter(i => i < 0 || i >= tables.length);

                if (invalidIndices.length > 0) {
                    process.stdout.write(`Invalid table numbers. Please enter numbers 1-${tables.length}: `);
                    continue;
                }

                const selectedTables = selectedIndices.map(i => tables[i].name);
                console.log(`Selected tables: ${selectedTables.join(', ')}`);
                return selectedTables;

            } catch (error) {
                process.stdout.write("Invalid input. Please enter comma-separated numbers or 'all': ");
            }
        }

        return tables.map(t => t.name); // Default fallback
    } catch (error) {
        console.warn(`Could not list tables from source database: ${error}`);
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