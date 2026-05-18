/**
 * SagaOrchestrator Redis 模式测试
 */
const { expect } = require('chai');
const SagaOrchestrator = require('../../../lib/saga/SagaOrchestrator');

describe('SagaOrchestrator - Redis 模式', () => {
    let mockCache;
    let orchestrator;

    beforeEach(() => {
        // 模拟 Redis cache
        mockCache = {
            storage: new Map(),

            async set(key, value) {
                this.storage.set(key, JSON.parse(JSON.stringify(value)));
            },

            async get(key) {
                return this.storage.get(key);
            },

            async keys(pattern) {
                const allKeys = Array.from(this.storage.keys());
                if (pattern.endsWith('*')) {
                    const prefix = pattern.slice(0, -1);
                    return allKeys.filter(k => k.startsWith(prefix));
                }
                return allKeys.filter(k => k === pattern);
            }
        };

        orchestrator = new SagaOrchestrator({
            cache: mockCache,
            logger: { debug: () => {}, info: () => {}, error: () => {}, warn: () => {} }
        });
    });

    it('应该初始化为 Redis 模式', () => {
        expect(orchestrator.useRedis).to.be.true;
        expect(orchestrator.sagaKeyPrefix).to.equal('monsqlize:saga:def:');
    });

    describe('defineSaga (Redis)', () => {
        it('应该将 Saga 元数据存储到 Redis', async () => {
            await orchestrator.defineSaga({
                name: 'test-saga',
                steps: [
                    {
                        name: 'step1',
                        execute: async () => {},
                        compensate: async () => {}
                    }
                ]
            });

            const key = 'monsqlize:saga:def:test-saga';
            const stored = mockCache.storage.get(key);

            expect(stored).to.exist;
            expect(stored.name).to.equal('test-saga');
            expect(stored.steps).to.have.lengthOf(1);
            expect(stored.steps[0]).to.deep.equal({
                name: 'step1',
                hasCompensate: true
            });
        });

        it('应该同时在内存中保存函数', async () => {
            await orchestrator.defineSaga({
                name: 'test-saga',
                steps: [
                    { name: 'step1', execute: async () => {} }
                ]
            });

            expect(orchestrator.sagas).to.be.instanceOf(Map);
            expect(orchestrator.sagas.has('test-saga')).to.be.true;
        });

        it('应该正确标记无补偿函数的步骤', async () => {
            await orchestrator.defineSaga({
                name: 'test-saga',
                steps: [
                    { name: 'step1', execute: async () => {} },
                    {
                        name: 'step2',
                        execute: async () => {},
                        compensate: async () => {}
                    }
                ]
            });

            const key = 'monsqlize:saga:def:test-saga';
            const stored = mockCache.storage.get(key);

            expect(stored.steps[0].hasCompensate).to.be.false;
            expect(stored.steps[1].hasCompensate).to.be.true;
        });
    });

    describe('execute (Redis)', () => {
        beforeEach(async () => {
            await orchestrator.defineSaga({
                name: 'test-saga',
                steps: [
                    {
                        name: 'step1',
                        execute: async (ctx) => {
                            ctx.set('result', 'success');
                            return { data: 'test' };
                        }
                    }
                ]
            });
        });

        it('应该能执行已定义的 Saga', async () => {
            const result = await orchestrator.execute('test-saga', { input: 'data' });

            expect(result.success).to.be.true;
            expect(result.sagaName).to.equal('test-saga');
        });

        it('Redis 中存在但未注册应该抛出错误', async () => {
            // 手动在 Redis 中添加 Saga 定义
            await mockCache.set('monsqlize:saga:def:unregistered-saga', {
                name: 'unregistered-saga',
                steps: []
            });

            // 清空内存中的 Saga
            orchestrator.sagas.delete('unregistered-saga');

            try {
                await orchestrator.execute('unregistered-saga', {});
                throw new Error('Should have thrown');
            } catch (error) {
                expect(error.message).to.include('在 Redis 中存在但未在当前进程注册');
            }
        });
    });

    describe('listSagas (Redis)', () => {
        it('应该从 Redis 列出所有 Saga', async () => {
            await orchestrator.defineSaga({
                name: 'saga1',
                steps: [{ name: 's1', execute: async () => {} }]
            });
            await orchestrator.defineSaga({
                name: 'saga2',
                steps: [{ name: 's2', execute: async () => {} }]
            });

            const sagas = await orchestrator.listSagas();
            expect(sagas).to.have.lengthOf(2);
            expect(sagas).to.include('saga1');
            expect(sagas).to.include('saga2');
        });
    });

    describe('getStats (Redis)', () => {
        it('应该返回 Redis 存储模式', () => {
            const stats = orchestrator.getStats();
            expect(stats.storageMode).to.equal('Redis');
        });

        it('应该更新 Redis 模式下的统计', async () => {
            await orchestrator.defineSaga({
                name: 'test-saga',
                steps: [
                    { name: 'step1', execute: async () => {} }
                ]
            });

            await orchestrator.execute('test-saga', {});

            const stats = orchestrator.getStats();
            expect(stats.totalExecutions).to.equal(1);
            expect(stats.successfulExecutions).to.equal(1);
        });
    });

    describe('边界情况', () => {
        it('cache 为 false 应该使用内存模式', () => {
            const memOrchestrator = new SagaOrchestrator({
                cache: false
            });

            expect(memOrchestrator.useRedis).to.be.false;
            expect(memOrchestrator.sagas).to.be.instanceOf(Map);
        });

        it('cache 没有 set 方法应该使用内存模式', () => {
            const memOrchestrator = new SagaOrchestrator({
                cache: { get: () => {} }  // 缺少 set 方法
            });

            expect(memOrchestrator.useRedis).to.be.false;
        });
    });
});

