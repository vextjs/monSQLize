# Saga advanced features and implementation principles

> **Deprecated compatibility page**: monSQLize keeps Saga APIs for existing callers, but Saga orchestration is no longer a recommended monSQLize capability. Prefer application/framework-level workflow orchestration, such as the VextJS runtime layer, for new business flows.

## Overview

Saga is a distributed transaction solution proposed by Hector Garcia-Molina and Kenneth Salem in 1987. monSQLize keeps a legacy in-process Saga orchestration API for existing callers. Treat it as a compatibility helper, not a crash-recoverable enterprise Saga coordinator.


## Core Concept

```text
Traditional ACID transactions (monolithic application)
├── Atomicity ✅
├── Consistency ✅
├── Isolation ✅
└── Durability ✅

Saga distributed transactions (microservices)
├── Eventual Consistency ✅
├── Compensation ✅
├── Isolation Relaxation ⚠️
└── Idempotency requirement (Idempotency) ⭐
```


## Legacy design scope

- **No MongoDB transaction time limit**: Steps run outside a single MongoDB transaction.
- **Step orchestration compatibility**: Existing code can coordinate multiple local operations through the legacy API.
- **Automatic compensation attempt**: Completed steps are compensated in reverse order when a later step fails.
- **Definition metadata sharing**: Redis storage can share Saga definition metadata across processes.
- **Application-owned durability**: Execution-state persistence, recovery, and reconciliation belong in the application/framework layer.

> **Durability boundary**: Redis mode currently persists Saga definition metadata only, such as the Saga name and step metadata. Execution state remains process-local: completed steps, step results, compensation progress, and the in-flight context are not written to Redis. If a process exits between steps, monSQLize cannot automatically resume that Saga execution. Payment, order, or fulfillment flows should use an external durable journal/outbox, idempotency keys, and reconciliation if crash recovery is required.

---

## Core architecture


## Class diagram

```text
SagaOrchestrator (Coordinator)
├── cache: Cache/Redis      //Distributed storage
├── sagas: Map              //Saga definition (function reference)
├── stats: Object           //Statistics
├── defineSaga()            //Define Saga
├── execute()               //Execute Saga
└── listSagas()             //List all sagas

SagaDefinition
├── name: string            //Saga name
├── steps: Array<Step>      //List of steps
├── executor: SagaExecutor  //actuator
└── execute()               //Execution entry

SagaExecutor (executor)
├── definition: SagaDefinition
├── logger: Logger
├── _executeForward()       //Forward execution
├── _executeBackward()      //reverse compensation
└── _createContext()        //Create context

SagaContext(context)
├── data: Object            //Enter data
├── state: Map              //Sharing state between steps
├── results: Array          //step result
├── set(key, value)         //Set status
└── get(key)                //Get status
```


## Execution flow chart

```text
definition phase
   ↓
┌─────────────────┐
│  defineSaga()   │
└─────────────────┘
   ↓
┌─────────────────┐
│ SagaDefinition │ ← Verify configuration
│   + steps[]     │
└─────────────────┘
   ↓
storage definition
├── Redis mode: definition metadata → Redis
└── Memory Mode: Definition → Map

Execution phase
   ↓
┌─────────────────┐
│  executeSaga()  │
└─────────────────┘
   ↓
get definition
   ↓
┌─────────────────┐
│  SagaExecutor   │
└─────────────────┘
   ↓
┌────────────────────────────┐
│ Forward execution (Forward) │
│  Step 1 → Step 2 → Step 3  │
└────────────────────────────┘
↓ failed
┌────────────────────────────┐
│ Reverse compensation (Backward) │
│ Comp 2 ← Comp 1 ← (current) │
└────────────────────────────┘
```

---

## Saga mode principle


## Traditional distributed transaction issues

**Questions with 2PC (two-phase submission)**:

```text
Coordinator Participant A Participant B
   │                     │           │
   ├── Prepare ──────────┼───────────┤
   │                     │           │
   ├──────── OK ─────────┤           │
   ├──────── OK ─────────┼───────────┤
   │                     │           │
   ├── Commit ───────────┼───────────┤
│ (timeout) │
   │                     ❌          ✅
└─────── Blocking waiting ─────┘

❌ Problem: Synchronization blocking, single point of failure, poor performance
```


## Saga mode solution

**Compensation mode**:

```text
Service A Service B Service C
 ↓                    ↓                  ↓
Perform operation 1 Perform operation 2 Perform operation 3
✅ ✅ ❌ Failed
 │                    │                  │
 ↓                    ↓                  ↓
Stay successful Stay successful --
 │                    │
 ↓                    ↓
Compensation 1 ←──────────── Compensation 2
 ✅                   ✅

✅ Advantages: asynchronous non-blocking, eventual consistency, high availability
```


## Saga vs 2PC

| Features | 2PC | Saga |
|------|-----|------|
| Coordination mode | Synchronous blocking | Asynchronous non-blocking |
| Consistency | Strong consistency | Eventual consistency |
| Isolation | Complete isolation | Downgraded isolation |
| Performance | Low | High |
| Availability | Low | High |
| Complexity | Low | Medium |
| Applicable scenarios | Single application | Microservices |

---

## Execution process


## Forward execution

```javascript
async _executeForward(steps, context) {
    const results = [];

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];

        this.logger?.info(`[Saga] Execute steps ${i + 1}/${steps.length}: ${step.name}`);

        try {
            const startTime = Date.now();

            //⭐ Steps to follow
            const result = await step.execute(context);

            const duration = Date.now() - startTime;

            //Record results
            results.push({
                stepName: step.name,
                success: true,
                result,
                duration
            });

            this.logger?.info(
                `[Saga] Step ${step.name} is completed and takes ${duration}ms`
            );

        } catch (error) {
            //Step failed
            this.logger?.error(
                `[Saga] Step ${step.name} failed: ${error.message}`
            );

            results.push({
                stepName: step.name,
                success: false,
                error: error.message,
                stack: error.stack
            });

            //Interrupt execution, trigger compensation
            throw error;
        }
    }

    return results;
}
```


## State transition

```text
PENDING (pending execution)
   ↓
RUNNING (executing)
├─→ SUCCESS (all successful)
└─→ FAILED (a step failed)
         ↓
COMPENSATING (compensating)
├─→ COMPENSATED (compensation successful)
└─→ COMPENSATION_FAILED (compensation failed)⚠️
```

---

## Compensation mechanism


## Compensation principle

Compensation is at the heart of Saga, ensuring that completed operations can be undone in the event of failure:

```javascript
async _executeBackward(completedSteps, context) {
    const compensationResults = [];

    //⭐ Perform compensation in reverse order
    for (let i = completedSteps.length - 1; i >= 0; i--) {
        const stepResult = completedSteps[i];
        const step = this.definition.steps.find(s => s.name === stepResult.stepName);

        //Skip steps without compensation function
        if (!step || !step.compensate) {
            this.logger?.debug(
                `[Saga] Step ${stepResult.stepName} has no compensation function and is skipped`
            );
            continue;
        }

        this.logger?.info(`[Saga] Compensation step: ${step.name}`);

        try {
            const startTime = Date.now();

            //⭐ Execute compensation
            await step.compensate(context, stepResult.result);

            const duration = Date.now() - startTime;

            compensationResults.push({
                stepName: step.name,
                compensated: true,
                duration
            });

            this.logger?.info(
                `[Saga] Step ${step.name} compensation is completed and takes ${duration}ms`
            );

        } catch (error) {
            //⚠️ Compensation failed (serious error)
            this.logger?.error(
                `[Saga] Step ${step.name} compensation failed: ${error.message}`
            );

            compensationResults.push({
                stepName: step.name,
                compensated: false,
                error: error.message
            });

            //Continue with other steps to compensate
        }
    }

    return compensationResults;
}
```


## Compensation design principles

**1. Logical compensation vs physical compensation**

```javascript
//❌ Physical compensation: deletion of records
compensate: async (ctx) => {
    await db.orders.deleteOne({ orderId: ctx.get('orderId') });
}

//✅ Logical compensation: mark cancellation
compensate: async (ctx) => {
    await db.orders.updateOne(
        { orderId: ctx.get('orderId') },
        { $set: { status: 'cancelled', cancelledAt: new Date() } }
    );
}
```

**2. Idempotence**

The compensation operation must be repeatable:

```javascript
//✅ Idempotent compensation
compensate: async (ctx) => {
    const orderId = ctx.get('orderId');

    //Check current status
    const order = await db.orders.findOne({ orderId });

    if (order.status === 'cancelled') {
        return;  //Canceled, skipped
    }

    //Execution Cancel
    await db.orders.updateOne(
        { orderId, status: { $ne: 'cancelled' } },  //condition update
        { $set: { status: 'cancelled' } }
    );
}
```

**3. Compensation sequence**

Execute strictly in reverse order:

```text
Forward execution sequence:
1. Create order (orderId: 123)
2. Reduce inventory (productId: 456, quantity: -10)
3. Charge (chargeId: 789)
↓ failed

Compensation execution sequence:
3. Refund (chargeId: 789) ← The last executed one will be compensated first
2. Add inventory (productId: 456, quantity: +10)
1. Cancel order (orderId: 123) ← Last compensation executed first
```

---

## Context management


## SagaContext structure

```javascript
class SagaContext {
    constructor(data) {
        this.data = data;        //Enter data (read only)
        this.state = new Map();  //Sharing state between steps
        this.results = [];       //Step execution result
        this.sagaId = `saga_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    //Set sharing status
    set(key, value) {
        this.state.set(key, value);
    }

    //Get sharing status
    get(key) {
        return this.state.get(key);
    }

    //Check if status exists
    has(key) {
        return this.state.has(key);
    }

    //clear status
    clear() {
        this.state.clear();
    }
}
```


## Context usage example

```javascript
msq.defineSaga({
    name: 'order-flow',
    steps: [
        {
            name: 'create-order',
            execute: async (ctx) => {
                //1. Read input data
                const userId = ctx.data.userId;
                const items = ctx.data.items;

                //2. Execute business logic
                const order = await db.orders.insertOne({
                    userId,
                    items,
                    status: 'pending'
                });

                //3. ⭐ Save to context (for use in subsequent steps)
                ctx.set('orderId', order.insertedId);
                ctx.set('userId', userId);

                return order;
            },
            compensate: async (ctx) => {
                //4. ⭐ Get information from context
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
                //5. ⭐ Use the data saved in the previous step
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

## Distributed storage


## Redis multi-process sharing

```javascript
class SagaOrchestrator {
    constructor(options = {}) {
        this.cache = options.cache;

        //Determine storage mode
        if (this.cache && typeof this.cache.set === 'function') {
            //✅ Redis mode
            this.useRedis = true;
            this.sagaKeyPrefix = 'monsqlize:saga:def:';
        } else {
            //✅ Memory mode
            this.sagas = new Map();
            this.useRedis = false;
        }
    }

    async defineSaga(config) {
        const saga = new SagaDefinition(config, this);

        if (this.useRedis) {
            //Metadata stored in Redis
            await this.cache.set(
                this.sagaKeyPrefix + config.name,
                {
                    name: config.name,
                    steps: config.steps.map(s => ({
                        name: s.name,
                        hasCompensate: !!s.compensate
                    }))
                },
                0  //permanent storage
            );

            //⭐ Function references are kept in memory (cannot be serialized)
            if (!this.sagas) this.sagas = new Map();
            this.sagas.set(config.name, saga);
        } else {
            this.sagas.set(config.name, saga);
        }

        return saga;
    }
}
```


## Multi-process architecture

```text
Process 1 (Web server)
├── defineSaga('order-flow') ──┐
├── executeSaga()              │
└── SagaDefinition (memory) │
                               │
                               ↓
                         ┌────────────┐
│ Redis │ ← Metadata
                         └────────────┘
                               ↑
Process 2 (Worker) │
├── defineSaga('order-flow') ──┘
├── executeSaga()
└── SagaDefinition (memory)

⭐ Each process needs to call the defineSaga() registration function when it starts
```

Redis sharing does not make execution state durable. Each process still executes and compensates the current Saga run in memory; only the definition metadata is shared through Redis.

---

## Error handling


## Error type

1. **Step execution failed** → trigger compensation
2. **Compensation failed** → Record the log and continue with other compensation steps
3. **Fatal Error** → Abort Saga


## Error handling process

```javascript
try {
    //Forward execution
    const results = await this._executeForward(steps, context);
    const completedStepNames = results.map(r => r.stepName);

    return {
        success: true,
        executionId: context.sagaId,
        sagaId: context.sagaId,
        completedSteps: completedStepNames,
        completedStepCount: completedStepNames.length,
        completedStepNames,
        compensatedSteps: [],
        result: results[results.length - 1]?.result
    };

} catch (error) {
    this.logger?.error(`[Saga] Execution failed: ${error.message}`);

    //⭐ Trigger compensation
    const compensationResults = await this._executeBackward(
        context.results.filter(r => r.success),  //Only compensate for successful steps
        context
    );
    const completedStepNames = context.results
        .filter(r => r.success)
        .map(r => r.stepName);

    return {
        success: false,
        executionId: context.sagaId,
        sagaId: context.sagaId,
        completedSteps: completedStepNames,
        completedStepCount: completedStepNames.length,
        completedStepNames,
        compensatedSteps: compensationResults
            .filter(r => r.reason !== 'no-compensate-defined')
            .map(r => r.stepName),
        error,
        errorMessage: error.message,
        compensation: {
            success: compensationResults.every(r => r.success || r.reason === 'no-compensate-defined'),
            results: compensationResults
        }
    };
}
```


## Compensation failure handling

```javascript
//Compensation failure will not interrupt other compensations
try {
    await step.compensate(context, stepResult.result);

} catch (error) {
    //⚠️ Record compensation failure
    this.logger?.error(
        `[Saga] Compensation failed: ${step.name}, error: ${error.message}`
    );

    compensationResults.push({
        stepName: step.name,
        compensated: false,
        error: error.message
    });

    //⭐ Continue with other steps to compensate
}
```

---

## Logging and monitoring


## Log level

```javascript
//INFO: normal process
logger.info('[Saga] Start executing Saga: order-flow');
logger.info('[Saga] Execution step 1/3: create-order');
logger.info('[Saga] Step create-order completed, taking 123ms');

//ERROR: abnormal situation
logger.error('[Saga] Step charge-payment failed: Insufficient funds');
logger.error('[Saga] Compensation failed: refund-payment');

//DEBUG: debugging information
logger.debug('[Saga] step create-order has no compensation function and is skipped');
```


## Statistics

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


## Monitoring indicators

1. **Execution time** - the time taken for each step
2. **Success Rate** - Success/Failure Ratio
3. **Compensation Rate** - How often compensation is triggered
4. **Compensation Failure Rate** - Steps to Compensate Failure

---

## Performance optimization


## 1. Parallel execution (future feature)

The current version is serial execution, and parallel execution may be supported in the future:

```javascript
//Current: Serial
steps: [
    { name: 'step1', execute: async () => {} },  //wait
    { name: 'step2', execute: async () => {} },  //wait
    { name: 'step3', execute: async () => {} }
]

//The future: parallel
steps: [
    {
        parallel: [
            { name: 'step1', execute: async () => {} },  //Parallel
            { name: 'step2', execute: async () => {} }   //Parallel
        ]
    },
    { name: 'step3', execute: async () => {} }  //Wait for the first two to complete
]
```


## 2. Timeout control

```javascript
{
    name: 'slow-step',
    timeout: 30000,  //30 seconds timeout
    execute: async (ctx) => {
        //Time consuming operation
    }
}
```


## 3. Retry mechanism

```javascript
{
    name: 'unstable-api',
    retry: {
        maxAttempts: 3,
        backoff: 1000  //1 second exponential backoff
    },
    execute: async (ctx) => {
        //Unstable external API
    }
}
```

---

## Advanced features


## 1. Conditional steps

```javascript
{
    name: 'send-email',
    condition: (ctx) => ctx.get('notifyUser') === true,  //conditional execution
    execute: async (ctx) => {
        await sendEmail(ctx.get('userEmail'));
    }
}
```


## 2. Dynamic steps

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


## 3. Nested Saga

```javascript
msq.defineSaga({
    name: 'parent-saga',
    steps: [
        {
            name: 'child-saga',
            execute: async (ctx) => {
                //Execution sub-Saga
                return await msq.executeSaga('child-saga', ctx.data);
            }
        }
    ]
});
```

---

## Source code analysis


## SagaOrchestrator

```javascript
class SagaOrchestrator {
    async defineSaga(config) {
        this._validateConfig(config);  //Configuration verification

        const saga = new SagaDefinition(config, this);

        if (this.useRedis) {
            //Redis storage metadata
            await this.cache.set(
                this.sagaKeyPrefix + config.name,
                { name: config.name, steps: [...] },
                0
            );

            //Memory saving function reference
            this.sagas.set(config.name, saga);
        } else {
            this.sagas.set(config.name, saga);
        }

        return saga;
    }

    async execute(sagaName, data) {
        const saga = this.sagas?.get(sagaName);

        if (!saga) {
            throw new Error(`Saga '${sagaName}' undefined`);
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


## SagaExecutor

```javascript
class SagaExecutor {
    async execute(data) {
        const context = this._createContext(data);

        try {
            //Forward execution
            const results = await this._executeForward(
                this.definition.steps,
                context
            );

            return {
                success: true,
                executionId: context.sagaId,
                sagaId: context.sagaId,
                sagaName: this.definition.name,
                completedSteps: results.map(r => r.stepName),
                completedStepCount: results.length,
                completedStepNames: results.map(r => r.stepName),
                compensatedSteps: [],
                result: results[results.length - 1]?.result
            };

        } catch (error) {
            //reverse compensation
            const compensationResults = await this._executeBackward(
                context.results.filter(r => r.success),
                context
            );

            return {
                success: false,
                executionId: context.sagaId,
                sagaId: context.sagaId,
                sagaName: this.definition.name,
                completedSteps: context.results.filter(r => r.success).map(r => r.stepName),
                completedStepCount: context.results.filter(r => r.success).length,
                completedStepNames: context.results.filter(r => r.success).map(r => r.stepName),
                compensatedSteps: compensationResults
                    .filter(r => r.reason !== 'no-compensate-defined')
                    .map(r => r.stepName),
                error,
                errorMessage: error.message,
                compensation: {
                    success: compensationResults.every(r => r.success || r.reason === 'no-compensate-defined'),
                    results: compensationResults
                }
            };
        }
    }
}
```

---

## Best Practices


## 1. Compensation design

```javascript
//✅ Good: logical compensation + idempotent
compensate: async (ctx) => {
    const orderId = ctx.get('orderId');

    await db.orders.updateOne(
        { _id: orderId, status: { $ne: 'cancelled' } },
        { $set: { status: 'cancelled', cancelledAt: new Date() } }
    );
}

//❌ Bad: physical deletion + non-idempotent
compensate: async (ctx) => {
    const orderId = ctx.get('orderId');
    await db.orders.deleteOne({ _id: orderId });
}
```


## 2. Status management

```javascript
//✅ Good: clear status transfer
execute: async (ctx) => {
    const result = await doSomething();
    ctx.set('resultId', result.id);  //Save ID instead of whole object
    return result;
}

//❌ Bad: Overuse of context
execute: async (ctx) => {
    ctx.set('allData', hugeObject);  //avoid large objects
}
```


## 3. Error handling

```javascript
//✅ Good: Detailed error message
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

## Related documents

- [Saga Distributed Transaction](./saga-transaction.md) - User Guide
- [Transaction Document](./transaction.md) - Local Transaction
- [Distributed deployment](./distributed-deployment.md) - Multi-process deployment
