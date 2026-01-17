/**
 * Saga 分布式事务示例
 *
 * 演示如何使用 Saga 模式处理跨服务的分布式事务
 *
 * @since v1.0.8
 */

const { SagaOrchestrator } = require('../lib/saga');

// ============================================
// 示例1：基础用法 - 简单的转账场景
// ============================================

console.log('\n========== 示例1：基础用法 - 转账场景 ==========\n');

async function example1() {
    // 模拟账户服务
    const accounts = {
        'A001': { balance: 1000 },
        'B002': { balance: 500 }
    };

    const accountService = {
        debit: async (accountId, amount) => {
            console.log(`  扣款: 账号 ${accountId} 扣除 ${amount} 元`);
            if (accounts[accountId].balance < amount) {
                throw new Error('余额不足');
            }
            accounts[accountId].balance -= amount;
        },
        credit: async (accountId, amount) => {
            console.log(`  入账: 账号 ${accountId} 增加 ${amount} 元`);
            accounts[accountId].balance += amount;
        }
    };

    // 创建 Saga 编排器
    const saga = new SagaOrchestrator({
        timeout: 30000,
        logger: console
    });

    // 定义转账 Saga
    const transferSaga = saga.define('transferMoney')
        // 步骤1：扣款
        .step('debit', {
            action: async (ctx) => {
                await accountService.debit(ctx.fromAccount, ctx.amount);
                console.log(`  ✅ 步骤1完成: 扣款成功`);
            },
            compensate: async (ctx) => {
                await accountService.credit(ctx.fromAccount, ctx.amount);
                console.log(`  🔄 补偿步骤1: 返还 ${ctx.amount} 元`);
            }
        })
        // 步骤2：入账
        .step('credit', {
            action: async (ctx) => {
                await accountService.credit(ctx.toAccount, ctx.amount);
                console.log(`  ✅ 步骤2完成: 入账成功`);
            },
            compensate: async (ctx) => {
                await accountService.debit(ctx.toAccount, ctx.amount);
                console.log(`  🔄 补偿步骤2: 扣除 ${ctx.amount} 元`);
            }
        });

    try {
        console.log('开始执行转账...');
        console.log(`初始状态: A001=${accounts['A001'].balance}, B002=${accounts['B002'].balance}`);

        await transferSaga.execute({
            fromAccount: 'A001',
            toAccount: 'B002',
            amount: 100
        });

        console.log('✅ 转账成功!');
        console.log(`最终状态: A001=${accounts['A001'].balance}, B002=${accounts['B002'].balance}`);
    } catch (error) {
        console.error('❌ 转账失败:', error.message);
    }
}

// ============================================
// 示例2：电商订单流程
// ============================================

console.log('\n========== 示例2：电商订单流程 ==========\n');

async function example2() {
    // 模拟服务
    const inventoryService = {
        reserve: async (productId, quantity) => {
            console.log(`  库存服务: 锁定库存 ${productId} x${quantity}`);
            return { id: `res-${Date.now()}`, productId, quantity };
        },
        release: async (reservationId) => {
            console.log(`  库存服务: 释放库存 ${reservationId}`);
        }
    };

    const paymentService = {
        charge: async (userId, amount) => {
            console.log(`  支付服务: 创建支付 用户${userId} 金额${amount}`);
            return { id: `pay-${Date.now()}`, userId, amount };
        },
        refund: async (paymentId) => {
            console.log(`  支付服务: 退款 ${paymentId}`);
        }
    };

    const orderService = {
        create: async (orderData) => {
            console.log(`  订单服务: 创建订单`, orderData);
            return { id: `order-${Date.now()}`, ...orderData };
        },
        cancel: async (orderId) => {
            console.log(`  订单服务: 取消订单 ${orderId}`);
        }
    };

    // 创建 Saga
    const saga = new SagaOrchestrator({
        timeout: 60000,
        logger: console
    });

    // 定义订单创建 Saga
    const orderSaga = saga.define('createOrder')
        .step('reserveInventory', {
            action: async (ctx) => {
                const result = await inventoryService.reserve(ctx.productId, ctx.quantity);
                ctx.reservationId = result.id;
                console.log(`  ✅ 步骤1完成: 库存已锁定`);
                return result;
            },
            compensate: async (ctx) => {
                await inventoryService.release(ctx.reservationId);
                console.log(`  🔄 补偿步骤1: 库存已释放`);
            }
        })
        .step('createPayment', {
            action: async (ctx) => {
                const payment = await paymentService.charge(ctx.userId, ctx.amount);
                ctx.paymentId = payment.id;
                console.log(`  ✅ 步骤2完成: 支付已创建`);
                return payment;
            },
            compensate: async (ctx) => {
                await paymentService.refund(ctx.paymentId);
                console.log(`  🔄 补偿步骤2: 已退款`);
            }
        })
        .step('createOrder', {
            action: async (ctx) => {
                const order = await orderService.create({
                    userId: ctx.userId,
                    productId: ctx.productId,
                    quantity: ctx.quantity,
                    paymentId: ctx.paymentId,
                    amount: ctx.amount
                });
                ctx.orderId = order.id;
                console.log(`  ✅ 步骤3完成: 订单已创建`);
                return order;
            },
            compensate: async (ctx) => {
                await orderService.cancel(ctx.orderId);
                console.log(`  🔄 补偿步骤3: 订单已取消`);
            }
        });

    try {
        console.log('开始创建订单...');

        const result = await orderSaga.execute({
            userId: 'user123',
            productId: 'prod456',
            quantity: 2,
            amount: 199.99
        });

        console.log('✅ 订单创建成功!');
        console.log('订单ID:', result.orderId);
    } catch (error) {
        console.error('❌ 订单创建失败:', error.message);
        console.log('已自动回滚所有操作');
    }
}

// ============================================
// 示例3：失败场景 - 自动补偿
// ============================================

console.log('\n========== 示例3：失败场景 - 自动补偿 ==========\n');

async function example3() {
    const operations = [];

    const saga = new SagaOrchestrator();

    const failingSaga = saga.define('failingProcess')
        .step('step1', {
            action: async (ctx) => {
                operations.push('执行步骤1');
                console.log('  ✅ 步骤1: 成功');
                ctx.step1Data = 'data1';
            },
            compensate: async (ctx) => {
                operations.push('补偿步骤1');
                console.log('  🔄 补偿步骤1');
            }
        })
        .step('step2', {
            action: async (ctx) => {
                operations.push('执行步骤2');
                console.log('  ✅ 步骤2: 成功');
                ctx.step2Data = 'data2';
            },
            compensate: async (ctx) => {
                operations.push('补偿步骤2');
                console.log('  🔄 补偿步骤2');
            }
        })
        .step('step3', {
            action: async (ctx) => {
                operations.push('执行步骤3');
                console.log('  ❌ 步骤3: 失败!');
                throw new Error('步骤3执行失败');
            },
            compensate: async (ctx) => {
                operations.push('补偿步骤3');
                console.log('  🔄 补偿步骤3');
            }
        });

    try {
        console.log('开始执行 Saga...');
        await failingSaga.execute({});
    } catch (error) {
        console.error('\n❌ Saga 失败:', error.message);
        console.log('\n执行顺序:');
        operations.forEach((op, i) => {
            console.log(`  ${i + 1}. ${op}`);
        });
        console.log('\n✅ 已自动补偿步骤2和步骤1（逆序）');
    }
}

// ============================================
// 示例4：事件监听
// ============================================

console.log('\n========== 示例4：事件监听 ==========\n');

async function example4() {
    const saga = new SagaOrchestrator();

    // 监听各种事件
    saga.on('stepStarted', ({ stepName }) => {
        console.log(`  📍 事件: 步骤开始 - ${stepName}`);
    });

    saga.on('stepCompleted', ({ stepName }) => {
        console.log(`  ✅ 事件: 步骤完成 - ${stepName}`);
    });

    saga.on('stepFailed', ({ stepName, error }) => {
        console.log(`  ❌ 事件: 步骤失败 - ${stepName}: ${error.message}`);
    });

    saga.on('compensationStarted', ({ stepName }) => {
        console.log(`  🔄 事件: 补偿开始 - ${stepName}`);
    });

    saga.on('sagaCompleted', ({ sagaId }) => {
        console.log(`  🎉 事件: Saga 完成 - ${sagaId}`);
    });

    saga.on('sagaFailed', ({ sagaId, error }) => {
        console.log(`  💥 事件: Saga 失败 - ${sagaId}: ${error.message}`);
    });

    const testSaga = saga.define('eventTest')
        .step('step1', {
            action: async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        })
        .step('step2', {
            action: async () => {
                throw new Error('测试失败');
            },
            compensate: async () => {}
        });

    try {
        console.log('开始执行 Saga（带事件监听）...\n');
        await testSaga.execute({});
    } catch (error) {
        console.log('\n事件监听演示完成');
    }
}

// ============================================
// 示例5：超时和重试
// ============================================

console.log('\n========== 示例5：超时和重试 ==========\n');

async function example5() {
    const saga = new SagaOrchestrator({
        timeout: 10000,
        maxRetries: 3,
        retryDelay: 1000
    });

    let attemptCount = 0;

    const retrySaga = saga.define('retryTest')
        .step('unreliableOperation', {
            action: async (ctx) => {
                attemptCount++;
                console.log(`  尝试 ${attemptCount}: 执行不稳定操作...`);

                // 前2次失败，第3次成功
                if (attemptCount < 3) {
                    throw new Error('临时故障');
                }

                console.log(`  ✅ 第${attemptCount}次尝试成功!`);
                return 'success';
            },
            retries: 3,
            retryDelay: 500
        });

    try {
        console.log('开始执行（会自动重试）...\n');
        await retrySaga.execute({});
        console.log('\n✅ Saga 成功完成（经过3次尝试）');
    } catch (error) {
        console.error('❌ 所有重试都失败了:', error.message);
    }
}

// ============================================
// 示例6：并行步骤
// ============================================

console.log('\n========== 示例6：并行步骤 ==========\n');

async function example6() {
    const saga = new SagaOrchestrator();

    const notificationService = {
        sendEmail: async (email, message) => {
            await new Promise(resolve => setTimeout(resolve, 100));
            console.log(`  📧 邮件已发送: ${email}`);
        },
        sendSMS: async (phone, message) => {
            await new Promise(resolve => setTimeout(resolve, 150));
            console.log(`  📱 短信已发送: ${phone}`);
        },
        sendPush: async (deviceId, message) => {
            await new Promise(resolve => setTimeout(resolve, 80));
            console.log(`  📲 推送已发送: ${deviceId}`);
        }
    };

    const notificationSaga = saga.define('sendNotifications')
        .parallel([
            {
                name: 'sendEmail',
                action: async (ctx) => {
                    await notificationService.sendEmail(ctx.email, ctx.message);
                }
            },
            {
                name: 'sendSMS',
                action: async (ctx) => {
                    await notificationService.sendSMS(ctx.phone, ctx.message);
                }
            },
            {
                name: 'sendPush',
                action: async (ctx) => {
                    await notificationService.sendPush(ctx.deviceId, ctx.message);
                }
            }
        ])
        .step('recordNotification', {
            action: async (ctx) => {
                console.log('  ✅ 所有通知已发送，记录到数据库');
            }
        });

    try {
        console.log('开始发送通知（并行）...\n');
        const start = Date.now();

        await notificationSaga.execute({
            email: 'user@example.com',
            phone: '13800138000',
            deviceId: 'device123',
            message: '您的订单已发货'
        });

        const duration = Date.now() - start;
        console.log(`\n✅ 完成! 总耗时: ${duration}ms（并行执行）`);
    } catch (error) {
        console.error('❌ 通知发送失败:', error.message);
    }
}

// ============================================
// 运行所有示例
// ============================================

async function runAllExamples() {
    try {
        await example1();
        await example2();
        await example3();
        await example4();
        await example5();
        await example6();

        console.log('\n========================================');
        console.log('✅ 所有示例执行完成!');
        console.log('========================================\n');

    } catch (error) {
        console.error('示例执行失败:', error);
        process.exit(1);
    }
}

// 如果直接运行此文件
if (require.main === module) {
    runAllExamples()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = {
    example1,
    example2,
    example3,
    example4,
    example5,
    example6
};

