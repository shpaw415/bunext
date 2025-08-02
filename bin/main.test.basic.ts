import { test, expect, describe } from "bun:test";

describe("Bunext Framework Basic Tests", () => {
    test("basic test runner functionality", () => {
        expect(1 + 1).toBe(2);
        expect("hello").toBe("hello");
        expect(true).toBe(true);
    });

    test("bun environment check", () => {
        expect(typeof Bun).toBe("object");
        expect(Bun.version).toBeDefined();
        console.log(`Running on Bun ${Bun.version}`);
    });

    test("database file exists", async () => {
        const fs = await import("node:fs");
        const databaseExists = fs.existsSync("./config/bunext.sqlite");
        expect(databaseExists).toBe(true);
        console.log("Database file: ✓ exists");
    });

    test("configuration files exist", async () => {
        const fs = await import("node:fs");

        const serverConfigExists = fs.existsSync("./config/server.ts");
        expect(serverConfigExists).toBe(true);
        console.log("Server config: ✓ exists");

        const databaseConfigExists = fs.existsSync("./config/database.ts");
        expect(databaseConfigExists).toBe(true);
        console.log("Database config: ✓ exists");
    });

    test("database connection", async () => {
        try {
            const { Database } = await import("bun:sqlite");
            const db = new Database("./config/bunext.sqlite", { readonly: true });

            // Simple query to test connection
            const result = db.query("SELECT 1 as test").get();
            expect(result).toEqual({ test: 1 });

            db.close();
            console.log("Database connection: ✓ working");
        } catch (error) {
            console.error("Database connection failed:", error);
            throw error;
        }
    });

    test("package.json accessibility", async () => {
        try {
            const packageJson = await import("../package.json");
            expect(packageJson.name).toBe("bunext-js");
            expect(packageJson.version).toBeDefined();
            console.log(`Package: ${packageJson.name} v${packageJson.version}`);
        } catch (error) {
            console.error("Package.json access failed:", error);
            throw error;
        }
    });
});
