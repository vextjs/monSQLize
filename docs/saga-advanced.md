# Saga 高级特性与实现原理

> **版本**: v1.0.8+  
> **类型**: 技术原理文档  
> **分类**: 分布式事务

---

## 📑 目录

- [概述](#概述)
- [核心架构](#核心架构)
- [Saga模式原理](#saga模式原理)
- [执行流程](#执行流程)
- [补偿机制](#补偿机制)
- [上下文管理](#上下文管理)
- [分布式存储](#分布式存储)
- [错误处理](#错误处理)
- [日志与监控](#日志与监控)
- [性能优化](#性能优化)
- [高级特性](#高级特性)
- [源码剖析](#源码剖析)
- [最佳实践](#最佳实践)

---

## 概述

Saga 是由 Hector Garcia-Molina 和 Kenneth Salem 在 1987 年提出的分布式事务解决方案。monSQLize 实现了完整的 Saga 编排模式（Orchestration-based Saga），提供了企业级的分布式事务协调能力。

### 核心理念

```
传统 ACID 事务（单体应用）
├── 原子性（Atomicity）      ✅
├── 一致性（Consistency）     ✅
├── 隔离性（Isolation）       ✅
└── 持久性（Durability）      ✅

Saga 分布式事务（微服务）
├── 最终一致性（Eventual Consistency）  ✅
├── 补偿机制（Compensation）             ✅
├── 隔离性降级（Isolation Relaxation）   ⚠️
└── 幂等性要求（Idempotency）            ⭐
```

### 设计目标

- **无时间限制**：突破 MongoDB 60秒事务限制
- **跨服务协调**：协调多个服务/数据库的操作
- **自动补偿**：失败时自动逆序执行补偿
- **多进程支持**：Redis 存储实现进程间共享
- **零侵入**：业务代码与事务逻辑分离

---

## 核心架构

### 类图

```
SagaOrchestrator（协调器）
├── cache: Cache/Redis      // 分布式存储
├── sagas: Map              // Saga定义（函数引用）
├── stats: Object           // 统计信息
├── defineSaga()            // 定义Saga
├── execute()               // 执行Saga
└── listSagas()             // 列出所有Saga

SagaDefinition（定义）
├── name: string            // Saga名称
├── steps: Array<Step>      // 步骤列表
├── executor: SagaExecutor  // 执行器
└── execute()               // 执行入口

SagaExecutor（执行器）
├── definition: SagaDefinition
├── logger: Logger
├── _executeForward()       // 正向执行
├── _executeBackward()      // 反向补偿
└── _createContext()        // 创建上下文

SagaContext（上下文）
├── data: Object            // 输入数据
├── state: Map              // 步骤间共享状态
├── results: Array          // 步骤结果
├── set(key, value)         // 设置状态
└── get(key)                // 获取状态
```

### 执行流程图

```
定义阶段
   ↓
┌─────────────────┐
│  defineSaga()   │
└─────────────────┘
   ↓
┌─────────────────┐
│ SagaDefinition  │  ← 验证配置
│   + steps[]     │
└─────────────────┘
   ↓
存储定义
├── Redis模式：元数据 → Redis
└── 内存模式：定义 → Map

执行阶段
   ↓
┌─────────────────┐
│  executeSaga()  │
└─────────────────┘
   ↓
获取定义
   ↓
┌─────────────────┐
│  SagaExecutor   │
└─────────────────┘
   ↓
┌────────────────────────────┐
│  正向执行（Forward）         │
│  Step 1 → Step 2 → Step 3  │
└────────────────────────────┘
   ↓ 失败
┌────────────────────────────┐
│  反向补偿（Backward）        │
│  Comp 2 ← Comp 1 ← (当前)  │
└────────────────────────────┘
```

---

## Saga模式原理

### 传统分布式事务问题

**2PC（两阶段提交）的问题**：

```
协调者                 参与者A      参与者B
   │                     │           │
   ├── Prepare ──────────┼───────────┤
   │                     │           │
   ├──────── OK ─────────┤           │
   ├──────── OK ─────────┼───────────┤
   │                     │           │
   ├── Commit ───────────┼───────────┤
   │                   (超时)       │
   │                     ❌          ✅
   └─────── 阻塞等待 ─────┘           

❌ 问题：同步阻塞、单点故障、性能差
```

### Saga模式解决方案

**补偿模式（Compensation）**：

```
服务A                服务B              服务C
 ↓                    ↓                  ↓
执行操作1            执行操作2          执行操作3
 ✅                   ✅                 ❌ 失败
 │                    │                  │
 ↓                    ↓                  ↓
保持成功            保持成功            --
 │                    │
 ↓                    ↓
补偿1 ←──────────── 补偿2
 ✅                   ✅

✅ 优势：异步非阻塞、最终一致性、高可用
```

### Saga vs 2PC

| 特性 | 2PC | Saga |
|------|-----|------|
| 协调方式 | 同步阻塞 | 异步非阻塞 |
| 一致性 | 强一致 | 最终一致 |
| 隔离性 | 完全隔离 | 降级隔离 |
| 性能 | 低 | 高 |
| 可用性 | 低 | 高 |
| 复杂度 | 低 | 中 |
| 适用场景 | 单体应用 | 微服务 |

---

## 执行流程

### 正向执行

```javascript
async _executeForward(steps, context) {
    const results = [];
    
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        
        this.logger?.info(`[Saga] 执行步骤 ${i + 1}/${steps.length}: ${step.name}`);
        
        try {
            const startTime = Date.now();
            
            // ⭐ 执行步骤
            const result = await step.execute(context);
            
            const duration = Date.now() - startTime;
            
            // 记录结果
            results.push({
                stepName: step.name,
                success: true,
                result,
                duration
            });
            
            this.logger?.info(
                `[Saga] 步骤 ${step.name} 完成，耗时 ${duration}ms`
            );
            
        } catch (error) {
            // 步骤失败
            this.logger?.error(
                `[Saga] 步骤 ${step.name} 失败: ${error.message}`
            );
            
            results.push({
                stepName: step.name,
                success: false,
                error: error.message,
                stack: error.stack
            });
            
            // 中断执行，触发补偿
            throw error;
        }
    }
    
    return results;
}
```

### 状态转换

```
PENDING（待执行）
   ↓
RUNNING（执行中）
   ├─→ SUCCESS（全部成功）
   └─→ FAILED（某步骤失败）
         ↓
      COMPENSATING（补偿中）
         ├─→ COMPENSATED（补偿成功）
         └─→ COMPENSATION_FAILED（补偿失败）⚠️
```

---

## 补偿机制

### 补偿原理

补偿是 Saga 的核心，确保在失败时能够撤销已完成的操作：

```javascript
async _executeBackward(completedSteps, context) {
    const compensationResults = [];
    
    // ⭐ 逆序执行补偿
    for (let i = completedSteps.length - 1; i >= 0; i--) {
        const stepResult = completedSteps[i];
        const step = this.definition.steps.find(s => s.name === stepResult.stepName);
        
        // 跳过没有补偿函数的步骤
        if (!step || !step.compensate) {
            this.logger?.debug(
                `[Saga] 步骤 ${stepResult.stepName} 无补偿函数，跳过`
            );
            continue;
        }
        
        this.logger?.info(`[Saga] 补偿步骤: ${step.name}`);
        
        try {
            const startTime = Date.now();
            
            // ⭐ 执行补偿
            await step.compensate(context, stepResult.result);
            
            const duration = Date.now() - startTime;
            
            compensationResults.push({
                stepName: step.name,
                compensated: true,
                duration
            });
            
            this.logger?.info(
                `[Saga] 步骤 ${step.name} 补偿完成，耗时 ${duration}ms`
            );
            
        } catch (error) {
            // ⚠️ 补偿失败（严重错误）
            this.logger?.error(
                `[Saga] 步骤 ${step.name} 补偿失败: ${error.message}`
            );
            
            compensationResults.push({
                stepName: step.name,
                compensated: false,
                error: error.message
            });
            
            // 继续补偿其他步骤
        }
    }
    
    return compensationResults;
}
```

### 补偿设计原则

**1. 逻辑补偿 vs 物理补偿**

```javascript
// ❌ 物理补偿：删除记录
compensate: async (ctx) => {
    await db.orders.deleteOne({ orderId: ctx.get('orderId') });
}

// ✅ 逻辑补偿：标记取消
compensate: async (ctx) => {
    await db.orders.updateOne(
        { orderId: ctx.get('orderId') },
        { $set: { status: 'cancelled', cancelledAt: new Date() } }
    );
}
```

**2. 幂等性**

补偿操作必须可以重复执行：

```javascript
// ✅ 幂等补偿
compensate: async (ctx) => {
    const orderId = ctx.get('orderId');
    
    // 检查当前状态
    const order = await db.orders.findOne({ orderId });
    
    if (order.status === 'cancelled') {
        return;  // 已取消，跳过
    }
    
    // 执行取消
    await db.orders.updateOne(
        { orderId, status: { $ne: 'cancelled' } },  // 条件更新
        { $set: { status: 'cancelled' } }
    );
}
```

**3. 补偿顺序**

严格逆序执行：

```
正向执行顺序：
1. 创建订单 (orderId: 123)
2. 减库存 (productId: 456, quantity: -10)
3. 扣款 (chargeId: 789)
       ↓ 失败

补偿执行顺序：
3. 退款 (chargeId: 789)         ← 最后执行的先补偿
2. 加库存 (productId: 456, quantity: +10)
1. 取消订单 (orderId: 123)      ← 最先执行的最后补偿
```

---

## 上下文管理

### SagaContext 结构

```javascript
class SagaContext {
    constructor(data) {
        this.data = data;        // 输入数据（只读）
        this.state = new Map();  // 步骤间共享状态
        this.results = [];       // 步骤执行结果
        this.sagaId = `saga_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // 设置共享状态
    set(key, value) {
        this.state.set(key, value);
    }
    
    // 获取共享状态
    get(key) {
        return this.state.get(key);
    }
    
    // 检查状态是否存在
    has(key) {
        return this.state.has(key);
    }
    
    // 清空状态
    clear() {
        this.state.clear();
    }
}
```

### 上下文使用示例

```javascript
msq.defineSaga({
    name: 'order-flow',
    steps: [
        {
            name: 'create-order',
            execute: async (ctx) => {
                // 1. 读取输入数据
                const userId = ctx.data.userId;
                const items = ctx.data.items;
                
                // 2. 执行业务逻辑
                const order = await db.orders.insertOne({
                    userId,
                    items,
                    status: 'pending'
                });
                
                // 3. ⭐ 保存到上下文（供后续步骤使用）
                ctx.set('orderId', order.insertedId);
                ctx.set('userId', userId);
                
                return order;
            },
            compensate: async (ctx) => {
                // 4. ⭐ 从上下文获取信息
                const orderId = ctx.get('orderId');
                
                await db.orders.updateOne(
                    { _id: orderId },
                    { $set: { status: 'cancelled' } }
                );
            }
        },
        {
            name: 'charge-payment',
            execute: async (ctx) => {
                // 5. ⭐ 使用前一步骤保存的数据
                const orderId = ctx.get('orderId');
                const userId = ctx.get('userId');
                
                const charge = await stripe.charges.create({
                    amount: ctx.data.amount,
                    customer: userId,
                    metadata: { orderId }
                });
                
                ctx.set('chargeId', charge.id);
                
                return charge;
            },
            compensate: async (ctx) => {
                const chargeId = ctx.get('chargeId');
                
                await stripe.refunds.create({
                    charge: chargeId
                });
            }
        }
    ]
});
```

---

## 分布式存储

### Redis 多进程共享

```javascript
class SagaOrchestrator {
    constructor(options = {}) {
        this.cache = options.cache;
        
        // 判断存储模式
        if (this.cache && typeof this.cache.set === 'function') {
            // ✅ Redis 模式
            this.useRedis = true;
            this.sagaKeyPrefix = 'monsqlize:saga:def:';
        } else {
            // ✅ 内存模式
            this.sagas = new Map();
            this.useRedis = false;
        }
    }
    
    async defineSaga(config) {
        const saga = new SagaDefinition(config, this);
        
        if (this.useRedis) {
            // 元数据存入 Redis
            await this.cache.set(
                this.sagaKeyPrefix + config.name,
                {
                    name: config.name,
                    steps: config.steps.map(s => ({
                        name: s.name,
                        hasCompensate: !!s.compensate
                    }))
                },
                0  // 永久存储
            );
            
            // ⭐ 函数引用保存在内存（无法序列化）
            if (!this.sagas) this.sagas = new Map();
            this.sagas.set(config.name, saga);
        } else {
            this.sagas.set(config.name, saga);
        }
        
        return saga;
    }
}
```

### 多进程架构

```
进程1（Web服务器）
├── defineSaga('order-flow') ──┐
├── executeSaga()              │
└── SagaDefinition（内存）      │
                               │
                               ↓
                         ┌────────────┐
                         │   Redis    │  ← 元数据
                         └────────────┘
                               ↑
进程2（Worker）                │
├── defineSaga('order-flow') ──┘
├── executeSaga()
└── SagaDefinition（内存）

⭐ 每个进程启动时都需要调用 defineSaga() 注册函数
```

---

## 错误处理

### 错误类型

1. **步骤执行失败** → 触发补偿
2. **补偿失败** → 记录日志，继续补偿其他步骤
3. **致命错误** → 中止 Saga

### 错误处理流程

```javascript
try {
    // 正向执行
    const results = await this._executeForward(steps, context);
    
    return {
        success: true,
        sagaId: context.sagaId,
        completedSteps: results.length,
        results
    };
    
} catch (error) {
    this.logger?.error(`[Saga] 执行失败: ${error.message}`);
    
    // ⭐ 触发补偿
    const compensationResults = await this._executeBackward(
        context.results.filter(r => r.success),  // 只补偿成功的步骤
        context
    );
    
    return {
        success: false,
        sagaId: context.sagaId,
        failedStep: context.results[context.results.length - 1]?.stepName,
        error: error.message,
        compensationResults
    };
}
```

### 补偿失败处理

```javascript
// 补偿失败不中断其他补偿
try {
    await step.compensate(context, stepResult.result);
    
} catch (error) {
    // ⚠️ 记录补偿失败
    this.logger?.error(
        `[Saga] 补偿失败: ${step.name}, 错误: ${error.message}`
    );
    
    compensationResults.push({
        stepName: step.name,
        compensated: false,
        error: error.message
    });
    
    // ⭐ 继续补偿其他步骤
}
```

---

## 日志与监控

### 日志级别

```javascript
// INFO：正常流程
logger.info('[Saga] 开始执行 Saga: order-flow');
logger.info('[Saga] 执行步骤 1/3: create-order');
logger.info('[Saga] 步骤 create-order 完成，耗时 123ms');

// ERROR：异常情况
logger.error('[Saga] 步骤 charge-payment 失败: Insufficient funds');
logger.error('[Saga] 补偿失败: refund-payment');

// DEBUG：调试信息
logger.debug('[Saga] 步骤 create-order 无补偿函数，跳过');
```

### 统计信息

```javascript
getStats() {
    return {
        totalExecutions: 1000,
        successfulExecutions: 950,
        failedExecutions: 50,
        compensatedExecutions: 50,
        successRate: '95.00%',
        storageMode: 'Redis'
    };
}
```

### 监控指标

1. **执行时间** - 每个步骤的耗时
2. **成功率** - 成功/失败比例
3. **补偿率** - 触发补偿的频率
4. **补偿失败率** - 补偿失败的步骤

---

## 性能优化

### 1. 并行执行（未来特性）

当前版本是串行执行，未来可支持并行：

```javascript
// 当前：串行
steps: [
    { name: 'step1', execute: async () => {} },  // 等待
    { name: 'step2', execute: async () => {} },  // 等待
    { name: 'step3', execute: async () => {} }
]

// 未来：并行
steps: [
    {
        parallel: [
            { name: 'step1', execute: async () => {} },  // 并行
            { name: 'step2', execute: async () => {} }   // 并行
        ]
    },
    { name: 'step3', execute: async () => {} }  // 等待前面两个完成
]
```

### 2. 超时控制

```javascript
{
    name: 'slow-step',
    timeout: 30000,  // 30秒超时
    execute: async (ctx) => {
        // 耗时操作
    }
}
```

### 3. 重试机制

```javascript
{
    name: 'unstable-api',
    retry: {
        maxAttempts: 3,
        backoff: 1000  // 1秒指数退避
    },
    execute: async (ctx) => {
        // 不稳定的外部API
    }
}
```

---

## 高级特性

### 1. 条件步骤

```javascript
{
    name: 'send-email',
    condition: (ctx) => ctx.get('notifyUser') === true,  // 条件执行
    execute: async (ctx) => {
        await sendEmail(ctx.get('userEmail'));
    }
}
```

### 2. 动态步骤

```javascript
{
    name: 'process-items',
    execute: async (ctx) => {
        const items = ctx.data.items;
        
        for (const item of items) {
            await processItem(item);
        }
    },
    compensate: async (ctx) => {
        const items = ctx.data.items;
        
        for (const item of items.reverse()) {
            await revertItem(item);
        }
    }
}
```

### 3. 嵌套 Saga

```javascript
msq.defineSaga({
    name: 'parent-saga',
    steps: [
        {
            name: 'child-saga',
            execute: async (ctx) => {
                // 执行子Saga
                return await msq.executeSaga('child-saga', ctx.data);
            }
        }
    ]
});
```

---

## 源码剖析

### lib/saga/SagaOrchestrator.js

```javascript
class SagaOrchestrator {
    async defineSaga(config) {
        this._validateConfig(config);  // 配置验证
        
        const saga = new SagaDefinition(config, this);
        
        if (this.useRedis) {
            // Redis存储元数据
            await this.cache.set(
                this.sagaKeyPrefix + config.name,
                { name: config.name, steps: [...] },
                0
            );
            
            // 内存保存函数引用
            this.sagas.set(config.name, saga);
        } else {
            this.sagas.set(config.name, saga);
        }
        
        return saga;
    }
    
    async execute(sagaName, data) {
        const saga = this.sagas?.get(sagaName);
        
        if (!saga) {
            throw new Error(`Saga '${sagaName}' 未定义`);
        }
        
        this.stats.totalExecutions++;
        
        const result = await saga.execute(data);
        
        if (result.success) {
            this.stats.successfulExecutions++;
        } else {
            this.stats.failedExecutions++;
            this.stats.compensatedExecutions++;
        }
        
        return result;
    }
}
```

### lib/saga/SagaExecutor.js

```javascript
class SagaExecutor {
    async execute(data) {
        const context = this._createContext(data);
        
        try {
            // 正向执行
            const results = await this._executeForward(
                this.definition.steps,
                context
            );
            
            return {
                success: true,
                sagaId: context.sagaId,
                results
            };
            
        } catch (error) {
            // 反向补偿
            const compensationResults = await this._executeBackward(
                context.results.filter(r => r.success),
                context
            );
            
            return {
                success: false,
                sagaId: context.sagaId,
                error: error.message,
                compensationResults
            };
        }
    }
}
```

---

## 最佳实践

### 1. 补偿设计

```javascript
// ✅ 好：逻辑补偿 + 幂等
compensate: async (ctx) => {
    const orderId = ctx.get('orderId');
    
    await db.orders.updateOne(
        { _id: orderId, status: { $ne: 'cancelled' } },
        { $set: { status: 'cancelled', cancelledAt: new Date() } }
    );
}

// ❌ 坏：物理删除 + 非幂等
compensate: async (ctx) => {
    const orderId = ctx.get('orderId');
    await db.orders.deleteOne({ _id: orderId });
}
```

### 2. 状态管理

```javascript
// ✅ 好：清晰的状态传递
execute: async (ctx) => {
    const result = await doSomething();
    ctx.set('resultId', result.id);  // 保存ID而不是整个对象
    return result;
}

// ❌ 坏：过度使用上下文
execute: async (ctx) => {
    ctx.set('allData', hugeObject);  // 避免大对象
}
```

### 3. 错误处理

```javascript
// ✅ 好：详细的错误信息
execute: async (ctx) => {
    try {
        await externalAPI.call();
    } catch (error) {
        throw new Error(
            `External API failed: ${error.message}, orderId: ${ctx.get('orderId')}`
        );
    }
}
```

---

## 相关文档

- [Saga 分布式事务](./saga-transaction.md) - 用户使用指南
- [事务文档](./transaction.md) - 本地事务
- [分布式部署](./distributed-deployment.md) - 多进程部署

---

**最后更新**: 2026-01-20  
**版本**: v1.0.8
