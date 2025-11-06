#!/usr/bin/env node
/**
 * monSQLize 性能基准测试运行器
 * 使用 benchmark.js 测试核心 API 性能
 */

const Benchmark = require('benchmark');
const MonSQLize = require('../../lib');

// 使用 Memory Server 进行基准测试
const DB_CONFIG = {
    type: 'mongodb',
    databaseName: 'benchmark_db',
    config: { useMemoryServer: true }
};

let monSQLize;
let collection;

/**
 * 准备测试数据
 */
async function setupTestData() {
    console.log('🔧 准备测试数据...\n');
    monSQLize = new MonSQLize(DB_CONFIG);
    const conn = await monSQLize.connect();
    collection = conn.collection;

    const db = monSQLize._adapter.db;
    const usersCollection = db.collection('users');
    const productsCollection = db.collection('products');

    // 清空旧数据
    await usersCollection.deleteMany({});
    await productsCollection.deleteMany({});

    // 插入 1000 条用户数据
    const users = [];
    for (let i = 1; i <= 1000; i++) {
        users.push({
            userId: `USER-${String(i).padStart(5, '0')}`,
            name: `用户${i}`,
            email: `user${i}@example.com`,
            status: i % 5 === 0 ? 'inactive' : 'active',
            level: Math.floor(Math.random() * 10) + 1,
            totalSpent: Math.floor(Math.random() * 20000),
            createdAt: new Date(Date.now() - i * 86400000)
        });
    }
    await usersCollection.insertMany(users);

    // 插入 500 条商品数据
    const products = [];
    for (let i = 1; i <= 500; i++) {
        products.push({
            productId: `PROD-${String(i).padStart(5, '0')}`,
            name: `商品${i}`,
            category: ['electronics', 'books', 'clothing'][i % 3],
            price: Math.floor(Math.random() * 1000) + 50,
            inStock: i % 4 !== 0,
            sales: Math.floor(Math.random() * 2000)
        });
    }
    await productsCollection.insertMany(products);

    console.log('✅ 测试数据准备完成');
    console.log(`   - Users: ${users.length} 条`);
    console.log(`   - Products: ${products.length} 条\n`);
}

/**
 * 运行基准测试
 */
async function runBenchmarks() {
    await setupTestData();

    const suite = new Benchmark.Suite('monSQLize Performance');

    // ========================================
    // findOne 基准测试
    // ========================================
    suite.add('findOne - 简单查询', {
        defer: true,
        fn: async (deferred) => {
            await collection('users').findOne({
                query: { userId: 'USER-00100' }
            });
            deferred.resolve();
        }
    });

    suite.add('findOne - 带缓存', {
        defer: true,
        fn: async (deferred) => {
            await collection('users').findOne({
                query: { userId: 'USER-00100' },
                cache: 60000
            });
            deferred.resolve();
        }
    });

    // ========================================
    // find 基准测试
    // ========================================
    suite.add('find - 查询 10 条', {
        defer: true,
        fn: async (deferred) => {
            await collection('users').find({
                query: { status: 'active' },
                limit: 10
            });
            deferred.resolve();
        }
    });

    suite.add('find - 查询 50 条', {
        defer: true,
        fn: async (deferred) => {
            await collection('users').find({
                query: { status: 'active' },
                limit: 50
            });
            deferred.resolve();
        }
    });

    suite.add('find - 带排序', {
        defer: true,
        fn: async (deferred) => {
            await collection('users').find({
                query: { status: 'active' },
                sort: { createdAt: -1 },
                limit: 20
            });
            deferred.resolve();
        }
    });

    // ========================================
    // count 基准测试
    // ========================================
    suite.add('count - 空查询（estimatedDocumentCount）', {
        defer: true,
        fn: async (deferred) => {
            await collection('users').count();
            deferred.resolve();
        }
    });

    suite.add('count - 条件查询', {
        defer: true,
        fn: async (deferred) => {
            await collection('users').count({
                query: { status: 'active' }
            });
            deferred.resolve();
        }
    });

    suite.add('count - 带缓存', {
        defer: true,
        fn: async (deferred) => {
            await collection('users').count({
                query: { status: 'active' },
                cache: 60000
            });
            deferred.resolve();
        }
    });

    // ========================================
    // findPage 基准测试
    // ========================================
    suite.add('findPage - 游标分页（after）', {
        defer: true,
        fn: async (deferred) => {
            await collection('users').findPage({
                query: { status: 'active' },
                sort: { _id: 1 },
                limit: 20,
                totals: 'none'
            });
            deferred.resolve();
        }
    });

    suite.add('findPage - 跳页分页（page=1）', {
        defer: true,
        fn: async (deferred) => {
            await collection('users').findPage({
                query: { status: 'active' },
                sort: { _id: 1 },
                limit: 20,
                page: 1,
                totals: 'none'
            });
            deferred.resolve();
        }
    });

    // ========================================
    // aggregate 基准测试
    // ========================================
    suite.add('aggregate - 简单聚合', {
        defer: true,
        fn: async (deferred) => {
            await collection('products').aggregate(
                [
                    { $match: { inStock: true } },
                    { $group: { _id: '$category', total: { $sum: 1 } } }
                ]
            );
            deferred.resolve();
        }
    });

    suite.add('aggregate - 复杂聚合', {
        defer: true,
        fn: async (deferred) => {
            await collection('products').aggregate(
                [
                    { $match: { inStock: true } },
                    { $group: { 
                        _id: '$category', 
                        count: { $sum: 1 },
                        avgPrice: { $avg: '$price' },
                        totalSales: { $sum: '$sales' }
                    }},
                    { $sort: { totalSales: -1 } }
                ]
            );
            deferred.resolve();
        }
    });

    // ========================================
    // distinct 基准测试
    // ========================================
    suite.add('distinct - 去重查询', {
        defer: true,
        fn: async (deferred) => {
            await collection('products').distinct('category');
            deferred.resolve();
        }
    });

    // 运行测试
    suite.on('cycle', (event) => {
        console.log(String(event.target));
    });

    suite.on('complete', function() {
        console.log('\n╔═══════════════════════════════════════════════════════════╗');
        console.log('║              📊 基准测试完成                              ║');
        console.log('╚═══════════════════════════════════════════════════════════╝\n');
        
        console.log('最快的测试：');
        const fastest = this.filter('fastest').map('name');
        fastest.forEach(name => console.log(`  🏆 ${name}`));
        
        console.log('\n性能排行（按 ops/sec 降序）：');
        const sorted = this.slice().sort((a, b) => b.hz - a.hz);
        sorted.forEach((bench, i) => {
            const opsPerSec = bench.hz.toFixed(2);
            const margin = (bench.stats.rme).toFixed(2);
            console.log(`  ${i + 1}. ${bench.name}`);
            console.log(`     ${opsPerSec} ops/sec (±${margin}%)`);
        });

        process.exit(0);
    });

    suite.on('error', (event) => {
        console.error('❌ 基准测试出错:', event.target.error);
        process.exit(1);
    });

    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║              🚀 开始运行性能基准测试                      ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    suite.run({ async: true });
}

// 运行基准测试
if (require.main === module) {
    runBenchmarks().catch((error) => {
        console.error('❌ 基准测试失败:', error);
        process.exit(1);
    });
}

module.exports = { runBenchmarks };
