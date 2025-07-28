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
   * Creates tables from the provided schema
   * @param schema - Single table schema or array of table schemas
   */
  create(schema: TableSchema | TableSchema[]): void {
    const schemas = Array.isArray(schema) ? schema : [schema];

    for (const tableSchema of schemas) {
      this.createTable(tableSchema);
    }
  }

  /**
   * Creates a table based on the provided schema
   * @param tableSchema - The schema definition for the table
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
}
// Type definitions for database operations
type OptionsFlags<Type> = {
  [Property in keyof Type]: boolean;
};

type ReservedKeyWords = "LIKE" | "OR";
type TableExtends = Record<string | ReservedKeyWords, string | number>;

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
  private readonly schema: DBSchema;

  /**
   * Direct access to the database instance
   * @link https://bun.sh/docs/api/sqlite
   */
  readonly databaseInstance: _BunDB;

  constructor({
    name,
    db,
    schema,
    debug = false,
    enableWAL = true,
  }: {
    name: string;
    db?: _BunDB;
    schema?: DBSchema;
    debug?: boolean;
    enableWAL?: boolean;
  }) {
    this.tableName = name;
    this.databaseInstance = db || globalThis.MainDatabase;
    this.schema = schema || globalThis.dbSchema || [];
    this.isDebugEnabled = debug;

    if (!this.databaseInstance) {
      throw new Error("Database instance is not available");
    }

    if (enableWAL && db) {
      this.databaseInstance.exec("PRAGMA journal_mode = WAL;");
    }
  }

  // Public API methods

  /**
   * Select records from the table
   */
  select(options: DatabaseSelectOptions<SELECT_FORMAT>): Partial<SELECT_FORMAT>[] {
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
      const results = query.all(...params);
      query.finalize();
      return results.map(row => this.restoreDataTypes(row)) as Partial<SELECT_FORMAT>[];
    });
  }

  /**
   * Insert records into the table
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
   * Update records in the table
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
   * Delete records from the table
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
   * Count records in the table
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
        col => (options.select as any)[col]
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

  private buildWhereClause(where: any): string {
    if (!where || Object.keys(where).length === 0) {
      return "";
    }

    // Handle LIKE operator
    if (where.LIKE) {
      const likeConditions = Object.keys(where.LIKE).map(key => `${key} LIKE ?`);
      return `WHERE ${likeConditions.join(" AND ")}`;
    }

    // Handle OR operator
    if (where.OR && Array.isArray(where.OR)) {
      const orConditions = where.OR.map((condition: any) => {
        if (condition.LIKE) {
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

  private extractQueryParameters(options: any): any[] {
    return this.extractWhereParameters(options.where);
  }

  private extractWhereParameters(where: any): any[] {
    if (!where) return [];

    // Handle LIKE operator
    if (where.LIKE) {
      return this.parseParameters(Object.values(where.LIKE));
    }

    // Handle OR operator
    if (where.OR && Array.isArray(where.OR)) {
      const parameters: any[] = [];
      for (const condition of where.OR) {
        if (condition.LIKE) {
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

  private parseParameters(params: any[]): any[] {
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
      if (typeof param === "object") {
        return JSON.stringify(param);
      }
      return param;
    });
  }

  private formatRecordForInsert(record: Record<string, any>): Record<string, any> {
    const formatted: Record<string, any> = {};

    for (const [key, value] of Object.entries(record)) {
      const paramKey = `$${key}`;
      formatted[paramKey] = this.parseParameters([value])[0];
    }

    return formatted;
  }

  private restoreDataTypes(row: any): any {
    const restored: Record<string, any> = {};
    const tableSchema = this.schema.find(schema => schema.name === this.tableName);

    if (!tableSchema) {
      return row;
    }

    for (const [key, value] of Object.entries(row)) {
      const column = tableSchema.columns.find(col => col.name === key);

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

  private executeWithErrorWrapper<T>(callback: () => T): T {
    const maxRetries = 3;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        return callback();
      } catch (error) {
        const err = error as Error;

        if (err.name === "SQLiteError" && err.message.includes("database is locked")) {
          retries++;
          if (retries >= maxRetries) {
            throw new Error("Database is locked after multiple retry attempts");
          }
          // Wait a bit before retrying
          const delay = Math.min(100 * Math.pow(2, retries), 1000);
          Bun.sleepSync(delay);
          continue;
        }

        throw error;
      }
    }

    throw new Error("Unexpected error in executeWithErrorWrapper");
  }

  private debugLog(message: string, data?: any): void {
    if (this.isDebugEnabled) {
      console.log(`[Table:${this.tableName}] ${message}`, data || "");
    }
  }
}

// Backward compatibility export
export const _Database = DatabaseManager;

export const wild = {
  single: "_",
  multiple: "%",
} as const;
