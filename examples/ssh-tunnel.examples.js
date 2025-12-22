/**
 * SSH 隧道使用示例
 *
 * 本文件展示如何使用 monSQLize 的 SSH 隧道功能连接防火墙后的 MongoDB
 *
 * 注意：这些示例需要真实的SSH服务器和MongoDB环境才能运行
 */

const MonSQLize = require('../lib/index');
const fs = require('fs');

// ============================================
// 示例 1: SSH隧道 + 密码认证（推荐用于测试）
// ============================================
async function example1_passwordAuth() {
    console.log('\n========== 示例 1: SSH隧道 + 密码认证 ==========\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'production',
        config: {
            // SSH隧道配置（密码认证）
            ssh: {
                host: 'bastion.example.com',
                port: 22,
                username: 'deploy',
                password: 'your-password',  // ✅ 支持密码认证
            },
            // MongoDB连接URI（内网MongoDB地址）
            uri: 'mongodb://mongouser:mongopass@internal-mongo.local:27017/production',
            // 或者分别指定
            remoteHost: 'internal-mongo.local',
            remotePort: 27017,
        }
    });

    try {
        await msq.connect();
        console.log('✅ 已通过SSH隧道连接到MongoDB（密码认证）');

        const users = msq.collection('users');
        const user = await users.findOne({ email: 'alice@example.com' });
        console.log('查询结果:', user);

    } catch (err) {
        console.error('❌ 连接失败:', err.message);
    } finally {
        if (msq._adapter) {
            await msq._adapter.close();
        }
    }
}

// ============================================
// 示例 2: 基础 SSH 隧道（私钥认证）
// ============================================
async function example2_basicSSHTunnel() {
    console.log('\n========== 示例 2: 基础 SSH 隧道（私钥认证） ==========\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'production',
        config: {
            // SSH 隧道配置
            ssh: {
                host: 'bastion.example.com',      // SSH 服务器地址
                port: 22,                          // SSH 端口（默认22）
                username: 'deploy',                // SSH 用户名
                privateKeyPath: '~/.ssh/id_rsa',  // 私钥路径
            },
            // MongoDB连接URI（内网MongoDB地址）
            uri: 'mongodb://mongouser:mongopass@internal-mongo.local:27017/production',
            // MongoDB 目标地址（内网）
            remoteHost: 'internal-mongo.local',   // MongoDB 服务器地址
            remotePort: 27017,                    // MongoDB 端口
        }
    });

    try {
        // 连接（自动建立 SSH 隧道）
        await msq.connect();
        console.log('✅ 已通过 SSH 隧道连接到 MongoDB');

        // 正常使用 MongoDB
        const users = msq.collection('users');
        const user = await users.findOne({ email: 'alice@example.com' });
        console.log('查询结果:', user);

    } catch (err) {
        console.error('❌ 连接失败:', err.message);
    } finally {
        // 关闭连接（自动关闭 SSH 隧道）
        if (msq._adapter) {
            await msq._adapter.close();
        }
    }
}

// ============================================
// 示例 3: 使用 URI 格式（自动解析）
// ============================================
async function example3_uriFormat() {
    console.log('\n========== 示例 3: 使用 URI 格式（自动解析） ==========\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'production',
        config: {
            ssh: {
                host: 'bastion.example.com',
                username: 'deploy',
                privateKeyPath: '~/.ssh/id_rsa',
            },
            // 自动从 URI 解析 remoteHost 和 remotePort
            uri: 'mongodb://mongouser:mongopass@internal-mongo:27017/production'
        }
    });

    try {
        await msq.connect();
        console.log('✅ 已通过 SSH 隧道连接到 MongoDB');

        const products = msq.collection('products');
        const count = await products.count({});
        console.log('商品总数:', count);

    } catch (err) {
        console.error('❌ 连接失败:', err.message);
    } finally {
        if (msq._adapter) {
            await msq._adapter.close();
        }
    }
}

// ============================================
// 示例 4: 指定本地端口
// ============================================
async function example4_customLocalPort() {
    console.log('\n========== 示例 4: 指定本地端口 ==========\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'production',
        config: {
            ssh: {
                host: 'bastion.example.com',
                username: 'deploy',
                privateKeyPath: '~/.ssh/id_rsa',
                localPort: 27018,  // 固定本地端口（可选，默认随机分配）
            },
            uri: 'mongodb://mongouser:mongopass@internal-mongo:27017/production',
            remoteHost: 'internal-mongo',
            remotePort: 27017
        }
    });

    try {
        await msq.connect();
        console.log('✅ 已通过 SSH 隧道连接到 MongoDB（本地端口: 27018）');

        const orders = msq.collection('orders');
        const recentOrders = await orders.find({}, { limit: 10, sort: { createdAt: -1 } });
        console.log('最近订单数:', recentOrders.length);

    } catch (err) {
        console.error('❌ 连接失败:', err.message);
    } finally {
        if (msq._adapter) {
            await msq._adapter.close();
        }
    }
}

// ============================================
// 示例 5: 带认证的 MongoDB URI
// ============================================
async function example5_authenticatedMongoDB() {
    console.log('\n========== 示例 5: 带认证的 MongoDB ==========\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'production',
        config: {
            ssh: {
                host: 'bastion.example.com',
                username: 'deploy',
                privateKeyPath: '~/.ssh/id_rsa',
            },
            // MongoDB URI 包含认证信息
            uri: 'mongodb://mongouser:mongopass@internal-mongo:27017/production',
            remoteHost: 'internal-mongo',
            remotePort: 27017,
        }
    });

    try {
        await msq.connect();
        console.log('✅ 已通过 SSH 隧道连接到 MongoDB（带认证）');

        const logs = msq.collection('logs');
        const logCount = await logs.count({});
        console.log('日志总数:', logCount);

    } catch (err) {
        console.error('❌ 连接失败:', err.message);
    } finally {
        if (msq._adapter) {
            await msq._adapter.close();
        }
    }
}

// ============================================
// 示例 6: 完整配置（高级用法）
// ============================================
async function example6_advancedConfig() {
    console.log('\n========== 示例 6: 完整配置 ==========\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'production',
        config: {
            ssh: {
                // SSH 服务器配置
                host: 'bastion.example.com',
                port: 2222,                        // 自定义 SSH 端口
                username: 'deploy',
                privateKeyPath: '~/.ssh/id_rsa',

                // 高级配置
                readyTimeout: 30000,               // 连接超时（30秒）
                localPort: 27018,                  // 本地端口
            },
            // MongoDB URI（包含认证）
            uri: 'mongodb://mongouser:mongopass@mongo-replica-01.internal:27017/production',
            // MongoDB 配置
            remoteHost: 'mongo-replica-01.internal',
            remotePort: 27017,
            // MongoDB 连接选项
            options: {
                maxPoolSize: 10,
                minPoolSize: 2,
                serverSelectionTimeoutMS: 5000,
            }
        }
    });

    try {
        await msq.connect();
        console.log('✅ 已通过 SSH 隧道连接到 MongoDB（完整配置）');

        const users = msq.collection('users');
        const activeUsers = await users.find({ status: 'active' }, { limit: 100 });
        console.log('活跃用户数:', activeUsers.length);

    } catch (err) {
        console.error('❌ 连接失败:', err.message);
    } finally {
        if (msq._adapter) {
            await msq._adapter.close();
        }
    }
}

// ============================================
// 示例 7: 错误处理
// ============================================
async function example7_errorHandling() {
    console.log('\n========== 示例 7: 错误处理 ==========\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test',
        config: {
            ssh: {
                host: 'nonexistent-server.example.com',
                username: 'user',
                password: 'testpass',  // 使用密码以便演示错误处理
            },
            uri: 'mongodb://user:pass@mongo.internal:27017/test',
            remoteHost: 'mongo.internal',
            remotePort: 27017
        }
    });

    try {
        await msq.connect();
    } catch (err) {
        // 友好的错误处理
        if (err.message.includes('getaddrinfo') || err.message.includes('ENOTFOUND')) {
            console.log('❌ 错误: SSH服务器地址无法解析');
            console.log('检查事项:');
            console.log('  - SSH 服务器地址是否正确');
            console.log('  - DNS 解析是否正常');
            console.log('  - 网络连接是否正常');
        } else if (err.message.includes('Timed out')) {
            console.log('❌ 错误: SSH 连接超时');
            console.log('检查事项:');
            console.log('  - SSH 服务器是否在线');
            console.log('  - SSH 端口是否正确（默认22）');
            console.log('  - 防火墙是否允许 SSH 连接');
        } else if (err.message.includes('Authentication')) {
            console.log('❌ 错误: SSH 认证失败');
            console.log('检查事项:');
            console.log('  - 用户名是否正确');
            console.log('  - 密码/私钥是否正确');
            console.log('  - SSH服务器是否允许该认证方式');
        } else {
            console.log('❌ 错误:', err.message);
        }
    }
}

// ============================================
// 运行所有示例
// ============================================
async function runAllExamples() {
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║         monSQLize SSH 隧道使用示例                    ║');
    console.log('╚═══════════════════════════════════════════════════════╝');

    console.log('\n⚠️  注意: 这些示例需要真实的 SSH 服务器和 MongoDB 环境');
    console.log('如需运行，请修改配置为您的实际环境信息\n');

    // 示例代码展示（不实际运行）
    console.log('可运行的示例:');
    console.log('  - example1_passwordAuth()        # SSH隧道 + 密码认证');
    console.log('  - example2_basicSSHTunnel()      # 基础 SSH 隧道（私钥）');
    console.log('  - example3_uriFormat()           # 使用 URI 格式');
    console.log('  - example4_customLocalPort()     # 指定本地端口');
    console.log('  - example5_authenticatedMongoDB()# 带认证的 MongoDB');
    console.log('  - example6_advancedConfig()      # 完整配置');
    console.log('  - example7_errorHandling()       # 错误处理\n');

    // 如果需要实际运行，请取消下面的注释
    // await example1_passwordAuth();
    // await example2_basicSSHTunnel();
    // await example3_uriFormat();
    // await example4_customLocalPort();
    // await example5_authenticatedMongoDB();
    // await example6_advancedConfig();
    await example7_errorHandling();
}

// 运行示例
if (require.main === module) {
    runAllExamples().catch(console.error);
}

module.exports = {
    example1_passwordAuth,
    example2_basicSSHTunnel,
    example3_uriFormat,
    example4_customLocalPort,
    example5_authenticatedMongoDB,
    example6_advancedConfig,
    example7_errorHandling
};

