/**
 * Test the fixed table implementation
 * This should have working autocomplete for select fields
 */

import { FixedDatabase } from "./fixed-index";

// Get the fixed database
const db = FixedDatabase();

function testFixedAutocomplete() {
    console.log('=== Testing Fixed Table Autocomplete ===');

    // ✅ Test 1: Basic select with autocomplete
    // When you type in the select object, you should see autocomplete for:
    // id, username, password, role, data, createdAt
    const usersBasic = db.Users.select({
        select: {
            id: true,           // ✅ Should autocomplete
            username: true,     // ✅ Should autocomplete
            role: true,         // ✅ Should autocomplete
            // data: true,      // ✅ Try uncommenting - should autocomplete
            // createdAt: true, // ✅ Try uncommenting - should autocomplete
        }
    });
    console.log('Basic select result:', usersBasic);

    // ✅ Test 2: Where clause with autocomplete  
    const usersFiltered = db.Users.select({
        where: {
            role: 'admin',      // ✅ Field name should autocomplete
            // username: 'test' // ✅ Try uncommenting - field should autocomplete
        },
        select: {
            username: true,     // ✅ Should autocomplete
            role: true,         // ✅ Should autocomplete
            data: true,         // ✅ Should autocomplete
        }
    });
    console.log('Filtered select result:', usersFiltered);

    // ✅ Test 3: FindFirst with autocomplete
    const firstUser = db.Users.findFirst({
        where: {
            role: 'admin'       // ✅ Should autocomplete
        },
        select: {
            username: true,     // ✅ Should autocomplete
            data: true,         // ✅ Should autocomplete
            createdAt: true,    // ✅ Should autocomplete
        }
    });
    console.log('First user result:', firstUser);

    // ✅ Test 4: Query builder with autocomplete
    const queryResult = db.Users
        .query()
        .where({
            role: 'user'        // ✅ Should autocomplete for field names
        })
        .select({
            id: true,           // ✅ Should autocomplete
            username: true,     // ✅ Should autocomplete
            createdAt: true,    // ✅ Should autocomplete
        })
        .limit(10)
        .execute();
    console.log('Query builder result:', queryResult);

    // ✅ Test 5: All variations
    const allUsers = db.Users.select(); // All fields
    const filteredUsers2 = db.Users.select({ where: { role: 'admin' } }); // All fields with filter

    console.log('All test cases completed successfully!');
}

function testTypeSafety() {
    console.log('=== Testing Type Safety ===');

    // ❌ These should cause TypeScript errors (uncomment to test):

    // const invalidField = db.Users.select({
    //   select: { nonExistentField: true }  // Should show error
    // });

    // const invalidWhere = db.Users.select({
    //   where: { invalidField: 'test' }     // Should show error  
    // });

    // const wrongType = db.Users.select({
    //   where: { id: 'not-a-number' }       // Should show error
    // });

    console.log('Type safety test completed');
}

function showExpectedResults() {
    console.log('=== Expected Autocomplete Behavior ===');
    console.log('When you type in VSCode:');
    console.log('');
    console.log('db.Users.select({');
    console.log('  select: {');
    console.log('    // <- HERE: You should see autocomplete popup with:');
    console.log('    //    - id');
    console.log('    //    - username');
    console.log('    //    - password');
    console.log('    //    - role');
    console.log('    //    - data');
    console.log('    //    - createdAt');
    console.log('  }');
    console.log('});');
    console.log('');
    console.log('The same should work for:');
    console.log('- where: { /* field names */ }');
    console.log('- findFirst({ select: { /* field names */ } })');
    console.log('- query().select({ /* field names */ })');
}

if (import.meta.main) {
    testFixedAutocomplete();
    testTypeSafety();
    showExpectedResults();
}

export { testFixedAutocomplete, testTypeSafety, showExpectedResults };
