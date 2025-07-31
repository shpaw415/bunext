# Database Management Features

This document describes the enhanced database management features added to the bunext database system.

## DatabaseManager Class Features

### Backup and Restore

#### `backup(backupPath: string, options?)`
Creates a backup of the database to a specified file.

```typescript
const dbManager = new DatabaseManager();

// Full database backup with data
dbManager.backup('./backup.db');

// Schema-only backup
dbManager.backup('./schema.json', { includeData: false });
```

#### `restore(backupPath: string, options?)`
Restores database from a backup file.

```typescript
// Restore from SQLite backup
dbManager.restore('./backup.db');

// Restore with existing tables dropped first
dbManager.restore('./backup.db', { dropExisting: true });

// Restore from JSON schema
dbManager.restore('./schema.json');
```

### Database Merging

#### `mergeDatabase(sourcePath: string, options?)`
Merges data from another database into the current one.

```typescript
// Simple merge with replace on conflict
dbManager.mergeDatabase('./source.db');

// Merge with ignore conflicts
dbManager.mergeDatabase('./source.db', { 
  conflictResolution: 'ignore' 
});

// Merge specific tables only
dbManager.mergeDatabase('./source.db', { 
  tablesFilter: ['users', 'products'] 
});
```

### Schema Management

#### `exportSchema()` and `importSchema(schemaData)`
Export and import database schema as JSON.

```typescript
// Export current schema
const schema = dbManager.exportSchema();

// Import schema from data
dbManager.importSchema(schema);
```

### Database Analytics

#### `getDatabaseStats()`
Get comprehensive database statistics.

```typescript
const stats = dbManager.getDatabaseStats();
console.log(stats);
// {
//   tables: 3,
//   totalRecords: 1500,
//   databaseSize: 2048000,
//   tableStats: [
//     { name: 'users', records: 500, size: 1024000 },
//     { name: 'products', records: 1000, size: 1024000 }
//   ],
//   indexes: 5
// }
```

#### `getTableInfo(tableName: string)`
Get detailed information about a specific table.

```typescript
const info = dbManager.getTableInfo('users');
// Returns: { columns, indexes, foreignKeys, triggers }
```

### Database Maintenance

#### `optimize(options?)`
Optimize database performance.

```typescript
// Full optimization
dbManager.optimize();

// Selective optimization
dbManager.optimize({ 
  vacuum: true, 
  analyze: true, 
  reindex: false 
});
```

#### `checkIntegrity()`
Check database integrity.

```typescript
const integrity = dbManager.checkIntegrity();
if (!integrity.isValid) {
  console.log('Database errors:', integrity.errors);
}
```

#### `executeTransaction(statements: string[])`
Execute multiple SQL statements in a transaction.

```typescript
dbManager.executeTransaction([
  "UPDATE users SET status = 'active' WHERE last_login > datetime('now', '-30 days')",
  "DELETE FROM temp_data WHERE created_at < datetime('now', '-1 day')",
  "INSERT INTO audit_log (action, timestamp) VALUES ('cleanup', datetime('now'))"
]);
```

### Utility Methods

#### `listTables()`
Get list of all tables in the database.

```typescript
const tables = dbManager.listTables();
console.log(tables); // ['users', 'products', 'orders']
```

## Table Class Features

### Data Migration and Sync

#### `syncWith(sourceTable, options)`
Synchronize data with another table.

```typescript
const sourceTable = new Table({ name: 'temp_users', db: sourceDb });
const targetTable = new Table({ name: 'users', db: targetDb });

const stats = targetTable.syncWith(sourceTable, {
  keyColumn: 'email',
  conflictResolution: 'update',
  onProgress: (processed, total) => {
    console.log(`Progress: ${processed}/${total}`);
  }
});

console.log(stats); // { inserted: 10, updated: 5, skipped: 2 }
```

### Data Export/Import

#### `exportToJson(options?)` and `importFromJson(jsonData, options?)`
Export and import table data as JSON.

```typescript
// Export with filtering
const jsonData = userTable.exportToJson({
  where: { isActive: true },
  select: { name: true, email: true }
});

// Export to file
userTable.exportToJson({ 
  filePath: './users_export.json',
  pretty: true 
});

// Import from JSON with conflict handling
const importStats = userTable.importFromJson(jsonData, {
  conflictResolution: 'replace',
  batchSize: 500
});
```

### Index Management

#### `createIndex(options)` and `dropIndex(indexName)`
Manage table indexes for better performance.

```typescript
// Create unique index
userTable.createIndex({
  name: 'idx_email_unique',
  columns: ['email'],
  unique: true
});

// Create composite index
userTable.createIndex({
  name: 'idx_name_age',
  columns: ['name', 'age']
});

// Drop index
userTable.dropIndex('idx_email_unique');
```

### Analytics and Monitoring

#### `getTableStats()`
Get comprehensive table statistics.

```typescript
const stats = userTable.getTableStats();
console.log(stats);
// {
//   name: 'users',
//   recordCount: 1000,
//   columns: [
//     { name: 'id', type: 'number', nullable: false, primary: true },
//     { name: 'email', type: 'string', nullable: false, primary: false }
//   ],
//   indexes: ['idx_email', 'idx_name_age'],
//   estimatedSize: '2.5 MB'
// }
```

#### `rawQuery<TResult>(query: string, params?)`
Execute raw SQL queries with type safety and automatic data restoration.

```typescript
// Execute custom query with parameters
const results = userTable.rawQuery<{ name: string; order_count: number }>(
  `SELECT u.name, COUNT(o.id) as order_count 
   FROM users u 
   LEFT JOIN orders o ON u.id = o.user_id 
   WHERE u.created_at > ?
   GROUP BY u.id`,
  ['2024-01-01']
);

console.log(results[0].name); // Type-safe access
```

## Usage Examples

### Complete Backup and Migration Workflow

```typescript
import { DatabaseManager, Table } from './database/class';

// Setup
const sourceDb = new Database('./source.db');
const targetDb = new Database('./target.db');
const dbManager = new DatabaseManager(targetDb);

// 1. Create backup before migration
dbManager.backup('./pre-migration-backup.db');

// 2. Merge data from source
dbManager.mergeDatabase('./source.db', {
  conflictResolution: 'replace',
  tablesFilter: ['users', 'products']
});

// 3. Optimize after migration
dbManager.optimize();

// 4. Verify integrity
const integrity = dbManager.checkIntegrity();
if (!integrity.isValid) {
  console.error('Migration failed, restoring backup...');
  dbManager.restore('./pre-migration-backup.db');
} else {
  console.log('Migration successful!');
}
```

### Data Synchronization Between Environments

```typescript
// Sync production data to development environment
const prodTable = new Table({ name: 'users', db: prodDb });
const devTable = new Table({ name: 'users', db: devDb });

// Export anonymized production data
const prodData = prodTable.exportToJson({
  select: { id: true, name: true, email: true, created_at: true },
  where: { status: 'active' }
});

// Anonymize sensitive data (example)
const anonymizedData = JSON.parse(prodData as string);
anonymizedData.data = anonymizedData.data.map((user: any) => ({
  ...user,
  email: `user${user.id}@example.com`,
  name: `User ${user.id}`
}));

// Import to development
devTable.importFromJson(anonymizedData, {
  conflictResolution: 'replace'
});
```

### Performance Monitoring and Optimization

```typescript
// Regular maintenance routine
function performMaintenance() {
  const dbManager = new DatabaseManager();
  
  // Get current stats
  const beforeStats = dbManager.getDatabaseStats();
  console.log('Before optimization:', beforeStats);
  
  // Optimize database
  dbManager.optimize();
  
  // Get stats after optimization
  const afterStats = dbManager.getDatabaseStats();
  console.log('After optimization:', afterStats);
  
  // Check integrity
  const integrity = dbManager.checkIntegrity();
  if (!integrity.isValid) {
    console.error('Database integrity issues found:', integrity.errors);
  }
  
  // Create daily backup
  const date = new Date().toISOString().split('T')[0];
  dbManager.backup(`./backups/daily-backup-${date}.db`);
}

// Run maintenance weekly
setInterval(performMaintenance, 7 * 24 * 60 * 60 * 1000);
```

## Best Practices

1. **Always backup before major operations** - Use `backup()` before migrations or schema changes
2. **Use transactions for bulk operations** - Leverage `executeTransaction()` for better performance
3. **Monitor database health** - Regular `checkIntegrity()` and `getDatabaseStats()` calls
4. **Optimize regularly** - Run `optimize()` periodically, especially after large data changes
5. **Index strategically** - Use `createIndex()` for frequently queried columns
6. **Handle conflicts gracefully** - Choose appropriate `conflictResolution` strategies
7. **Use batch processing** - Set appropriate `batchSize` for large import/export operations

These features provide enterprise-level database management capabilities while maintaining the simple, type-safe API that bunext is known for.
