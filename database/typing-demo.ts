/**
 * Demonstration of enhanced type safety and query builder in Table class
 * This file showcases the improved typing system and fluent query interface
 */

import { Table } from './class';

// Example type definitions
interface User {
    id: number;
    name: string;
    email: string;
    age: number;
    isActive: boolean;
    role: 'admin' | 'user' | 'moderator';
    createdAt: string;
    lastLogin?: string;
}

interface UserInsert {
    name: string;
    email: string;
    age: number;
    isActive?: boolean;
    role?: 'admin' | 'user' | 'moderator';
    createdAt?: string;
    lastLogin?: string;
}

// Create table instance
const userTable = new Table<UserInsert, User>({
    name: 'users'
});

// Demonstration of enhanced select typing
function demonstrateSelectTyping() {
    console.log('=== Enhanced Select Typing Demo ===');

    // 1. Select all with full type inference
    const allUsers: User[] = userTable.select();
    console.log('All users:', allUsers);

    // 2. Select specific fields with precise typing and ENHANCED AUTOCOMPLETE
    // TypeScript will now provide autocomplete for field names in the select object
    const userNamesAndEmails = userTable.select({
        select: {
            name: true,      // ✅ Autocomplete works here!
            email: true,     // ✅ Autocomplete works here!
            // id: true,     // ✅ This will also autocomplete
            // age: true,    // ✅ This will also autocomplete

        }
    });
    // Type: Array<{ name: string; email: string }>
    console.log('Names and emails:', userNamesAndEmails);

    // 3. Complex select with where clause - AUTOCOMPLETE WORKS
    const activeAdmins = userTable.select({
        where: { isActive: true, role: 'admin' },
        select: {
            id: true,        // ✅ Full autocomplete support
            name: true,      // ✅ IntelliSense shows available fields
            role: true       // ✅ Type-safe field selection
        }
    });
    // Type: Array<{ id: number; name: string; role: 'admin' | 'user' | 'moderator' }>
    console.log('Active admins:', activeAdmins);

    // 4. FindFirst with type inference and AUTOCOMPLETE
    const firstUser = userTable.findFirst({
        where: { isActive: true },
        select: {
            name: true,      // ✅ Autocomplete available
            email: true,     // ✅ IntelliSense support  
            age: true        // ✅ Type checking works
        }
    });
    // Type: { name: string; email: string; age: number } | null
    console.log('First active user:', firstUser);

    // 5. Flexible selection (backward compatibility)
    const flexibleSelect = userTable.select({
        select: {
            name: true,      // ✅ Optional properties work
            email: true      // ✅ Can omit other fields
            // Fields can be omitted - this maintains backward compatibility
        },
        where: { isActive: true }
    });
    console.log('Flexible selection:', flexibleSelect);

    // 6. Error demonstration - TypeScript will catch these:
    // ❌ This will show TypeScript error:
    // const invalidSelect = userTable.select({
    //   select: { invalidField: true }  // Error: Property 'invalidField' does not exist
    // });

    // 7. Select with LIKE clause
    const gmailUsers = userTable.select({
        where: { LIKE: { email: '%@gmail.com' } },
        select: { name: true, email: true }
    });
    console.log('Gmail users:', gmailUsers);
}

// Demonstration of the new query builder
function demonstrateQueryBuilder() {
    console.log('=== Query Builder Demo with Enhanced Autocomplete ===');

    // 1. Basic fluent query with AUTOCOMPLETE SUPPORT
    const activeUsers = userTable
        .query()
        .where({ isActive: true })
        .select({
            id: true,        // ✅ Full autocomplete here!
            name: true,      // ✅ IntelliSense shows all available fields
            email: true      // ✅ Type-safe field selection
        })
        .limit(10)
        .execute();
    console.log('Active users (fluent):', activeUsers);

    // 2. Complex filtering with method chaining and AUTOCOMPLETE
    const premiumUsers = userTable
        .query()
        .where({ role: 'admin' })
        .whereLike({ email: '%@company.com' })
        .select({
            id: true,        // ✅ Autocomplete works in chained calls
            name: true,      // ✅ Type safety maintained
            role: true,      // ✅ IntelliSense available
            email: true      // ✅ Field validation works
        })
        .limit(50)
        .skip(0)
        .execute();
    console.log('Premium users:', premiumUsers);

    // 3. Select all vs specific fields
    const allFieldsQuery = userTable
        .query()
        .where({ isActive: true })
        .selectAll()        // Returns all fields
        .execute();

    const specificFieldsQuery = userTable
        .query()
        .where({ isActive: true })
        .select({
            name: true,       // ✅ Precise field selection with autocomplete
            email: true
        })
        .execute();
    console.log('All fields vs specific fields');

    // 4. Count with filters
    const activeUserCount = userTable
        .query()
        .where({ isActive: true })
        .count();
    console.log('Active user count:', activeUserCount);

    // 5. Check existence
    const hasAdmins = userTable
        .query()
        .where({ role: 'admin' })
        .exists();
    console.log('Has admins:', hasAdmins);

    // 6. Find first with query builder and AUTOCOMPLETE
    const firstActiveUser = userTable
        .query()
        .where({ isActive: true })
        .select({
            name: true,       // ✅ Autocomplete in query builder
            email: true,      // ✅ Type safety throughout the chain
            createdAt: true   // ✅ All fields available for selection
        })
        .first();
    console.log('First active user (query builder):', firstActiveUser);

    // 7. Complex OR conditions
    const adminOrModerator = userTable
        .query()
        .whereOr([
            { role: 'admin' },
            { role: 'moderator' }
        ])
        .select({
            id: true,
            name: true,
            role: true
        })
        .execute();
    console.log('Admins or moderators:', adminOrModerator);

    // 8. Chaining demonstration - each step maintains type safety
    const complexQuery = userTable
        .query()
        .where({ isActive: true })          // Step 1: Filter active users
        .whereLike({ email: '%@work.com' }) // Step 2: Add email filter  
        .select({
            id: true,                         // ✅ Autocomplete at each step
            name: true,                       // ✅ IntelliSense works
            email: true,                      // ✅ Type checking enabled
            role: true
        })
        .limit(25)                          // Step 3: Limit results
        .skip(10)                           // Step 4: Skip first 10
        .execute();                         // Step 5: Execute query
    console.log('Complex chained query:', complexQuery);
}// Demonstration of type safety
function demonstrateTypeSafety() {
    console.log('=== Type Safety & Autocomplete Demo ===');

    // ✅ WHAT WORKS NOW - Enhanced Developer Experience:

    console.log('1. Autocomplete Support:');
    console.log('   - When typing in the select object, IntelliSense shows all available fields');
    console.log('   - Field names are validated at compile time');
    console.log('   - Return types are precisely inferred based on selected fields');

    console.log('2. Type Safety Features:');

    // ✅ Autocomplete in select options
    const typeSafeSelect = userTable.select({
        select: {
            // When you type here, you get autocomplete for: id, name, email, age, isActive, role, createdAt, lastLogin
            name: true,      // ✅ Autocomplete works
            email: true,     // ✅ Type checking works  
            isActive: true   // ✅ IntelliSense support
        }
    });

    // ✅ Autocomplete in query builder
    const builderQuery = userTable
        .query()
        .where({ isActive: true })
        .select({
            // Autocomplete available here too!
            id: true,
            name: true,
            role: true
        })
        .execute();

    // ✅ Autocomplete in findFirst
    const findFirstQuery = userTable.findFirst({
        where: { id: 1 },
        select: {
            // All field names available with autocomplete
            name: true,
            email: true
        }
    });

    // ❌ TypeScript ERRORS that are caught at compile time:

    console.log('3. Compile-time Error Detection:');

    // ❌ This would cause a TypeScript error:
    // const invalidField = userTable.select({
    //   select: { nonExistentField: true }  
    //   // Error: Object literal may only specify known properties, and 'nonExistentField' does not exist
    // });

    // ❌ This would cause a TypeScript error:
    // const invalidWhere = userTable.select({
    //   where: { invalidField: 'value' }
    //   // Error: Object literal may only specify known properties, and 'invalidField' does not exist
    // });

    // ❌ This would cause a TypeScript error:
    // const wrongType = userTable.query()
    //   .where({ age: 'not-a-number' })  // Error: Type 'string' is not assignable to type 'number'
    //   .execute();

    console.log('4. What you get:');
    console.log('   ✅ Field name autocomplete in select options');
    console.log('   ✅ Type checking for field existence');
    console.log('   ✅ Precise return type inference');
    console.log('   ✅ IntelliSense support throughout the query chain');
    console.log('   ✅ Compile-time error detection for invalid fields');
    console.log('   ✅ Both strict and flexible selection patterns supported');

    // ✅ These are all type-safe with full autocomplete:
    const demoQueries = {
        basicSelect: userTable.select({
            where: { age: 25 },
            select: { name: true, email: true } // ✅ Full autocomplete here
        }),

        queryBuilder: userTable
            .query()
            .where({ isActive: true })
            .select({ id: true, name: true })   // ✅ And here
            .limit(5)
            .execute(),

        findFirst: userTable.findFirst({
            where: { role: 'admin' },
            select: { name: true, role: true }  // ✅ And here too
        })
    };

    console.log('All type-safe queries executed successfully with autocomplete support!');
}

// Run demonstrations
if (import.meta.main) {
    demonstrateSelectTyping();
    demonstrateQueryBuilder();
    demonstrateTypeSafety();
}

export {
    demonstrateSelectTyping,
    demonstrateQueryBuilder,
    demonstrateTypeSafety,
    userTable
};
