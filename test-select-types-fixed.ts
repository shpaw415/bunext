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

// Test 1: No options - should return User[]
const allUsers = userTable.select();
// Type should be: User[]
const firstUser: User = allUsers[0]; // This should work

// Test 2: Options without select - should return User[]
const activeUsers = userTable.select({
    where: { isActive: true }
});
// Type should be: User[]
const firstActiveUser: User = activeUsers[0]; // This should work

// Test 3: Options with select - should return partial User[]
const userNames = userTable.select({
    where: { isActive: true },
    select: { id: true, name: true }
});
// Type should be: { id: number; name: string }[]
const firstUserName: { id: number; name: string } = userNames[0]; // This should work
// const invalidAccess: string = userNames[0].email; // This should error

// Test autocomplete - this should show id, name, email, isActive
const withSelect = userTable.select({
    select: {
        // Should have autocomplete for: id, name, email, isActive
        id: true,
        name: true
    }
});

console.log("Type tests compiled successfully!");
console.log("First user:", firstUser);
console.log("First active user:", firstActiveUser);
console.log("First user name:", firstUserName);
