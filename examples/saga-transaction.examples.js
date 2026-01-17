/**
 * Saga 事务集成示例
 */
const MonSQLize = require('../lib/index.js');

// 模拟外部服务
const mockServices = {
    orders: {
        create: async (data) => {
            console.log('[订单服务] 创建订单:', data);
            return { orderId: 'ORDER_' + Date.now(), ...data };
        },
        cancel: async (orderId) => {
            console.log('[订单服务] 取消订单:', orderId);
            return { orderId, cancelled: true };
        }
    },
    inventory: {
        reserve: async (items) => {
            console.log('[库存服务] 预留库存:', items);
            // 模拟库存不足
            if (items[0].quantity > 100) {
                throw new Error('库存不足');
            }
            return { reservationId: 'RSV_' + Date.now(), items };
        },
        release: async (reservationId) => {
            console.log('[库存服务] 释放库存:', reservationId);
            return { reservationId, released: true };
        }
    },
    payment: {
        charge: async (amount, source) => {
            console.log('[支付服务] 扣款:', { amount, source });
            return { chargeId: 'CHG_' + Date.now(), amount, source };
        },
        refund: async (chargeId) => {
            console.log('[支付服务] 退款:', chargeId);
            return { chargeId, refunded: true };
        }
    }
};

async function main() {
    console.log('='.repeat(60));
    console.log('Saga 分布式事务示例');
    console.log('='.repeat(60));

    // 初始化 MonSQLize（不连接数据库，仅用于 Saga）
    // 显式禁用 cache，使用内存模式
    const msq = new MonSQLize({
        type: 'mongodb',
        config: { uri: 'mongodb://localhost:27017/test' },
        cache: false,  // 禁用缓存，Saga 使用内存存储
        logger: { level: 'info' }
    });

    // 定义订单 Saga
    msq.defineSaga({
        name: 'create-order-with-payment',
        steps: [
            {
                name: 'create-order',
                execute: async (ctx) => {
                    const orderData = {
                        userId: ctx.data.userId,
                        items: ctx.data.items,
                        amount: ctx.data.amount
                    };

                    const result = await mockServices.orders.create(orderData);
                    ctx.set('orderId', result.orderId);

                    return result;
                },
                compensate: async (ctx) => {
                    const orderId = ctx.get('orderId');
                    await mockServices.orders.cancel(orderId);
                }
            },
            {
                name: 'reserve-inventory',
                execute: async (ctx) => {
                    const result = await mockServices.inventory.reserve(ctx.data.items);
                    ctx.set('reservationId', result.reservationId);

                    return result;
                },
                compensate: async (ctx) => {
                    const reservationId = ctx.get('reservationId');
                    await mockServices.inventory.release(reservationId);
                }
            },
            {
                name: 'charge-payment',
                execute: async (ctx) => {
                    const result = await mockServices.payment.charge(
                        ctx.data.amount,
                        ctx.data.paymentSource
                    );
                    ctx.set('chargeId', result.chargeId);

                    return result;
                },
                compensate: async (ctx) => {
                    const chargeId = ctx.get('chargeId');
                    await mockServices.payment.refund(chargeId);
                }
            }
        ]
    });

    // 场景1：成功执行
    console.log('\n场景1：正常订单（应该成功）');
    console.log('-'.repeat(60));
    try {
        const result = await msq.executeSaga('create-order-with-payment', {
            userId: 'user123',
            items: [{ sku: 'SKU123', quantity: 2, price: 50 }],
            amount: 100,
            paymentSource: 'card_visa'
        });

        console.log('\n✅ Saga 执行结果:');
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('❌ 错误:', error.message);
    }

    // 场景2：库存不足，触发补偿
    console.log('\n\n场景2：库存不足（应该触发补偿）');
    console.log('-'.repeat(60));
    try {
        const result = await msq.executeSaga('create-order-with-payment', {
            userId: 'user456',
            items: [{ sku: 'SKU456', quantity: 200, price: 50 }],  // 库存不足
            amount: 10000,
            paymentSource: 'card_mastercard'
        });

        console.log('\n⚠️ Saga 执行结果:');
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('❌ 错误:', error.message);
    }

    // 查看统计
    console.log('\n\n统计信息');
    console.log('-'.repeat(60));
    const stats = msq.getSagaStats();
    console.log(JSON.stringify(stats, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('示例完成');
    console.log('='.repeat(60));
}

// 运行示例
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main };

