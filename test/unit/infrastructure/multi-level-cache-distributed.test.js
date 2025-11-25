/**
 * MultiLevelCache 分布式失效集成测试
 *
 * 测试 MultiLevelCache 与 DistributedCacheInvalidator 的集成：
 * - setPublish 方法
 * - delPattern 触发广播
 * - 分布式场景下的缓存一致性
 */

const { describe, it, beforeEach } = require('mocha');
const { expect } = require('chai');
const sinon = require('sinon');
const MultiLevelCache = require('../../../lib/multi-level-cache');
const CacheFactory = require('../../../lib/cache');

describe('MultiLevelCache - 分布式失效集成', () => {
    let localCache;
    let remoteCache;
    let multiCache;
    let publishSpy;

    beforeEach(() => {
        localCache = CacheFactory.createDefault({ maxSize: 100 });
        remoteCache = {
            get: sinon.stub().resolves(null),
            set: sinon.stub().resolves(true),
            del: sinon.stub().resolves(true),
            delPattern: sinon.stub().resolves(5),
            exists: sinon.stub().resolves(false),
            getMany: sinon.stub().resolves([]),
            setMany: sinon.stub().resolves(true),
            delMany: sinon.stub().resolves(0)
        };

        publishSpy = sinon.spy();
    });

    describe('setPublish 方法', () => {
        it('应该设置 publish 回调', () => {
            multiCache = new MultiLevelCache({
                local: localCache,
                remote: remoteCache
            });

            const publishFn = sinon.spy();
            multiCache.setPublish(publishFn);

            expect(multiCache.publish).to.equal(publishFn);
        });

        it('应该忽略非函数参数', () => {
            multiCache = new MultiLevelCache({
                local: localCache,
                remote: remoteCache
            });

            multiCache.setPublish('not a function');

            expect(multiCache.publish).to.be.null;
        });

        it('应该在构造时接受 publish 参数', () => {
            const publishFn = sinon.spy();

            multiCache = new MultiLevelCache({
                local: localCache,
                remote: remoteCache,
                publish: publishFn
            });

            expect(multiCache.publish).to.equal(publishFn);
        });
    });

    describe('delPattern 触发广播', () => {
        beforeEach(() => {
            multiCache = new MultiLevelCache({
                local: localCache,
                remote: remoteCache,
                publish: publishSpy
            });
        });

        it('应该在 delPattern 时触发 publish', async () => {
            await localCache.set('user:1', { name: 'Alice' });
            await localCache.set('user:2', { name: 'Bob' });

            await multiCache.delPattern('user:*');

            expect(publishSpy.calledOnce).to.be.true;
            expect(publishSpy.firstCall.args[0]).to.deep.include({
                type: 'invalidate',
                pattern: 'user:*'
            });
            expect(publishSpy.firstCall.args[0].ts).to.be.a('number');
        });

        it('应该在没有 publish 时正常工作', async () => {
            multiCache = new MultiLevelCache({
                local: localCache,
                remote: remoteCache
            });

            await localCache.set('user:1', { name: 'Alice' });

            // 不应该抛出错误
            const deleted = await multiCache.delPattern('user:*');
            expect(deleted).to.be.a('number');
        });

        it('应该返回删除的本地缓存数量', async () => {
            await localCache.set('product:1', { price: 100 });
            await localCache.set('product:2', { price: 200 });
            await localCache.set('order:1', { total: 300 });

            const deleted = await multiCache.delPattern('product:*');

            expect(deleted).to.equal(2);
        });

        it('应该处理 publish 错误', async () => {
            const errorPublish = sinon.stub().throws(new Error('Publish error'));
            multiCache = new MultiLevelCache({
                local: localCache,
                remote: remoteCache,
                publish: errorPublish
            });

            await localCache.set('user:1', { name: 'Alice' });

            // 不应该影响删除操作
            const deleted = await multiCache.delPattern('user:*');
            expect(deleted).to.equal(1);
        });
    });

    describe('分布式场景模拟', () => {
        let cacheA;
        let cacheB;
        let publishToB;
        let publishToA;

        beforeEach(() => {
            // 模拟实例 A
            const localA = CacheFactory.createDefault({ maxSize: 100 });
            cacheA = new MultiLevelCache({
                local: localA,
                remote: remoteCache
            });

            // 模拟实例 B
            const localB = CacheFactory.createDefault({ maxSize: 100 });
            cacheB = new MultiLevelCache({
                local: localB,
                remote: remoteCache
            });

            // 模拟广播：A -> B
            publishToB = async (msg) => {
                if (msg.type === 'invalidate') {
                    await cacheB.local.delPattern(msg.pattern);
                }
            };

            // 模拟广播：B -> A
            publishToA = async (msg) => {
                if (msg.type === 'invalidate') {
                    await cacheA.local.delPattern(msg.pattern);
                }
            };

            cacheA.setPublish(publishToB);
            cacheB.setPublish(publishToA);
        });

        it('应该在实例间同步缓存失效', async () => {
            // 两个实例都缓存相同的数据
            await cacheA.local.set('user:1', { name: 'Alice', version: 1 });
            await cacheB.local.set('user:1', { name: 'Alice', version: 1 });

            // 验证初始状态
            expect(await cacheA.local.get('user:1')).to.exist;
            expect(await cacheB.local.get('user:1')).to.exist;

            // 实例 A 失效缓存
            await cacheA.delPattern('user:*');

            // 实例 B 的缓存应该也被失效
            expect(await cacheA.local.get('user:1')).to.be.null;
            expect(await cacheB.local.get('user:1')).to.be.null;
        });

        it('应该支持模式匹配失效', async () => {
            // 设置多个缓存
            await cacheA.local.set('user:1', { name: 'Alice' });
            await cacheA.local.set('user:2', { name: 'Bob' });
            await cacheA.local.set('product:1', { price: 100 });

            await cacheB.local.set('user:1', { name: 'Alice' });
            await cacheB.local.set('user:2', { name: 'Bob' });
            await cacheB.local.set('product:1', { price: 100 });

            // 实例 A 只失效 user:*
            await cacheA.delPattern('user:*');

            // 验证：user:* 失效，product:* 保留
            expect(await cacheA.local.get('user:1')).to.be.null;
            expect(await cacheA.local.get('user:2')).to.be.null;
            expect(await cacheA.local.get('product:1')).to.exist;

            expect(await cacheB.local.get('user:1')).to.be.null;
            expect(await cacheB.local.get('user:2')).to.be.null;
            expect(await cacheB.local.get('product:1')).to.exist;
        });

        it('应该处理并发失效', async () => {
            // 设置缓存
            await cacheA.local.set('data:1', { value: 'A' });
            await cacheB.local.set('data:1', { value: 'B' });

            // 并发失效
            await Promise.all([
                cacheA.delPattern('data:*'),
                cacheB.delPattern('data:*')
            ]);

            // 两边都应该被清空
            expect(await cacheA.local.get('data:1')).to.be.null;
            expect(await cacheB.local.get('data:1')).to.be.null;
        });
    });

    describe('边缘情况', () => {
        beforeEach(() => {
            multiCache = new MultiLevelCache({
                local: localCache,
                remote: remoteCache,
                publish: publishSpy
            });
        });

        it('应该处理空 pattern', async () => {
            const deleted = await multiCache.delPattern('nonexistent:*');

            expect(deleted).to.equal(0);
            expect(publishSpy.calledOnce).to.be.true;
        });

        it('应该处理特殊字符的 pattern', async () => {
            await localCache.set('user:alice@example.com', { email: 'alice@example.com' });

            const deleted = await multiCache.delPattern('user:*@*');

            expect(deleted).to.equal(1);
        });

        it('应该支持精确匹配', async () => {
            await localCache.set('user:1', { name: 'Alice' });
            await localCache.set('user:10', { name: 'Bob' });
            await localCache.set('user:100', { name: 'Charlie' });

            const deleted = await multiCache.delPattern('user:1');

            expect(deleted).to.equal(1);
            expect(await localCache.get('user:10')).to.exist;
            expect(await localCache.get('user:100')).to.exist;
        });
    });

    describe('性能测试', () => {
        beforeEach(() => {
            multiCache = new MultiLevelCache({
                local: localCache,
                remote: remoteCache,
                publish: publishSpy
            });
        });

        it('应该快速处理大量失效', async () => {
            // 设置 100 个缓存项
            for (let i = 0; i < 100; i++) {
                await localCache.set(`item:${i}`, { value: i });
            }

            const start = Date.now();
            await multiCache.delPattern('item:*');
            const duration = Date.now() - start;

            expect(duration).to.be.lessThan(100); // 应该在 100ms 内完成
            expect(publishSpy.calledOnce).to.be.true;
        });
    });
});

