/**
 * Example: Using the Advanced Connection Pooling Feature
 * 
 * This example demonstrates how to use the new connection pooling feature
 * added to the DatabaseManager class.
 */

import { DatabaseManager, type PoolConfig } from './class';

// Example 1: Basic pooling setup
async function basicPoolingExample() {
    console.log('=== Basic Pooling Example ===');

    // Create a database manager with connection pooling enabled
    const db = await new DatabaseManager().withPooling({
        dbPath: './example.sqlite'
    });

    // Create a simple table
    db.create({
        name: 'users',
        columns: [
            { name: 'id', type: 'number', primary: true, autoIncrement: true },
            { name: 'name', type: 'string' },
            { name: 'email', type: 'string', unique: true },
            { name: 'createdAt', type: 'Date', default: new Date() }
        ]
    });

    // Get pool statistics
    const stats = db.getPoolStats();
    if (stats) {
        console.log('Pool stats:', {
            totalConnections: stats.totalConnections,
            activeConnections: stats.activeConnections,
            idleConnections: stats.idleConnections
        });
    }

    await db.closePool();
}

// Example 2: Advanced pooling configuration
async function advancedPoolingExample() {
    console.log('=== Advanced Pooling Example ===');

    const poolConfig: Partial<PoolConfig> = {
        maxConnections: 20,        // Maximum 20 connections
        minConnections: 5,         // Keep at least 5 idle connections
        acquireTimeout: 15000,     // Wait up to 15 seconds for a connection
        idleTimeout: 60000,        // Close idle connections after 1 minute
        enableQueryCache: true,    // Enable query result caching
        maxCacheSize: 2000,        // Cache up to 2000 query results
        enableLogging: true        // Enable detailed logging
    };

    const db = await new DatabaseManager().withPooling({
        dbPath: './advanced-example.sqlite',
        poolConfig
    });

    // Create tables
    db.create([
        {
            name: 'products',
            columns: [
                { name: 'id', type: 'number', primary: true, autoIncrement: true },
                { name: 'name', type: 'string' },
                { name: 'price', type: 'float', default: 0.0 },
                { name: 'category', type: 'string' }
            ]
        },
        {
            name: 'orders',
            columns: [
                { name: 'id', type: 'number', primary: true, autoIncrement: true },
                { name: 'productId', type: 'number' },
                { name: 'quantity', type: 'number', default: 1 },
                { name: 'orderDate', type: 'Date', default: new Date() }
            ]
        }
    ]);

    // Execute operations using pooled connections
    const results = await db.executePooledTransaction([
        (database) => database.prepare('INSERT INTO products (name, price, category) VALUES (?, ?, ?)').run('Laptop', 999.99, 'Electronics'),
        (database) => database.prepare('INSERT INTO products (name, price, category) VALUES (?, ?, ?)').run('Mouse', 29.99, 'Electronics'),
        (database) => database.prepare('SELECT COUNT(*) as count FROM products').get()
    ]);

    console.log('Transaction results:', results);
    console.log('Products created:', results[2]);

    // Monitor pool performance
    const finalStats = db.getPoolStats();
    if (finalStats) {
        console.log('Final pool stats:', {
            totalConnections: finalStats.totalConnections,
            totalAcquired: finalStats.totalAcquired,
            averageAcquireTime: finalStats.averageAcquireTime.toFixed(2) + 'ms',
            cacheHitRate: (finalStats.cacheHitRate * 100).toFixed(2) + '%'
        });
    }

    await db.closePool();
}

// Example 3: Database factory pattern
async function factoryPatternExample() {
    console.log('=== Factory Pattern Example ===');

    // Create a factory for database instances with consistent pooling configuration
    const createPooledDB = DatabaseManager.createPoolFactory({
        usePool: true,
        poolConfig: {
            maxConnections: 10,
            enableQueryCache: true,
            enableLogging: false
        }
    });

    // Create different database instances for different purposes
    const userDB = createPooledDB({ dbPath: './users.sqlite' });
    const productDB = createPooledDB({ dbPath: './products.sqlite' });
    const logDB = createPooledDB({
        dbPath: './logs.sqlite',
        poolConfig: { maxConnections: 5 } // Override for logs DB
    });

    // Create schemas for each database
    userDB.create({
        name: 'users',
        columns: [
            { name: 'id', type: 'number', primary: true, autoIncrement: true },
            { name: 'username', type: 'string', unique: true },
            { name: 'email', type: 'string', unique: true }
        ]
    });

    productDB.create({
        name: 'products',
        columns: [
            { name: 'id', type: 'number', primary: true, autoIncrement: true },
            { name: 'name', type: 'string' },
            { name: 'price', type: 'float' }
        ]
    });

    logDB.create({
        name: 'access_logs',
        columns: [
            { name: 'id', type: 'number', primary: true, autoIncrement: true },
            { name: 'timestamp', type: 'Date', default: new Date() },
            { name: 'message', type: 'string' }
        ]
    });

    console.log('Created specialized database instances with pooling');

    // Close all pools when done
    await DatabaseManager.closeAllPools();
}

// Example 4: High-performance bulk operations with pooling
async function bulkOperationsExample() {
    console.log('=== Bulk Operations with Pooling Example ===');

    const db = await new DatabaseManager().withPooling({
        dbPath: './bulk-example.sqlite',
        poolConfig: {
            maxConnections: 15,
            enableQueryCache: false, // Disable caching for bulk operations
            enableLogging: true
        }
    });

    // Create a table for bulk data
    db.create({
        name: 'analytics',
        columns: [
            { name: 'id', type: 'number', primary: true, autoIncrement: true },
            { name: 'event', type: 'string' },
            { name: 'userId', type: 'number' },
            { name: 'timestamp', type: 'Date', default: new Date() },
            { name: 'metadata', type: 'json', DataType: { batch: 'number', index: 'number', timestamp: 'number' } }
        ]
    });

    // Simulate concurrent operations using pooled connections
    const promises = [];

    for (let i = 0; i < 5; i++) {
        promises.push(
            db.executeWithPool(async (database) => {
                const stmt = database.prepare('INSERT INTO analytics (event, userId, metadata) VALUES (?, ?, ?)');
                const transaction = database.transaction((events: any[]) => {
                    for (const event of events) {
                        stmt.run(event.event, event.userId, JSON.stringify(event.metadata));
                    }
                });

                // Insert 1000 records per connection
                const events = Array.from({ length: 1000 }, (_, j) => ({
                    event: `event_${i}_${j}`,
                    userId: Math.floor(Math.random() * 10000),
                    metadata: { batch: i, index: j, timestamp: Date.now() }
                }));

                transaction(events);
                stmt.finalize();

                return events.length;
            })
        );
    }

    const results = await Promise.all(promises);
    console.log('Bulk insert results:', results);
    console.log('Total records inserted:', results.reduce((a, b) => a + b, 0));

    // Check final pool statistics
    const finalStats = db.getPoolStats();
    if (finalStats) {
        console.log('Pool performance:', {
            totalConnections: finalStats.totalConnections,
            totalAcquired: finalStats.totalAcquired,
            averageAcquireTime: finalStats.averageAcquireTime.toFixed(2) + 'ms'
        });
    }

    await db.closePool();
}

// Example 5: Graceful shutdown pattern
function gracefulShutdownExample() {
    console.log('=== Graceful Shutdown Example ===');

    // Set up graceful shutdown handlers
    const shutdown = async (signal: string) => {
        console.log(`Received ${signal}, closing database pools...`);

        try {
            await DatabaseManager.closeAllPools();
            console.log('All database pools closed successfully');
            process.exit(0);
        } catch (error) {
            console.error('Error closing database pools:', error);
            process.exit(1);
        }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    console.log('Graceful shutdown handlers registered');
}

// Run examples
async function runExamples() {
    try {
        await basicPoolingExample();
        await advancedPoolingExample();
        await factoryPatternExample();
        await bulkOperationsExample();
        gracefulShutdownExample();

        console.log('\\n=== All examples completed successfully! ===');
    } catch (error) {
        console.error('Example failed:', error);
    }
}

// Export for use in other files
export {
    basicPoolingExample,
    advancedPoolingExample,
    factoryPatternExample,
    bulkOperationsExample,
    gracefulShutdownExample,
    runExamples
};

// Run if this file is executed directly
if (import.meta.main) {
    runExamples();
}
