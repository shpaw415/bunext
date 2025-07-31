import { Database as _BunDB } from "bun:sqlite";
import type { _DataType, DBSchema, TableSchema, ColumnsSchema } from "./schema";
import { resolve } from "node:path";

// Global type declarations
declare global {
  var dbSchema: DBSchema;
  var MainDatabase: _BunDB;
}

// Constants
const DEFAULT_DB_PATH = "./config/bunext.sqlite";
const DEFAULT_CONFIG_PATH = `${process.cwd()}/config/database.ts`;

/**
 * Type-safe connection pool for managing database instances and prepared statements
 */
class TypeSafeConnectionPool {
  private static instances: Map<string, _BunDB> = new Map();
  private static preparedStatements: Map<string, ReturnType<_BunDB['prepare']>> = new Map();
  private static queryCache: Map<string, unknown[]> = new Map();
  private static cacheMaxSize = 1000;

  static getConnection(dbPath: string): _BunDB {
    if (!this.instances.has(dbPath)) {
      const db = new _BunDB(dbPath, { create: true, strict: true });

      // Optimize SQLite settings for performance
      db.exec("PRAGMA journal_mode = WAL;");
      db.exec("PRAGMA foreign_keys = ON;");
      db.exec("PRAGMA synchronous = NORMAL;");
      db.exec("PRAGMA cache_size = -64000;"); // 64MB cache
      db.exec("PRAGMA temp_store = MEMORY;");
      db.exec("PRAGMA mmap_size = 268435456;"); // 256MB mmap

      this.instances.set(dbPath, db);
    }
    return this.instances.get(dbPath)!;
  }

  static getPreparedStatement(key: string, query: string, db: _BunDB): ReturnType<_BunDB['prepare']> {
    if (!this.preparedStatements.has(key)) {
      this.preparedStatements.set(key, db.prepare(query));
    }
    return this.preparedStatements.get(key)!;
  }

  static getCachedQuery<T = unknown[]>(key: string): T | undefined {
    return this.queryCache.get(key) as T | undefined;
  }

  static setCachedQuery<T = unknown[]>(key: string, result: T): void {
    if (this.queryCache.size >= this.cacheMaxSize) {
      // Remove oldest entry
      const firstKey = this.queryCache.keys().next().value;
      if (firstKey) {
        this.queryCache.delete(firstKey);
      }
    }
    this.queryCache.set(key, result as unknown[]);
  }

  static clearCache(): void {
    this.queryCache.clear();
  }

  static closeAll(): void {
    for (const stmt of this.preparedStatements.values()) {
      stmt.finalize();
    }
    for (const db of this.instances.values()) {
      db.close();
    }
    this.instances.clear();
    this.preparedStatements.clear();
    this.queryCache.clear();
  }
}

/**
 * Initialize global database schema and instance with proper error handling
 */
async function initializeGlobalDatabase(): Promise<void> {
  try {
    if (!globalThis.dbSchema) {
      const configModule = await import(DEFAULT_CONFIG_PATH);
      globalThis.dbSchema = configModule.default;
    }

    if (!globalThis.MainDatabase) {
      globalThis.MainDatabase = new _BunDB(DEFAULT_DB_PATH, {
        create: true,
        strict: true,
      });

      // Enable WAL mode for better performance and concurrency
      globalThis.MainDatabase.exec("PRAGMA journal_mode = WAL;");
      globalThis.MainDatabase.exec("PRAGMA foreign_keys = ON;");
      globalThis.MainDatabase.exec("PRAGMA synchronous = NORMAL;");
    }
  } catch (error) {
    console.warn("Failed to initialize global database:", error);
  }
}

// Initialize on module load
initializeGlobalDatabase();

/**
 * Database utility class for creating tables
 */
export class DatabaseManager {
  public databaseInstance: _BunDB;

  constructor(db?: _BunDB) {
    this.databaseInstance = db || globalThis.MainDatabase;

    if (!this.databaseInstance) {
      throw new Error("Database instance is not available. Please ensure the database is properly initialized.");
    }
  }

  /**
   * Creates tables from the provided schema with automatic type mapping and constraints
   * Supports both single table and batch table creation with proper error handling
   * 
   * @param schema - Single table schema or array of table schemas
   * 
   * @example
   * ```typescript
   * // Create a single table
   * const dbManager = new DatabaseManager();
   * dbManager.create({
   *   name: 'users',
   *   columns: [
   *     { name: 'id', type: 'number', primary: true, autoIncrement: true },
   *     { name: 'name', type: 'string', nullable: false },
   *     { name: 'email', type: 'string', unique: true }
   *   ]
   * });
   * 
   * // Create multiple tables at once
   * dbManager.create([
   *   { name: 'users', columns: [...] },
   *   { name: 'posts', columns: [...] }
   * ]);
   * ```
   */
  create(schema: TableSchema | TableSchema[]): void {
    const schemas = Array.isArray(schema) ? schema : [schema];

    for (const tableSchema of schemas) {
      this.createTable(tableSchema);
    }
  }

  /**
   * Creates a single table based on the provided schema with full validation
   * Automatically maps TypeScript types to SQLite types and applies constraints
   * 
   * @param tableSchema - Complete schema definition for the table including columns and constraints
   * 
   * @example
   * ```typescript
   * const dbManager = new DatabaseManager();
   * dbManager.createTable({
   *   name: 'products',
   *   columns: [
   *     { name: 'id', type: 'number', primary: true, autoIncrement: true },
   *     { name: 'name', type: 'string', nullable: false },
   *     { name: 'price', type: 'float', default: 0.0 },
   *     { name: 'isActive', type: 'boolean', default: true },
   *     { name: 'metadata', type: 'json', nullable: true },
   *     { name: 'createdAt', type: 'Date', default: Date.now() }
   *   ]
   * });
   * ```
   * 
   * @throws {Error} When table name is empty, no columns provided, no primary key, or duplicate column names
   */
  createTable(tableSchema: TableSchema): void {
    this.validateTableSchema(tableSchema);

    const queryString = this.buildCreateTableQuery(tableSchema);

    try {
      const query = this.databaseInstance.query(queryString);
      query.run();
      query.finalize();
    } catch (error) {
      throw new Error(`Failed to create table '${tableSchema.name}': ${error}`);
    }
  }

  /**
   * Validates the table schema before creation
   */
  private validateTableSchema(schema: TableSchema): void {
    if (!schema.name || schema.name.trim() === '') {
      throw new Error("Table name cannot be empty");
    }

    if (!schema.columns || schema.columns.length === 0) {
      throw new Error("Table must have at least one column");
    }

    const hasPrimaryKey = schema.columns.some(column => column.primary);
    if (!hasPrimaryKey) {
      throw new Error(`Table '${schema.name}' must have at least one primary key column`);
    }

    // Validate column names are unique
    const columnNames = schema.columns.map(col => col.name);
    const uniqueNames = new Set(columnNames);
    if (columnNames.length !== uniqueNames.size) {
      throw new Error(`Table '${schema.name}' has duplicate column names`);
    }
  }

  /**
   * Builds the CREATE TABLE SQL query string
   */
  private buildCreateTableQuery(schema: TableSchema): string {
    const columns = schema.columns.map(column => this.buildColumnDefinition(column));
    return `CREATE TABLE IF NOT EXISTS ${schema.name} (${columns.join(", ")})`;
  }

  /**
   * Builds individual column definition
   */
  private buildColumnDefinition(column: ColumnsSchema): string {
    const dataType = this.getSQLiteDataType(column);
    const constraints = this.buildColumnConstraints(column);

    return `${column.name} ${dataType}${constraints}`;
  }

  /**
   * Maps schema types to SQLite data types
   */
  private getSQLiteDataType(column: ColumnsSchema): string {
    switch (column.type) {
      case "number":
        return "INTEGER";
      case "float":
        return "REAL";
      case "Date":
      case "boolean":
        return "INTEGER";
      case "string":
      case "json":
        return "TEXT";
      default:
        throw new Error(`Unsupported column type: ${(column as any).type}`);
    }
  }

  /**
   * Builds column constraints (PRIMARY KEY, NOT NULL, etc.)
   */
  private buildColumnConstraints(column: ColumnsSchema): string {
    const constraints: string[] = [];

    if (column.primary) {
      constraints.push("PRIMARY KEY");
    }

    if (column.type === "number" && column.autoIncrement) {
      constraints.push("AUTOINCREMENT");
    }

    if (!column.nullable && !column.primary) {
      constraints.push("NOT NULL");
    }

    if (column.unique && !column.primary) {
      constraints.push("UNIQUE");
    }

    if (column.default !== undefined) {
      const defaultValue = this.formatDefaultValue(column.default, column.type);
      constraints.push(`DEFAULT ${defaultValue}`);
    }

    return constraints.length > 0 ? ` ${constraints.join(" ")}` : "";
  }

  /**
   * Formats default values for SQL
   */
  private formatDefaultValue(defaultValue: any, type: ColumnsSchema["type"]): string {
    if (defaultValue === null) {
      return "NULL";
    }

    switch (type) {
      case "string":
      case "json":
        if (typeof defaultValue === "object") {
          return `'${JSON.stringify(defaultValue)}'`;
        }
        return `'${String(defaultValue)}'`;

      case "boolean":
        return defaultValue ? "1" : "0";

      case "Date":
        if (defaultValue instanceof Date) {
          return String(defaultValue.getTime());
        }
        return String(defaultValue);

      case "number":
      case "float":
        return String(defaultValue);

      default:
        return `'${String(defaultValue)}'`;
    }
  }

  /**
   * Creates a complete database backup with optional compression and data filtering
   * Supports both full database backups and schema-only exports
   * Uses SQLite's VACUUM INTO for efficient full database copying
   * 
   * @param backupPath - File path where the backup will be saved (automatically adds .gz for compressed backups)
   * @param options - Backup configuration options
   * @param options.compress - Enable gzip compression for smaller backup files (default: false)
   * @param options.includeData - Include table data or schema only (default: true)
   * 
   * @example
   * ```typescript
   * const dbManager = new DatabaseManager();
   * 
   * // Full database backup with compression
   * dbManager.backup('./backups/database-full.db', { 
   *   compress: true, 
   *   includeData: true 
   * });
   * 
   * // Schema-only backup (no data)
   * dbManager.backup('./backups/schema-only.json', { 
   *   compress: false, 
   *   includeData: false 
   * });
   * 
   * // Compressed schema backup
   * dbManager.backup('./backups/schema.json.gz', { 
   *   compress: true, 
   *   includeData: false 
   * });
   * ```
   * 
   * @throws {Error} When backup operation fails due to file system issues or database lock
   */
  backup(backupPath: string, options: { compress?: boolean; includeData?: boolean } = {}): void {
    const { compress = false, includeData = true } = options;

    try {
      let finalBackupPath = backupPath;

      if (includeData) {
        // For compressed backups, we need to create a temporary file first
        let tempPath: string;
        if (compress) {
          // Create a unique temporary file path
          const timestamp = Date.now();
          tempPath = `${backupPath}.${timestamp}.tmp`;
        } else {
          tempPath = backupPath;
        }

        // Full database backup using SQLite's VACUUM INTO
        this.databaseInstance.exec(`VACUUM INTO '${tempPath}'`);

        if (compress) {
          // Compress the backup file
          const fs = require('fs');

          const data = fs.readFileSync(tempPath);
          const compressed = Bun.gzipSync(data);

          // Ensure the backup path has .gz extension
          finalBackupPath = backupPath.endsWith('.gz') ? backupPath : `${backupPath}.gz`;
          fs.writeFileSync(finalBackupPath, compressed);

          // Clean up temporary file
          fs.unlinkSync(tempPath);
        }
      } else {
        // Schema-only backup
        const schema = this.exportSchema();
        const fs = require('fs');
        const schemaJson = JSON.stringify(schema, null, 2);

        if (compress) {
          const compressed = Bun.gzipSync(Buffer.from(schemaJson, 'utf8'));
          finalBackupPath = backupPath.endsWith('.gz') ? backupPath : `${backupPath}.gz`;
          fs.writeFileSync(finalBackupPath, compressed);
        } else {
          fs.writeFileSync(backupPath, schemaJson);
        }
      }

      console.log(`Database backup created: ${finalBackupPath}${compress ? ' (compressed)' : ''}`);
    } catch (error) {
      throw new Error(`Failed to create backup: ${error}`);
    }
  }

  /**
   * Restores database from a backup file with automatic compression detection
   * Supports both SQLite database files and JSON schema files
   * Automatically detects and handles compressed (.gz) backup files
   * 
   * @param backupPath - Path to the backup file (supports .db, .sqlite, .json, and their .gz variants)
   * @param options - Restore configuration options
   * @param options.dropExisting - Whether to drop all existing tables before restore (default: false)
   * 
   * @example
   * ```typescript
   * const dbManager = new DatabaseManager();
   * 
   * // Restore from compressed database backup
   * dbManager.restore('./backups/database.db.gz');
   * 
   * // Restore with dropping existing tables first
   * dbManager.restore('./backups/database.db', { 
   *   dropExisting: true 
   * });
   * 
   * // Restore schema from JSON
   * dbManager.restore('./backups/schema.json');
   * 
   * // Restore from compressed JSON schema
   * dbManager.restore('./backups/schema.json.gz');
   * ```
   * 
   * @throws {Error} When backup file doesn't exist, is corrupted, or restore operation fails
   */
  restore(backupPath: string, options: { dropExisting?: boolean } = {}): void {
    const { dropExisting = false } = options;

    try {
      const fs = require('fs');

      if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup file not found: ${backupPath}`);
      }

      if (dropExisting) {
        // Get all table names and drop them
        const tables = this.listTables();
        for (const table of tables) {
          this.databaseInstance.exec(`DROP TABLE IF EXISTS ${table}`);
        }
      }

      // Check if file is compressed
      const isCompressed = backupPath.endsWith('.gz');
      let fileData: Buffer;

      if (isCompressed) {
        // Decompress the file
        const compressedData = fs.readFileSync(backupPath);
        const decompressed = Bun.gunzipSync(compressedData);
        fileData = Buffer.from(decompressed);
      } else {
        fileData = fs.readFileSync(backupPath);
      }

      // Check if it's a JSON schema or SQLite database
      const isJsonSchema = backupPath.includes('.json') ||
        (isCompressed && backupPath.replace('.gz', '').endsWith('.json'));

      if (isJsonSchema) {
        // Restore from JSON schema
        const schemaData = JSON.parse(fileData.toString('utf8'));
        this.importSchema(schemaData);
      } else {
        // For SQLite backup files, we need to write to a temporary file if it was compressed
        let tempDbPath: string | null = null;
        let dbPathToUse: string;

        if (isCompressed) {
          // Write decompressed data to temporary file
          tempDbPath = backupPath.replace('.gz', '.tmp');
          fs.writeFileSync(tempDbPath, fileData);
          dbPathToUse = tempDbPath;
        } else {
          dbPathToUse = backupPath;
        }

        try {
          const { Database: BunDB } = require('bun:sqlite');
          const backupDb = new BunDB(dbPathToUse, { readonly: true });

          try {
            // Get tables from backup
            const backupTables = backupDb.prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            ).all() as { name: string }[];

            // Restore each table
            for (const { name } of backupTables) {
              // Get table schema from backup
              const tableInfo = backupDb.prepare(`PRAGMA table_info(${name})`).all();

              // Create table if it doesn't exist
              const columnDefs = tableInfo.map((col: any) => {
                let def = `${col.name} ${col.type}`;
                if (col.pk) def += " PRIMARY KEY";
                if (col.notnull && !col.pk) def += " NOT NULL";
                if (col.dflt_value !== null) def += ` DEFAULT ${col.dflt_value}`;
                return def;
              }).join(", ");

              this.databaseInstance.exec(`CREATE TABLE IF NOT EXISTS ${name} (${columnDefs})`);

              // Copy data
              const data = backupDb.prepare(`SELECT * FROM ${name}`).all();
              if (data.length > 0) {
                const columns = Object.keys(data[0]);
                const placeholders = columns.map(() => '?').join(', ');
                const insertQuery = `INSERT OR REPLACE INTO ${name} (${columns.join(', ')}) VALUES (${placeholders})`;
                const insertStmt = this.databaseInstance.prepare(insertQuery);

                for (const row of data) {
                  insertStmt.run(...Object.values(row) as any[]);
                }
                insertStmt.finalize();
              }
            }
          } finally {
            backupDb.close();
          }
        } finally {
          // Clean up temporary file if it was created
          if (tempDbPath && fs.existsSync(tempDbPath)) {
            fs.unlinkSync(tempDbPath);
          }
        }
      }

      console.log(`Database restored from: ${backupPath}${isCompressed ? ' (decompressed)' : ''}`);
    } catch (error) {
      throw new Error(`Failed to restore database: ${error}`);
    }
  }

  /**
   * Merges data from another SQLite database into the current database
   * Provides flexible conflict resolution strategies and selective table merging
   * Uses SQLite's ATTACH DATABASE for efficient cross-database operations
   * 
   * @param sourcePath - Path to the source SQLite database file to merge from
   * @param options - Merge configuration options
   * @param options.conflictResolution - How to handle conflicting records ('replace' | 'ignore' | 'fail')
   * @param options.tablesFilter - Array of table names to merge (if not provided, merges all tables)
   * @param options.onConflict - Custom conflict resolution callback for advanced scenarios
   * 
   * @example
   * ```typescript
   * const dbManager = new DatabaseManager();
   * 
   * // Basic merge with replace on conflict
   * dbManager.mergeDatabase('./source.db', {
   *   conflictResolution: 'replace'
   * });
   * 
   * // Selective table merge with ignore on conflict
   * dbManager.mergeDatabase('./source.db', {
   *   conflictResolution: 'ignore',
   *   tablesFilter: ['users', 'products']
   * });
   * 
   * // Merge with custom conflict resolution
   * dbManager.mergeDatabase('./source.db', {
   *   conflictResolution: 'replace',
   *   onConflict: (tableName, existing, newRecord) => {
   *     if (tableName === 'users') {
   *       return existing.updatedAt > newRecord.updatedAt ? 'keep_existing' : 'use_new';
   *     }
   *     return 'use_new';
   *   }
   * });
   * ```
   * 
   * @throws {Error} When source database doesn't exist, attachment fails, or merge conflicts occur (in 'fail' mode)
   */
  mergeDatabase(sourcePath: string, options: {
    conflictResolution?: 'replace' | 'ignore' | 'fail';
    tablesFilter?: string[];
    onConflict?: (tableName: string, existingRecord: any, newRecord: any) => 'keep_existing' | 'use_new' | 'merge';
  } = {}): void {
    const { conflictResolution = 'replace', tablesFilter } = options;

    try {
      const fs = require('fs');

      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Source database not found: ${sourcePath}`);
      }

      // Attach source database
      this.databaseInstance.exec(`ATTACH DATABASE '${sourcePath}' AS source_db`);

      // Get tables from source database
      const sourceTables = this.databaseInstance.prepare(
        "SELECT name FROM source_db.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      ).all() as { name: string }[];

      const tablesToMerge = tablesFilter
        ? sourceTables.filter(table => tablesFilter.includes(table.name))
        : sourceTables;

      for (const { name: tableName } of tablesToMerge) {
        console.log(`Merging table: ${tableName}`);

        // Check if table exists in current database
        const tableExists = this.databaseInstance.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
        ).get(tableName);

        if (!tableExists) {
          // Table doesn't exist, copy it entirely
          this.databaseInstance.exec(`CREATE TABLE ${tableName} AS SELECT * FROM source_db.${tableName}`);
          console.log(`Created new table: ${tableName}`);
        } else {
          // Table exists, merge data based on conflict resolution
          const conflictAction = conflictResolution === 'replace' ? 'REPLACE' :
            conflictResolution === 'ignore' ? 'IGNORE' : 'ABORT';

          try {
            this.databaseInstance.exec(
              `INSERT OR ${conflictAction} INTO ${tableName} SELECT * FROM source_db.${tableName}`
            );
            console.log(`Merged data into existing table: ${tableName}`);
          } catch (error) {
            if (conflictResolution === 'fail') {
              throw new Error(`Conflict in table ${tableName}: ${error}`);
            }
            console.warn(`Warning: Some records in ${tableName} were skipped due to conflicts`);
          }
        }
      }

      this.databaseInstance.exec("DETACH DATABASE source_db");
      console.log("Database merge completed successfully");
    } catch (error) {
      // Ensure detachment in case of error
      try {
        this.databaseInstance.exec("DETACH DATABASE source_db");
      } catch { }
      throw new Error(`Failed to merge database: ${error}`);
    }
  }

  /**
   * Exports the complete database schema as a structured JSON object
   * Includes table definitions, column information, indexes, and metadata
   * Useful for documentation, version control, and schema migration
   * 
   * @returns A comprehensive schema object with version info and table definitions
   * 
   * @example
   * ```typescript
   * const dbManager = new DatabaseManager();
   * const schema = dbManager.exportSchema();
   * 
   * console.log(schema);
   * // Output:
   * // {
   * //   version: "1.0",
   * //   created: "2025-07-29T20:30:00.000Z",
   * //   tables: [
   * //     {
   * //       name: "users",
   * //       columns: [
   * //         { cid: 0, name: "id", type: "INTEGER", notnull: 1, dflt_value: null, pk: 1 },
   * //         { cid: 1, name: "name", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 }
   * //       ],
   * //       indexes: [...]
   * //     }
   * //   ]
   * // }
   * 
   * // Save schema to file
   * const fs = require('fs');
   * fs.writeFileSync('schema.json', JSON.stringify(schema, null, 2));
   * ```
   */
  exportSchema(): any {
    const tables = this.databaseInstance.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all() as { name: string }[];

    const schema: any = {
      version: "1.0",
      created: new Date().toISOString(),
      tables: []
    };

    for (const { name } of tables) {
      const tableInfo = this.databaseInstance.prepare(`PRAGMA table_info(${name})`).all();
      const indexes = this.databaseInstance.prepare(
        "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name = ?"
      ).all(name);

      schema.tables.push({
        name,
        columns: tableInfo,
        indexes: indexes
      });
    }

    return schema;
  }

  /**
   * Imports and recreates database schema from a JSON schema object
   * Validates schema format and creates tables with proper indexes
   * Useful for database initialization and migration from schema exports
   * 
   * @param schemaData - Schema object in the format returned by exportSchema()
   * 
   * @example
   * ```typescript
   * const dbManager = new DatabaseManager();
   * 
   * // Import from exported schema
   * const schema = {
   *   version: "1.0",
   *   created: "2025-07-29T20:30:00.000Z",
   *   tables: [
   *     {
   *       name: "users",
   *       columns: [
   *         { cid: 0, name: "id", type: "INTEGER", notnull: 1, dflt_value: null, pk: 1 },
   *         { cid: 1, name: "name", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 }
   *       ],
   *       indexes: []
   *     }
   *   ]
   * };
   * 
   * dbManager.importSchema(schema);
   * 
   * // Import from JSON file
   * const fs = require('fs');
   * const schemaFromFile = JSON.parse(fs.readFileSync('schema.json', 'utf8'));
   * dbManager.importSchema(schemaFromFile);
   * ```
   * 
   * @throws {Error} When schema format is invalid or table creation fails
   */
  importSchema(schemaData: any): void {
    if (!schemaData.tables || !Array.isArray(schemaData.tables)) {
      throw new Error("Invalid schema format");
    }

    for (const table of schemaData.tables) {
      // Create table from column definitions
      const columnDefs = table.columns.map((col: any) => {
        let def = `${col.name} ${col.type}`;
        if (col.pk) def += " PRIMARY KEY";
        if (col.notnull && !col.pk) def += " NOT NULL";
        if (col.dflt_value !== null) def += ` DEFAULT ${col.dflt_value}`;
        return def;
      }).join(", ");

      this.databaseInstance.exec(`CREATE TABLE IF NOT EXISTS ${table.name} (${columnDefs})`);

      // Create indexes
      if (table.indexes) {
        for (const index of table.indexes) {
          if (index.sql) {
            this.databaseInstance.exec(index.sql);
          }
        }
      }
    }
  }

  /**
   * Retrieves comprehensive database statistics and health information
   * Provides insights into database size, record counts, and structure
   * Useful for monitoring, optimization, and capacity planning
   * 
   * @returns Detailed statistics object with table-level and database-level metrics
   * 
   * @example
   * ```typescript
   * const dbManager = new DatabaseManager();
   * const stats = dbManager.getDatabaseStats();
   * 
   * console.log(`Database has ${stats.tables} tables with ${stats.totalRecords} total records`);
   * console.log(`Database size: ${stats.databaseSize} bytes`);
   * console.log(`Total indexes: ${stats.indexes}`);
   * 
   * // Per-table statistics
   * stats.tableStats.forEach(table => {
   *   console.log(`${table.name}: ${table.records} records, ${table.size} bytes`);
   * });
   * 
   * // Output example:
   * // Database has 3 tables with 1500 total records
   * // Database size: 65536 bytes
   * // Total indexes: 5
   * // users: 100 records, 8192 bytes
   * // products: 500 records, 32768 bytes
   * // orders: 900 records, 24576 bytes
   * ```
   */
  getDatabaseStats(): {
    tables: number;
    totalRecords: number;
    databaseSize: number;
    tableStats: Array<{ name: string; records: number; size: number }>;
    indexes: number;
    lastVacuum?: Date;
  } {
    const tables = this.listTables();
    const tableStats: Array<{ name: string; records: number; size: number }> = [];
    let totalRecords = 0;

    for (const tableName of tables) {
      const countResult = this.databaseInstance.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as { count: number };
      const sizeResult = this.databaseInstance.prepare(
        `SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()`
      ).get() as { size: number };

      tableStats.push({
        name: tableName,
        records: countResult.count,
        size: sizeResult.size || 0
      });
      totalRecords += countResult.count;
    }

    const indexCount = this.databaseInstance.prepare(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
    ).get() as { count: number };

    return {
      tables: tables.length,
      totalRecords,
      databaseSize: tableStats.reduce((sum, table) => sum + table.size, 0),
      tableStats,
      indexes: indexCount.count
    };
  }

  /**
   * Optimizes database performance through various SQLite maintenance operations
   * Improves query performance, reduces file size, and updates query statistics
   * Should be run periodically for optimal database performance
   * 
   * @param options - Optimization configuration options
   * @param options.vacuum - Rebuild database to reclaim space and defragment (default: true)
   * @param options.analyze - Update table statistics for better query planning (default: true)
   * @param options.reindex - Rebuild all indexes for consistency (default: false)
   * 
   * @example
   * ```typescript
   * const dbManager = new DatabaseManager();
   * 
   * // Full optimization (recommended for maintenance)
   * dbManager.optimize({
   *   vacuum: true,
   *   analyze: true,
   *   reindex: true
   * });
   * 
   * // Quick optimization (just update statistics)
   * dbManager.optimize({
   *   vacuum: false,
   *   analyze: true,
   *   reindex: false
   * });
   * 
   * // Default optimization
   * dbManager.optimize(); // Runs VACUUM and ANALYZE
   * ```
   * 
   * @note VACUUM can be time-consuming on large databases and requires free disk space equal to database size
   */
  optimize(options: { vacuum?: boolean; analyze?: boolean; reindex?: boolean } = {}): void {
    const { vacuum = true, analyze = true, reindex = false } = options;

    console.log("Starting database optimization...");

    if (vacuum) {
      console.log("Running VACUUM...");
      this.databaseInstance.exec("VACUUM;");
    }

    if (analyze) {
      console.log("Running ANALYZE...");
      this.databaseInstance.exec("ANALYZE;");
    }

    if (reindex) {
      console.log("Reindexing...");
      this.databaseInstance.exec("REINDEX;");
    }

    console.log("Database optimization completed");
  }

  /**
   * Retrieves a list of all user-defined tables in the database
   * Excludes SQLite system tables (those starting with 'sqlite_')
   * Useful for database introspection and dynamic operations
   * 
   * @returns Array of table names as strings
   * 
   * @example
   * ```typescript
   * const dbManager = new DatabaseManager();
   * const tables = dbManager.listTables();
   * 
   * console.log('Available tables:', tables);
   * // Output: ['users', 'products', 'orders', 'categories']
   * 
   * // Iterate through tables
   * tables.forEach(tableName => {
   *   const info = dbManager.getTableInfo(tableName);
   *   console.log(`${tableName} has ${info.columns.length} columns`);
   * });
   * ```
   */
  listTables(): string[] {
    const result = this.databaseInstance.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all() as { name: string }[];
    return result.map(row => row.name);
  }

  /**
   * Retrieves comprehensive information about a specific table
   * Includes column definitions, indexes, foreign keys, and triggers
   * Essential for database introspection and schema analysis
   * 
   * @param tableName - Name of the table to inspect
   * @returns Object containing complete table metadata
   * 
   * @example
   * ```typescript
   * const dbManager = new DatabaseManager();
   * const tableInfo = dbManager.getTableInfo('users');
   * 
   * console.log('Columns:', tableInfo.columns);
   * // Output: [
   * //   { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 },
   * //   { cid: 1, name: 'name', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
   * //   { cid: 2, name: 'email', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 }
   * // ]
   * 
   * console.log('Indexes:', tableInfo.indexes);
   * console.log('Foreign Keys:', tableInfo.foreignKeys);
   * console.log('Triggers:', tableInfo.triggers);
   * 
   * // Check if table has specific column
   * const hasEmailColumn = tableInfo.columns.some(col => col.name === 'email');
   * ```
   */
  getTableInfo(tableName: string): {
    columns: any[];
    indexes: any[];
    foreignKeys: any[];
    triggers: any[];
  } {
    const columns = this.databaseInstance.prepare(`PRAGMA table_info(${tableName})`).all();
    const indexes = this.databaseInstance.prepare(`PRAGMA index_list(${tableName})`).all();
    const foreignKeys = this.databaseInstance.prepare(`PRAGMA foreign_key_list(${tableName})`).all();
    const triggers = this.databaseInstance.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name = ?"
    ).all(tableName);

    return { columns, indexes, foreignKeys, triggers };
  }

  /**
   * Executes multiple SQL statements within a single transaction
   * Ensures atomicity - either all statements succeed or all are rolled back
   * Provides better performance for bulk operations and data consistency
   * 
   * @param statements - Array of SQL statements to execute in sequence
   * 
   * @example
   * ```typescript
   * const dbManager = new DatabaseManager();
   * 
   * // Execute multiple related operations atomically
   * dbManager.executeTransaction([
   *   "INSERT INTO users (name, email) VALUES ('John', 'john@example.com')",
   *   "INSERT INTO profiles (user_id, bio) VALUES (1, 'Software developer')",
   *   "UPDATE users SET status = 'active' WHERE id = 1"
   * ]);
   * 
   * // Complex data migration
   * const migrationStatements = [
   *   "ALTER TABLE users ADD COLUMN created_at INTEGER",
   *   "UPDATE users SET created_at = strftime('%s', 'now') WHERE created_at IS NULL",
   *   "CREATE INDEX idx_users_created_at ON users(created_at)"
   * ];
   * dbManager.executeTransaction(migrationStatements);
   * ```
   * 
   * @throws {Error} When any statement in the transaction fails, causing complete rollback
   */
  executeTransaction(statements: string[]): void {
    const transaction = this.databaseInstance.transaction(() => {
      for (const statement of statements) {
        this.databaseInstance.exec(statement);
      }
    });

    try {
      transaction();
      console.log(`Executed ${statements.length} statements in transaction`);
    } catch (error) {
      throw new Error(`Transaction failed: ${error}`);
    }
  }

  /**
   * Performs a comprehensive database integrity check using SQLite's built-in validation
   * Detects corruption, consistency issues, and structural problems
   * Essential for database maintenance and troubleshooting
   * 
   * @returns Object containing validation results and any detected errors
   * 
   * @example
   * ```typescript
   * const dbManager = new DatabaseManager();
   * const integrity = dbManager.checkIntegrity();
   * 
   * if (integrity.isValid) {
   *   console.log('Database integrity check passed ✓');
   * } else {
   *   console.log('Database integrity issues found:');
   *   integrity.errors.forEach((error, index) => {
   *     console.log(`${index + 1}. ${error}`);
   *   });
   * }
   * 
   * // Example output for healthy database:
   * // Database integrity check passed ✓
   * 
   * // Example output for corrupted database:
   * // Database integrity issues found:
   * // 1. wrong # of entries in index idx_users_email
   * // 2. row 42 missing from index idx_products_name
   * ```
   * 
   * @note This operation can be time-consuming on large databases
   */
  checkIntegrity(): { isValid: boolean; errors: string[] } {
    try {
      const result = this.databaseInstance.prepare("PRAGMA integrity_check").all() as { integrity_check: string }[];
      const isValid = result.length === 1 && result[0].integrity_check === 'ok';
      const errors = isValid ? [] : result.map(row => row.integrity_check);

      return { isValid, errors };
    } catch (error) {
      return { isValid: false, errors: [`Integrity check failed: ${error}`] };
    }
  }
}
// Type definitions for database operations
type OptionsFlags<Type> = {
  [Property in keyof Type]?: true;
};

type ReservedKeyWords = "LIKE" | "OR";
type TableExtends = Record<string | ReservedKeyWords, string | number>;

// Helper type to get only the keys that are set to true
type TrueKeys<T> = {
  [K in keyof T]: T[K] extends true ? K : never;
}[keyof T];

// More precise selected type
type PreciseSelectedType<T, S> = S extends "*"
  ? T
  : Pick<T, Extract<TrueKeys<S>, keyof T>>;

type DatabaseSelectOptions<Table extends TableExtends> = {
  where?: WhereClause<Table>;
  select?: Partial<OptionsFlags<Table>> | "*";
  limit?: number;
  skip?: number;
};

type DatabaseInsertData<Table> = Table;

type WhereClause<Table extends TableExtends> =
  | (Partial<Table> & {
    LIKE?: undefined;
    OR?: undefined;
  })
  | (WhereOR<Table> & {
    LIKE?: undefined;
  })
  | (WhereLike<Table> & { OR?: undefined });

type WhereWithoutLike<Table extends TableExtends> =
  | Partial<Table>
  | WhereORWithoutLike<Table>;

type WhereORWithoutLike<Table extends TableExtends> = {
  OR: Partial<Table>[];
};

type FilterStringValues<T extends TableExtends> = {
  [K in keyof T]: T[K] extends string ? K : never;
}[keyof T];

type FilteredStringObject<T extends TableExtends> = {
  [K in FilterStringValues<T>]: T[K];
};

type WhereLike<Table extends TableExtends> =
  | {
    /**
     * LIKE operator with wildcards:
     * - **_** <-- single character
     * - **%** <-- multiple characters
     * @link https://www.sqlitetutorial.net/sqlite-like
     * @example
     * db.select({ where: { LIKE: { foo: "lo_" } } }) // matches "lor"
     * @example
     * db.select({ where: { LIKE: { foo: "lo%" } } }) // matches "lor", "lorem ipsum", etc.
     */
    LIKE: Partial<FilteredStringObject<Table>>;
  } & { [K in Exclude<ReservedKeyWords, "LIKE">]?: undefined };

type WhereOR<Table extends TableExtends> = {
  OR: Partial<Table | WhereLike<Table>>[];
};

type DatabaseUpdateOptions<Table extends TableExtends> = {
  where?: WhereWithoutLike<Table>;
  values: Partial<Table>;
};

type DatabaseDeleteOptions<Table extends TableExtends> = {
  where: WhereWithoutLike<Table>;
};

type DatabaseCountOptions<Table extends TableExtends> = {
  where?: WhereWithoutLike<Table>;
};

type DatabaseOperationOptions<
  T extends TableExtends,
  SELECT_FORMAT extends TableExtends
> = DatabaseSelectOptions<SELECT_FORMAT> | DatabaseUpdateOptions<T> | DatabaseDeleteOptions<T> | DatabaseCountOptions<T>;



/**
 * Enhanced Table class with better type safety and error handling
 */
export class Table<
  T extends Omit<TableSchema, "name" | "columns">,
  SELECT_FORMAT extends Omit<TableSchema, "name" | "columns">
> {
  private readonly tableName: string;
  private readonly isDebugEnabled: boolean;
  private readonly schema: TableSchema["columns"];

  /**
   * Direct access to the database instance
   * @link https://bun.sh/docs/api/sqlite
   */
  readonly databaseInstance: _BunDB;

  constructor(config: {
    name: string;
    db?: _BunDB;
    schema: DBSchema;
    debug?: boolean;
    enableWAL?: boolean;
  }) {

    this.tableName = config.name;
    this.databaseInstance = config.db || globalThis.MainDatabase;
    this.schema = (config.schema ?? globalThis.dbSchema)?.find(s => s.name === config.name)?.columns || [];
    this.isDebugEnabled = config.debug || false;

    if (!this.databaseInstance) {
      throw new Error("Database instance is not available");
    }

    if ((config.enableWAL !== false) && config.db) {
      this.databaseInstance.exec("PRAGMA journal_mode = WAL;");
    }
  }

  /**
   * Creates the table using the schema definition with sophisticated type mapping and constraints
   * Leverages DatabaseManager's advanced table creation logic for proper SQLite type conversion
   * Automatically validates schema and ensures data integrity with proper primary keys
   * 
   * @example
   * ```typescript
   * // Define schema in your Bunext app
   * import { DBSchema } from "bunext-js/database/schema";
   * 
   * const schema: DBSchema = [
   *   {
   *     name: "Users",
   *     columns: [
   *       { name: "id", type: "number", unique: true, primary: true, autoIncrement: true },
   *       { name: "name", type: "string" },
   *       { name: "email", type: "string", unique: true },
   *       { name: "isActive", type: "boolean", default: true },
   *       { name: "metadata", type: "json", DataType: {} },
   *       { name: "createdAt", type: "Date" },
   *     ],
   *   },
   * ];
   * 
   * // In your server code, access the table via Database()
   * import { Database } from "bunext-js/database";
   * 
   * const db = Database();
   * db.Users.createTable(); // Creates the table with proper SQLite types
   * ```
   * 
   * @throws {Error} When schema is missing, invalid, or table creation fails
   */
  createTable(): void {
    if (!this.schema || this.schema.length === 0) {
      throw new Error(`No schema found for table '${this.tableName}'. Please ensure the table is defined in the global schema.`);
    }

    // Create a TableSchema object from the current table configuration
    const tableSchema: TableSchema = {
      name: this.tableName,
      columns: this.schema
    };

    // Use DatabaseManager's sophisticated table creation logic
    const dbManager = new DatabaseManager(this.databaseInstance);

    try {
      dbManager.createTable(tableSchema);

      this.debugLog("Table created successfully", {
        tableName: this.tableName,
        columnCount: this.schema.length,
        columns: this.schema.map(col => {
          const baseInfo = {
            name: col.name,
            type: col.type,
            primary: col.primary,
            nullable: col.nullable,
            unique: col.unique
          };

          // Add autoIncrement only for number type columns
          if (col.type === 'number' && 'autoIncrement' in col) {
            return { ...baseInfo, autoIncrement: col.autoIncrement };
          }

          return baseInfo;
        })
      });
    } catch (error) {
      const errorMessage = `Failed to create table '${this.tableName}': ${error instanceof Error ? error.message : String(error)}`;
      this.debugLog("Table creation failed", { error: errorMessage });
      throw new Error(errorMessage);
    }
  }

  // Public API methods

  /**
   * Selects all records from the table with complete type safety
   * Returns all columns when no specific selection is provided
   * 
   * @param options - Query options excluding specific column selection
   * @param options.where - WHERE clause conditions with support for LIKE and OR operations
   * @param options.limit - Maximum number of records to return
   * @param options.skip - Number of records to skip (for pagination)
   * @returns Array of complete records with all fields
   * 
   * @example
   * ```typescript
   * import { Database } from "bunext-js/database";
   * 
   * const db = Database();
   * 
   * // Get all users
   * const allUsers = db.Users.select();
   * 
   * // Get users with conditions
   * const activeUsers = db.Users.select({
   *   where: { isActive: true }
   * });
   * 
   * // Complex query with LIKE and pagination
   * const searchResults = db.Users.select({
   *   where: { LIKE: { name: 'John%' } },
   *   limit: 10,
   *   skip: 0
   * });
   * 
   * // OR conditions
   * const specificUsers = db.Users.select({
   *   where: { OR: [{ id: 1 }, { id: 2 }, { email: 'admin@example.com' }] }
   * });
   * ```
   */
  select(options: Omit<DatabaseSelectOptions<SELECT_FORMAT>, 'select'> & { select?: "*" }): SELECT_FORMAT[];

  /**
   * Selects specific fields from the table with precise TypeScript type inference
   * Returns only the specified columns, reducing memory usage and improving performance
   * 
   * @param options - Query options with specific field selection
   * @param options.select - Object specifying which fields to include (field: true)
   * @param options.where - WHERE clause conditions
   * @param options.limit - Maximum number of records to return
   * @param options.skip - Number of records to skip
   * @returns Array of records containing only the selected fields with precise typing
   * 
   * @example
   * ```typescript
   * import { Database } from "bunext-js/database";
   * 
   * const db = Database();
   * 
   * // Select only specific fields - TypeScript knows exact return type
   * const usernames = db.Users.select({
   *   select: { id: true, name: true },
   *   where: { isActive: true }
   * });
   * // Type: Array<{ id: number; name: string }>
   * 
   * // Select single field
   * const emails = db.Users.select({
   *   select: { email: true }
   * });
   * // Type: Array<{ email: string }>
   * 
   * // Complex selection with conditions
   * const userProfiles = db.Users.select({
   *   select: { id: true, name: true, email: true, createdAt: true },
   *   where: { LIKE: { email: '%@company.com' } },
   *   limit: 50
   * });
   * ```
   */
  select<TSelect extends OptionsFlags<SELECT_FORMAT>>(
    options: Omit<DatabaseSelectOptions<SELECT_FORMAT>, 'select'> & { select: TSelect }
  ): PreciseSelectedType<SELECT_FORMAT, TSelect>[];

  /**
   * Select records from the table (implementation)
   */
  select(options: DatabaseSelectOptions<SELECT_FORMAT> = {}): SELECT_FORMAT[] {
    this.validateSelectOptions(options);

    // Handle empty OR conditions
    if (options.where && 'OR' in options.where &&
      Array.isArray(options.where.OR) && options.where.OR.length === 0) {
      return [];
    }

    const queryString = this.buildSelectQuery(options);
    const params = this.extractQueryParameters(options);

    this.debugLog("Executing SELECT query", { queryString, params });

    return this.executeWithErrorWrapper(() => {
      const query = this.databaseInstance.prepare(queryString);
      const results = query.all(...params) as Record<string, unknown>[];
      query.finalize();
      return results.map(row => this.restoreDataTypes(row)) as SELECT_FORMAT[];
    });
  }

  /**
   * Inserts multiple records into the table with automatic transaction handling
   * Provides type safety and automatic data type conversion for SQLite compatibility
   * Uses prepared statements for optimal performance and SQL injection protection
   * 
   * @param records - Array of records to insert, must match table schema type
   * 
   * @example
   * ```typescript
   * import { Database } from "bunext-js/database";
   * 
   * const db = Database();
   * 
   * // Insert single user
   * db.Users.insert([{
   *   id: 1,
   *   name: 'John Doe',
   *   email: 'john@example.com',
   *   isActive: true,
   *   metadata: { role: 'admin', department: 'IT' },
   *   createdAt: new Date()
   * }]);
   * 
   * // Insert multiple users in one transaction
   * db.Users.insert([
   *   { id: 2, name: 'Jane Smith', email: 'jane@example.com', isActive: true, createdAt: new Date() },
   *   { id: 3, name: 'Bob Wilson', email: 'bob@example.com', isActive: false, createdAt: new Date() }
   * ]);
   * 
   * // Automatic type conversion happens:
   * // - Date objects → Unix timestamps
   * // - boolean values → 1/0 integers  
   * // - Objects → JSON strings
   * ```
   * 
   * @throws {Error} When no records provided, invalid data types, or database constraints violated
   */
  insert(records: T[]): void {
    if (!records || records.length === 0) {
      throw new Error("No records provided for insertion");
    }

    const sampleRecord = records[0];
    const columns = Object.keys(sampleRecord);
    const queryString = `INSERT INTO ${this.tableName} (${columns.join(", ")}) VALUES (${columns.map(col => `$${col}`).join(", ")})`;

    this.debugLog("Executing INSERT query", { queryString, recordCount: records.length });

    return this.executeWithErrorWrapper(() => {
      const insertStmt = this.databaseInstance.prepare(queryString);
      const insertTransaction = this.databaseInstance.transaction((records: T[]) => {
        for (const record of records) {
          const formattedRecord = this.formatRecordForInsert(record);
          insertStmt.run(formattedRecord);
        }
      });

      insertTransaction(records);
      insertStmt.finalize();
    });
  }

  /**
   * Optimized bulk insertion for large datasets with configurable batch processing
   * Processes records in batches to prevent memory overflow and improve performance
   * Returns array of inserted row IDs for tracking and reference
   * 
   * @param records - Array of records to insert
   * @param batchSize - Number of records to process per batch (default: 1000)
   * @returns Array of inserted row IDs (lastInsertRowid values)
   * 
   * @example
   * ```typescript
   * import { Database } from "bunext-js/database";
   * 
   * const db = Database();
   * 
   * // Bulk insert with default batch size
   * const userIds = db.Users.bulkInsert(thousandsOfUsers);
   * console.log(`Inserted ${userIds.length} users with IDs: ${userIds.slice(0, 5)}...`);
   * 
   * // Custom batch size for memory optimization
   * const productIds = db.Products.bulkInsert(millionsOfProducts, 500);
   * 
   * // Use returned IDs for related operations
   * const insertedIds = db.Users.bulkInsert(newUsers, 100);
   * insertedIds.forEach(userId => {
   *   // Create related records using the returned IDs
   *   db.Profiles.insert([{ userId, bio: 'New user profile' }]);
   * });
   * ```
   * 
   * @note Larger batch sizes use more memory but reduce transaction overhead
   */
  bulkInsert(records: T[], batchSize: number = 1000): number[] {
    if (!records || records.length === 0) {
      throw new Error("No records provided for bulk insertion");
    }

    const batches = this.chunk(records, batchSize);
    const insertedIds: number[] = [];

    return this.executeWithErrorWrapper(() => {
      const sampleRecord = records[0];
      const columns = Object.keys(sampleRecord);
      const queryString = `INSERT INTO ${this.tableName} (${columns.join(", ")}) VALUES (${columns.map(col => `$${col}`).join(", ")})`;

      const insertStmt = this.databaseInstance.prepare(queryString);
      const bulkTransaction = this.databaseInstance.transaction((batch: T[]) => {
        for (const record of batch) {
          const formattedRecord = this.formatRecordForInsert(record);
          const result = insertStmt.run(formattedRecord);
          insertedIds.push(result.lastInsertRowid as number);
        }
      });

      for (const batch of batches) {
        bulkTransaction(batch);
      }

      insertStmt.finalize();
      return insertedIds;
    });
  }

  /**
   * Performs upsert operation (INSERT or UPDATE on conflict) with flexible conflict resolution
   * Handles unique constraint violations gracefully by updating existing records
   * Uses SQLite's ON CONFLICT clause for atomic operations
   * 
   * @param records - Array of records to upsert
   * @param conflictColumns - Columns that define uniqueness for conflict detection
   * @param updateColumns - Specific columns to update on conflict (optional, defaults to all non-conflict columns)
   * 
   * @example
   * ```typescript
   * import { Database } from "bunext-js/database";
   * 
   * const db = Database();
   * 
   * // Upsert users by email (unique constraint)
   * db.Users.upsert([
   *   { id: 1, name: 'John Updated', email: 'john@example.com', isActive: true },
   *   { id: 2, name: 'Jane New', email: 'jane@example.com', isActive: true }
   * ], ['email']); // If email exists, update other fields
   * 
   * // Upsert with specific update columns
   * db.Users.upsert([
   *   { id: 1, name: 'John', email: 'john@example.com', isActive: false, lastLogin: new Date() }
   * ], ['email'], ['isActive', 'lastLogin']); // Only update isActive and lastLogin on conflict
   * 
   * // Composite key upsert
   * db.Orders.upsert([
   *   { userId: 1, productId: 100, quantity: 5, price: 29.99 }
   * ], ['userId', 'productId']); // Unique combination of userId + productId
   * ```
   * 
   * @throws {Error} When conflict columns don't exist or upsert operation fails
   */
  upsert<K extends keyof T>(
    records: T[],
    conflictColumns: K[],
    updateColumns?: (keyof T)[]
  ): void {
    if (!records || records.length === 0) {
      throw new Error("No records provided for upsert");
    }

    const sampleRecord = records[0];
    const columns = Object.keys(sampleRecord);
    const conflictCols = conflictColumns.map(String).join(", ");

    const updateCols = updateColumns
      ? updateColumns.map(col => `${String(col)} = excluded.${String(col)}`).join(", ")
      : columns.filter(col => !conflictColumns.includes(col as K))
        .map(col => `${col} = excluded.${col}`).join(", ");

    const queryString = `
      INSERT INTO ${this.tableName} (${columns.join(", ")})
      VALUES (${columns.map(col => `$${col}`).join(", ")})
      ON CONFLICT(${conflictCols}) DO UPDATE SET ${updateCols}
    `;

    this.debugLog("Executing UPSERT query", { queryString, recordCount: records.length });

    return this.executeWithErrorWrapper(() => {
      const upsertStmt = this.databaseInstance.prepare(queryString);
      const upsertTransaction = this.databaseInstance.transaction((records: T[]) => {
        for (const record of records) {
          const formattedRecord = this.formatRecordForInsert(record);
          upsertStmt.run(formattedRecord);
        }
      });

      upsertTransaction(records);
      upsertStmt.finalize();
    });
  }

  /**
   * Updates existing records in the table with type-safe value assignment
   * Requires WHERE clause for data safety and prevents accidental mass updates
   * Uses prepared statements for performance and SQL injection protection
   * 
   * @param options - Update configuration with WHERE conditions and new values
   * @param options.where - Required WHERE clause to identify records to update
   * @param options.values - Object containing fields to update with new values
   * 
   * @example
   * ```typescript
   * import { Database } from "bunext-js/database";
   * 
   * const db = Database();
   * 
   * // Update single user by ID
   * db.Users.update({
   *   where: { id: 1 },
   *   values: { 
   *     name: 'John Updated',
   *     isActive: false,
   *     lastModified: new Date()
   *   }
   * });
   * 
   * // Update multiple users with conditions
   * db.Users.update({
   *   where: { isActive: true },
   *   values: { lastSeen: new Date() }
   * });
   * 
   * // Update with OR conditions
   * db.Users.update({
   *   where: { OR: [{ department: 'IT' }, { role: 'admin' }] },
   *   values: { accessLevel: 'elevated' }
   * });
   * 
   * // Partial updates (only specified fields changed)
   * db.Users.update({
   *   where: { email: 'john@example.com' },
   *   values: { isActive: true } // Other fields remain unchanged
   * });
   * ```
   * 
   * @throws {Error} When WHERE clause is missing/empty or update operation fails
   */
  update(options: DatabaseUpdateOptions<T>): void {
    this.validateUpdateOptions(options);

    if (!options.where || Object.keys(options.where).length === 0) {
      throw new Error("Update operation requires a WHERE clause for safety");
    }

    let queryString = `UPDATE ${this.tableName} SET `;
    queryString += Object.keys(options.values).map(key => `${key} = ?`).join(", ");
    queryString += ` ${this.buildWhereClause(options.where)}`;

    const setParams = this.parseParameters(Object.values(options.values));
    const whereParams = this.extractWhereParameters(options.where);
    const allParams = [...setParams, ...whereParams];

    this.debugLog("Executing UPDATE query", { queryString, params: allParams });

    return this.executeWithErrorWrapper(() => {
      const query = this.databaseInstance.prepare(queryString);
      query.run(...allParams);
      query.finalize();
    });
  }

  /**
   * Deletes records from the table with mandatory WHERE clause for safety
   * Prevents accidental deletion of all data by requiring specific conditions
   * Supports complex WHERE conditions including OR operations
   * 
   * @param options - Delete configuration with required WHERE conditions
   * @param options.where - Required WHERE clause to identify records to delete
   * 
   * @example
   * ```typescript
   * import { Database } from "bunext-js/database";
   * 
   * const db = Database();
   * 
   * // Delete single user by ID
   * db.Users.delete({
   *   where: { id: 1 }
   * });
   * 
   * // Delete inactive users
   * db.Users.delete({
   *   where: { isActive: false }
   * });
   * 
   * // Delete with complex conditions
   * db.Users.delete({
   *   where: { 
   *     OR: [
   *       { lastLogin: null },
   *       { status: 'deleted' }
   *     ]
   *   }
   * });
   * 
   * // Delete users created before specific date
   * const cutoffDate = new Date('2023-01-01');
   * db.Users.delete({
   *   where: { createdAt: cutoffDate.getTime() } // Converted to timestamp
   * });
   * 
   * // Bulk delete with conditions
   * db.Users.delete({
   *   where: { department: 'temp', contractEnded: true }
   * });
   * ```
   * 
   * @throws {Error} When WHERE clause is missing/empty or delete operation fails
   */
  delete(options: DatabaseDeleteOptions<T>): void {
    this.validateDeleteOptions(options);

    // Handle empty OR conditions
    if (options.where && 'OR' in options.where &&
      Array.isArray(options.where.OR) && options.where.OR.length === 0) {
      return;
    }

    const queryString = `DELETE FROM ${this.tableName} ${this.buildWhereClause(options.where)}`;
    const params = this.extractWhereParameters(options.where);

    this.debugLog("Executing DELETE query", { queryString, params });

    return this.executeWithErrorWrapper(() => {
      const query = this.databaseInstance.prepare(queryString);
      query.run(...params);
      query.finalize();
    });
  }

  /**
   * Counts the number of records matching specified conditions
   * Efficient counting without loading actual record data into memory
   * Supports all WHERE clause types including LIKE and OR operations
   * 
   * @param options - Optional counting configuration
   * @param options.where - WHERE clause conditions to filter records
   * @returns Number of matching records
   * 
   * @example
   * ```typescript
   * import { Database } from "bunext-js/database";
   * 
   * const db = Database();
   * 
   * // Count all records
   * const totalUsers = db.Users.count();
   * console.log(`Total users: ${totalUsers}`);
   * 
   * // Count with conditions
   * const activeUsers = db.Users.count({ 
   *   where: { isActive: true } 
   * });
   * 
   * // Count with LIKE pattern
   * const gmailUsers = db.Users.count({
   *   where: { LIKE: { email: '%@gmail.com' } }
   * });
   * 
   * // Count with OR conditions
   * const adminOrModeratorCount = db.Users.count({
   *   where: { OR: [{ role: 'admin' }, { role: 'moderator' }] }
   * });
   * 
   * // Count for pagination
   * const pageSize = 10;
   * const totalRecords = db.Users.count({ where: { isActive: true } });
   * const totalPages = Math.ceil(totalRecords / pageSize);
   * ```
   */
  count(options?: DatabaseCountOptions<T>): number {
    // Handle empty OR conditions
    if (options?.where && 'OR' in options.where &&
      Array.isArray(options.where.OR) && options.where.OR.length === 0) {
      return 0;
    }

    let queryString = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    let params: any[] = [];

    if (options?.where) {
      queryString += ` ${this.buildWhereClause(options.where)}`;
      params = this.extractWhereParameters(options.where);
    }

    this.debugLog("Executing COUNT query", { queryString, params });

    const result = this.executeWithErrorWrapper(() => {
      const query = this.databaseInstance.prepare(queryString);
      const result = query.get(...params) as { count: number };
      query.finalize();
      return result;
    });

    return result.count;
  }

  /**
   * Finds the first record matching the specified criteria
   * Returns null if no matching record is found, providing safe null-checking
   * Supports both full record selection and specific field selection
   * 
   * @param options - Search configuration options
   * @param options.where - WHERE clause conditions to filter records
   * @param options.select - Fields to select (all fields if not specified)
   * @returns First matching record or null if none found
   * 
   * @example
   * ```typescript
   * import { Database } from "bunext-js/database";
   * 
   * const db = Database();
   * 
   * // Find user by email
   * const user = db.Users.findFirst({
   *   where: { email: 'john@example.com' }
   * });
   * if (user) {
   *   console.log(`Found user: ${user.name}`);
   * }
   * 
   * // Find with specific field selection
   * const userProfile = db.Users.findFirst({
   *   where: { id: 1 },
   *   select: { id: true, name: true, email: true }
   * });
   * 
   * // Find active admin
   * const admin = db.Users.findFirst({
   *   where: { role: 'admin', isActive: true }
   * });
   * 
   * // Find with LIKE pattern
   * const emailUser = db.Users.findFirst({
   *   where: { LIKE: { email: 'admin@%' } }
   * });
   * 
   * // Safe null checking
   * const maybeUser = db.Users.findFirst({ where: { id: 999 } });
   * console.log(maybeUser?.name ?? 'User not found');
   * ```
   */
  findFirst(options?: {
    where?: WhereClause<SELECT_FORMAT>;
    select?: Partial<OptionsFlags<SELECT_FORMAT>> | "*";
  }): SELECT_FORMAT | null {
    if (!options?.select || options.select === "*") {
      const results = this.select({
        where: options?.where,
        limit: 1
      });
      return results.length > 0 ? results[0] : null;
    } else {
      const results = this.select({
        where: options.where,
        select: options.select as OptionsFlags<SELECT_FORMAT>,
        limit: 1
      });
      return results.length > 0 ? results[0] as SELECT_FORMAT : null;
    }
  }

  /**
   * Checks if any records exist matching the specified criteria
   * Efficient existence check without loading record data
   * Returns boolean result for conditional logic and validation
   * 
   * @param options - Optional existence check configuration
   * @param options.where - WHERE clause conditions to filter records
   * @returns True if at least one matching record exists, false otherwise
   * 
   * @example
   * ```typescript
   * import { Database } from "bunext-js/database";
   * 
   * const db = Database();
   * 
   * // Check if email is already taken
   * const emailExists = db.Users.exists({
   *   where: { email: 'john@example.com' }
   * });
   * if (emailExists) {
   *   throw new Error('Email already registered');
   * }
   * 
   * // Check if any active users exist
   * const hasActiveUsers = db.Users.exists({
   *   where: { isActive: true }
   * });
   * 
   * // Check if admin exists
   * if (!db.Users.exists({ where: { role: 'admin' } })) {
   *   console.log('No admin found, creating default admin...');
   * }
   * 
   * // Validation in business logic
   * function canDeleteUser(userId: number): boolean {
   *   const hasOrders = db.Orders.exists({ where: { userId } });
   *   return !hasOrders; // Can delete user if they have no orders
   * }
   * 
   * // Check existence with complex conditions
   * const hasRecentActivity = db.Users.exists({
   *   where: { lastLogin: Date.now() - (7 * 24 * 60 * 60 * 1000) } // 7 days ago
   * });
   * ```
   */
  exists(options?: {
    where?: WhereClause<SELECT_FORMAT>;
  }): boolean {
    let query = `SELECT 1 FROM ${this.tableName}`;
    let params: (string | number)[] = [];

    if (options?.where) {
      query += ` ${this.buildWhereClause(options.where)}`;
      params = this.extractWhereParameters(options.where);
    }

    query += ` LIMIT 1`;

    return this.executeWithErrorWrapper(() => {
      const stmt = this.databaseInstance.prepare(query);
      const result = stmt.get(...params);
      stmt.finalize();
      return !!result;
    });
  }

  /**
   * Retrieves unique/distinct values from a specific column
   * Eliminates duplicate values and provides clean data for analytics or dropdowns
   * Supports filtering with WHERE conditions and result limiting
   * 
   * @param options - Distinct query configuration
   * @param options.column - Column name to get distinct values from
   * @param options.where - Optional WHERE clause to filter records
   * @param options.limit - Optional limit on number of distinct values returned
   * @returns Array of unique values from the specified column
   * 
   * @example
   * ```typescript
   * import { Database } from "bunext-js/database";
   * 
   * const db = Database();
   * 
   * // Get all unique departments
   * const departments = db.Users.distinct({
   *   column: 'department'
   * });
   * console.log('Departments:', departments); // ['IT', 'HR', 'Sales', 'Marketing']
   * 
   * // Get unique roles for active users only
   * const activeRoles = db.Users.distinct({
   *   column: 'role',
   *   where: { isActive: true }
   * });
   * 
   * // Limited distinct values
   * const topCountries = db.Users.distinct({
   *   column: 'country',
   *   limit: 10
   * });
   * 
   * // Use for building UI dropdowns
   * const statusOptions = db.Orders.distinct({
   *   column: 'status'
   * }).map(status => ({ label: status, value: status }));
   * 
   * // Analytics: unique customer count per product
   * const uniqueCustomers = db.Orders.distinct({
   *   column: 'customerId',
   *   where: { productId: 123 }
   * });
   * console.log(`Product 123 has ${uniqueCustomers.length} unique customers`);
   * ```
   */
  distinct<K extends keyof SELECT_FORMAT>(options: {
    column: K;
    where?: WhereClause<SELECT_FORMAT>;
    limit?: number;
  }): SELECT_FORMAT[K][] {
    const { column, where, limit } = options;
    let query = `SELECT DISTINCT ${String(column)} FROM ${this.tableName}`;
    let params: (string | number)[] = [];

    if (where) {
      query += ` ${this.buildWhereClause(where)}`;
      params = this.extractWhereParameters(where);
    }

    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    this.debugLog("Executing DISTINCT query", { query, params });

    return this.executeWithErrorWrapper(() => {
      const stmt = this.databaseInstance.prepare(query);
      const results = stmt.all(...params) as Record<string, unknown>[];
      stmt.finalize();

      return results.map(row => {
        const restored = this.restoreDataTypes(row);
        return restored[column as string] as SELECT_FORMAT[K];
      });
    });
  }

  /**
   * Performs aggregation operations (SUM, AVG, MIN, MAX, COUNT) on numeric columns
   * Provides statistical analysis and reporting capabilities with type safety
   * Supports filtering with WHERE conditions for targeted analysis
   * 
   * @param options - Aggregation configuration
   * @param options.column - Column name to perform aggregation on (must be numeric for SUM/AVG)
   * @param options.functions - Array of aggregation functions to apply
   * @param options.where - Optional WHERE clause to filter records before aggregation
   * @returns Object with aggregation results keyed by function name
   * 
   * @example
   * ```typescript
   * const orderTable = new Table<Order, Order>({ name: 'orders' });
   * 
   * // Get order statistics
   * const orderStats = orderTable.aggregate({
   *   column: 'total',
   *   functions: ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT']
   * });
   * console.log('Order Statistics:', orderStats);
   * // { SUM: 15750.50, AVG: 157.51, MIN: 9.99, MAX: 999.99, COUNT: 100 }
   * 
   * // Revenue analysis for specific period
   * const monthlyRevenue = orderTable.aggregate({
   *   column: 'total',
   *   functions: ['SUM', 'COUNT'],
   *   where: { 
   *     createdAt: Date.now() - (30 * 24 * 60 * 60 * 1000) // Last 30 days
   *   }
   * });
   * console.log(`Monthly revenue: $${monthlyRevenue.SUM} from ${monthlyRevenue.COUNT} orders`);
   * 
   * // Product performance
   * const productStats = orderTable.aggregate({
   *   column: 'quantity',
   *   functions: ['SUM', 'AVG'],
   *   where: { productId: 123, status: 'completed' }
   * });
   * 
   * // User age analysis
   * const ageStats = userTable.aggregate({
   *   column: 'age',
   *   functions: ['AVG', 'MIN', 'MAX'],
   *   where: { isActive: true }
   * });
   * ```
   */
  aggregate<K extends keyof SELECT_FORMAT>(options: {
    column: K;
    functions: Array<'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT'>;
    where?: WhereClause<SELECT_FORMAT>;
  }): Record<string, number> {
    const { column, functions, where } = options;
    const selectClauses = functions.map(fn => `${fn}(${String(column)}) as ${fn}`).join(', ');
    let query = `SELECT ${selectClauses} FROM ${this.tableName}`;
    let params: (string | number)[] = [];

    if (where) {
      query += ` ${this.buildWhereClause(where)}`;
      params = this.extractWhereParameters(where);
    }

    this.debugLog("Executing AGGREGATE query", { query, params });

    return this.executeWithErrorWrapper(() => {
      const stmt = this.databaseInstance.prepare(query);
      const result = stmt.get(...params) as Record<string, number>;
      stmt.finalize();

      return result || {};
    });
  }

  /**
   * Provides paginated results with comprehensive metadata for building user interfaces
   * Efficiently handles large datasets by fetching only requested page data
   * Includes total count, page information, and optional sorting
   * 
   * @param options - Pagination configuration
   * @param options.page - Page number (1-based indexing)
   * @param options.pageSize - Number of records per page
   * @param options.where - Optional WHERE clause to filter records
   * @param options.select - Optional field selection for performance optimization
   * @param options.orderBy - Optional sorting configuration
   * @returns Pagination result with data and metadata
   * 
   * @example
   * ```typescript
   * const userTable = new Table<User, User>({ name: 'users' });
   * 
   * // Basic pagination
   * const page1 = userTable.paginate({
   *   page: 1,
   *   pageSize: 10
   * });
   * console.log(`Page ${page1.page} of ${page1.totalPages} (${page1.total} total users)`);
   * console.log('Users:', page1.data);
   * 
   * // Paginated search with sorting
   * const searchResults = userTable.paginate({
   *   page: 2,
   *   pageSize: 20,
   *   where: { isActive: true },
   *   orderBy: { column: 'createdAt', direction: 'DESC' }
   * });
   * 
   * // Performance-optimized pagination (specific fields only)
   * const userList = userTable.paginate({
   *   page: 1,
   *   pageSize: 50,
   *   select: { id: true, name: true, email: true },
   *   where: { LIKE: { name: 'John%' } },
   *   orderBy: { column: 'name', direction: 'ASC' }
   * });
   * 
   * // Building pagination UI
   * function renderPagination(result: typeof page1) {
   *   const { page, totalPages, total, pageSize } = result;
   *   console.log(`Showing ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, total)} of ${total} results`);
   *   
   *   return {
   *     hasNext: page < totalPages,
   *     hasPrev: page > 1,
   *     nextPage: page + 1,
   *     prevPage: page - 1
   *   };
   * }
   * ```
   */
  paginate(options: {
    page: number;
    pageSize: number;
    where?: WhereClause<SELECT_FORMAT>;
    select?: Partial<OptionsFlags<SELECT_FORMAT>> | "*";
    orderBy?: {
      column: keyof SELECT_FORMAT;
      direction?: 'ASC' | 'DESC';
    };
  }): {
    data: SELECT_FORMAT[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  } {
    const { page, pageSize, orderBy, where: whereClause, select: selectClause } = options;
    const offset = (page - 1) * pageSize;

    // Get total count using raw query for compatibility
    let countQuery = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    let countParams: (string | number)[] = [];

    if (whereClause) {
      countQuery += ` ${this.buildWhereClause(whereClause)}`;
      countParams = this.extractWhereParameters(whereClause);
    }

    const total = this.executeWithErrorWrapper(() => {
      const stmt = this.databaseInstance.prepare(countQuery);
      const result = stmt.get(...countParams) as { count: number };
      stmt.finalize();
      return result.count;
    });

    // Build paginated query
    const selectOptions = { where: whereClause, select: selectClause };
    let query = this.buildSelectQuery(selectOptions);

    if (orderBy) {
      query += ` ORDER BY ${String(orderBy.column)} ${orderBy.direction || 'ASC'}`;
    }

    query += ` LIMIT ${pageSize} OFFSET ${offset}`;

    const params = this.extractQueryParameters(selectOptions);

    this.debugLog("Executing PAGINATED query", { query, params });

    const data = this.executeWithErrorWrapper(() => {
      const stmt = this.databaseInstance.prepare(query);
      const results = stmt.all(...params) as Record<string, unknown>[];
      stmt.finalize();
      return results.map(row => this.restoreDataTypes(row)) as SELECT_FORMAT[];
    });

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  }

  // Helper methods for validation
  private validateSelectOptions(options: DatabaseSelectOptions<SELECT_FORMAT>): void {
    if (options.limit && options.limit < 0) {
      throw new Error("Limit must be a positive number");
    }
    if (options.skip && options.skip < 0) {
      throw new Error("Skip must be a positive number");
    }
  }

  private validateUpdateOptions(options: DatabaseUpdateOptions<T>): void {
    if (!options.values || Object.keys(options.values).length === 0) {
      throw new Error("Update values cannot be empty");
    }
  }

  private validateDeleteOptions(options: DatabaseDeleteOptions<T>): void {
    if (!options.where || Object.keys(options.where).length === 0) {
      throw new Error("Delete operation requires a WHERE clause for safety");
    }
  }

  // Helper methods for query building
  private buildSelectQuery(options: DatabaseSelectOptions<SELECT_FORMAT>): string {
    let query = "SELECT ";

    if (options.select === "*" || !options.select) {
      query += "*";
    } else {
      const selectedColumns = Object.keys(options.select).filter(
        col => Boolean(options.select && (options.select as Record<string, boolean>)[col])
      );
      query += selectedColumns.join(", ");
    }

    query += ` FROM ${this.tableName}`;

    if (options.where) {
      query += ` ${this.buildWhereClause(options.where)}`;
    }

    if (options.limit) {
      query += ` LIMIT ${options.limit}`;
    }

    if (options.skip) {
      query += ` OFFSET ${options.skip}`;
    }

    return query;
  }

  private buildWhereClause(where: WhereClause<SELECT_FORMAT>): string;
  private buildWhereClause(where: WhereWithoutLike<T>): string;
  private buildWhereClause(where: WhereClause<SELECT_FORMAT> | WhereWithoutLike<T>): string {
    if (!where || Object.keys(where).length === 0) {
      return "";
    }

    // Handle LIKE operator
    if ('LIKE' in where && where.LIKE) {
      const likeConditions = Object.keys(where.LIKE).map(key => `${key} LIKE ?`);
      return `WHERE ${likeConditions.join(" AND ")}`;
    }

    // Handle OR operator
    if ('OR' in where && where.OR && Array.isArray(where.OR)) {
      const orConditions = where.OR.map((condition) => {
        if (typeof condition === 'object' && condition !== null && 'LIKE' in condition && condition.LIKE) {
          const likeConditions = Object.keys(condition.LIKE).map(key => `${key} LIKE ?`);
          return likeConditions.join(" AND ");
        }
        const regularConditions = Object.keys(condition).map(key => `${key} = ?`);
        return regularConditions.join(" AND ");
      });
      return `WHERE ${orConditions.join(" OR ")}`;
    }

    // Handle regular WHERE conditions
    const conditions = Object.keys(where).map(key => `${key} = ?`);
    return `WHERE ${conditions.join(" AND ")}`;
  }

  private extractQueryParameters(options: DatabaseSelectOptions<SELECT_FORMAT>): (string | number)[] {
    if (!options.where) return [];
    return this.extractWhereParameters(options.where);
  }

  private extractWhereParameters(where: WhereClause<SELECT_FORMAT>): (string | number)[];
  private extractWhereParameters(where: WhereWithoutLike<T>): (string | number)[];
  private extractWhereParameters(where: WhereClause<SELECT_FORMAT> | WhereWithoutLike<T> | undefined): (string | number)[] {
    if (!where) return [];

    // Handle LIKE operator
    if ('LIKE' in where && where.LIKE) {
      return this.parseParameters(Object.values(where.LIKE));
    }

    // Handle OR operator
    if ('OR' in where && where.OR && Array.isArray(where.OR)) {
      const parameters: (string | number)[] = [];
      for (const condition of where.OR) {
        if (typeof condition === 'object' && condition !== null && 'LIKE' in condition && condition.LIKE) {
          parameters.push(...this.parseParameters(Object.values(condition.LIKE)));
        } else {
          parameters.push(...this.parseParameters(Object.values(condition)));
        }
      }
      return parameters;
    }

    // Handle regular WHERE conditions
    return this.parseParameters(Object.values(where));
  }

  private parseParameters(params: unknown[]): (string | number)[] {
    return params.map((param) => {
      if (typeof param === "number" || typeof param === "string") {
        return param;
      }
      if (typeof param === "boolean") {
        return param ? 1 : 0;
      }
      if (param instanceof Date) {
        return param.getTime();
      }
      if (typeof param === "object" && param !== null) {
        return JSON.stringify(param);
      }
      if (param === null || param === undefined) {
        return "";
      }
      return String(param);
    });
  }

  private formatRecordForInsert(record: Record<string, unknown>): Record<string, string | number> {
    const formatted: Record<string, string | number> = {};

    for (const [key, value] of Object.entries(record)) {
      const paramKey = `$${key}`;
      const [parsedValue] = this.parseParameters([value]);
      formatted[paramKey] = parsedValue;
    }

    return formatted;
  }

  private restoreDataTypes(row: Record<string, unknown>): Record<string, unknown> {
    const restored: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      const column = this.schema.find(col => col.name === key);

      if (!column) {
        restored[key] = value;
        continue;
      }

      switch (column.type) {
        case "Date":
          restored[key] = typeof value === "number" ? new Date(value) : value;
          break;
        case "json":
          try {
            restored[key] = typeof value === "string" ? JSON.parse(value) : value;
          } catch {
            restored[key] = value;
          }
          break;
        case "boolean":
          restored[key] = value === 1;
          break;
        default:
          restored[key] = value;
      }
    }

    return restored;
  }

  private executeWithErrorWrapper<TResult>(callback: () => TResult): TResult {
    const maxRetries = 3;
    let retries = 0;
    let lastError: Error;

    while (retries < maxRetries) {
      try {
        return callback();
      } catch (error) {
        lastError = error as Error;

        if (lastError.name === "SQLiteError" && lastError.message.includes("database is locked")) {
          retries++;
          if (retries >= maxRetries) {
            throw new Error("Database is locked after multiple retry attempts");
          }
          // Wait a bit before retrying
          const delay = Math.min(100 * Math.pow(2, retries), 1000);
          Bun.sleepSync(delay);
          continue;
        }

        throw lastError;
      }
    }

    throw new Error("Unexpected error in executeWithErrorWrapper");
  }

  private debugLog(message: string, data?: Record<string, unknown> | string): void {
    if (this.isDebugEnabled) {
      console.log(`[Table:${this.tableName}] ${message}`, data || "");
    }
  }

  /**
   * Utility method to chunk array into smaller batches
   */
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Synchronizes data between tables with intelligent conflict resolution
   * Useful for data migration, replication, and maintaining data consistency
   * Provides progress tracking and detailed statistics on sync operations
   * 
   * @param sourceTable - Source table to copy data from
   * @param options - Synchronization configuration
   * @param options.keyColumn - Column used to identify matching records between tables
   * @param options.conflictResolution - How to handle existing records ('replace' | 'ignore' | 'update')
   * @param options.batchSize - Records to process per batch for memory management (default: 1000)
   * @param options.onProgress - Callback function for progress monitoring
   * @returns Statistics object with counts of inserted, updated, and skipped records
   * 
   * @example
   * ```typescript
   * const sourceUserTable = new Table<User, User>({ name: 'users_backup' });
   * const targetUserTable = new Table<User, User>({ name: 'users' });
   * 
   * // Basic sync with progress tracking
   * const syncResult = targetUserTable.syncWith(sourceUserTable, {
   *   keyColumn: 'email',
   *   conflictResolution: 'update',
   *   onProgress: (processed, total) => {
   *     console.log(`Sync progress: ${processed}/${total} (${Math.round(processed/total*100)}%)`);
   *   }
   * });
   * console.log(`Sync completed: ${syncResult.inserted} inserted, ${syncResult.updated} updated, ${syncResult.skipped} skipped`);
   * 
   * // Data migration with replace strategy
   * const migrationStats = newUserTable.syncWith(oldUserTable, {
   *   keyColumn: 'id',
   *   conflictResolution: 'replace',
   *   batchSize: 500
   * });
   * 
   * // Partial sync with ignore strategy
   * const partialSync = userTable.syncWith(importTable, {
   *   keyColumn: 'externalId',
   *   conflictResolution: 'ignore', // Keep existing records unchanged
   *   onProgress: (processed, total) => {
   *     if (processed % 1000 === 0) {
   *       console.log(`Processed ${processed} of ${total} records`);
   *     }
   *   }
   * });
   * ```
   */
  syncWith<U extends Record<string, any>>(
    sourceTable: Table<U, U>,
    options: {
      keyColumn: keyof T & keyof U;
      conflictResolution?: 'replace' | 'ignore' | 'update';
      batchSize?: number;
      onProgress?: (processed: number, total: number) => void;
    }
  ): { inserted: number; updated: number; skipped: number } {
    const { keyColumn, conflictResolution = 'replace', batchSize = 1000, onProgress } = options;

    this.debugLog("Starting data sync", {
      sourceTable: sourceTable.tableName,
      targetTable: this.tableName,
      keyColumn: String(keyColumn)
    });

    const sourceData = sourceTable.select({ select: "*" }) as U[];
    const stats = { inserted: 0, updated: 0, skipped: 0 };

    const batches = this.chunk(sourceData, batchSize);
    let processed = 0;

    for (const batch of batches) {
      for (const record of batch) {
        const keyValue = record[keyColumn];
        const existing = this.findFirst({
          where: { [keyColumn]: keyValue } as any
        });

        if (existing) {
          switch (conflictResolution) {
            case 'replace':
              this.update({
                where: { [keyColumn]: keyValue } as any,
                values: record as Partial<T>
              });
              stats.updated++;
              break;
            case 'update':
              // Only update non-null values from source
              const updateValues = Object.entries(record)
                .filter(([key, value]) => value !== null && value !== undefined && key !== keyColumn)
                .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

              if (Object.keys(updateValues).length > 0) {
                this.update({
                  where: { [keyColumn]: keyValue } as any,
                  values: updateValues as Partial<T>
                });
                stats.updated++;
              } else {
                stats.skipped++;
              }
              break;
            case 'ignore':
              stats.skipped++;
              break;
          }
        } else {
          this.insert([record as unknown as T]);
          stats.inserted++;
        }

        processed++;
        if (onProgress && processed % 100 === 0) {
          onProgress(processed, sourceData.length);
        }
      }
    }

    if (onProgress) {
      onProgress(sourceData.length, sourceData.length);
    }

    this.debugLog("Data sync completed", stats);
    return stats;
  }

  /**
   * Exports table data to JSON format with optional filtering and file output
   * Creates structured export with metadata including table name, timestamp, and record count
   * Supports both in-memory JSON string generation and direct file writing
   * 
   * @param options - Export configuration options
   * @param options.where - Optional WHERE clause to filter exported records
   * @param options.select - Optional field selection to limit exported columns
   * @param options.filePath - Optional file path to write JSON directly to disk
   * @param options.pretty - Whether to format JSON with indentation (default: true)
   * @returns JSON string if no filePath provided, undefined if written to file
   * 
   * @example
   * ```typescript
   * const userTable = new Table<User, User>({ name: 'users' });
   * 
   * // Export all data to file
   * userTable.exportToJson({
   *   filePath: './exports/users-backup.json'
   * });
   * 
   * // Export filtered data with specific fields
   * const jsonString = userTable.exportToJson({
   *   where: { isActive: true },
   *   select: { id: true, name: true, email: true },
   *   pretty: true
   * });
   * 
   * // Export for data analysis
   * userTable.exportToJson({
   *   where: { createdAt: Date.now() - (30 * 24 * 60 * 60 * 1000) }, // Last 30 days
   *   filePath: './reports/new-users-monthly.json'
   * });
   * 
   * // Compact export for API responses
   * const compactJson = userTable.exportToJson({
   *   select: { id: true, name: true },
   *   pretty: false
   * });
   * 
   * // Example output structure:
   * // {
   * //   "table": "users",
   * //   "exported": "2025-07-29T20:30:00.000Z",
   * //   "count": 150,
   * //   "data": [
   * //     { "id": 1, "name": "John Doe", "email": "john@example.com" },
   * //     ...
   * //   ]
   * // }
   * ```
   */
  exportToJson(options: {
    where?: WhereClause<SELECT_FORMAT>;
    select?: Partial<OptionsFlags<SELECT_FORMAT>> | "*";
    filePath?: string;
    pretty?: boolean;
  } = {}): string | void {
    const { where, select, filePath, pretty = true } = options;

    const data = this.select({ where, select } as any);
    const jsonData = {
      table: this.tableName,
      exported: new Date().toISOString(),
      count: data.length,
      data
    };

    const jsonString = pretty ? JSON.stringify(jsonData, null, 2) : JSON.stringify(jsonData);

    if (filePath) {
      const fs = require('fs');
      fs.writeFileSync(filePath, jsonString);
      this.debugLog("Data exported to file", { filePath, records: data.length });
    } else {
      return jsonString;
    }
  }

  /**
   * Imports data from JSON with intelligent conflict resolution and validation
   * Processes JSON data in batches for memory efficiency and error handling
   * Provides detailed statistics and error reporting for data quality assurance
   * 
   * @param jsonData - JSON string or object containing data to import
   * @param options - Import configuration options
   * @param options.conflictResolution - How to handle duplicate records ('replace' | 'ignore' | 'fail')
   * @param options.batchSize - Records to process per batch for memory management (default: 1000)
   * @param options.validateSchema - Whether to validate import data against table schema (default: true)
   * @returns Statistics object with counts of imported, skipped records and any errors
   * 
   * @example
   * ```typescript
   * const userTable = new Table<User, User>({ name: 'users' });
   * 
   * // Import from JSON file
   * const fs = require('fs');
   * const jsonData = fs.readFileSync('./imports/users.json', 'utf8');
   * const result = userTable.importFromJson(jsonData, {
   *   conflictResolution: 'replace',
   *   batchSize: 500
   * });
   * console.log(`Import result: ${result.imported} imported, ${result.skipped} skipped, ${result.errors.length} errors`);
   * 
   * // Import with error handling
   * const importResult = userTable.importFromJson({
   *   table: 'users',
   *   data: [
   *     { id: 1, name: 'John Doe', email: 'john@example.com' },
   *     { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
   *   ]
   * }, {
   *   conflictResolution: 'ignore',
   *   validateSchema: true
   * });
   * 
   * if (importResult.errors.length > 0) {
   *   console.error('Import errors:', importResult.errors);
   * }
   * 
   * // Safe import with failure handling
   * try {
   *   const strictImport = userTable.importFromJson(jsonData, {
   *     conflictResolution: 'fail', // Throw error on conflicts
   *     validateSchema: true
   *   });
   * } catch (error) {
   *   console.error('Import failed:', error.message);
   * }
   * 
   * // Bulk data migration
   * const migrationResult = userTable.importFromJson(legacyData, {
   *   conflictResolution: 'replace',
   *   batchSize: 100,
   *   validateSchema: false // Skip validation for legacy data
   * });
   * ```
   */
  importFromJson(
    jsonData: string | object,
    options: {
      conflictResolution?: 'replace' | 'ignore' | 'fail';
      batchSize?: number;
      validateSchema?: boolean;
    } = {}
  ): { imported: number; skipped: number; errors: string[] } {
    const { conflictResolution = 'ignore', batchSize = 1000, validateSchema = true } = options;
    const stats = { imported: 0, skipped: 0, errors: [] as string[] };

    try {
      const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;

      if (!data.data || !Array.isArray(data.data)) {
        throw new Error("Invalid JSON format: expected 'data' array");
      }

      if (validateSchema && data.table && data.table !== this.tableName) {
        console.warn(`Warning: JSON is from table '${data.table}' but importing to '${this.tableName}'`);
      }

      const batches = this.chunk(data.data, batchSize);

      for (const batch of batches) {
        try {
          if (conflictResolution === 'replace') {
            // Use upsert for replace behavior (requires primary key)
            const primaryKeyCol = this.schema.find(col => col.primary)?.name;
            if (primaryKeyCol) {
              this.upsert(batch as T[], [primaryKeyCol as keyof T]);
              stats.imported += batch.length;
            } else {
              // Fallback to regular insert
              this.insert(batch as T[]);
              stats.imported += batch.length;
            }
          } else {
            this.insert(batch as T[]);
            stats.imported += batch.length;
          }
        } catch (error) {
          if (conflictResolution === 'fail') {
            throw error;
          }
          stats.errors.push(`Batch error: ${error}`);
          stats.skipped += batch.length;
        }
      }

      this.debugLog("JSON import completed", stats);
      return stats;
    } catch (error) {
      stats.errors.push(`Import failed: ${error}`);
      return stats;
    }
  }

  /**
   * Creates a database index on specified columns for improved query performance
   * Supports both regular and unique indexes with configurable creation options
   * Essential for optimizing WHERE clause performance on frequently queried columns
   * 
   * @param options - Index creation configuration
   * @param options.name - Unique name for the index
   * @param options.columns - Array of column names to include in the index
   * @param options.unique - Whether to create a unique index (prevents duplicate values)
   * @param options.ifNotExists - Whether to use IF NOT EXISTS clause (default: true)
   * 
   * @example
   * ```typescript
   * const userTable = new Table<User, User>({ name: 'users' });
   * 
   * // Create index for faster email lookups
   * userTable.createIndex({
   *   name: 'idx_users_email',
   *   columns: ['email'],
   *   unique: true // Ensure email uniqueness
   * });
   * 
   * // Composite index for complex queries
   * userTable.createIndex({
   *   name: 'idx_users_dept_status',
   *   columns: ['department', 'isActive'],
   *   unique: false
   * });
   * 
   * // Performance optimization for date ranges
   * orderTable.createIndex({
   *   name: 'idx_orders_created_at',
   *   columns: ['createdAt']
   * });
   * 
   * // Multi-column unique constraint
   * userRoleTable.createIndex({
   *   name: 'idx_user_role_unique',
   *   columns: ['userId', 'roleId'],
   *   unique: true // Prevent duplicate role assignments
   * });
   * 
   * // Safe index creation (won't fail if exists)
   * userTable.createIndex({
   *   name: 'idx_users_name',
   *   columns: ['name'],
   *   ifNotExists: true
   * });
   * ```
   * 
   * @throws {Error} When index creation fails or column names are invalid
   */
  createIndex(options: {
    name: string;
    columns: (keyof SELECT_FORMAT)[];
    unique?: boolean;
    ifNotExists?: boolean;
  }): void {
    const { name, columns, unique = false, ifNotExists = true } = options;

    const indexType = unique ? "UNIQUE INDEX" : "INDEX";
    const ifNotExistsClause = ifNotExists ? "IF NOT EXISTS" : "";
    const columnList = columns.map(String).join(", ");

    const query = `CREATE ${indexType} ${ifNotExistsClause} ${name} ON ${this.tableName} (${columnList})`;

    try {
      this.databaseInstance.exec(query);
      this.debugLog("Index created", { name, columns, unique });
    } catch (error) {
      throw new Error(`Failed to create index '${name}': ${error}`);
    }
  }

  /**
   * Removes an existing database index to free up space or change indexing strategy
   * Provides safe deletion with optional existence checking
   * Use when indexes are no longer needed or need to be recreated with different configuration
   * 
   * @param indexName - Name of the index to remove
   * @param ifExists - Whether to use IF EXISTS clause to prevent errors (default: true)
   * 
   * @example
   * ```typescript
   * const userTable = new Table<User, User>({ name: 'users' });
   * 
   * // Safe index removal
   * userTable.dropIndex('idx_users_old_column', true);
   * 
   * // Force removal (will throw if index doesn't exist)
   * userTable.dropIndex('idx_users_temp', false);
   * 
   * // Cleanup during schema migration
   * const indexesToDrop = [
   *   'idx_users_legacy_field',
   *   'idx_users_deprecated_status',
   *   'idx_users_old_timestamp'
   * ];
   * 
   * indexesToDrop.forEach(indexName => {
   *   userTable.dropIndex(indexName); // Uses ifExists: true by default
   * });
   * 
   * // Recreate index with new configuration
   * userTable.dropIndex('idx_users_email');
   * userTable.createIndex({
   *   name: 'idx_users_email_domain',
   *   columns: ['email', 'domain'],
   *   unique: true
   * });
   * ```
   * 
   * @throws {Error} When ifExists is false and index doesn't exist, or when drop operation fails
   */
  dropIndex(indexName: string, ifExists: boolean = true): void {
    const ifExistsClause = ifExists ? "IF EXISTS" : "";
    const query = `DROP INDEX ${ifExistsClause} ${indexName}`;

    try {
      this.databaseInstance.exec(query);
      this.debugLog("Index dropped", { indexName });
    } catch (error) {
      throw new Error(`Failed to drop index '${indexName}': ${error}`);
    }
  }

  /**
   * Retrieves comprehensive table statistics and performance metrics
   * Provides insights into table size, structure, and indexing for optimization decisions
   * Useful for monitoring table growth and identifying performance bottlenecks
   * 
   * @returns Detailed statistics object with table metadata and performance metrics
   * 
   * @example
   * ```typescript
   * const userTable = new Table<User, User>({ name: 'users' });
   * const stats = userTable.getTableStats();
   * 
   * console.log(`Table: ${stats.name}`);
   * console.log(`Records: ${stats.recordCount.toLocaleString()}`);
   * console.log(`Estimated size: ${stats.estimatedSize}`);
   * console.log(`Columns: ${stats.columns.length}`);
   * console.log(`Indexes: ${stats.indexes.length}`);
   * 
   * // Analyze column structure
   * stats.columns.forEach(col => {
   *   console.log(`${col.name} (${col.type})${col.primary ? ' PRIMARY KEY' : ''}${col.nullable ? '' : ' NOT NULL'}`);
   * });
   * 
   * // Check indexing coverage
   * if (stats.indexes.length === 0) {
   *   console.warn('No indexes found - consider adding indexes for better performance');
   * }
   * 
   * // Monitor table growth
   * const isLargeTable = stats.recordCount > 100000;
   * if (isLargeTable) {
   *   console.log('Large table detected - consider partitioning or archiving old data');
   * }
   * 
   * // Example output:
   * // {
   * //   name: 'users',
   * //   recordCount: 50000,
   * //   columns: [
   * //     { name: 'id', type: 'number', nullable: false, primary: true },
   * //     { name: 'email', type: 'string', nullable: false, primary: false }
   * //   ],
   * //   indexes: ['idx_users_email', 'idx_users_created_at'],
   * //   estimatedSize: '2.4 MB'
   * // }
   * ```
   */
  getTableStats(): {
    name: string;
    recordCount: number;
    columns: Array<{ name: string; type: string; nullable: boolean; primary: boolean }>;
    indexes: string[];
    estimatedSize: string;
  } {
    const recordCount = this.count();

    const columns = this.schema.map(col => ({
      name: col.name,
      type: col.type,
      nullable: !!col.nullable,
      primary: !!col.primary
    }));

    const indexResult = this.databaseInstance.prepare(
      `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name = ?`
    ).all(this.tableName) as { name: string }[];

    const indexes = indexResult.map(row => row.name);

    // Rough size estimation (this is approximate)
    const avgRecordSize = Math.max(columns.length * 20, 100); // Rough estimate
    const estimatedBytes = recordCount * avgRecordSize;
    const estimatedSize = this.formatBytes(estimatedBytes);

    return {
      name: this.tableName,
      recordCount,
      columns,
      indexes,
      estimatedSize
    };
  }

  /**
   * Format bytes to human readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Executes raw SQL queries with automatic parameter binding and type restoration
   * Provides direct database access for complex queries not covered by standard methods
   * Automatically applies data type conversion for results when query involves the current table
   * 
   * @param query - SQL query string with parameter placeholders (?)
   * @param params - Array of parameters to bind to query placeholders
   * @returns Array of query results with automatic type restoration when applicable
   * 
   * @example
   * ```typescript
   * const userTable = new Table<User, User>({ name: 'users' });
   * 
   * // Complex join query
   * const userOrderStats = userTable.rawQuery<{userId: number, orderCount: number, totalSpent: number}>(`
   *   SELECT u.id as userId, COUNT(o.id) as orderCount, SUM(o.total) as totalSpent
   *   FROM users u
   *   LEFT JOIN orders o ON u.id = o.userId
   *   WHERE u.isActive = ?
   *   GROUP BY u.id
   *   HAVING COUNT(o.id) > ?
   * `, [1, 5]); // Active users with more than 5 orders
   * 
   * // Advanced analytics query
   * const monthlyGrowth = userTable.rawQuery(`
   *   SELECT 
   *     strftime('%Y-%m', datetime(createdAt/1000, 'unixepoch')) as month,
   *     COUNT(*) as newUsers
   *   FROM users 
   *   WHERE createdAt > ?
   *   GROUP BY month
   *   ORDER BY month DESC
   * `, [Date.now() - (365 * 24 * 60 * 60 * 1000)]); // Last year
   * 
   * // Custom aggregation with window functions
   * const userRankings = userTable.rawQuery(`
   *   SELECT 
   *     name,
   *     points,
   *     RANK() OVER (ORDER BY points DESC) as ranking
   *   FROM users 
   *   WHERE points > ?
   * `, [1000]);
   * 
   * // Database maintenance queries
   * const tableInfo = userTable.rawQuery(`
   *   SELECT sql FROM sqlite_master WHERE type='table' AND name=?
   * `, ['users']);
   * 
   * // Performance analysis
   * const queryPlan = userTable.rawQuery(`
   *   EXPLAIN QUERY PLAN
   *   SELECT * FROM users WHERE email = ? AND isActive = ?
   * `, ['john@example.com', 1]);
   * ```
   * 
   * @note Use with caution - raw queries bypass type safety and ORM protections
   */
  rawQuery<TResult = any>(query: string, params: any[] = []): TResult[] {
    this.debugLog("Executing raw query", { query, params });

    return this.executeWithErrorWrapper(() => {
      const stmt = this.databaseInstance.prepare(query);
      const results = stmt.all(...params) as Record<string, unknown>[];
      stmt.finalize();

      // Apply data type restoration if results seem to be from this table
      if (results.length > 0 && query.toLowerCase().includes(this.tableName.toLowerCase())) {
        return results.map(row => this.restoreDataTypes(row)) as TResult[];
      }

      return results as TResult[];
    });
  }
}



// Backward compatibility export
export const _Database = DatabaseManager;

export const wild = {
  single: "_",
  multiple: "%",
} as const;
