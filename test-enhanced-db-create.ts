#!/usr/bin/env bun
/**
 * Test script for enhanced database:create functionality
 * This demonstrates the backup, recreate, and merge process
 */

import { handleDatabaseCreate } from './bin/db.ts';
import { resolve } from 'node:path';

console.log("🧪 Testing Enhanced Database Creation");
console.log("=====================================");

async function testDatabaseCreation() {
    try {
        // First, let's create some test data if database doesn't exist
        const dbPath = resolve(process.cwd(), "config", "bunext.sqlite");
        const dbFile = Bun.file(dbPath);

        if (await dbFile.exists()) {
            console.log("📋 Existing database found - this will test the migration process");
        } else {
            console.log("📋 No existing database - this will test initial creation");
        }

        console.log("\n🚀 Starting enhanced database creation...");
        await handleDatabaseCreate();

        console.log("\n✅ Test completed successfully!");

    } catch (error) {
        console.error("\n❌ Test failed:", error);
        process.exit(1);
    }
}

// Only run if this file is executed directly
if (import.meta.main) {
    testDatabaseCreation();
}

export { testDatabaseCreation };
