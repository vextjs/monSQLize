/**
 * SagaOrchestrator 单元测试
 */
const { expect } = require('chai');
const SagaOrchestrator = require('../../../lib/saga/SagaOrchestrator');

describe('SagaOrchestrator', () => {
    describe('内存模式', () => {
        let orchestrator;

        beforeEach(() => {
            orchestrator = new SagaOrchestrator();
        });

        it('应该初始化为内存模式', () => {
            expect(orchestrator.useRedis).to.be.false;
            expect(orchestrator.sagas).to.be.instanceOf(Map);
        });

        describe('defineSaga', () => {
            it('应该能定义 Saga', async () => {
                const saga = await orchestrator.defineSaga({
                    name: 'test-saga',
                    steps: [
                        { name: 'step1', execute: async () => {} }
                    ]
                });

                expect(saga).to.exist;
                expect(saga.name).to.equal('test-saga');
            });

            it('缺少 name 应该抛出错误', async () => {
                try {
                    await orchestrator.defineSaga({
                        steps: []
                    });
                    throw new Error('Should have thrown');
                } catch (error) {
                    expect(error.message).to.include('Saga name is required');
                }
            });

            it('steps 为空应该抛出错误', async () => {
                try {
                    await orchestrator.defineSaga({
                        name: 'test',
                        steps: []
                    });
                    throw new Error('Should have thrown');
                } catch (error) {
                    expect(error.message).to.include('non-empty array');
                }
            });

            it('步骤缺少 execute 应该抛出错误', async () => {
                try {
                    await orchestrator.defineSaga({
                        name: 'test',
                        steps: [{ name: 'step1' }]
                    });
                    throw new Error('Should have thrown');
                } catch (error) {
                    expect(error.message).to.include('execute function');
                }
            });
        });

        describe('execute', () => {
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

            it('应该能执行 Saga', async () => {
                const result = await orchestrator.execute('test-saga', { input: 'data' });

                expect(result.success).to.be.true;
                expect(result.sagaName).to.equal('test-saga');
                expect(result.completedSteps).to.equal(1);
            });

            it('执行不存在的 Saga 应该抛出错误', async () => {
                try {
                    await orchestrator.execute('nonexistent', {});
                    throw new Error('Should have thrown');
                } catch (error) {
                    expect(error.message).to.include('未定义');
                }
            });

            it('应该更新统计信息', async () => {
                await orchestrator.execute('test-saga', {});

                const stats = orchestrator.getStats();
                expect(stats.totalExecutions).to.equal(1);
                expect(stats.successfulExecutions).to.equal(1);
                expect(stats.storageMode).to.equal('内存');
            });
        });

        describe('listSagas', () => {
            it('应该列出所有 Saga', async () => {
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

        describe('getStats', () => {
            it('应该返回初始统计', () => {
                const stats = orchestrator.getStats();

                expect(stats.totalExecutions).to.equal(0);
                expect(stats.successfulExecutions).to.equal(0);
                expect(stats.failedExecutions).to.equal(0);
                expect(stats.successRate).to.equal('0%');
                expect(stats.storageMode).to.equal('内存');
            });
        });
    });
});

