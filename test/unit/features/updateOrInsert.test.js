/**
 * updateOrInsert 方法完整测试套件
 * 测试更新或插入文档（深度合并）的功能
 */

const MonSQLize = require('../../../lib');
const { ObjectId } = require('mongodb');
const assert = require('assert');

describe('updateOrInsert 方法测试套件', function () {
    this.timeout(30000);

    let msq;
    let collection;
    let nativeDb;

    before(async function () {
        console.log('🔧 初始化测试环境...');

        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_update_or_insert',
            config: { useMemoryServer: true },
            slowQueryMs: 1000
        });

        const conn = await msq.connect();
        collection = conn.collection;

        nativeDb = msq._adapter.db;

        console.log('✅ 测试环境准备完成');
    });

    after(async function () {
        console.log('🧹 清理测试环境...');
        if (msq) {
            await msq.close();
        }
        console.log('✅ 测试环境清理完成');
    });

    afterEach(async function () {
    // 清理所有测试集合
        const collections = await nativeDb.listCollections().toArray();
        for (const coll of collections) {
            await nativeDb.collection(coll.name).deleteMany({});
        }
    });

    describe('1. 基础功能测试', function () {
        it('1.1 应该插入新文档（不存在时）', async function () {
            const result = await collection('configs').updateOrInsert(
                { userId: 1 },
                {
                    config: {
                        theme: 'dark',
                        language: 'zh'
                    }
                }
            );

            assert.strictEqual(result.upserted, true, '应该标记为插入');
            assert.strictEqual(result.modified, false, '不应该有修改');
            assert.ok(result.doc._id);
            assert.strictEqual(result.doc.config.theme, 'dark');
        });

        it('1.2 应该更新现有文档（replace 策略）', async function () {
            // 先插入
            await nativeDb.collection('configs').insertOne({
                userId: 2,
                config: { theme: 'light', language: 'en' }
            });

            // 更新（完全替换）
            const result = await collection('configs').updateOrInsert(
                { userId: 2 },
                {
                    config: { theme: 'dark' }  // 只有 theme，language 会丢失
                },
                { mergeStrategy: 'replace' }
            );

            assert.strictEqual(result.upserted, false);
            assert.strictEqual(result.modified, true);
            assert.strictEqual(result.doc.config.theme, 'dark');
            assert.strictEqual(result.doc.config.language, undefined, 'replace 策略会丢失其他字段');
        });
    });

    describe('2. 深度合并测试', function () {
        it('2.1 应该深度合并嵌套对象', async function () {
            // 先插入
            await nativeDb.collection('configs').insertOne({
                userId: 3,
                config: {
                    theme: 'light',
                    language: 'en',
                    fontSize: 14,
                    notifications: {
                        email: true,
                        push: false,
                        sms: false
                    }
                }
            });

            // 深度合并更新
            const result = await collection('configs').updateOrInsert(
                { userId: 3 },
                {
                    config: {
                        theme: 'dark',
                        notifications: {
                            email: false  // 只更新这一项
                        }
                    }
                },
                { mergeStrategy: 'deep' }
            );

            assert.strictEqual(result.upserted, false);
            assert.strictEqual(result.modified, true);

            // 验证深度合并结果
            assert.strictEqual(result.doc.config.theme, 'dark', '应该更新 theme');
            assert.strictEqual(result.doc.config.language, 'en', '应该保留 language');
            assert.strictEqual(result.doc.config.fontSize, 14, '应该保留 fontSize');
            assert.strictEqual(result.doc.config.notifications.email, false, '应该更新 email');
            assert.strictEqual(result.doc.config.notifications.push, false, '应该保留 push');
            assert.strictEqual(result.doc.config.notifications.sms, false, '应该保留 sms');
        });

        it('2.2 深度合并应该保留所有未修改的字段', async function () {
            await nativeDb.collection('configs').insertOne({
                userId: 4,
                profile: {
                    name: 'Alice',
                    age: 30,
                    address: {
                        city: 'Beijing',
                        street: 'Main St',
                        zip: '100000'
                    },
                    hobbies: ['reading', 'gaming']
                }
            });

            const result = await collection('configs').updateOrInsert(
                { userId: 4 },
                {
                    profile: {
                        age: 31,
                        address: {
                            city: 'Shanghai'  // 只更新城市
                        }
                    }
                },
                { mergeStrategy: 'deep' }
            );

            assert.strictEqual(result.doc.profile.name, 'Alice', '应该保留 name');
            assert.strictEqual(result.doc.profile.age, 31, '应该更新 age');
            assert.strictEqual(result.doc.profile.address.city, 'Shanghai', '应该更新 city');
            assert.strictEqual(result.doc.profile.address.street, 'Main St', '应该保留 street');
            assert.strictEqual(result.doc.profile.address.zip, '100000', '应该保留 zip');
            assert.deepStrictEqual(result.doc.profile.hobbies, ['reading', 'gaming'], '应该保留 hobbies');
        });

        it('2.3 深度合并应该正确处理数组（直接替换）', async function () {
            await nativeDb.collection('configs').insertOne({
                userId: 5,
                tags: ['tag1', 'tag2', 'tag3']
            });

            const result = await collection('configs').updateOrInsert(
                { userId: 5 },
                {
                    tags: ['tag4', 'tag5']  // 数组应该直接替换，不合并
                },
                { mergeStrategy: 'deep' }
            );

            assert.deepStrictEqual(result.doc.tags, ['tag4', 'tag5'], '数组应该直接替换');
        });
    });

    describe('3. 浅合并测试', function () {
        it('3.1 浅合并应该只合并第一层', async function () {
            await nativeDb.collection('configs').insertOne({
                userId: 6,
                config: {
                    theme: 'light',
                    notifications: {
                        email: true,
                        push: false
                    }
                }
            });

            const result = await collection('configs').updateOrInsert(
                { userId: 6 },
                {
                    config: {
                        theme: 'dark'  // config 会被完全替换
                    }
                },
                { mergeStrategy: 'shallow' }
            );

            assert.strictEqual(result.doc.config.theme, 'dark');
            assert.strictEqual(result.doc.config.notifications, undefined, '浅合并会丢失嵌套对象');
        });
    });

    describe('4. 真实场景测试', function () {
        it('4.1 场景：用户配置管理', async function () {
            // 初始配置
            await nativeDb.collection('user_configs').insertOne({
                userId: 100,
                preferences: {
                    theme: 'light',
                    language: 'en',
                    fontSize: 14,
                    notifications: {
                        email: true,
                        push: true,
                        sms: false
                    },
                    shortcuts: {
                        save: 'Ctrl+S',
                        copy: 'Ctrl+C'
                    }
                }
            });

            // 用户只修改主题和邮件通知
            const result = await collection('user_configs').updateOrInsert(
                { userId: 100 },
                {
                    preferences: {
                        theme: 'dark',
                        notifications: {
                            email: false
                        }
                    }
                },
                { mergeStrategy: 'deep' }
            );

            // 验证：只有指定字段更新，其他全部保留
            const prefs = result.doc.preferences;
            assert.strictEqual(prefs.theme, 'dark', '主题已更新');
            assert.strictEqual(prefs.language, 'en', 'language 保留');
            assert.strictEqual(prefs.fontSize, 14, 'fontSize 保留');
            assert.strictEqual(prefs.notifications.email, false, 'email 通知已更新');
            assert.strictEqual(prefs.notifications.push, true, 'push 通知保留');
            assert.strictEqual(prefs.notifications.sms, false, 'sms 通知保留');
            assert.deepStrictEqual(prefs.shortcuts, { save: 'Ctrl+S', copy: 'Ctrl+C' }, '快捷键保留');

            console.log('  ✅ 用户配置管理：只更新 theme 和 email，其他 5 个字段全部保留');
        });

        it('4.2 场景：系统功能开关', async function () {
            await nativeDb.collection('system_configs').insertOne({
                key: 'features',
                settings: {
                    maintenance: false,
                    maxUploadSize: 10,
                    features: {
                        chat: true,
                        ai: false,
                        video: true,
                        analytics: false
                    }
                }
            });

            // 只启用 AI 功能
            const result = await collection('system_configs').updateOrInsert(
                { key: 'features' },
                {
                    settings: {
                        features: {
                            ai: true
                        }
                    }
                },
                { mergeStrategy: 'deep' }
            );

            const settings = result.doc.settings;
            assert.strictEqual(settings.maintenance, false, 'maintenance 保留');
            assert.strictEqual(settings.maxUploadSize, 10, 'maxUploadSize 保留');
            assert.strictEqual(settings.features.chat, true, 'chat 保留');
            assert.strictEqual(settings.features.ai, true, 'ai 已启用');
            assert.strictEqual(settings.features.video, true, 'video 保留');
            assert.strictEqual(settings.features.analytics, false, 'analytics 保留');

            console.log('  ✅ 系统功能开关：只启用 AI，其他 5 个配置全部保留');
        });

        it('4.3 场景：月度统计部分更新', async function () {
            await nativeDb.collection('monthly_stats').insertOne({
                month: '2024-12',
                stats: {
                    users: { total: 1000, active: 800, new: 50 },
                    orders: { total: 500, amount: 100000 },
                    revenue: { total: 100000, refund: 5000 }
                }
            });

            // 只更新用户统计
            const result = await collection('monthly_stats').updateOrInsert(
                { month: '2024-12' },
                {
                    stats: {
                        users: { total: 1050, active: 850, new: 50 }
                    }
                },
                { mergeStrategy: 'deep' }
            );

            const stats = result.doc.stats;
            assert.strictEqual(stats.users.total, 1050, 'users.total 已更新');
            assert.strictEqual(stats.users.active, 850, 'users.active 已更新');
            assert.deepStrictEqual(stats.orders, { total: 500, amount: 100000 }, 'orders 保留');
            assert.deepStrictEqual(stats.revenue, { total: 100000, refund: 5000 }, 'revenue 保留');

            console.log('  ✅ 月度统计：只更新用户数据，订单和营收数据完全保留');
        });
    });

    describe('5. 参数验证测试', function () {
        it('5.1 应该拒绝非对象 query', async function () {
            try {
                await collection('configs').updateOrInsert('invalid', {});
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('query 必须是对象'));
            }
        });

        it('5.2 应该拒绝非对象 update', async function () {
            try {
                await collection('configs').updateOrInsert({ userId: 1 }, 'invalid');
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('update 必须是对象'));
            }
        });

        it('5.3 应该拒绝无效的 mergeStrategy', async function () {
            try {
                await collection('configs').updateOrInsert(
                    { userId: 1 },
                    { config: { theme: 'dark' } },
                    { mergeStrategy: 'invalid' }
                );
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('mergeStrategy'));
            }
        });
    });

    describe('6. projection 选项测试', function () {
        it('6.1 应该支持 projection（插入时）', async function () {
            const result = await collection('configs').updateOrInsert(
                { userId: 7 },
                {
                    config: { theme: 'dark', language: 'zh' },
                    secret: 'should-not-return'
                },
                { projection: { config: 1 } }
            );

            assert.ok(result.doc._id);
            assert.ok(result.doc.config);
            assert.strictEqual(result.doc.secret, undefined, 'secret 不应该返回');
        });

        it('6.2 应该支持 projection（更新时）', async function () {
            await nativeDb.collection('configs').insertOne({
                userId: 8,
                config: { theme: 'light' },
                secret: 'secret-value'
            });

            const result = await collection('configs').updateOrInsert(
                { userId: 8 },
                {
                    config: { theme: 'dark' }
                },
                {
                    mergeStrategy: 'deep',
                    projection: { config: 1 }
                }
            );

            assert.ok(result.doc._id);
            assert.ok(result.doc.config);
            assert.strictEqual(result.doc.secret, undefined, 'secret 不应该返回');
        });
    });
});

