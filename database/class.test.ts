import { describe, test, expect } from "bun:test";
import { Table } from "./class";
import type { DBSchema, TableSchema } from "./schema";

// Mock database setup for testing
const mockDB = {
    prepare: (query: string) => ({
        all: (...params: any[]) => [
            { id: 1, username: "john", password: "secret", email: "john@example.com", age: 25 },
            { id: 2, username: "jane", password: "password", email: "jane@example.com", age: 30 }
        ],
        get: (...params: any[]) => ({ count: 2 }),
        run: (...params: any[]) => { },
        finalize: () => { }
    }),
    query: (query: string) => ({
        run: () => { },
        finalize: () => { }
    }),
    exec: (query: string) => { },
    transaction: (fn: any) => fn
} as any;

// Mock schema with proper types
const mockSchema: DBSchema = [
    {
        name: "users",
        columns: [
            { name: "id", type: "number", primary: true },
            { name: "username", type: "string" },
            { name: "password", type: "string" },
            { name: "email", type: "string" },
            { name: "age", type: "number" }
        ]
    }
];

// Set up global mocks
globalThis.MainDatabase = mockDB;
globalThis.dbSchema = mockSchema;

// Define types for our test table
type User = {
    id: number;
    username: string;
    password: string;
    email: string;
    age: number;
};

describe("Table Select Method Type Safety", () => {
    const usersTable = new Table<User, User>({
        name: "users",
        db: mockDB,
        schema: mockSchema
    });

    test("should return all fields when select is '*' or undefined", () => {
        // Test with select: "*"
        const allUsers1 = usersTable.select({ select: "*" });

        // TypeScript should infer: User[]
        // All fields should be accessible
        expect(allUsers1[0].id).toBeDefined();
        expect(allUsers1[0].username).toBeDefined();
        expect(allUsers1[0].password).toBeDefined();
        expect(allUsers1[0].email).toBeDefined();
        expect(allUsers1[0].age).toBeDefined();

        // Test with no select (defaults to all)
        const allUsers2 = usersTable.select({});

        // TypeScript should infer: User[]
        expect(allUsers2[0].id).toBeDefined();
        expect(allUsers2[0].username).toBeDefined();
        expect(allUsers2[0].password).toBeDefined();
        expect(allUsers2[0].email).toBeDefined();
        expect(allUsers2[0].age).toBeDefined();
    });

    test("should return only selected fields when specific fields are chosen", () => {
        // Test with specific field selection
        const selectedUsers = usersTable.select({
            select: { username: true, email: true }
        });


        // TypeScript should infer: Pick<User, "username" | "email">[]
        // Only username and email should be accessible in TypeScript
        expect(selectedUsers[0].username).toBeDefined();
        expect(selectedUsers[0].email).toBeDefined();

        // These would cause TypeScript errors (but we can't test that in runtime)
        // selectedUsers[0].id        // ❌ TypeScript error
        // selectedUsers[0].password  // ❌ TypeScript error
        // selectedUsers[0].age       // ❌ TypeScript error
    });

    test("should handle single field selection", () => {
        const usernameOnly = usersTable.select({
            select: { username: true }
        });

        // TypeScript should infer: Pick<User, "username">[]
        expect(usernameOnly[0].username).toBeDefined();
        expect(typeof usernameOnly[0].username).toBe("string");
    });

    test("should handle complex where clauses with proper typing", () => {
        const filteredUsers = usersTable.select({
            select: { id: true, username: true },
            where: { age: 25 },
            limit: 10
        });

        // TypeScript should infer: Pick<User, "id" | "username">[]
        expect(Array.isArray(filteredUsers)).toBe(true);
        expect(filteredUsers[0].id).toBeDefined();
        expect(filteredUsers[0].username).toBeDefined();
    });

    test("should work with boolean field selections", () => {
        // Only specify the fields you want (true values only)
        const partialUsers = usersTable.select({
            select: {
                username: true,
                email: true
                // password, age, and id not specified, should not be included
            }
        });

        // TypeScript should infer: Pick<User, "username" | "email">[]
        expect(partialUsers[0].username).toBeDefined();
        expect(partialUsers[0].email).toBeDefined();
    });
});

/**
 * Type testing examples (these demonstrate TypeScript intellisense)
 */
export function typeTestingExamples() {
    const usersTable = new Table<User, User>({
        name: "users",
        db: mockDB,
        schema: mockSchema
    });

    // Example 1: Select all fields
    const allUsers = usersTable.select({ select: "*" });
    // Type: User[]
    // Available: allUsers[0].id, .username, .password, .email, .age ✅

    // Example 2: Select specific fields
    const specificUsers = usersTable.select({
        select: { username: true, email: true }
    });
    // Type: Pick<User, "username" | "email">[]
    // Available: specificUsers[0].username, .email ✅
    // Not available: .id, .password, .age ❌

    // Example 3: Select single field
    const usernameOnly = usersTable.select({
        select: { username: true }
    });
    // Type: Pick<User, "username">[]
    // Available: usernameOnly[0].username ✅
    // Not available: .id, .password, .email, .age ❌

    // Example 4: Default behavior (no select specified)
    const defaultUsers = usersTable.select({});
    // Type: User[]
    // Available: defaultUsers[0].id, .username, .password, .email, .age ✅

    return {
        allUsers,
        specificUsers,
        usernameOnly,
        defaultUsers
    };
}
