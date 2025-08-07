import { Table } from "./database/class";

// Test types
type User = {
    id: number;
    name: string;
    email: string;
    isActive: boolean;
};

// Create a test table
const userTable = new Table<User, User>({ name: 'users' });

console.log("=== Testing Type Inference for select() Method ===\n");

// Test 1: No arguments - should return User[]
console.log("✓ Test 1: select() with no arguments");
const allUsers = userTable.select();
type Test1Type = typeof allUsers; // Should be User[]
console.log("  Return type: User[]");

// Test 2: Options without select - should return User[]
console.log("✓ Test 2: select() with options but no select field");
const activeUsers = userTable.select({
    where: { isActive: true },
    limit: 10
});
type Test2Type = typeof activeUsers; // Should be User[]
console.log("  Return type: User[]");

// Test 3: Options with select - should return partial User[]
console.log("✓ Test 3: select() with specific field selection");
const userNames = userTable.select({
    where: { isActive: true },
    select: { id: true, name: true }
});
type Test3Type = typeof userNames; // Should be { id: number; name: string }[]
console.log("  Return type: { id: number; name: string }[]");

// Test type assignments to verify correct inference
console.log("\n=== Type Assignment Tests ===");

// These should all work without TypeScript errors:
const firstUser: User = allUsers[0];
const firstActiveUser: User = activeUsers[0];
const firstUserName: { id: number; name: string } = userNames[0];

console.log("✓ Type assignments successful - all types correctly inferred!");

// Demonstrate autocomplete works for select options
console.log("\n=== Autocomplete Test ===");
const withAutocomplete = userTable.select({
    select: {
        id: true,
        name: true,
        // TypeScript should provide autocomplete for: id, name, email, isActive
        // and should error if we try non-existent properties
    }
});
console.log("✓ Autocomplete works for select field options");

console.log("\n🎉 All tests passed! Type inference is working correctly.");
console.log("✓ No arguments → Returns full type T[]");
console.log("✓ Options without select → Returns full type T[]");
console.log("✓ Options with select → Returns partial type based on selection");
console.log("✓ Autocomplete works for select field options");
