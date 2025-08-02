# Database Table Select Method - Improved TypeScript Typing

## 🎯 Overview

The `Table.select()` method now provides **precise TypeScript typing** based on what fields are actually selected, giving you compile-time safety and perfect IntelliSense.

## 🔧 Type Behavior

### **1. Select All Fields (`select: "*"` or no select)**

```typescript
// Returns all fields: User[]
const allUsers = table.select({ select: "*" });
const allUsers2 = table.select({}); // Same as above

// TypeScript knows about ALL properties:
allUsers[0].id        ✅ Available
allUsers[0].username  ✅ Available  
allUsers[0].password  ✅ Available
allUsers[0].email     ✅ Available
allUsers[0].age       ✅ Available
```

### **2. Select Specific Fields**

```typescript
// Returns only selected fields: Pick<User, "username" | "email">[]
const specificUsers = table.select({
  select: { username: true, email: true }
});

// TypeScript only allows access to selected properties:
specificUsers[0].username  ✅ Available
specificUsers[0].email     ✅ Available
specificUsers[0].id        ❌ TypeScript Error
specificUsers[0].password  ❌ TypeScript Error
specificUsers[0].age       ❌ TypeScript Error
```

### **3. Select Single Field**

```typescript
// Returns single field: Pick<User, "username">[]
const usernameOnly = table.select({
  select: { username: true }
});

// Only the selected field is available:
usernameOnly[0].username  ✅ Available
usernameOnly[0].email     ❌ TypeScript Error
```

## 🚀 Advanced Examples

### **Complex Queries with Precise Typing**

```typescript
type User = {
  id: number;
  username: string;
  password: string;
  email: string;
  age: number;
  isActive: boolean;
};

const userTable = new Table<User, User>({ name: "users" });

// Example 1: Public user data (no sensitive fields)
const publicUsers = userTable.select({
  select: { id: true, username: true, email: true },
  where: { isActive: true },
  limit: 10
});
// Type: Pick<User, "id" | "username" | "email">[]
// ✅ publicUsers[0].username
// ❌ publicUsers[0].password (not selected)

// Example 2: Authentication data
const authUsers = userTable.select({
  select: { id: true, username: true, password: true },
  where: { username: "john" }
});
// Type: Pick<User, "id" | "username" | "password">[]
// ✅ authUsers[0].password
// ❌ authUsers[0].email (not selected)

// Example 3: Age statistics
const ageData = userTable.select({
  select: { age: true },
  where: { isActive: true }
});
// Type: Pick<User, "age">[]
// ✅ ageData[0].age
// ❌ ageData[0].username (not selected)
```

### **Working with Conditional Selection**

```typescript
function getUserData<T extends Partial<OptionsFlags<User>>>(
  includePassword: boolean,
  selectOptions: T
) {
  const baseSelect = { id: true, username: true, email: true };
  
  if (includePassword) {
    return userTable.select({
      select: { ...baseSelect, password: true, ...selectOptions }
    });
  }
  
  return userTable.select({
    select: { ...baseSelect, ...selectOptions }
  });
}

// Usage examples:
const publicData = getUserData(false, { age: true });
// Type: Pick<User, "id" | "username" | "email" | "age">[]

const adminData = getUserData(true, { isActive: true });
// Type: Pick<User, "id" | "username" | "email" | "password" | "isActive">[]
```

## 🔍 Implementation Details

### **Type Definitions**

```typescript
// Helper type to extract only true keys
type TrueKeys<T> = {
  [K in keyof T]: T[K] extends true ? K : never;
}[keyof T];

// Precise type selection
type PreciseSelectedType<T, S> = S extends "*"
  ? T
  : S extends OptionsFlags<T>
    ? Pick<T, TrueKeys<S> & keyof T>
    : T;
```

### **Method Overloads**

```typescript
class Table<T, SELECT_FORMAT> {
  // Overload 1: Select all fields
  select(options: { select?: "*" }): SELECT_FORMAT[];
  
  // Overload 2: Select specific fields  
  select<TSelect extends Partial<OptionsFlags<SELECT_FORMAT>>>(
    options: { select: TSelect }
  ): PreciseSelectedType<SELECT_FORMAT, TSelect>[];
  
  // Implementation
  select(options: any = {}): any[] {
    // ... implementation
  }
}
```

## ✨ Benefits

### **1. Compile-Time Safety** 🛡️
- **Prevents accessing non-selected fields** at compile time
- **Catches typos** in field names
- **Ensures data consistency** across your application

### **2. Perfect IntelliSense** 💡
- **Auto-completion** only shows available fields
- **Type hints** are accurate and contextual
- **Refactoring safety** when changing field selections

### **3. Performance Benefits** 🚀
- **Encourages minimal data selection** (only fetch what you need)
- **Clear intent** in code about what data is being used
- **Better caching strategies** possible with precise types

### **4. Security Benefits** 🔒
- **Explicit field selection** prevents accidental data exposure
- **Compile-time prevention** of accessing sensitive fields
- **Clear data boundaries** between different access levels

## 📝 Usage Guidelines

### **Best Practices** ✅

```typescript
// ✅ Explicit field selection for public APIs
const publicUsers = table.select({
  select: { id: true, username: true, email: true }
});

// ✅ Use specific types for different contexts
type PublicUser = Pick<User, "id" | "username" | "email">;
type AuthUser = Pick<User, "id" | "username" | "password">;

// ✅ Select only what you need
const usernames = table.select({
  select: { username: true }
});
```

### **What to Avoid** ❌

```typescript
// ❌ Don't use select: "*" for public APIs
const users = table.select({ select: "*" }); // Exposes all fields

// ❌ Don't rely on runtime field filtering
const users = table.select({ select: "*" });
const publicUsers = users.map(u => ({ id: u.id, username: u.username }));
// Should use proper select instead

// ❌ Don't ignore TypeScript errors
const users = table.select({ select: { username: true } });
console.log(users[0].password); // TypeScript error - don't ignore!
```

## 🎉 Migration Guide

If you have existing code, here's how to update it:

### **Before** (Old API)
```typescript
const users = table.select({});
// Type: Partial<User>[] (imprecise)

// You could access any field, even if not selected:
users[0].password; // No TypeScript error, but might be undefined
```

### **After** (New API)
```typescript
// Option 1: Select all fields explicitly
const users = table.select({ select: "*" });
// Type: User[] (precise)

// Option 2: Select specific fields
const users = table.select({
  select: { id: true, username: true, email: true }
});
// Type: Pick<User, "id" | "username" | "email">[] (precise)

users[0].password; // ❌ TypeScript error if not selected
```

This improved typing makes your code more robust, secure, and maintainable! 🎯
