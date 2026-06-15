# Business-level distributed lock

> **Version**: v1.0.1
> **Status**: ✅ Achieved
> **Dependencies**: Redis (ioredis)

---

## Table of Contents

- [Overview](#overview)
- [Core Features](#core-features)
- [Applicable scenarios](#applicable-scenarios)
- [Not applicable scenarios](#not-applicable-scenarios)
- [Quick start](#quick-start)
- [1. Install dependencies](#1-install-dependencies)
- [2. Configuration](#2-configuration)
- [3. Use](#3-use)
- [API Reference](#api-reference)
- [withLock(key, callback, options?)](#withlockkey-callback-options)
- [acquireLock(key, options?)](#acquirelockkey-options)
- [tryAcquireLock(key, options?)](#tryacquirelockkey-options)
- [getLockStats()](#getlockstats)
- [Configuration options](#configuration-options)
- [Global configuration](#global-configuration)
- [API level configuration](#api-level-configuration)
- [Usage scenarios](#usage-scenarios)
- [Scenario 1: Inventory deduction (complex business)](#scenario-1-inventory-deduction-complex-business)
- [Scenario 2: Order creation (lock + transaction)](#scenario-2-order-creation-lock-transaction)
- [Scenario 3: Scheduled task prevention](#scenario-3-scheduled-task-prevention)
- [Scenario 4: External API call](#scenario-4-external-api-call)
- [Cooperate with transactions](#cooperate-with-transactions)
- [Error handling](#error-handling)
- [Error type](#error-type)
- [Processing example](#processing-example)
- [Downgrade strategy](#downgrade-strategy)
- [Best Practices](#best-practices)
- [1. Unified management of lock keys](#1-unified-management-of-lock-keys)
- [2. Lock granularity selection](#2-lock-granularity-selection)
- [3. TTL settings](#3-ttl-settings)
- [4. Error handling](#4-error-handling)
- [5. Monitoring statistics](#5-monitoring-statistics)
- [FAQ](#faq)
- [Q1: What is the difference between business locks and transaction locks?](#q1-what-is-the-difference-between-business-locks-and-transaction-locks)
- [Q2: When is a business lock required?](#q2-when-is-a-business-lock-required)
- [Q3: What should I do if Redis is unavailable?](#q3-what-should-i-do-if-redis-is-unavailable)
- [Q4: What happens if the lock times out?](#q4-what-happens-if-the-lock-times-out)
- [Q5: How to avoid deadlock?](#q5-how-to-avoid-deadlock)
- [Q6: Does lock renewal support?](#q6-does-lock-renewal-support)
- [Comparison with professional lock library](#comparison-with-professional-lock-library)
- [Reference](#reference)

## Overview

monSQLize v1.0.1 introduces a business-level distributed lock function, implemented based on Redis, to protect critical sections of complex business logic and prevent concurrency conflicts.


## Core Features

- ✅ **Atomic Operation**: Based on Redis SET NX PX atomic command
- ✅ **Auto-release**: Supports TTL automatic expiration to prevent deadlocks
- ✅ **Retry Mechanism**: Configurable retry times and intervals
- ✅ **Error Handling**: Redis connection interruption detection and downgrade strategy
- ✅ **Statistics Monitoring**: Built-in lock operation statistics
- ✅ **Works with affairs**: Can be combined seamlessly with `withTransaction`


## Applicable scenarios

| Scene | Description |
|------|------|
| Complex order creation | Query → Calculate discount → Multi-table update |
| Inventory deduction | Complex business logic (not simple -1) |
| Prevent duplication of scheduled tasks | Prevent repeated execution in multi-instance environments |
| External API call | Update database after calling third party |


## Not applicable scenarios

| Scenario | Recommended solution |
|------|---------|
| Simple Inventory Deduction (-1) | Transaction + Condition Update |
| Prevent users from clicking repeatedly | Rate limiting (frame layer) |
| Strong consistency across services | Using Redlock or ZooKeeper |

---

## Quick start


## 1. Install dependencies

`ioredis` has been installed with `monsqlize` by default. There is no need to install `ioredis` separately. The example can directly create a Redis client on the application side and configure it through `cache.distributed`.


## 2. Configuration

```javascript
import MonSQLize from 'monsqlize';
const Redis = require('ioredis');

const redis = new Redis('redis://localhost:6379');

const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: 'mongodb://localhost:27017' },
    cache: {
        transaction: {
            distributedLock: {
                redis: redis,                       //Redis instance
                keyPrefix: 'myapp:lock:'           //Lock key prefix (optional)
            }
        }
    }
});
```


## 3. Use

```javascript
await msq.connect();

//Use business lock
await msq.withLock('inventory:SKU123', async () => {
    const product = await inventory.findOne({ sku: 'SKU123' });
    if (product.stock >= 1) {
        await inventory.updateOne(
            { sku: 'SKU123' },
            { $inc: { stock: -1 } }
        );
    }
});
```

---

## API Reference


## withLock(key, callback, options?)

Automatically manage lock lifecycle (recommended).

**Signature**:
```typescript
async withLock<T>(
    key: string,
    callback: () => Promise<T>,
    options?: LockOptions
): Promise<T>
```

**Parameters**:

| Parameters | Type | Required | Default value | Description |
|------|------|------|--------|------|
| `key` | string | ✅ | - | The unique identifier of the lock |
| `callback` | Function | ✅ | - | Function executed after acquiring the lock |
| `options.ttl` | number | ❌ | 10000 | Lock expiration time (milliseconds) |
| `options.retryTimes` | number | ❌ | 3 | Number of retries |
| `options.retryDelay` | number | ❌ | 100 | Retry interval (milliseconds) |
| `options.fallbackToNoLock` | boolean | ❌ | false | Downgrade when Redis is unavailable |

**Return value**: `Promise<T>` - return value of callback

**Example**:

```javascript
//Basic usage
await msq.withLock('resource:123', async () => {
    //critical section code
    await doSomething();
});

//Custom options
await msq.withLock('resource:123', async () => {
    await doSomething();
}, {
    ttl: 5000,        //Release automatically after 5 seconds
    retryTimes: 5,    //Retry 5 times
    retryDelay: 200   //Each interval is 200ms
});

//return value
const result = await msq.withLock('resource:123', async () => {
    return await calculateSomething();
});
console.log(result);
```

---


## acquireLock(key, options?)

Manually acquire the lock (blocking retries).

**Signature**:
```typescript
async acquireLock(
    key: string,
    options?: LockOptions
): Promise<Lock>
```

**Return value**: `Promise<Lock>` - Lock object

**Lock object methods**:

| Method | Description |
|------|------|
| `release()` | Release lock |
| `renew(ttl?)` | Renewal |
| `isHeld()` | Check if the lock is still held |
| `getHoldTime()` | Acquisition lock holding time (milliseconds) |

**Example**:

```javascript
const lock = await db.acquireLock('resource:123', {
    ttl: 10000,
    retryTimes: 3
});

try {
    //business logic
    await doSomething();

    //Optional: Renewal
    await lock.renew(5000);

} finally {
    await lock.release();
}
```

---


## tryAcquireLock(key, options?)

Try to acquire the lock (without blocking).

**Signature**:
```typescript
async tryAcquireLock(
    key: string,
    options?: Omit<LockOptions, 'retryTimes'>
): Promise<Lock | null>
```

**Return value**: `Promise<Lock | null>` - Lock object or null

**Example**:

```javascript
const lock = await db.tryAcquireLock('resource:123', { ttl: 5000 });

if (lock) {
    try {
        //business logic
        await doSomething();
    } finally {
        await lock.release();
    }
} else {
    console.log('Resources are occupied');
}
```

---


## getLockStats()

Get lock statistics.

**Signature**:
```typescript
getLockStats(): LockStats
```

**Return Value**:

```typescript
interface LockStats {
    locksAcquired: number;    //The number of times the lock was successfully acquired
    locksReleased: number;    //The number of times the lock was successfully released
    lockChecks: number;       //Number of lock checks
    errors: number;           //number of errors
    lockKeyPrefix: string;    //Lock key prefix
    maxDuration: number;      //Lock maximum duration
}
```

**Example**:

```javascript
const stats = db.getLockStats();
console.log(`Acquired locks: ${stats.locksAcquired} times`);
console.log(`Locks released: ${stats.locksReleased} times`);
console.log(`Errors: ${stats.errors} times`);
```

---

## Configuration options


## Global configuration

Configure in the `MonSQLize` constructor:

```javascript
new MonSQLize({
    cache: {
        transaction: {
            distributedLock: {
                //Redis instance (required)
                redis: redisInstance,

                //Lock key prefix (optional, default 'monsqlize:cache:lock:')
                keyPrefix: 'myapp:lock:'
            }
        }
    }
});
```


## API level configuration

The default value can be overridden on each call:

```javascript
await msq.withLock('key', callback, {
    ttl: 5000,          //Override default TTL
    retryTimes: 5,      //Override the default number of retries
    retryDelay: 200,    //Override the default retry interval
    fallbackToNoLock: true  //Enable downgrade
});
```

---

## Usage scenarios


## Scenario 1: Inventory deduction (complex business)

```javascript
await msq.withLock(`inventory:${sku}`, async () => {
    const product = await inventory.findOne({ sku });
    const user = await users.findOne({ userId });

    //Complex calculations: member discounts, coupons, points deductions
    const finalPrice = calculatePrice(product, user, coupon);

    if (user.balance < finalPrice) {
        throw new Error('Insufficient balance');
    }

    //Multiple table update
    await inventory.updateOne({ sku }, { $inc: { stock: -1 } });
    await users.updateOne({ userId }, { $inc: { balance: -finalPrice } });
    await orders.insertOne({ userId, sku, price: finalPrice });
});
```


## Scenario 2: Order creation (lock + transaction)

```javascript
await msq.withLock(`order:${userId}:${sku}`, async () => {
    await msq.withTransaction(async (tx) => {
        //intra-transaction operations
        await inventory.updateOne(
            { sku, stock: { $gte: 1 } },
            { $inc: { stock: -1 } },
            { session: tx.session }
        );

        await orders.insertOne({
            userId, sku, createdAt: new Date()
        }, { session: tx.session });
    });
});
```


## Scenario 3: Scheduled task prevention

```javascript
//Scheduled tasks (executed at 0 o'clock every day)
async function dailyReportTask() {
    const lock = await db.tryAcquireLock('cron:daily-report', {
        ttl: 60000  //60 seconds
    });

    if (!lock) {
        console.log('Other instances are executing, skip');
        return;
    }

    try {
        await generateDailyReport();
    } finally {
        await lock.release();
    }
}
```


## Scenario 4: External API call

```javascript
await msq.withLock(`payment:${orderId}`, async () => {
    //Call third-party payment
    const paymentResult = await thirdPartyPayment.charge({
        orderId,
        amount: 100
    });

    //Update order status
    await orders.updateOne(
        { _id: orderId },
        {
            $set: {
                status: 'paid',
                paymentId: paymentResult.id
            }
        }
    );
});
```

---

## Cooperate with transactions

Business locks work seamlessly with monSQLize transactions:

```javascript
//Recommendation: lock outside, affairs inside
await msq.withLock('resource:123', async () => {
    await msq.withTransaction(async (tx) => {
        //Transaction operations
        await collection1.updateOne({}, {}, { session: tx.session });
        await collection2.insertOne({}, { session: tx.session });
    });
});
```

**Why is it locked out? **
- Locks protect the entire business process (including pre-transaction queries and calculations)
- Transactions ensure the atomicity of database operations
- The two are complementary and do not conflict with each other

---

## Error handling


## Error type

| Error | Description |
|------|------|
| `LockAcquireError` | Failed to acquire lock (still failed after retrying) |
| `LockTimeoutError` | Lock operation timed out |
| Redis connection error | Redis unavailable |


## Processing example

```javascript
const { LockAcquireError } = require('monsqlize');

try {
    await msq.withLock('resource:123', async () => {
        await doSomething();
    });
} catch (error) {
    if (error instanceof LockAcquireError) {
        //Lock is occupied
        console.log('The resource is busy, please try again later.');
        return { success: false, reason: 'busy' };
    }
    throw error;
}
```


## Downgrade strategy

```javascript
//Downgrade to lock-free execution when Redis is unavailable (use with caution)
await msq.withLock('resource:123', async () => {
    await doSomething();
}, {
    fallbackToNoLock: true  //⚠️ Use with caution!
});
```

**Downgrade Suggestions**:

| Scenario | Suggestions |
|------|------|
| Core business (orders, payments) | Throw exceptions, no downgrade |
| Non-core business (statistics, logs) | Can be downgraded |
| Scheduled tasks | Throw an exception and skip this execution |

---

## Best Practices


## 1. Unified management of lock keys

```javascript
// constants/lock-keys.js
const LockKeys = {
    INVENTORY: {
        key: (sku) => `inventory:${sku}`,
        ttl: 5000
    },
    ORDER_CREATE: {
        key: (userId, sku) => `order:create:${userId}:${sku}`,
        ttl: 10000
    }
};

//use
await msq.withLock(
    LockKeys.INVENTORY.key(sku),
    callback,
    { ttl: LockKeys.INVENTORY.ttl }
);
```


## 2. Lock granularity selection

```javascript
//❌ The granularity is too coarse: all orders share one lock
await msq.withLock('order', async () => { ... });

//✅ Suitable granularity: one lock for each user + product
await msq.withLock(`order:${userId}:${sku}`, async () => { ... });

//⚠️ Too fine granularity: one lock per request (meaningless)
await msq.withLock(`order:${requestId}`, async () => { ... });
```


## 3. TTL settings

```javascript
//experience value
{
    ttl: 5000    //Simple operation (inventory deduction)
    ttl: 10000   //General operations (order creation)
    ttl: 60000   //scheduled tasks
    ttl: 300000  //Long-term tasks (report generation)
}
```


## 4. Error handling

```javascript
//✅ Recommended: Complete error handling
try {
    await msq.withLock('key', async () => {
        await doSomething();
    });
} catch (error) {
    if (error instanceof LockAcquireError) {
        //Lock is occupied
        return { success: false, reason: 'busy' };
    }
    //Other errors
    throw error;
}
```


## 5. Monitoring statistics

```javascript
//Regularly check lock statistics
setInterval(() => {
    const stats = db.getLockStats();
    if (stats.errors > 100) {
        console.warn('Lock error rate is too high:', stats);
    }
}, 60000);
```

---

## FAQ


## Q1: What is the difference between business locks and transaction locks?

| Comparison items | Transaction lock (original) | Business lock (v1.0.1) |
|--------|--------------|----------------|
| **Purpose** | Protect cache consistency | Protect business logic |
| **Lifecycle** | Transaction duration | User defined |
| **API** | Internal use | Public API |
| **Key management** | session binding | user specified |


## Q2: When is a business lock required?

**Scenarios that require business locks**:
- ✅ Complex business (query → calculation → multi-table update)
- ✅ Prevent duplication of scheduled tasks
- ✅ Update database after external API call

**Scenarios where business locks are not required**:
- ❌ Simple deduction (updated with transaction + condition)
- ❌ Prevent users from clicking repeatedly (with rate limiting)


## Q3: What should I do if Redis is unavailable?

```javascript
//Method 1: Throw an exception (recommended)
try {
    await msq.withLock('key', callback);
} catch (error) {
    if (error.message.includes('Redis unavailable')) {
        //Record alarm
    }
}

//Method 2: Downgrade (use with caution)
await msq.withLock('key', callback, {
    fallbackToNoLock: true
});
```


## Q4: What happens if the lock times out?

The lock will be released automatically (TTL mechanism) and will not cause deadlock.


## Q5: How to avoid deadlock?

- ✅ Use `withLock` (auto release)
- ✅ Use `try...finally` when manually acquiring the lock
- ✅ Set a reasonable TTL


## Q6: Does lock renewal support?

Supported, use `lock.renew(ttl)`:

```javascript
const lock = await db.acquireLock('key');
try {
    await doSomething();
    await lock.renew(5000);  //Renewal 5 seconds
    await doMoreThings();
} finally {
    await lock.release();
}
```

---

## Comparison with professional lock library

| Features | monSQLize business lock | Redlock | node-redis-warlock |
|------|----------------|---------|-------------------|
| **Installation** | Redis dependencies are installed with the package; Redis service is required | Additional installation | Additional installation |
| **Redis Node** | Single node | Multi-node | Single node |
| **Consistency** | Eventually consistent | Strong consistency | Eventually consistent |
| **Complexity** | Simple | Complex | Simple |
| **Applicable scenarios** | 80% business scenarios | Finance/core | Simple scenarios |
| **Integrated with monSQLize** | ✅ Seamless | Manual required | Manual required |

**Suggestions**:
- Most scenarios use monSQLize business locks
- Use Redlock for core scenarios such as finance/payment
- For simple scenarios, other lightweight libraries can be considered

---

## Reference

- [Program Document]
- [Sample code](https://github.com/vextjs/monSQLize/blob/main/examples/docs/lock.ts)
- [Unit Test](../../test/unit/lock/lock.test.ts)
