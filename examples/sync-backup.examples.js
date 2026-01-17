/**
 * Change Stream 数据同步示例
 *
 * 演示如何使用 Change Stream 实时同步数据到备份库
 *
 * @version 1.0.8
 */

const MonSQLize = require('../index');

console.log('=== Change Stream 数据同步示例 ===\n');

// ========== 示例1：基础配置 ==========
async function example1() {
    console.log('【示例1】基础配置\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        config: {
            uri: 'mongodb://localhost:27017/main',
            replicaSet: 'rs0'  // 🔴 必须：Change Stream 需要 Replica Set
        },

        // 🆕 同步配置
        sync: {
            enabled: true,

            // 备份目标
            targets: [
                {
                    name: 'backup-main',
                    uri: 'mongodb://localhost:27017/backup',
                    collections: ['users', 'orders']  // 只同步指定集合
                }
            ],

            // Resume Token 配置
            resumeToken: {
                storage: 'file',
                path: './.sync-resume-token'
            }
        }
    });

    await msq.connect();
    console.log('✅ 连接成功，Change Stream 同步已启动\n');

    // 正常使用，自动同步
    const users = msq.collection('users');
    const result = await users.insertOne({
        name: 'Alice',
        email: 'alice@example.com',
        createdAt: new Date()
    });

    console.log('✅ 插入用户:', result.insertedId);
    console.log('✅ 数据自动同步到 backup-main\n');

    // 等待一下确保同步完成
    await new Promise(resolve => setTimeout(resolve, 1000));

    await msq.close();
    console.log('✅ 连接已关闭\n');
}

// ========== 示例2：多备份目标 ==========
async function example2() {
    console.log('【示例2】多备份目标（多地容灾）\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        config: {
            uri: 'mongodb://localhost:27017/main',
            replicaSet: 'rs0'
        },

        sync: {
            enabled: true,
            targets: [
                {
                    name: 'backup-asia',
                    uri: 'mongodb://asia-backup:27017/backup',
                    collections: ['*']  // 同步所有集合
                },
                {
                    name: 'backup-us',
                    uri: 'mongodb://us-backup:27017/backup',
                    collections: ['*']
                },
                {
                    name: 'backup-eu',
                    uri: 'mongodb://eu-backup:27017/backup',
                    collections: ['users', 'orders']  // 部分同步
                }
            ]
        }
    });

    await msq.connect();
    console.log('✅ 同时同步到3个备份库\n');

    // 写操作自动同步到所有目标
    await msq.collection('users').insertOne({ name: 'Bob' });
    console.log('✅ 数据已同步到 backup-asia, backup-us, backup-eu\n');

    await msq.close();
}

// ========== 示例3：数据过滤 ==========
async function example3() {
    console.log('【示例3】数据过滤（只同步 active 用户）\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        config: {
            uri: 'mongodb://localhost:27017/main',
            replicaSet: 'rs0'
        },

        sync: {
            enabled: true,
            targets: [
                {
                    name: 'backup-main',
                    uri: 'mongodb://localhost:27017/backup'
                }
            ],

            // 🆕 过滤函数
            filter: (event) => {
                // 只同步 active 状态的用户
                if (event.ns?.coll === 'users') {
                    return event.fullDocument?.status === 'active';
                }
                return true;
            }
        }
    });

    await msq.connect();

    // 插入 active 用户 → 会同步
    await msq.collection('users').insertOne({
        name: 'Alice',
        status: 'active'
    });
    console.log('✅ active 用户已同步');

    // 插入 inactive 用户 → 不会同步
    await msq.collection('users').insertOne({
        name: 'Bob',
        status: 'inactive'
    });
    console.log('⏭️  inactive 用户未同步（被过滤）\n');

    await msq.close();
}

// ========== 示例4：数据转换（脱敏）==========
async function example4() {
    console.log('【示例4】数据转换（敏感数据脱敏）\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        config: {
            uri: 'mongodb://localhost:27017/main',
            replicaSet: 'rs0'
        },

        sync: {
            enabled: true,
            targets: [
                {
                    name: 'backup-public',
                    uri: 'mongodb://public-backup:27017/backup'
                }
            ],

            // 🆕 转换函数（脱敏）
            transform: (doc) => {
                // 删除敏感字段
                delete doc.password;
                delete doc.ssn;
                delete doc.creditCard;

                // 脱敏邮箱
                if (doc.email) {
                    const [name, domain] = doc.email.split('@');
                    doc.email = name.slice(0, 3) + '***@' + domain;
                }

                // 添加同步时间戳
                doc.syncedAt = new Date();

                return doc;
            }
        }
    });

    await msq.connect();

    await msq.collection('users').insertOne({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'secret123',  // 会被删除
        ssn: '123-45-6789'      // 会被删除
    });

    console.log('✅ 敏感数据已脱敏后同步到备份库\n');

    await msq.close();
}

// ========== 示例5：Redis Resume Token ==========
async function example5() {
    console.log('【示例5】使用 Redis 存储 Resume Token\n');

    const Redis = require('ioredis');
    const redis = new Redis();

    const msq = new MonSQLize({
        type: 'mongodb',
        config: {
            uri: 'mongodb://localhost:27017/main',
            replicaSet: 'rs0'
        },

        sync: {
            enabled: true,
            targets: [
                {
                    name: 'backup-main',
                    uri: 'mongodb://localhost:27017/backup'
                }
            ],

            // 🆕 Redis Resume Token
            resumeToken: {
                storage: 'redis',
                redis: redis
            }
        }
    });

    await msq.connect();
    console.log('✅ Resume Token 保存到 Redis\n');

    await msq.collection('users').insertOne({ name: 'Alice' });

    // 等待同步
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 查看 Resume Token
    const token = await redis.get('monsqlize:sync:resume-token');
    console.log('Resume Token:', JSON.parse(token));

    await msq.close();
    await redis.quit();
}

// ========== 示例6：查看同步统计 ==========
async function example6() {
    console.log('【示例6】查看同步统计\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        config: {
            uri: 'mongodb://localhost:27017/main',
            replicaSet: 'rs0'
        },

        sync: {
            enabled: true,
            targets: [
                {
                    name: 'backup-main',
                    uri: 'mongodb://localhost:27017/backup'
                }
            ]
        }
    });

    await msq.connect();

    // 执行一些操作
    await msq.collection('users').insertOne({ name: 'Alice' });
    await msq.collection('users').insertOne({ name: 'Bob' });
    await msq.collection('orders').insertOne({ userId: 'Alice' });

    // 等待同步
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 获取统计信息
    const stats = msq._syncManager.getStats();
    console.log('同步统计:', JSON.stringify(stats, null, 2));

    await msq.close();
}

// ========== 运行示例 ==========
async function runExamples() {
    try {
        // 取消注释想要运行的示例

        // await example1();  // 基础配置
        // await example2();  // 多备份目标
        // await example3();  // 数据过滤
        // await example4();  // 数据转换
        // await example5();  // Redis Resume Token
        // await example6();  // 查看统计

        console.log('提示：取消注释想要运行的示例\n');
        console.log('⚠️  前提条件：');
        console.log('1. MongoDB 必须是 Replica Set（rs.status()）');
        console.log('2. MongoDB 版本 >= 4.0');
        console.log('3. 用户有 changeStream 权限');

    } catch (error) {
        console.error('❌ 错误:', error.message);
    }
}

runExamples();

