# Saga distributed transactions

monSQLize v1.1.0 introduces the Saga distributed transaction mode for coordinating transaction operations across services.

## Table of Contents

- [What is Saga](#what-is-saga)
- [Core Features](#core-features)
- [Usage scenarios](#usage-scenarios)
- [Applicable scenarios](#applicable-scenarios)
- [Not applicable scenarios](#not-applicable-scenarios)
- [Quick start](#quick-start)
- [Installation](#installation)
- [Basic usage](#basic-usage)
- [API Documentation](#api-documentation)
- [defineSaga(config)](#definesagaconfig)
- [executeSaga(name, data)](#executesaganame-data)
- [listSagas()](#listsagas)
- [getSagaStats()](#getsagastats)
- [SagaContext API](#sagacontext-api)
- [ctx.data](#ctxdata)
- [ctx.set(key, value)](#ctxsetkey-value)
- [ctx.get(key)](#ctxgetkey)
- [ctx.executionId](#ctxexecutionid)
- [Best Practices](#best-practices)
- [1. Clearly define compensation operations](#1-clearly-define-compensation-operations)
- [2. Save key information to context](#2-save-key-information-to-context)
- [3. Idempotent design](#3-idempotent-design)
- [4. Error handling](#4-error-handling)
- [5. Single process mode vs Redis mode](#5-single-process-mode-vs-redis-mode)
- [FAQ](#faq)
- [Q1: What is the difference between Saga and withTransaction?](#q1-what-is-the-difference-between-saga-and-withtransaction)
- [Q2: What should I do if compensation fails?](#q2-what-should-i-do-if-compensation-fails)
- [Q3: How to debug Saga?](#q3-how-to-debug-saga)
- [Q4: Can Saga be nested?](#q4-can-saga-be-nested)
- [Q5: How to test Saga?](#q5-how-to-test-saga)
- [Example](#example)
- [Version history](#version-history)

## What is Saga

Saga is a distributed transaction model that decomposes long transactions into multiple local transactions, and each local transaction has a corresponding compensation operation. When a step fails, the completed steps are undone by performing compensating operations in reverse order.


## Core Features

- ✅ **Cross-service transaction coordination**: Coordinate the operations of multiple services
- ✅ **Automatic compensation mechanism**: Automatically perform compensation in reverse order when failure occurs
- ✅ **NO TIME LIMIT**: Break MongoDB’s 60-second transaction limit
- ✅ **Redis Distributed Support**: Sharing Saga definitions in a multi-process environment
- ✅ **Detailed Log**: Complete execution and compensation log

---

## Usage scenarios


## Applicable scenarios

1. **Cross-service transactions**
   ```
A service (order) → B service (inventory) → C service (payment)
   ```

2. **Third Party API Integration**
   ```
Create order → Stripe charge → Send email
   ```

3. **Long time process**
   ```
Complex business processes longer than 60 seconds
   ```


## Not applicable scenarios

1. **Single Service Single Database Operation** → Use `withTransaction`
2. **External API read only** → use `withTransaction`

---

## Quick start


## Installation

Saga functionality is built into monSQLize v1.1.0+ and requires no additional installation.

```bash
npm install monsqlize@^1.1.0
```


## Basic usage

```javascript
import MonSQLize from 'monsqlize';

//initialization
const msq = new MonSQLize({
    type: 'mongodb',
    config: { uri: 'mongodb://localhost:27017/mydb' }
});

await msq.connect();

//Definition Saga
msq.defineSaga({
    name: 'create-order-with-payment',
    steps: [
        {
            name: 'create-order',
            execute: async (ctx) => {
                //Create order
                const order = await createOrder(ctx.data);
                ctx.set('orderId', order.id);
                return order;
            },
            compensate: async (ctx) => {
                //Cancel order
                const orderId = ctx.get('orderId');
                await cancelOrder(orderId);
            }
        },
        {
            name: 'charge-payment',
            execute: async (ctx) => {
                //Deduction
                const charge = await stripe.charges.create({
                    amount: ctx.data.amount,
                    source: ctx.data.paymentToken
                });
                ctx.set('chargeId', charge.id);
                return charge;
            },
            compensate: async (ctx) => {
                //Refund
                const chargeId = ctx.get('chargeId');
                await stripe.refunds.create({ charge: chargeId });
            }
        }
    ]
});

//Execute Saga
try {
    const result = await msq.executeSaga('create-order-with-payment', {
        userId: 'user123',
        amount: 9900,
        paymentToken: 'tok_visa'
    });

    console.log('Order created successfully:', result.sagaId);
} catch (error) {
    console.error('Order creation failed:', error.message);
}
```

---

## API Documentation


## defineSaga(config)

Define a Saga.

**Parameters**:
- `config.name` (string): Saga name, globally unique
- `config.steps` (Array): List of steps

**Step Configuration**:
```javascript
{
    name: 'step-name',              //step name
    execute: async (ctx) => { },    //Execute function
    compensate: async (ctx, result) => { }  //Compensation function (optional)
}
```

**Return value**: SagaDefinition instance

**Example**:
```javascript
msq.defineSaga({
    name: 'my-saga',
    steps: [
        {
            name: 'step1',
            execute: async (ctx) => {
                //Forward operation
                return { success: true };
            },
            compensate: async (ctx, result) => {
                //Compensation operation
            }
        }
    ]
});
```

---


## executeSaga(name, data)

Execute Saga.

**Parameters**:
- `name` (string): Saga name
- `data` (Object): execution data, accessible via `ctx.data`

**Return value**: Promise<Object>

**Return successfully**:
```javascript
{
    success: true,
    executionId: 'saga_xxx',
    sagaId: 'saga_xxx',
    sagaName: 'my-saga',
    completedSteps: ['reserve-inventory', 'create-payment', 'create-order'],
    completedStepCount: 3,
    completedStepNames: ['reserve-inventory', 'create-payment', 'create-order'],
    compensatedSteps: [],
    result: { orderId: 'order_123' },
    duration: 123  //milliseconds
}
```

**Return on failure**:
```javascript
{
    success: false,
    executionId: 'saga_xxx',
    sagaId: 'saga_xxx',
    sagaName: 'my-saga',
    completedSteps: ['reserve-inventory', 'create-payment'],
    completedStepCount: 2,
    completedStepNames: ['reserve-inventory', 'create-payment'],
    compensatedSteps: ['create-payment', 'reserve-inventory'],
    error: new Error('Error message'),
    errorMessage: 'Error message',
    duration: 123,
    compensation: {
        success: true,
        results: [...]
    }
}
```

---


## listSagas()

List all defined sagas.

**Return value**: string[]

```javascript
const sagas = msq.listSagas();
console.log('Defined Saga:', sagas);
// ['create-order', 'update-inventory', ...]
```

---


## getSagaStats()

Get Saga statistics.

**Return value**: Object

```javascript
const stats = msq.getSagaStats();
console.log(stats);
// {
//   totalExecutions: 100,
//   successfulExecutions: 95,
//   failedExecutions: 5,
//   compensatedExecutions: 5,
//   successRate: '95.00%',
//   storageMode: 'Redis' or 'memory'
// }
```

---

## SagaContext API

The SagaContext is accessible in the `execute` and `compensate` functions.


## ctx.data

Get execution data (read-only).

```javascript
execute: async (ctx) => {
    const userId = ctx.data.userId;
    const amount = ctx.data.amount;
}
```


## ctx.set(key, value)

Save custom data for passing between steps. **Supports any type of value** (string, object, array, number, etc.).

```javascript
execute: async (ctx) => {
    //✅ String
    ctx.set('orderId', 'ORDER123');

    //✅ Object
    ctx.set('orderData', {
        orderId: 'ORDER123',
        amount: 9900,
        items: [{ sku: 'SKU001', quantity: 2 }]
    });

    //✅ Array
    ctx.set('itemIds', ['id1', 'id2', 'id3']);

    //✅ Numbers
    ctx.set('totalAmount', 9900);
}
```


## ctx.get(key)

Get custom data. The return value type is the same as when deposited.

```javascript
compensate: async (ctx) => {
    //Get string
    const orderId = ctx.get('orderId');
    await cancelOrder(orderId);

    //Get object
    const orderData = ctx.get('orderData');
    console.log('Order amount:', orderData.amount);

    //Get array
    const itemIds = ctx.get('itemIds');
    for (const id of itemIds) {
        await releaseItem(id);
    }
}
    await cancelOrder(orderId);
}
```


## ctx.executionId

Get the Saga unique identifier.

```javascript
execute: async (ctx) => {
    console.log('Saga ID:', ctx.executionId);
}
```

---

## Best Practices


## 1. Clearly define compensation operations

Every step that has side effects should have compensating actions.

```javascript
//✅ Recommended
{
    name: 'create-order',
    execute: async (ctx) => {
        const order = await createOrder(ctx.data);
        ctx.set('orderId', order.id);
        return order;
    },
    compensate: async (ctx) => {
        const orderId = ctx.get('orderId');
        await cancelOrder(orderId);
    }
}

//❌ Not recommended: There are side effects but no compensation
{
    name: 'create-order',
    execute: async (ctx) => {
        return await createOrder(ctx.data);
    }
    //no compensate
}
```

---


## 2. Save key information to context

Information required for compensation operations should be saved in execute. **Supports saving complete objects and simplifying code. **

```javascript
//✅ Recommended: Save the complete object
execute: async (ctx) => {
    const result = await createOrder(ctx.data);

    //The complete order object is saved and all information is accessible during compensation
    ctx.set('order', result);

    return result;
},
compensate: async (ctx) => {
    //Use the saved complete object
    const order = ctx.get('order');
    await cancelOrder(order.id, {
        reason: 'saga-compensation',
        amount: order.amount,
        items: order.items
    });
}

//✅Also: Save individual fields
execute: async (ctx) => {
    const result = await doSomething();

    ctx.set('resourceId', result.id);
    ctx.set('amount', result.amount);

    return result;
},
compensate: async (ctx) => {
    const resourceId = ctx.get('resourceId');
    const amount = ctx.get('amount');

    await revertOperation(resourceId, amount);
}
```

---


## 3. Idempotent design

Compensation operations should be idempotent (repeatable).

```javascript
compensate: async (ctx) => {
    const orderId = ctx.get('orderId');

    //✅ Recommended: Check Status
    const order = await getOrder(orderId);
    if (order.status !== 'cancelled') {
        await cancelOrder(orderId);
    }

    //❌ Not recommended: execute directly
    //await cancelOrder(orderId); // Possible repeated cancellation
}
```

---


## 4. Error handling

Compensation failures should be logged in detail.

```javascript
compensate: async (ctx) => {
    try {
        await doCompensation();
    } catch (error) {
        //Saga will automatically log errors
        //But you can add additional logs
        console.error('[Compensation Error]', {
            sagaId: ctx.sagaId,
            error: error.message
        });
        throw error;  //rethrow
    }
}
```

---


## 5. Single process mode vs Redis mode

**Single process mode** (default):

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    config: { uri: '...' },
    cache: false  //Or do not configure cache
});
```

**Redis mode** (multi-process):

```javascript
const MonSQLize = require('monsqlize');

const msq = new MonSQLize({
    type: 'mongodb',
    config: { uri: '...' },
    cache: MonSQLize.createRedisCacheAdapter('redis://localhost:6379')
});

//⚠️ IMPORTANT: Each process needs to call defineSaga() when starting
msq.defineSaga({
    name: 'my-saga',
    steps: [...]
});
```

---

## FAQ


## Q1: What is the difference between Saga and withTransaction?

| Dimensions | withTransaction | Saga |
|------|----------------|------|
| **Applicable scenarios** | Single database operation | Cross-service operation |
| **Rollback method** | MongoDB automatic rollback | Manual compensation |
| **Time Limit** | 60 seconds | No limit |
| **External API** | Does not support rollback | Supports compensation |

---


## Q2: What should I do if compensation fails?

Compensation failures will be recorded in the return result:

```javascript
const result = await msq.executeSaga('my-saga', data);

if (!result.success && !result.compensation.success) {
    console.error('Compensation fails and manual intervention is required');
    console.error('Failed steps:', result.compensation.results);
}
```

---


## Q3: How to debug Saga?

Enable logging:

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    config: { uri: '...' },
    logger: { level: 'debug' }  //Enable verbose logging
});
```

---


## Q4: Can Saga be nested?

Yes, but not recommended. It is recommended to split complex processes into multiple independent sagas.

---


## Q5: How to test Saga?

Use mock service:

```javascript
//Mock external services
const mockOrderService = {
    create: async (data) => ({ orderId: 'TEST_ORDER' }),
    cancel: async (orderId) => ({ cancelled: true })
};

//Define Test Saga
msq.defineSaga({
    name: 'test-saga',
    steps: [
        {
            name: 'create-order',
            execute: async (ctx) => {
                return await mockOrderService.create(ctx.data);
            },
            compensate: async (ctx) => {
                const orderId = ctx.get('orderId');
                await mockOrderService.cancel(orderId);
            }
        }
    ]
});

//Execute tests
const result = await msq.executeSaga('test-saga', {});
assert(result.success === true);
```

---

## Example

For complete examples please refer to:
- [examples/docs/saga.ts](../../examples/docs/saga.ts)

---

## Version history

- **v1.1.0** (2026-01-17): First release of Saga function

---

_Document update time: 2026-01-17_
_Version: v1.1.0_
