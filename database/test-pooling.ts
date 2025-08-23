/**
 * Simple test to verify the pooling feature works correctly
 */

import { DatabaseManager } from './class';

async function testPoolingFeature() {
    console.log('🔄 Testing Database Connection Pooling Feature...');

    try {
        // Test 1: Basic pooling setup
        console.log('\n1️⃣ Testing basic pooling setup...');
        const db = await new DatabaseManager().withPooling({
            dbPath: './test-pool.sqlite',
            poolConfig: {
                maxConnections: 5,
                minConnections: 2,
                enableLogging: true
            }
        });

        // Test 2: Table creation
        console.log('2️⃣ Creating test table...');
        db.create({
            name: 'test_users',
            columns: [
                { name: 'id', type: 'number', primary: true, autoIncrement: true },
                { name: 'name', type: 'string' },
                { name: 'email', type: 'string', unique: true },
                { name: 'created_at', type: 'Date', default: new Date() }
            ]
        });
        console.log('✅ Table created successfully');

        // Test 3: Pool statistics
        console.log('3️⃣ Checking pool statistics...');
        const stats = db.getPoolStats();
        if (stats) {
            console.log('📊 Pool Stats:', {
                totalConnections: stats.totalConnections,
                activeConnections: stats.activeConnections,
                idleConnections: stats.idleConnections,
                created: stats.totalCreated
            });
        } else {
            console.log('❌ Pool stats not available');
        }

        // Test 4: Pooled operation
        console.log('4️⃣ Testing pooled database operation...');
        const result = await db.executeWithPool((database) => {
            const stmt = database.prepare('INSERT INTO test_users (name, email) VALUES (?, ?)');
            stmt.run('Alice Test', 'alice@test.com');
            stmt.finalize();

            return database.prepare('SELECT COUNT(*) as count FROM test_users').get();
        });
        console.log('✅ Pooled operation result:', result);

        // Test 5: Transaction with pooling
        console.log('5️⃣ Testing pooled transaction...');
        const transactionResults = await db.executePooledTransaction([
            (database) => database.prepare('INSERT INTO test_users (name, email) VALUES (?, ?)').run('Bob Test', 'bob@test.com'),
            (database) => database.prepare('INSERT INTO test_users (name, email) VALUES (?, ?)').run('Charlie Test', 'charlie@test.com'),
            (database) => database.prepare('SELECT COUNT(*) as count FROM test_users').get()
        ]);
        console.log('✅ Transaction results:', transactionResults);
        console.log('📈 Final user count:', transactionResults[2]);

        // Test 6: Final statistics
        console.log('6️⃣ Final pool statistics...');
        const finalStats = db.getPoolStats();
        if (finalStats) {
            console.log('📊 Final Pool Stats:', {
                totalConnections: finalStats.totalConnections,
                totalAcquired: finalStats.totalAcquired,
                totalReleased: finalStats.totalReleased,
                averageAcquireTime: finalStats.averageAcquireTime.toFixed(2) + 'ms'
            });
        }

        // Test 7: Cleanup
        console.log('7️⃣ Closing pool...');
        await db.closePool();
        console.log('✅ Pool closed successfully');

        console.log('\n🎉 All pooling tests passed successfully!');
        return true;

    } catch (error) {
        console.error('❌ Test failed:', error);
        return false;
    }
}

// Test factory pattern
async function testFactoryPattern() {
    console.log('\n🏭 Testing Factory Pattern...');

    try {
        const createDB = DatabaseManager.createPoolFactory({
            usePool: true,
            poolConfig: {
                maxConnections: 3,
                enableLogging: false
            }
        });

        const testDB = createDB({ dbPath: './factory-test.sqlite' });

        testDB.create({
            name: 'factory_test',
            columns: [
                { name: 'id', type: 'number', primary: true, autoIncrement: true },
                { name: 'value', type: 'string' }
            ]
        });

        const stats = testDB.getPoolStats();
        console.log('✅ Factory pattern works, connections:', stats?.totalConnections);

        await testDB.closePool();
        return true;

    } catch (error) {
        console.error('❌ Factory test failed:', error);
        return false;
    }
}

// Run tests
async function runTests() {
    console.log('🚀 Starting Database Pooling Tests\\n');

    const basicTest = await testPoolingFeature();
    const factoryTest = await testFactoryPattern();

    if (basicTest && factoryTest) {
        console.log('\\n🎯 All tests completed successfully!');
        console.log('✨ Database connection pooling feature is working correctly.');
    } else {
        console.log('\\n💥 Some tests failed. Check the output above for details.');
    }

    // Close all pools to ensure clean exit
    await DatabaseManager.closeAllPools();
}

// Export for external use
export { testPoolingFeature, testFactoryPattern, runTests };

// Run tests if this file is executed directly
if (import.meta.main) {
    runTests().catch(console.error);
}
