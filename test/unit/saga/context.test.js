/**
 * SagaContext 单元测试
 */
const { expect } = require('chai');
const SagaContext = require('../../../lib/saga/SagaContext');

describe('SagaContext', () => {
    let context;

    beforeEach(() => {
        context = new SagaContext('saga_123', { userId: 'user1' });
    });

    describe('构造函数', () => {
        it('应该正确初始化', () => {
            expect(context.sagaId).to.equal('saga_123');
            expect(context.data).to.deep.equal({ userId: 'user1' });
            expect(context.customData).to.be.instanceOf(Map);
            expect(context.completedSteps).to.be.an('array').that.is.empty;
            expect(context.stepResults).to.be.instanceOf(Map);
        });
    });

    describe('set/get', () => {
        it('应该能保存和获取字符串', () => {
            context.set('orderId', 'order123');
            expect(context.get('orderId')).to.equal('order123');
        });

        it('应该能保存和获取对象', () => {
            const orderData = {
                orderId: 'order123',
                amount: 100,
                items: ['item1', 'item2']
            };
            context.set('orderData', orderData);

            const retrieved = context.get('orderData');
            expect(retrieved).to.deep.equal(orderData);
            expect(retrieved.orderId).to.equal('order123');
            expect(retrieved.amount).to.equal(100);
            expect(retrieved.items).to.have.lengthOf(2);
        });

        it('应该能保存和获取数组', () => {
            const items = ['item1', 'item2', 'item3'];
            context.set('items', items);
            expect(context.get('items')).to.deep.equal(items);
        });

        it('应该能保存和获取数字', () => {
            context.set('amount', 9900);
            expect(context.get('amount')).to.equal(9900);
        });

        it('应该能保存和获取布尔值', () => {
            context.set('isActive', true);
            expect(context.get('isActive')).to.be.true;
        });

        it('获取不存在的键应该返回 undefined', () => {
            expect(context.get('nonexistent')).to.be.undefined;
        });
    });

    describe('markStepCompleted', () => {
        it('应该记录已完成的步骤', () => {
            context.markStepCompleted('step1', { success: true });

            expect(context.completedSteps).to.have.lengthOf(1);
            expect(context.completedSteps[0]).to.equal('step1');
            expect(context.stepResults.get('step1')).to.deep.equal({ success: true });
        });

        it('应该能记录多个步骤', () => {
            context.markStepCompleted('step1', { result: 1 });
            context.markStepCompleted('step2', { result: 2 });

            expect(context.completedSteps).to.have.lengthOf(2);
            expect(context.completedSteps).to.deep.equal(['step1', 'step2']);
        });
    });

    describe('getStepResult', () => {
        it('应该能获取步骤结果', () => {
            context.markStepCompleted('step1', { data: 'test' });

            const result = context.getStepResult('step1');
            expect(result).to.deep.equal({ data: 'test' });
        });

        it('获取不存在的步骤应该返回 undefined', () => {
            expect(context.getStepResult('nonexistent')).to.be.undefined;
        });
    });

    describe('getCompletedSteps', () => {
        it('应该返回已完成步骤的副本', () => {
            context.markStepCompleted('step1', {});
            context.markStepCompleted('step2', {});

            const steps = context.getCompletedSteps();
            expect(steps).to.deep.equal(['step1', 'step2']);

            // 验证返回的是副本
            steps.push('step3');
            expect(context.completedSteps).to.have.lengthOf(2);
        });
    });
});

