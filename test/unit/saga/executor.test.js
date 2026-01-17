/**
 * SagaExecutor 单元测试
 */
const { expect } = require('chai');
const SagaOrchestrator = require('../../../lib/saga/SagaOrchestrator');

describe('SagaExecutor', () => {
    let orchestrator;

    beforeEach(() => {
        orchestrator = new SagaOrchestrator();
    });

    describe('成功执行', () => {
        it('应该按顺序执行所有步骤', async () => {
            const executionOrder = [];

            await orchestrator.defineSaga({
                name: 'order-saga',
                steps: [
                    {
                        name: 'step1',
                        execute: async (ctx) => {
                            executionOrder.push('step1');
                            ctx.set('step1Result', 'done');
                            return { step: 1 };
                        }
                    },
                    {
                        name: 'step2',
                        execute: async (ctx) => {
                            executionOrder.push('step2');
                            expect(ctx.get('step1Result')).to.equal('done');
                            return { step: 2 };
                        }
                    },
                    {
                        name: 'step3',
                        execute: async (ctx) => {
                            executionOrder.push('step3');
                            return { step: 3 };
                        }
                    }
                ]
            });

            const result = await orchestrator.execute('order-saga', {});

            expect(result.success).to.be.true;
            expect(result.completedSteps).to.equal(3);
            expect(executionOrder).to.deep.equal(['step1', 'step2', 'step3']);
        });

        it('应该在上下文中传递数据', async () => {
            await orchestrator.defineSaga({
                name: 'data-saga',
                steps: [
                    {
                        name: 'set-data',
                        execute: async (ctx) => {
                            ctx.set('orderId', 'ORDER123');
                            ctx.set('amount', 100);
                            return { set: true };
                        }
                    },
                    {
                        name: 'use-data',
                        execute: async (ctx) => {
                            const orderId = ctx.get('orderId');
                            const amount = ctx.get('amount');

                            expect(orderId).to.equal('ORDER123');
                            expect(amount).to.equal(100);

                            return { orderId, amount };
                        }
                    }
                ]
            });

            const result = await orchestrator.execute('data-saga', {});
            expect(result.success).to.be.true;
        });
    });

    describe('失败和补偿', () => {
        it('步骤失败应该触发补偿', async () => {
            const compensationOrder = [];

            await orchestrator.defineSaga({
                name: 'fail-saga',
                steps: [
                    {
                        name: 'step1',
                        execute: async () => {
                            return { result: 'step1 done' };
                        },
                        compensate: async () => {
                            compensationOrder.push('compensate-step1');
                        }
                    },
                    {
                        name: 'step2',
                        execute: async () => {
                            return { result: 'step2 done' };
                        },
                        compensate: async () => {
                            compensationOrder.push('compensate-step2');
                        }
                    },
                    {
                        name: 'step3',
                        execute: async () => {
                            throw new Error('Step3 failed');
                        },
                        compensate: async () => {
                            compensationOrder.push('compensate-step3');
                        }
                    }
                ]
            });

            const result = await orchestrator.execute('fail-saga', {});

            expect(result.success).to.be.false;
            expect(result.error).to.include('Step3 failed');
            expect(result.completedSteps).to.equal(2);
            expect(result.compensation.success).to.be.true;

            // 验证补偿逆序执行
            expect(compensationOrder).to.deep.equal([
                'compensate-step2',
                'compensate-step1'
            ]);
        });

        it('没有补偿函数的步骤应该跳过', async () => {
            await orchestrator.defineSaga({
                name: 'no-compensate-saga',
                steps: [
                    {
                        name: 'step1',
                        execute: async () => {
                            return { result: 'step1' };
                        }
                        // 没有 compensate
                    },
                    {
                        name: 'step2',
                        execute: async () => {
                            throw new Error('Failed');
                        }
                    }
                ]
            });

            const result = await orchestrator.execute('no-compensate-saga', {});

            expect(result.success).to.be.false;
            expect(result.compensation.success).to.be.true;
            expect(result.compensation.results[0].reason).to.equal('no-compensate-defined');
        });

        it('补偿失败应该记录错误', async () => {
            await orchestrator.defineSaga({
                name: 'compensate-fail-saga',
                steps: [
                    {
                        name: 'step1',
                        execute: async () => {
                            return { result: 'step1' };
                        },
                        compensate: async () => {
                            throw new Error('Compensate failed');
                        }
                    },
                    {
                        name: 'step2',
                        execute: async () => {
                            throw new Error('Step2 failed');
                        }
                    }
                ]
            });

            const result = await orchestrator.execute('compensate-fail-saga', {});

            expect(result.success).to.be.false;
            expect(result.compensation.success).to.be.false;
            expect(result.compensation.results[0].error).to.include('Compensate failed');
        });

        it('应该使用补偿函数接收到的结果', async () => {
            let receivedResult = null;

            await orchestrator.defineSaga({
                name: 'compensate-with-result-saga',
                steps: [
                    {
                        name: 'step1',
                        execute: async () => {
                            return { orderId: 'ORDER123', amount: 100 };
                        },
                        compensate: async (ctx, result) => {
                            receivedResult = result;
                        }
                    },
                    {
                        name: 'step2',
                        execute: async () => {
                            throw new Error('Failed');
                        }
                    }
                ]
            });

            await orchestrator.execute('compensate-with-result-saga', {});

            expect(receivedResult).to.deep.equal({ orderId: 'ORDER123', amount: 100 });
        });
    });

    describe('返回值', () => {
        it('成功执行应该返回正确的结果', async () => {
            await orchestrator.defineSaga({
                name: 'success-saga',
                steps: [
                    { name: 'step1', execute: async () => {} }
                ]
            });

            const result = await orchestrator.execute('success-saga', {});

            expect(result).to.have.property('success', true);
            expect(result).to.have.property('sagaId');
            expect(result).to.have.property('sagaName', 'success-saga');
            expect(result).to.have.property('completedSteps', 1);
            expect(result).to.have.property('duration');
        });

        it('失败执行应该返回错误信息', async () => {
            await orchestrator.defineSaga({
                name: 'fail-saga',
                steps: [
                    {
                        name: 'step1',
                        execute: async () => {
                            throw new Error('Test error');
                        }
                    }
                ]
            });

            const result = await orchestrator.execute('fail-saga', {});

            expect(result).to.have.property('success', false);
            expect(result).to.have.property('error', 'Test error');
            expect(result).to.have.property('compensation');
        });
    });
});

