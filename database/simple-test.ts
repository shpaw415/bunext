/**
 * Test the simple table implementation to verify autocomplete works
 */

import { SimpleDatabase } from "./simple-index";

// Get database
const db = SimpleDatabase();

function testSimpleAutocomplete() {
    console.log('=== Testing Simple Table Autocomplete ===');

    // Test 1: Select with autocomplete
    // When you type "select: {" you should see: id, username, password, role, data, createdAt
    const users = db.Users.select({
        select: {
            username: true,  // ✅ Should have autocomplete
            role: true,      // ✅ Should have autocomplete
            data: true,      // ✅ Should have autocomplete
        }
    });

    // Test 2: Where clause autocomplete
    const filteredUsers = db.Users.select({
        where: {
            role: 'admin',   // ✅ Should have autocomplete for field names
            // username: 'test' // ✅ Should have autocomplete
        },
        select: {
            username: true,  // ✅ Should have autocomplete
            role: true,      // ✅ Should have autocomplete
        }
    });

    // Test 3: FindFirst autocomplete
    const firstUser = db.Users.findFirst({
        where: { role: 'admin' },
        select: {
            username: true,  // ✅ Should have autocomplete
            data: true,      // ✅ Should have autocomplete
        }
    });

    // Test 4: Query builder autocomplete
    const queryResult = db.Users
        .query()
        .where({ role: 'user' })     // ✅ Should have autocomplete
        .select({
            username: true,            // ✅ Should have autocomplete
            createdAt: true,          // ✅ Should have autocomplete
        })
        .execute();

    console.log('Simple autocomplete test completed');
}

// Test error cases - these should show TypeScript errors
function testErrorCases() {
    // ❌ These should cause TypeScript errors:

    // const invalid1 = db.Users.select({
    //   select: { invalidField: true }  // Should error
    // });

    // const invalid2 = db.Users.select({
    //   where: { invalidField: 'test' }  // Should error
    // });
}

if (import.meta.main) {
    testSimpleAutocomplete();
}

export { testSimpleAutocomplete };
