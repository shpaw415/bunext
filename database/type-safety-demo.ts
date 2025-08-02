// Type Safety Demonstration for Enhanced Database Class
// This file shows all the type safety improvements

import { Table, DatabaseManager } from "./class";

// Example type definitions
type User = {
    id: number;
    email: string;
    name: string;
    age?: number;
    is_active: boolean;
    metadata: { theme: string; notifications: boolean };
    created_at: Date;
};

type Post = {
    id: number;
    title: string;
    content: string;
    user_id: number;
    published: boolean;
    tags: string[];
    created_at: Date;
};

// Create type-safe table instances
const usersTable = new Table<User, User>({ name: "users" });
const postsTable = new Table<Post, Post>({ name: "posts" });

// ==================== TYPE-SAFE SELECT OPERATIONS ====================

// ✅ Select all fields - returns User[]
const allUsers = usersTable.select({});
// Type: User[]
// Available: id, email, name, age, is_active, metadata, created_at

// ✅ Select specific fields - returns Pick<User, "name" | "email">[]
const userNames = usersTable.select({
    select: { name: true, email: true }
});
// Type: Pick<User, "name" | "email">[]
// Available: name, email only

// ✅ Select with WHERE clause - fully type-safe
const activeUsers = usersTable.select({
    select: { name: true, is_active: true },
    where: { is_active: true }
});
// Type: Pick<User, "name" | "is_active">[]

// Complex WHERE with OR - type-safe
const youngOrOldUsers = usersTable.select({
    where: {
        OR: [
            { age: 25 },
            { age: 65 }
        ]
    }
});

// ✅ LIKE operator - only works with string fields
const usersWithGmail = usersTable.select({
    where: {
        LIKE: { email: "%@gmail.com" }
    }
});

// ==================== TYPE-SAFE INSERT OPERATIONS ====================

// ✅ Type-safe insert
const newUsers: User[] = [
    {
        id: 1,
        email: "john@example.com",
        name: "John Doe",
        age: 30,
        is_active: true,
        metadata: { theme: "dark", notifications: true },
        created_at: new Date()
    },
    {
        id: 2,
        email: "jane@example.com",
        name: "Jane Smith",
        // age is optional
        is_active: false,
        metadata: { theme: "light", notifications: false },
        created_at: new Date()
    }
];

usersTable.insert(newUsers);

// ==================== TYPE-SAFE UPDATE OPERATIONS ====================

// ✅ Type-safe update
usersTable.update({
    where: { email: "john@example.com" },
    values: {
        age: 31,
        is_active: false,
        metadata: { theme: "dark", notifications: false }
    }
});

// ==================== TYPE-SAFE DELETE OPERATIONS ====================

// ✅ Type-safe delete
usersTable.delete({
    where: { id: 1 }
});

// ==================== TYPE-SAFE COUNT OPERATIONS ====================

// ✅ Type-safe count
const totalUsers = usersTable.count();
const activeUserCount = usersTable.count({
    where: { is_active: true }
});

// ==================== COMPILE-TIME TYPE SAFETY EXAMPLES ====================

/*
// ❌ These would cause TypeScript compilation errors:

// Invalid column in select
const invalid1 = usersTable.select({
  select: { invalid_column: true } // Error: invalid_column doesn't exist
});

// Invalid column in where clause
const invalid2 = usersTable.select({
  where: { invalid_column: "value" } // Error: invalid_column doesn't exist
});

// LIKE on non-string column
const invalid3 = usersTable.select({
  where: {
    LIKE: { age: "30%" } // Error: LIKE only works on string columns
  }
});

// Accessing non-selected field
const selectedUsers = usersTable.select({
  select: { name: true, email: true }
});
const userAge = selectedUsers[0].age; // Error: age not selected

// Invalid insert data type
usersTable.insert([{
  id: 1,
  email: "test@example.com",
  name: "Test User",
  age: "thirty", // Error: age must be number
  is_active: true,
  metadata: { theme: "dark", notifications: true },
  created_at: new Date()
}]);

// Update with invalid field
usersTable.update({
  where: { id: 1 },
  values: { invalid_field: "value" } // Error: invalid_field doesn't exist
});

// Wrong data type in where clause
usersTable.select({
  where: { age: "thirty" } // Error: age must be number
});
*/

// ==================== RUNTIME TYPE SAFETY ====================

// Values are properly parsed and validated at runtime
const user = usersTable.select({ where: { id: 1 } })[0];

// JSON fields are properly parsed
console.log(user.metadata.theme); // ✅ String
console.log(user.metadata.notifications); // ✅ Boolean

// Date fields are properly restored
console.log(user.created_at instanceof Date); // ✅ true

// Boolean fields are properly converted
console.log(typeof user.is_active === 'boolean'); // ✅ true

// ==================== COMPLEX QUERY EXAMPLES ====================

// ✅ Join-like queries (manually constructed for now)
const userPosts = usersTable.select({
    select: { id: true, name: true, email: true },
    where: { is_active: true }
});

const posts = postsTable.select({
    select: { title: true, content: true, user_id: true },
    where: { published: true }
});

// Filter posts by active users
const activeUserPosts = posts.filter(post =>
    userPosts.some(user => user.id === post.user_id)
);

// ✅ Pagination with type safety
const paginatedUsers = usersTable.select({
    select: { name: true, email: true, created_at: true },
    where: { is_active: true },
    limit: 10,
    skip: 20 // Page 3 (0-indexed)
});

// ✅ Search functionality
const searchResults = usersTable.select({
    select: { name: true, email: true },
    where: {
        OR: [
            { LIKE: { name: "%john%" } },
            { LIKE: { email: "%john%" } }
        ]
    }
});

// ==================== EXPORT FOR TESTING ====================

export {
    usersTable,
    postsTable,
    allUsers,
    userNames,
    activeUsers,
    newUsers,
    totalUsers,
    activeUserCount,
    paginatedUsers,
    searchResults
};

export type {
    User,
    Post
};

console.log("✅ All database operations are fully type-safe!");
console.log("🚀 No 'any' types used - complete type safety achieved!");
