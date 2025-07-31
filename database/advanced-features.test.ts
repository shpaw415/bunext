import { expect } from "bun:test";
import { test, describe, beforeEach } from "bun:test";
import { Table } from "./class";
import Database from "bun:sqlite";

// Test the advanced features
const db = new Database(":memory:");

type User = {
    id: number;
    name: string;
    email: string;
    age: number;
    isActive: boolean;
    createdAt: Date;
};

describe("Advanced Table Features", () => {
    let userTable: Table<User, User>;

    beforeEach(() => {
        // Create fresh table for each test
        db.exec("DROP TABLE IF EXISTS users");

        userTable = new Table<User, User>({
            name: "users",
            db,
            schema: [
                {
                    name: "users",
                    columns: [
                        { name: "id", type: "number", primary: true, autoIncrement: true },
                        { name: "name", type: "string" },
                        { name: "email", type: "string", unique: true },
                        { name: "age", type: "number" },
                        { name: "isActive", type: "boolean", default: true },
                        { name: "createdAt", type: "Date", default: new Date() }
                    ]
                }
            ],
            debug: false
        });

        userTable.createTable();
    });

    test("bulk insert operations", () => {
        const users: User[] = [
            { name: "User 1", email: "user1@example.com", age: 25, isActive: true, createdAt: new Date(), id: 1 },
            { name: "User 2", email: "user2@example.com", age: 30, isActive: false, createdAt: new Date(), id: 2 },
            { name: "User 3", email: "user3@example.com", age: 35, isActive: true, createdAt: new Date(), id: 3 }
        ];

        const insertedIds = userTable.bulkInsert(users);
        expect(insertedIds).toEqual([1, 2, 3]);

        const count = userTable.count();
        expect(count).toBe(3);
    });

    test("upsert operations", () => {
        const user: User = {
            name: "John Doe",
            email: "john@example.com",
            age: 30,
            isActive: true,
            createdAt: new Date(),
            id: 1
        };

        // Insert first
        userTable.insert([user]);

        // Upsert - should update existing and insert new
        const upsertData: User[] = [
            { id: 1, name: "John Updated", email: "john@example.com", age: 31, isActive: true, createdAt: new Date() },
            { id: 2, name: "Jane Doe", email: "jane@example.com", age: 28, isActive: true, createdAt: new Date() }
        ];

        userTable.upsert(upsertData, ["id"], ["name", "age"]);

        const allUsers = userTable.select({ select: "*" });
        expect(allUsers.length).toBe(2);

        const johnUser = allUsers.find(u => u.email === "john@example.com");
        expect(johnUser?.name).toBe("John Updated");
        expect(johnUser?.age).toBe(31);

        const janeUser = allUsers.find(u => u.email === "jane@example.com");
        expect(janeUser?.name).toBe("Jane Doe");
    });

    test("findFirst helper", () => {
        // Insert test data
        const users: User[] = [
            { id: 1, name: "Alice", email: "alice@example.com", age: 25, isActive: true, createdAt: new Date() },
            { id: 2, name: "Bob", email: "bob@example.com", age: 30, isActive: false, createdAt: new Date() },
            { id: 3, name: "Charlie", email: "charlie@example.com", age: 35, isActive: true, createdAt: new Date() }
        ];
        userTable.bulkInsert(users);

        // Test findFirst with condition
        const firstActive = userTable.findFirst({ where: { isActive: true } });
        expect(firstActive?.name).toBe("Alice");

        // Test findFirst with no match
        const notFound = userTable.findFirst({ where: { age: 100 } });
        expect(notFound).toBeNull();

        // Test findFirst with select
        const partial = userTable.findFirst({
            where: { isActive: false },
            select: { name: true, age: true }
        });
        expect(partial?.name).toBe("Bob");
        expect(partial?.age).toBe(30);
    });

    test("exists helper", () => {
        // Insert test data
        const users: User[] = [
            { id: 1, name: "Alice", email: "alice@example.com", age: 25, isActive: true, createdAt: new Date() },
            { id: 2, name: "Bob", email: "bob@example.com", age: 30, isActive: false, createdAt: new Date() }
        ];
        userTable.bulkInsert(users);

        // Test exists with match
        const hasInactive = userTable.exists({ where: { isActive: false } });
        expect(hasInactive).toBe(true);

        // Test exists with no match
        const hasOldUser = userTable.exists({ where: { age: 100 } });
        expect(hasOldUser).toBe(false);
    });

    test("distinct helper", () => {
        // Insert test data with duplicate ages
        const users: User[] = [
            { id: 1, name: "Alice", email: "alice@example.com", age: 25, isActive: true, createdAt: new Date() },
            { id: 2, name: "Bob", email: "bob@example.com", age: 30, isActive: false, createdAt: new Date() },
            { id: 3, name: "Charlie", email: "charlie@example.com", age: 25, isActive: true, createdAt: new Date() },
            { id: 4, name: "David", email: "david@example.com", age: 35, isActive: true, createdAt: new Date() }
        ];
        userTable.bulkInsert(users);

        // Test distinct ages
        const distinctAges = userTable.distinct({ column: "age" });
        expect(distinctAges.sort()).toEqual([25, 30, 35]);

        // Test distinct boolean values
        const distinctActive = userTable.distinct({ column: "isActive" });
        expect(distinctActive.sort()).toEqual([false, true]); // Our enhanced method properly restores boolean types
    });

    test("aggregate helper", () => {
        // Insert test data
        const users: User[] = [
            { id: 1, name: "Alice", email: "alice@example.com", age: 20, isActive: true, createdAt: new Date() },
            { id: 2, name: "Bob", email: "bob@example.com", age: 30, isActive: false, createdAt: new Date() },
            { id: 3, name: "Charlie", email: "charlie@example.com", age: 40, isActive: true, createdAt: new Date() }
        ];
        userTable.bulkInsert(users);

        // Test aggregate functions
        const stats = userTable.aggregate({
            column: "age",
            functions: ["AVG", "MIN", "MAX", "SUM", "COUNT"]
        });

        expect(stats.MIN).toBe(20);
        expect(stats.MAX).toBe(40);
        expect(stats.SUM).toBe(90); // 20+30+40
        expect(stats.COUNT).toBe(3);
        expect(stats.AVG).toBe(30); // 90/3

        // Test with where condition
        const activeStats = userTable.aggregate({
            column: "age",
            functions: ["AVG", "COUNT"],
            where: { isActive: true }
        });

        expect(activeStats.COUNT).toBe(2); // Alice and Charlie
        expect(activeStats.AVG).toBe(30); // (20+40)/2
    });

    test("paginate helper", () => {
        // Insert test data
        const users = Array.from({ length: 10 }, (_, i) => ({
            name: `User ${i + 1}`,
            email: `user${i + 1}@example.com`,
            age: 20 + i,
            isActive: i % 2 === 0,
            createdAt: new Date(),
            id: i + 1
        }));
        userTable.bulkInsert(users);

        // Test basic pagination
        const page1 = userTable.paginate({
            page: 1,
            pageSize: 3,
            orderBy: { column: "name", direction: "ASC" }
        });

        expect(page1.data.length).toBe(3);
        expect(page1.total).toBe(10);
        expect(page1.page).toBe(1);
        expect(page1.pageSize).toBe(3);
        expect(page1.totalPages).toBe(4); // Math.ceil(10/3)
        expect(page1.data[0].name).toBe("User 1");

        // Test pagination with where condition
        const activePage = userTable.paginate({
            page: 1,
            pageSize: 2,
            where: { isActive: true },
            orderBy: { column: "age", direction: "ASC" }
        });

        expect(activePage.total).toBe(5); // 5 active users (even indices)
        expect(activePage.data.length).toBe(2);
        expect(activePage.totalPages).toBe(3); // Math.ceil(5/2)

        // Test pagination with select
        const partialPage = userTable.paginate({
            page: 1,
            pageSize: 2,
            select: { name: true, age: true },
            orderBy: { column: "age", direction: "DESC" }
        });

        expect(partialPage.data.length).toBe(2);
        expect(partialPage.data[0].name).toBeDefined();
        expect(partialPage.data[0].age).toBeDefined();
    });

    test("performance with large dataset", () => {
        // Test that operations are reasonably fast
        const users = Array.from({ length: 1000 }, (_, i) => ({
            id: i + 1,
            name: `User ${i}`,
            email: `user${i}@example.com`,
            age: 20 + (i % 50),
            isActive: i % 2 === 0,
            createdAt: new Date()
        }));

        // Bulk insert should be fast
        const startTime = performance.now();
        const ids = userTable.bulkInsert(users);
        const insertTime = performance.now() - startTime;

        expect(ids.length).toBe(1000);
        expect(insertTime).toBeLessThan(2000); // Should complete in under 2 seconds

        // Count operations should be fast
        const countStartTime = performance.now();
        const activeCount = userTable.count({ where: { isActive: true } });
        const countTime = performance.now() - countStartTime;

        expect(activeCount).toBe(500);
        expect(countTime).toBeLessThan(100); // Should be very fast

        // Pagination should work efficiently
        const paginationStartTime = performance.now();
        const result = userTable.paginate({
            page: 5,
            pageSize: 50,
            where: { isActive: true },
            orderBy: { column: "age", direction: "ASC" }
        });
        const paginationTime = performance.now() - paginationStartTime;

        expect(result.data.length).toBe(50);
        expect(paginationTime).toBeLessThan(200); // Should complete quickly
    });
});
