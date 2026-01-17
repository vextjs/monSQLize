# Saga 分布式事务

> **版本**: v1.1.0 (计划中)  
> **更新日期**: 2026-01-16  
> **状态**: 📋 **设计阶段 - 代码未实现**

---

## ⚠️ 重要说明

**当前状态**：
- ✅ **需求分析完成** - 详细的需求文档和业务场景
- ✅ **API 设计完成** - 完整的接口设计和使用方式
- ✅ **文档编写完成** - 本文档包含完整的使用指南
- ✅ **示例代码完成** - 6个实用示例代码
- ❌ **代码未实现** - lib/saga/ 目录和相关代码尚未编写
- ❌ **测试未实现** - 单元测试和集成测试尚未编写

**使用限制**：
- ⚠️ 本文档仅用于 **API 设计参考** 和 **功能预览**
- ⚠️ **无法在 v1.0.8 中使用**，需等待 v1.1.0 实现
- ⚠️ 示例代码仅供参考，实际 API 可能有调整

**实施计划**：
- 📅 **v1.1.0** - 计划实现 Saga 分布式事务功能
- 📅 预计时间：2-3 周
- 📅 包含完整的代码实现、测试和文档更新

如果您需要类似功能，可以：
1. 关注 [需求方案](../plans/requirements/req-saga-transaction-v1.0.8.md) 了解设计细节
2. 等待 v1.1.0 版本发布
3. 或基于本文档自行实现 Saga 模式

---

## 📋 目录

- [简介](#简介)
- [快速开始](#快速开始)
- [核心概念](#核心概念)
- [基础用法](#基础用法)
- [高级特性](#高级特性)
- [使用场景](#使用场景)
- [最佳实践](#最佳实践)
- [错误处理](#错误处理)
- [性能优化](#性能优化)
- [故障排查](#故障排查)
- [API 参考](#api-参考)

---

## 简介

Saga 是一种用于处理分布式事务的设计模式。与传统的两阶段提交（2PC）不同，Saga 将长事务拆分为一系列本地事务，每个本地事务都有对应的补偿操作。

### 为什么需要 Saga？

在微服务架构中，传统的 ACID 事务无法跨越多个服务。Saga 模式通过以下方式解决这个问题：

**问题场景**:
```javascript
// 创建订单流程涉及多个服务
1. 扣减库存 (库存服务)
2. 创建支付 (支付服务)
3. 创建订单 (订单服务)

// 如果第3步失败，前两步已经执行，如何回滚？
```

**Saga 解决方案**:
```javascript
// 每个步骤都定义补偿操作
1. 扣减库存 → 补偿：释放库存
2. 创建支付 → 补偿：退款
3. 创建订单 → 补偿：取消订单

// 任何步骤失败，自动执行已完成步骤的补偿操作
```

### 核心特性

- ✅ **自动补偿**: 任何步骤失败，自动回滚已执行的步骤
- ✅ **状态跟踪**: 完整记录每个步骤的执行状态
- ✅ **超时处理**: 支持全局和单步超时
- ✅ **重试机制**: 支持失败重试
- ✅ **并发控制**: 防止重复执行
- ✅ **日志记录**: 完整的执行日志

---

## 快速开始

### 安装

```bash
npm install monsqlize@1.0.8
```

### 基础示例

```javascript
const { SagaOrchestrator } = require('monsqlize');

// 1. 创建 Saga 编排器
const saga = new SagaOrchestrator({
    timeout: 30000,  // 30秒超时
    logger: console
});

// 2. 定义 Saga 流程
const orderSaga = saga.define('createOrder')
    .step('reserveInventory', {
        // 正向操作
        action: async (ctx) => {
            console.log('扣减库存...');
            const result = await inventoryService.reserve(ctx.productId, ctx.quantity);
            ctx.reservationId = result.id;  // 保存到上下文
            return result;
        },
        // 补偿操作
        compensate: async (ctx) => {
            console.log('释放库存...');
            await inventoryService.release(ctx.reservationId);
        }
    })
    .step('createPayment', {
        action: async (ctx) => {
            console.log('创建支付...');
            const payment = await paymentService.charge(ctx.userId, ctx.amount);
            ctx.paymentId = payment.id;
            return payment;
        },
        compensate: async (ctx) => {
            console.log('退款...');
            await paymentService.refund(ctx.paymentId);
        }
    })
    .step('createOrder', {
        action: async (ctx) => {
            console.log('创建订单...');
            return await orderService.create({
                userId: ctx.userId,
                productId: ctx.productId,
                quantity: ctx.quantity,
                paymentId: ctx.paymentId
            });
        },
        compensate: async (ctx) => {
            console.log('取消订单...');
            await orderService.cancel(ctx.orderId);
        }
    });

// 3. 执行 Saga
try {
    const result = await orderSaga.execute({
        userId: 'user123',
        productId: 'prod456',
        quantity: 2,
        amount: 199.99
    });
    console.log('订单创建成功:', result);
} catch (error) {
    console.error('订单创建失败:', error.message);
    // 失败时，已执行的步骤会自动补偿
}
```

---

## 核心概念

### Saga 编排器 (SagaOrchestrator)

管理所有 Saga 定义和执行的中心组件。

```javascript
const saga = new SagaOrchestrator({
    timeout: 30000,        // 全局超时（毫秒）
    maxRetries: 3,         // 最大重试次数
    retryDelay: 1000,      // 重试延迟（毫秒）
    logger: console,       // 日志对象
    persistence: null      // 持久化存储（可选）
});
```

### Saga 定义 (SagaDefinition)

定义一个具体的 Saga 流程。

```javascript
const definition = saga.define('sagaName')
    .step('step1', { action, compensate })
    .step('step2', { action, compensate })
    .step('step3', { action, compensate });
```

### 步骤 (Step)

Saga 中的一个操作单元，包含正向操作和补偿操作。

```javascript
{
    name: 'stepName',           // 步骤名称
    action: async (ctx) => {},  // 正向操作
    compensate: async (ctx) => {}, // 补偿操作（可选）
    timeout: 5000,              // 单步超时（可选）
    retries: 3                  // 单步重试（可选）
}
```

### 上下文 (Context)

在步骤间共享数据的对象。

```javascript
const ctx = {
    // 初始数据
    userId: 'user123',
    amount: 100,
    
    // 步骤添加的数据
    reservationId: 'res456',  // 由 step1 添加
    paymentId: 'pay789',      // 由 step2 添加
    orderId: 'order999'       // 由 step3 添加
};
```

### 执行状态

| 状态 | 说明 |
|------|------|
| `pending` | 等待执行 |
| `running` | 正在执行 |
| `completed` | 成功完成 |
| `failed` | 执行失败 |
| `compensating` | 正在补偿 |
| `compensated` | 补偿完成 |

---

## 基础用法

### 定义 Saga

```javascript
const saga = new SagaOrchestrator();

const transferSaga = saga.define('transferMoney')
    // 步骤1：扣款
    .step('debit', {
        action: async (ctx) => {
            await accountService.debit(ctx.fromAccount, ctx.amount);
            console.log(`扣款 ${ctx.amount} 成功`);
        },
        compensate: async (ctx) => {
            await accountService.credit(ctx.fromAccount, ctx.amount);
            console.log(`补偿：返还 ${ctx.amount}`);
        }
    })
    // 步骤2：入账
    .step('credit', {
        action: async (ctx) => {
            await accountService.credit(ctx.toAccount, ctx.amount);
            console.log(`入账 ${ctx.amount} 成功`);
        },
        compensate: async (ctx) => {
            await accountService.debit(ctx.toAccount, ctx.amount);
            console.log(`补偿：扣除 ${ctx.amount}`);
        }
    });
```

### 执行 Saga

```javascript
try {
    const result = await transferSaga.execute({
        fromAccount: 'A001',
        toAccount: 'B002',
        amount: 100
    });
    console.log('转账成功');
} catch (error) {
    console.error('转账失败:', error);
}
```

### 步骤间传递数据

```javascript
saga.define('processOrder')
    .step('validateOrder', {
        action: async (ctx) => {
            const validation = await orderService.validate(ctx.orderId);
            ctx.validatedAt = new Date();  // 添加到上下文
            ctx.validationId = validation.id;
            return validation;
        }
    })
    .step('processPayment', {
        action: async (ctx) => {
            // 使用前一步添加的数据
            if (!ctx.validationId) {
                throw new Error('订单未验证');
            }
            const payment = await paymentService.process(ctx.validationId);
            ctx.paymentId = payment.id;
            return payment;
        },
        compensate: async (ctx) => {
            if (ctx.paymentId) {
                await paymentService.refund(ctx.paymentId);
            }
        }
    });
```

---

## 高级特性

### 1. 条件补偿

只在特定条件下执行补偿：

```javascript
.step('createOrder', {
    action: async (ctx) => {
        const order = await orderService.create(ctx.orderData);
        ctx.orderId = order.id;
        ctx.orderCreated = true;  // 标记已创建
        return order;
    },
    compensate: async (ctx) => {
        // 只有实际创建了订单才需要取消
        if (ctx.orderCreated && ctx.orderId) {
            await orderService.cancel(ctx.orderId);
        }
    }
})
```

### 2. 超时配置

```javascript
const saga = new SagaOrchestrator({
    timeout: 60000  // 全局60秒超时
});

saga.define('longRunning')
    .step('quickStep', {
        action: async (ctx) => { /* ... */ },
        timeout: 5000  // 单步5秒超时，覆盖全局配置
    })
    .step('slowStep', {
        action: async (ctx) => { /* ... */ },
        timeout: 30000  // 单步30秒超时
    });
```

### 3. 重试机制

```javascript
saga.define('retryExample')
    .step('unreliableOperation', {
        action: async (ctx) => {
            // 可能失败的操作
            const result = await externalService.call();
            return result;
        },
        compensate: async (ctx) => { /* ... */ },
        retries: 3,        // 失败时重试3次
        retryDelay: 2000   // 每次重试间隔2秒
    });
```

### 4. 并行步骤

```javascript
saga.define('parallelProcessing')
    .parallel([
        {
            name: 'sendEmail',
            action: async (ctx) => {
                await emailService.send(ctx.email, ctx.message);
            }
        },
        {
            name: 'sendSMS',
            action: async (ctx) => {
                await smsService.send(ctx.phone, ctx.message);
            }
        },
        {
            name: 'sendPush',
            action: async (ctx) => {
                await pushService.send(ctx.deviceId, ctx.message);
            }
        }
    ])
    .step('recordNotification', {
        action: async (ctx) => {
            // 所有并行步骤完成后执行
            await notificationService.record(ctx);
        }
    });
```

### 5. 事务日志

启用持久化事务日志：

```javascript
const saga = new SagaOrchestrator({
    persistence: {
        type: 'mongodb',
        connection: mongoClient,
        collection: 'saga_logs'
    }
});

// 每个 Saga 执行都会记录到数据库
const result = await saga.execute('orderSaga', context);

// 查询历史记录
const logs = await saga.getLogs({ sagaId: result.sagaId });
console.log(logs);
```

### 6. 状态监听

```javascript
saga.on('stepStarted', ({ sagaId, stepName, context }) => {
    console.log(`步骤开始: ${stepName}`);
});

saga.on('stepCompleted', ({ sagaId, stepName, result }) => {
    console.log(`步骤完成: ${stepName}`);
});

saga.on('stepFailed', ({ sagaId, stepName, error }) => {
    console.error(`步骤失败: ${stepName}`, error);
});

saga.on('compensationStarted', ({ sagaId, stepName }) => {
    console.log(`补偿开始: ${stepName}`);
});

saga.on('sagaCompleted', ({ sagaId, result }) => {
    console.log(`Saga 完成`);
});

saga.on('sagaFailed', ({ sagaId, error }) => {
    console.error(`Saga 失败`, error);
});
```

---

## 使用场景

### 场景1：电商订单流程

```javascript
const orderSaga = saga.define('ecommerceOrder')
    // 1. 验证库存
    .step('checkInventory', {
        action: async (ctx) => {
            const available = await inventoryService.check(ctx.productId, ctx.quantity);
            if (!available) {
                throw new Error('库存不足');
            }
            ctx.inventoryChecked = true;
        }
    })
    // 2. 锁定库存
    .step('lockInventory', {
        action: async (ctx) => {
            const lock = await inventoryService.lock(ctx.productId, ctx.quantity);
            ctx.lockId = lock.id;
        },
        compensate: async (ctx) => {
            if (ctx.lockId) {
                await inventoryService.unlock(ctx.lockId);
            }
        }
    })
    // 3. 创建支付
    .step('createPayment', {
        action: async (ctx) => {
            const payment = await paymentService.create({
                userId: ctx.userId,
                amount: ctx.amount,
                method: ctx.paymentMethod
            });
            ctx.paymentId = payment.id;
        },
        compensate: async (ctx) => {
            if (ctx.paymentId) {
                await paymentService.cancel(ctx.paymentId);
            }
        }
    })
    // 4. 执行支付
    .step('executePayment', {
        action: async (ctx) => {
            await paymentService.execute(ctx.paymentId);
            ctx.paymentExecuted = true;
        },
        compensate: async (ctx) => {
            if (ctx.paymentExecuted) {
                await paymentService.refund(ctx.paymentId);
            }
        }
    })
    // 5. 扣减库存
    .step('deductInventory', {
        action: async (ctx) => {
            await inventoryService.deduct(ctx.lockId);
        },
        compensate: async (ctx) => {
            if (ctx.lockId) {
                await inventoryService.restore(ctx.lockId);
            }
        }
    })
    // 6. 创建订单
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
            return order;
        },
        compensate: async (ctx) => {
            if (ctx.orderId) {
                await orderService.cancel(ctx.orderId);
            }
        }
    })
    // 7. 发送通知
    .step('sendNotification', {
        action: async (ctx) => {
            await notificationService.send(ctx.userId, {
                type: 'orderCreated',
                orderId: ctx.orderId
            });
        },
        // 发送通知失败不需要补偿
        compensate: null
    });

// 执行
try {
    const result = await orderSaga.execute({
        userId: 'user123',
        productId: 'prod456',
        quantity: 2,
        amount: 199.99,
        paymentMethod: 'credit_card'
    });
    console.log('订单创建成功:', result.orderId);
} catch (error) {
    console.error('订单创建失败，已回滚:', error.message);
}
```

### 场景2：用户注册流程

```javascript
const registerSaga = saga.define('userRegistration')
    // 1. 创建用户账号
    .step('createAccount', {
        action: async (ctx) => {
            const user = await userService.create({
                username: ctx.username,
                email: ctx.email,
                password: ctx.password
            });
            ctx.userId = user.id;
            return user;
        },
        compensate: async (ctx) => {
            if (ctx.userId) {
                await userService.delete(ctx.userId);
            }
        }
    })
    // 2. 创建用户配置
    .step('createProfile', {
        action: async (ctx) => {
            const profile = await profileService.create({
                userId: ctx.userId,
                displayName: ctx.displayName,
                avatar: ctx.avatar
            });
            ctx.profileId = profile.id;
        },
        compensate: async (ctx) => {
            if (ctx.profileId) {
                await profileService.delete(ctx.profileId);
            }
        }
    })
    // 3. 发送欢迎邮件
    .step('sendWelcomeEmail', {
        action: async (ctx) => {
            await emailService.send({
                to: ctx.email,
                template: 'welcome',
                data: { username: ctx.username }
            });
        },
        compensate: null  // 邮件已发送，无法补偿
    })
    // 4. 初始化钱包
    .step('initializeWallet', {
        action: async (ctx) => {
            const wallet = await walletService.create({
                userId: ctx.userId,
                balance: 0
            });
            ctx.walletId = wallet.id;
        },
        compensate: async (ctx) => {
            if (ctx.walletId) {
                await walletService.delete(ctx.walletId);
            }
        }
    });
```

### 场景3：数据同步

```javascript
const syncSaga = saga.define('dataSync')
    // 1. 从源系统读取数据
    .step('fetchData', {
        action: async (ctx) => {
            const data = await sourceSystem.fetch(ctx.query);
            ctx.data = data;
            ctx.dataCount = data.length;
        }
    })
    // 2. 转换数据格式
    .step('transformData', {
        action: async (ctx) => {
            const transformed = await transformer.transform(ctx.data);
            ctx.transformedData = transformed;
        }
    })
    // 3. 写入目标系统
    .step('writeData', {
        action: async (ctx) => {
            const result = await targetSystem.write(ctx.transformedData);
            ctx.syncId = result.id;
        },
        compensate: async (ctx) => {
            if (ctx.syncId) {
                await targetSystem.rollback(ctx.syncId);
            }
        }
    })
    // 4. 更新同步记录
    .step('updateSyncLog', {
        action: async (ctx) => {
            await syncLogService.create({
                syncId: ctx.syncId,
                recordCount: ctx.dataCount,
                status: 'completed',
                completedAt: new Date()
            });
        },
        compensate: async (ctx) => {
            if (ctx.syncId) {
                await syncLogService.markAsFailed(ctx.syncId);
            }
        }
    });
```

---

## 最佳实践

### 1. 幂等性设计

确保步骤可以安全重试：

```javascript
.step('createPayment', {
    action: async (ctx) => {
        // ✅ 使用幂等键
        const payment = await paymentService.create({
            idempotencyKey: `order-${ctx.orderId}`,
            amount: ctx.amount
        });
        ctx.paymentId = payment.id;
        return payment;
    }
})
```

### 2. 资源清理

确保资源在失败时被正确清理：

```javascript
.step('processFile', {
    action: async (ctx) => {
        const tempFile = await fileService.createTemp();
        ctx.tempFile = tempFile;
        
        try {
            // 处理文件
            const result = await fileService.process(tempFile);
            return result;
        } finally {
            // 确保临时文件被删除
            await fileService.deleteTemp(tempFile);
        }
    }
})
```

### 3. 状态检查

补偿前检查状态，避免重复补偿：

```javascript
.step('deductBalance', {
    action: async (ctx) => {
        await walletService.deduct(ctx.userId, ctx.amount);
        ctx.balanceDeducted = true;
    },
    compensate: async (ctx) => {
        // ✅ 检查状态
        if (ctx.balanceDeducted) {
            await walletService.add(ctx.userId, ctx.amount);
        }
    }
})
```

### 4. 详细日志

记录关键信息用于调试：

```javascript
.step('criticalOperation', {
    action: async (ctx) => {
        console.log('开始执行关键操作', {
            userId: ctx.userId,
            timestamp: new Date(),
            context: ctx
        });
        
        const result = await service.execute(ctx);
        
        console.log('关键操作完成', {
            result: result,
            duration: Date.now() - ctx.startTime
        });
        
        return result;
    }
})
```

### 5. 超时保护

为耗时操作设置合理的超时：

```javascript
saga.define('longProcess')
    .step('quickStep', {
        action: async (ctx) => { /* ... */ },
        timeout: 5000  // 5秒
    })
    .step('longStep', {
        action: async (ctx) => { /* ... */ },
        timeout: 60000  // 60秒
    });
```

---

## 错误处理

### 错误类型

```javascript
try {
    await saga.execute('orderSaga', context);
} catch (error) {
    if (error.type === 'StepFailedError') {
        // 某个步骤执行失败
        console.error(`步骤 ${error.stepName} 失败:`, error.message);
    } else if (error.type === 'CompensationFailedError') {
        // 补偿操作失败（严重！）
        console.error(`补偿失败:`, error.message);
        // 需要人工介入
        await alertService.send('Compensation failed!', error);
    } else if (error.type === 'TimeoutError') {
        // 超时
        console.error('Saga 超时');
    } else {
        // 其他错误
        console.error('未知错误:', error);
    }
}
```

### 补偿失败处理

补偿失败是严重问题，需要特殊处理：

```javascript
saga.on('compensationFailed', async ({ sagaId, stepName, error, context }) => {
    // 1. 记录到数据库
    await errorLogService.create({
        type: 'compensationFailed',
        sagaId: sagaId,
        stepName: stepName,
        error: error.message,
        context: context,
        timestamp: new Date()
    });
    
    // 2. 发送告警
    await alertService.send({
        priority: 'critical',
        message: `Saga ${sagaId} compensation failed at step ${stepName}`,
        details: error
    });
    
    // 3. 创建工单
    await ticketService.create({
        title: `Manual compensation required for Saga ${sagaId}`,
        description: `Step: ${stepName}\nError: ${error.message}`,
        priority: 'high'
    });
});
```

---

## 性能优化

### 1. 并行执行

对于独立的步骤，使用并行执行：

```javascript
// ❌ 串行（慢）
.step('notifyEmail', { action: async (ctx) => await emailService.send() })
.step('notifySMS', { action: async (ctx) => await smsService.send() })
.step('notifyPush', { action: async (ctx) => await pushService.send() })

// ✅ 并行（快）
.parallel([
    { name: 'email', action: async (ctx) => await emailService.send() },
    { name: 'sms', action: async (ctx) => await smsService.send() },
    { name: 'push', action: async (ctx) => await pushService.send() }
])
```

### 2. 减少网络调用

批量操作减少网络往返：

```javascript
.step('batchUpdate', {
    action: async (ctx) => {
        // ✅ 一次调用更新多条记录
        await dbService.updateMany(ctx.ids, ctx.updates);
    }
})
```

### 3. 使用缓存

缓存频繁访问的数据：

```javascript
.step('validateUser', {
    action: async (ctx) => {
        // ✅ 先检查缓存
        let user = await cache.get(`user:${ctx.userId}`);
        if (!user) {
            user = await userService.get(ctx.userId);
            await cache.set(`user:${ctx.userId}`, user, 300);
        }
        ctx.user = user;
    }
})
```

---

## 故障排查

### 问题1：Saga 一直卡住

**检查**:
- 是否有步骤没有返回结果
- 是否有死循环
- 超时时间是否设置过长

**解决**:
```javascript
// 添加调试日志
saga.on('stepStarted', ({ stepName }) => {
    console.log(`[${new Date().toISOString()}] Step started: ${stepName}`);
});

saga.on('stepCompleted', ({ stepName, duration }) => {
    console.log(`[${new Date().toISOString()}] Step completed: ${stepName}, took ${duration}ms`);
});
```

### 问题2：补偿操作没有执行

**检查**:
- 步骤是否定义了 compensate
- 补偿逻辑是否抛出异常

**解决**:
```javascript
.step('myStep', {
    action: async (ctx) => { /* ... */ },
    compensate: async (ctx) => {
        try {
            // ✅ 包裹 try-catch
            await service.rollback(ctx.id);
        } catch (error) {
            console.error('Compensation error:', error);
            throw error;  // 重新抛出，让系统记录
        }
    }
})
```

---

## API 参考

### SagaOrchestrator

```typescript
class SagaOrchestrator {
    constructor(options?: {
        timeout?: number;
        maxRetries?: number;
        retryDelay?: number;
        logger?: any;
        persistence?: object;
    });
    
    define(name: string): SagaDefinition;
    execute(name: string, context: object): Promise<any>;
    on(event: string, handler: Function): void;
    getLogs(filter: object): Promise<Array>;
}
```

### SagaDefinition

```typescript
class SagaDefinition {
    step(name: string, config: {
        action: (ctx: object) => Promise<any>;
        compensate?: (ctx: object) => Promise<void>;
        timeout?: number;
        retries?: number;
    }): SagaDefinition;
    
    parallel(steps: Array<StepConfig>): SagaDefinition;
    execute(context: object): Promise<any>;
}
```

---

## 相关文档

- [transaction.md](./transaction.md) - 本地事务
- [transaction-optimizations.md](./transaction-optimizations.md) - 事务优化
- [multi-pool.md](./multi-pool.md) - 多连接池
- [distributed-deployment.md](./distributed-deployment.md) - 分布式部署

---

_文档版本: v1.0.8_  
_最后更新: 2026-01-16_

