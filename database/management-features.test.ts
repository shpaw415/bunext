import { expect } from "bun:test";
import { test, describe, beforeEach, afterEach } from "bun:test";
import { DatabaseManager, Table } from "./class";
import Database from "bun:sqlite";
import { unlinkSync, existsSync } from "fs";

describe("Database Management Features", () => {
    let db: Database;
    let dbManager: DatabaseManager;
    let testTable: Table<any, any>;
    const testDbPath = "./test-backup.db";
    const backupPath = "./test-backup-file.db";
    const jsonBackupPath = "./test-schema.json";

    beforeEach(() => {
        db = new Database(":memory:");
        dbManager = new DatabaseManager(db);

        testTable = new Table({
            name: "test_users",
            db,
            schema: [
                {
                    name: "test_users",
                    columns: [
                        { name: "id", type: "number", primary: true, autoIncrement: true },
                        { name: "name", type: "string" },
                        { name: "email", type: "string", unique: true },
                        { name: "age", type: "number" },
                        { name: "isActive", type: "boolean", default: true }
                    ]
                }
            ]
        });

        testTable.createTable();
    });

    afterEach(() => {
        // Clean up test files
        [testDbPath, backupPath, jsonBackupPath].forEach(path => {
            if (existsSync(path)) {
                try {
                    unlinkSync(path);
                } catch (e) {
                    // Ignore cleanup errors
                }
            }
        });
    });

    test("database backup and restore", () => {
        // Insert test data
        testTable.insert([
            { id: 1, name: "Alice", email: "alice@test.com", age: 25, isActive: true },
            { id: 2, name: "Bob", email: "bob@test.com", age: 30, isActive: false }
        ]);

        // Create backup
        dbManager.backup(backupPath);
        expect(existsSync(backupPath)).toBe(true);

        // Verify data exists
        const originalData = testTable.select({ select: "*" });
        expect(originalData.length).toBe(2);

        // Clear current database
        db.exec("DROP TABLE test_users");

        // Restore from backup
        dbManager.restore(backupPath);

        // Recreate table instance
        testTable = new Table({
            name: "test_users",
            db,
            schema: [
                {
                    name: "test_users",
                    columns: [
                        { name: "id", type: "number", primary: true, autoIncrement: true },
                        { name: "name", type: "string" },
                        { name: "email", type: "string", unique: true },
                        { name: "age", type: "number" },
                        { name: "isActive", type: "boolean", default: true }
                    ]
                }
            ]
        });

        // Verify data was restored
        const restoredData = testTable.select({ select: "*" });
        expect(restoredData.length).toBe(2);
        expect(restoredData[0].name).toBe("Alice");
    });

    test("compressed backup and restore", () => {
        const compressedBackupPath = "./test-backup-compressed.db.gz";
        const compressedJsonPath = "./test-schema-compressed.json.gz";

        // Clean up function
        const cleanup = () => {
            [compressedBackupPath, compressedJsonPath].forEach(path => {
                if (existsSync(path)) {
                    try {
                        unlinkSync(path);
                    } catch (e) {
                        // Ignore cleanup errors
                    }
                }
            });
        };

        try {
            // Insert test data
            testTable.insert([
                { id: 1, name: "Alice", email: "alice@test.com", age: 25, isActive: true },
                { id: 2, name: "Bob", email: "bob@test.com", age: 30, isActive: false }
            ]);

            // Create compressed backup with data
            dbManager.backup(compressedBackupPath, { compress: true, includeData: true });
            expect(existsSync(compressedBackupPath)).toBe(true);

            // Create compressed schema-only backup
            dbManager.backup(compressedJsonPath, { compress: true, includeData: false });
            expect(existsSync(compressedJsonPath)).toBe(true);

            // Verify original data exists
            const originalData = testTable.select({ select: "*" });
            expect(originalData.length).toBe(2);

            // Test restoring from compressed full backup
            db.exec("DROP TABLE test_users");
            dbManager.restore(compressedBackupPath);

            // Recreate table instance
            testTable = new Table({
                name: "test_users",
                db,
                schema: [
                    {
                        name: "test_users",
                        columns: [
                            { name: "id", type: "number", primary: true, autoIncrement: true },
                            { name: "name", type: "string" },
                            { name: "email", type: "string", unique: true },
                            { name: "age", type: "number" },
                            { name: "isActive", type: "boolean", default: true }
                        ]
                    }
                ]
            });

            // Verify data was restored from compressed backup
            const restoredData = testTable.select({ select: "*" });
            expect(restoredData.length).toBe(2);
            expect(restoredData[0].name).toBe("Alice");
            expect(restoredData[1].name).toBe("Bob");

            // Test restoring schema from compressed JSON
            db.exec("DROP TABLE test_users");
            dbManager.restore(compressedJsonPath);

            // Verify table structure was restored (but no data)
            const tables = dbManager.listTables();
            expect(tables).toContain("test_users");

        } finally {
            cleanup();
        }
    });

    test("database statistics", () => {
        // Insert test data
        testTable.insert([
            { id: 1, name: "Alice", email: "alice@test.com", age: 25, isActive: true },
            { id: 2, name: "Bob", email: "bob@test.com", age: 30, isActive: false },
            { id: 3, name: "Charlie", email: "charlie@test.com", age: 35, isActive: true }
        ]);

        const stats = dbManager.getDatabaseStats();
        expect(stats.tables).toBe(1);
        expect(stats.totalRecords).toBe(3);
        expect(stats.tableStats.length).toBe(1);
        expect(stats.tableStats[0].name).toBe("test_users");
        expect(stats.tableStats[0].records).toBe(3);
    });

    test("table export and import JSON", () => {
        // Insert test data
        const testData = [
            { id: 1, name: "Alice", email: "alice@test.com", age: 25, isActive: true },
            { id: 2, name: "Bob", email: "bob@test.com", age: 30, isActive: false }
        ];
        testTable.insert(testData);

        // Export to JSON
        const jsonExport = testTable.exportToJson();
        expect(typeof jsonExport).toBe("string");

        const exportData = JSON.parse(jsonExport as string);
        expect(exportData.table).toBe("test_users");
        expect(exportData.count).toBe(2);
        expect(exportData.data.length).toBe(2);

        // Clear table
        testTable.delete({ where: { id: 1 } as any }); // Delete specific record first
        testTable.delete({ where: { id: 2 } as any }); // Delete remaining record
        expect(testTable.count()).toBe(0);

        // Import from JSON
        const importStats = testTable.importFromJson(exportData);
        expect(importStats.imported).toBe(2);
        expect(importStats.errors.length).toBe(0);

        // Verify data was imported
        const importedData = testTable.select({ select: "*" });
        expect(importedData.length).toBe(2);
        expect(importedData[0].name).toBe("Alice");
    });

    test("table statistics", () => {
        // Insert test data
        testTable.insert([
            { id: 1, name: "Alice", email: "alice@test.com", age: 25, isActive: true },
            { id: 2, name: "Bob", email: "bob@test.com", age: 30, isActive: false }
        ]);

        const stats = testTable.getTableStats();
        expect(stats.name).toBe("test_users");
        expect(stats.recordCount).toBe(2);
        expect(stats.columns.length).toBe(5);
        expect(stats.columns.find(col => col.name === "id")?.primary).toBe(true);
        expect(typeof stats.estimatedSize).toBe("string");
    });

    test("create and drop index", () => {
        // Create index
        testTable.createIndex({
            name: "idx_email",
            columns: ["email"],
            unique: true
        });

        // Create another index
        testTable.createIndex({
            name: "idx_name_age",
            columns: ["name", "age"]
        });

        // Verify indexes exist (this would be visible in table stats)
        const stats = testTable.getTableStats();
        expect(stats.indexes.length).toBeGreaterThan(0);

        // Drop index
        testTable.dropIndex("idx_email");

        // Note: We can't easily verify the index was dropped without more complex queries
        // but the operation should complete without error
    });

    test("database integrity check", () => {
        // Insert some data
        testTable.insert([
            { id: 1, name: "Alice", email: "alice@test.com", age: 25, isActive: true }
        ]);

        const integrity = dbManager.checkIntegrity();
        expect(integrity.isValid).toBe(true);
        expect(integrity.errors.length).toBe(0);
    });

    test("database optimization", () => {
        // Insert some data
        testTable.insert([
            { id: 1, name: "Alice", email: "alice@test.com", age: 25, isActive: true },
            { id: 2, name: "Bob", email: "bob@test.com", age: 30, isActive: false }
        ]);

        // This should complete without error
        dbManager.optimize({
            vacuum: true,
            analyze: true,
            reindex: false
        });

        // Verify data is still there after optimization
        const count = testTable.count();
        expect(count).toBe(2);
    });

    test("raw query execution", () => {
        // Insert test data
        testTable.insert([
            { id: 1, name: "Alice", email: "alice@test.com", age: 25, isActive: true },
            { id: 2, name: "Bob", email: "bob@test.com", age: 30, isActive: false }
        ]);

        // Execute raw query
        const results = testTable.rawQuery<{ name: string; age: number }>(
            "SELECT name, age FROM test_users WHERE age > ?",
            [20]
        );

        expect(results.length).toBe(2);
        expect(results[0].name).toBeDefined();
        expect(results[0].age).toBeDefined();
    });
});
