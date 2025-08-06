# Enhanced Database Creation with Schema Migration

The enhanced `database:create` command now provides intelligent handling of existing databases with automated backup, recreation, and data migration capabilities.

## Features

### 🔍 Automatic Detection
- Detects existing database and tables
- Analyzes schema compatibility
- Provides detailed information before proceeding

### 📦 Safe Migration Process
1. **Automatic Backup**: Creates compressed backup of existing data
2. **Schema Recreation**: Drops old tables and creates new schema
3. **Intelligent Merge**: Analyzes and merges compatible data back
4. **Conflict Resolution**: Configurable handling of data conflicts

### 🛡️ Safety Features
- Always creates backup before any destructive operations
- Optional permanent backup for long-term storage
- Automatic rollback on migration failure
- Detailed logging of all operations

## Usage

```bash
# Enhanced database creation with migration
bun bunext database:create
```

## Migration Process

When existing tables are detected, the system will:

### 1. **Confirmation & Strategy Selection**
```
⚠️  Warning: Database already exists with tables.
To ensure compatibility with the new schema, the following process will occur:
1. Create a temporary backup of existing data
2. Drop existing tables and recreate with new schema  
3. Attempt to merge back compatible data
4. Handle any conflicts with configurable resolution

Do you want to proceed with schema migration? This will modify your database. (y/N):
```

### 2. **Conflict Resolution Strategy**
```
🔧 Conflict Resolution Strategy:
When merging data back after schema changes, conflicts may occur.
Choose how to handle records that conflict:

1. replace  - Overwrite existing records with backup data (recommended for most cases)
2. ignore   - Keep new schema records, skip conflicting backup data  
3. fail     - Stop migration on first conflict (safest, but may require manual intervention)

Choose strategy (1-3) [default: 1]:
```

### 3. **Backup Options**
```
Create a permanent backup before migration? (recommended) (Y/n):
```

### 4. **Automated Migration**
- Creates temporary compressed backup
- Analyzes existing vs new schema compatibility
- Drops old tables and creates new schema
- Identifies mergeable tables and columns
- Performs selective data merge with chosen conflict resolution

### 5. **Results & Cleanup**
```
📊 Current database: 3 tables, 1,250 total records
📋 Found 2 compatible tables to merge:
   - Users (8/10 columns compatible)
   - Posts (5/5 columns compatible)

Proceed with merging compatible data? (Y/n): y

🔄 Merging table: Users...
   ✅ Merged Users: 500 records
   ⚠️  Note: 2 columns were not compatible and were skipped

🔄 Merging table: Posts...  
   ✅ Merged Posts: 750 records

📊 Final database: 3 tables, 1,250 total records

⚠️  The following tables had incompatible schemas and were not merged:
   - OldLegacyTable (check backup for this data)

✅ Database migration completed successfully!
📁 Permanent backup saved: ./config/pre-migration-backup-2025-08-05-1234567890.db.gz
📁 Temporary backup: ./config/temp-migration-backup-1234567890.db.gz (you can delete this after verifying)
```

## Conflict Resolution Strategies

### Replace Strategy (Default)
- **Use case**: Most schema updates, column additions/modifications
- **Behavior**: Backup data overwrites any existing records with same primary key
- **Best for**: Ensuring data from backup is preserved

### Ignore Strategy  
- **Use case**: When new schema has been populated with fresh data
- **Behavior**: Keeps existing records, skips conflicting backup data
- **Best for**: Preserving newly created records over backup data

### Fail Strategy
- **Use case**: Critical systems requiring manual conflict review
- **Behavior**: Stops migration immediately on first conflict
- **Best for**: Maximum safety, manual intervention required

## Column Compatibility

The system automatically analyzes column compatibility:

✅ **Compatible Columns**: Same name and compatible data type
- Will be merged automatically
- Data type conversion handled by SQLite

⚠️ **Incompatible Columns**: 
- Different names between old and new schema
- Incompatible data types that can't be automatically converted
- These columns are skipped during merge

📋 **New Columns**: Present in new schema but not in backup
- Filled with default values as defined in schema
- NULL if no default specified

## Best Practices

### 1. **Always Accept Permanent Backup**
```bash
Create a permanent backup before migration? (recommended) (Y/n): Y
```

### 2. **Review Migration Results**
- Check the final statistics
- Verify critical data was migrated
- Test application functionality

### 3. **Backup Management**
```bash
# Keep permanent backups for rollback capability
ls -la config/*backup*.db.gz

# Clean up temporary files after verification
rm config/temp-migration-backup-*.db.gz
```

### 4. **Schema Design for Migrations**
- Use default values for new columns
- Avoid renaming critical columns when possible
- Add columns instead of modifying existing ones

## Error Handling & Recovery

### Migration Failure
If migration fails, the system automatically attempts to restore from backup:

```
❌ Migration failed! Attempting to restore from backup...
✅ Database restored from backup
```

### Manual Recovery
If automatic recovery fails:

```bash
# Restore from backup manually
bun bunext database:restore ./config/temp-migration-backup-1234567890.db.gz
```

## Testing

Test the enhanced functionality:

```bash
# Run test script
bun run test-enhanced-db-create.ts

# Or test with actual command
bun bunext database:create
```

## Advanced Usage

### Custom Schema Analysis
The system provides detailed compatibility analysis:
- Column name matching
- Data type compatibility
- Primary key preservation
- Index recreation

### Selective Table Migration
Only tables present in both old and new schemas are considered for migration.
Tables unique to either schema are handled appropriately:
- **Old-only tables**: Preserved in backup, not migrated
- **New-only tables**: Created empty with new schema

This enhanced system ensures safe, reliable database schema migrations while preserving your valuable data.
