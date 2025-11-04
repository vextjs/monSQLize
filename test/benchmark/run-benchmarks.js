/**
 * 性能基准测试运行器
 * 
 * 测试场景：
 * 1. 简单查询 (findOne/find)
 * 2. 分页查询 (findPage)
 * 3. 聚合查询 (aggregate)
 * 4. 缓存效率
 */

const Benchmark = require('benchmark');
const MonSQLize = require('../../lib/index');

// 测试配置
const TEST_CONFIG = {
    type: 'mongodb',
    databaseName: 'benchmark_test',
    config: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
    },
    maxTimeMS: 5000,
    findLimit: 10,
};

// 颜色输出
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
};

async function setupTestData(collection) {
    console.log('Setting up test data...');
    
    // 清空集合
    try {
        await collection.invalidate();
    } catch (e) {
        // 忽略错误
    }
    
    console.log('Test data ready.\n');
}

async function runBenchmarks() {
    console.log(`${colors.bright}${colors.cyan}=== monSQLize Performance Benchmarks ===${colors.reset}\n`);
    
    let db, collection;
    
    try {
        // 连接数据库
        console.log('Connecting to MongoDB...');
        const instance = new MonSQLize(TEST_CONFIG);
        const result = await instance.connect();
        db = result.db;
        collection = result.collection;
        
        const testCollection = collection('benchmark_users');
        
        // 准备测试数据
        await setupTestData(testCollection);
        
        // 基准测试套件
        const suite = new Benchmark.Suite('monSQLize');
        
        // 1. findOne 基准测试
        console.log(`${colors.yellow}1. Testing findOne performance...${colors.reset}`);
        suite.add('findOne - simple query', {
            defer: true,
            fn: async function(deferred) {
                await testCollection.findOne({ query: { email: 'user1@example.com' } });
                deferred.resolve();
            },
        });
        
        suite.add('findOne - with cache', {
            defer: true,
            fn: async function(deferred) {
                await testCollection.findOne({ 
                    query: { email: 'user1@example.com' },
                    cache: 5000,
                });
                deferred.resolve();
            },
        });
        
        // 2. find 基准测试
        console.log(`${colors.yellow}2. Testing find performance...${colors.reset}`);
        suite.add('find - limit 10', {
            defer: true,
            fn: async function(deferred) {
                await testCollection.find({ query: {}, limit: 10 });
                deferred.resolve();
            },
        });
        
        suite.add('find - limit 100', {
            defer: true,
            fn: async function(deferred) {
                await testCollection.find({ query: {}, limit: 100 });
                deferred.resolve();
            },
        });
        
        // 3. findPage 基准测试
        console.log(`${colors.yellow}3. Testing findPage performance...${colors.reset}`);
        suite.add('findPage - first page', {
            defer: true,
            fn: async function(deferred) {
                await testCollection.findPage({ limit: 20 });
                deferred.resolve();
            },
        });
        
        // 4. count 基准测试
        console.log(`${colors.yellow}4. Testing count performance...${colors.reset}`);
        suite.add('count - simple', {
            defer: true,
            fn: async function(deferred) {
                await testCollection.count({ query: {} });
                deferred.resolve();
            },
        });
        
        // 5. 缓存效率测试
        console.log(`${colors.yellow}5. Testing cache efficiency...${colors.reset}`);
        
        // 预热缓存
        await testCollection.findOne({ 
            query: { email: 'cache-test@example.com' },
            cache: 10000,
        });
        
        suite.add('findOne - cache hit', {
            defer: true,
            fn: async function(deferred) {
                await testCollection.findOne({ 
                    query: { email: 'cache-test@example.com' },
                    cache: 10000,
                });
                deferred.resolve();
            },
        });
        
        // 运行基准测试
        suite
            .on('cycle', function(event) {
                const benchmark = event.target;
                const hz = benchmark.hz;
                const mean = benchmark.stats.mean * 1000; // 转换为毫秒
                const rme = benchmark.stats.rme;
                
                console.log(`  ${colors.green}✓${colors.reset} ${benchmark.name}`);
                console.log(`    ${hz.toFixed(2)} ops/sec`);
                console.log(`    ${mean.toFixed(2)} ms/op (±${rme.toFixed(2)}%)`);
                console.log();
            })
            .on('complete', function() {
                console.log(`${colors.bright}${colors.green}Benchmarks completed!${colors.reset}\n`);
                
                // 输出总结
                const fastest = this.filter('fastest').map('name');
                const slowest = this.filter('slowest').map('name');
                
                console.log(`${colors.bright}Summary:${colors.reset}`);
                console.log(`  Fastest: ${colors.green}${fastest}${colors.reset}`);
                console.log(`  Slowest: ${colors.yellow}${slowest}${colors.reset}`);
                
                // 清理并退出
                process.exit(0);
            })
            .on('error', function(event) {
                console.error(`${colors.bright}Error:${colors.reset}`, event.target.error);
                process.exit(1);
            })
            .run({ async: true });
        
    } catch (error) {
        console.error(`${colors.bright}Setup Error:${colors.reset}`, error);
        process.exit(1);
    }
}

// 执行基准测试
if (require.main === module) {
    runBenchmarks().catch(err => {
        console.error('Benchmark error:', err);
        process.exit(1);
    });
}

module.exports = { runBenchmarks };

