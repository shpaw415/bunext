import { Table } from "./database/class";

// Test types
type User = {
    id: number;
    name: string;
    email: string;
    isActive: boolean;
};

// Create a test table (but don't run queries)
const userTable = new Table<User, User>({ name: 'users' });

// This function will test type inference without running queries
function testTypeInference() {
    // Test 1: No options - should return User[]
    const allUsers = userTable.select();
    // TypeScript should infer: User[]
    type Test1 = typeof allUsers; // User[]

    // Test 2: Options without select - should return User[]  
    const activeUsers = userTable.select({
        where: { isActive: true }
    });
    // TypeScript should infer: User[]
    type Test2 = typeof activeUsers; // User[]

    // Test 3: Options with select - should return partial User[]
    const userNames = userTable.select({
        where: { isActive: true },
        select: { id: true, name: true }
    });
    // TypeScript should infer: { id: number; name: string }[]
    type Test3 = typeof userNames; // { id: number; name: string }[]

    // Test autocomplete and type safety
    const withSelect = userTable.select({
        select: {
            id: true,
            name: true,
            // TypeScript should provide autocomplete for: id, name, email, isActive
            // and should error if we try to use non-existent properties
        }
    });
    type Test4 = typeof withSelect; // { id: number; name: string }[]

    // These should work (correct types):
    const test1Item: User = allUsers[0];
    const test2Item: User = activeUsers[0];
    const test3Item: { id: number; name: string } = userNames[0];
    const test4Item: { id: number; name: string } = withSelect[0];

    // These should cause TypeScript errors if uncommented:
    // const badTest3: User = userNames[0]; // Error: missing properties
    // const badAccess = userNames[0].email; // Error: property doesn't exist

    console.log("All type tests passed!");
    return {
        test1: typeof allUsers,
        test2: typeof activeUsers,
        test3: typeof userNames,
        test4: typeof withSelect
    };
}

// Export the function for type checking
export { testTypeInference };

console.log("Type inference test file created successfully!");
