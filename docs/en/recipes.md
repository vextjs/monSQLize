# Recipes

## Directory navigation

- [Only connect to MongoDB](#only-connect-to-mongodb)
- [Enable memory cache](#enable-memory-cache)
- [Enable Redis second-level cache and distributed invalidation](#enable-redis-second-level-cache-and-distributed-invalidation)
- [Connect to intranet MongoDB through SSH tunnel](#connect-to-intranet-mongodb-through-ssh-tunnel)
- [Configuring multiple connection pools](#configure-multiple-connection-pools)
- [Enable Model layer](#enable-model-layer)
- [Troubleshooting by error code](#troubleshoot-according-to-error-code)

## Only connect to MongoDB

```ts
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'app',
    config: { uri: 'mongodb://127.0.0.1:27017' },
});

await msq.connect();

const users = msq.collection('users');
await users.insertOne({ name: 'Ada', createdAt: new Date() });

await msq.close();
```

It is suitable to verify the connection, CRUD and package entry first. Missing `config.uri` throws `INVALID_CONFIG`, and directly accessing the data without `connect()` throws `NOT_CONNECTED`.

## Enable memory cache

```ts
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'app',
    config: { uri: 'mongodb://127.0.0.1:27017' },
    cache: {
        enabled: true,
        ttl: 60_000,
        maxEntries: 5_000,
        enableStats: true,
    },
});

await msq.connect();
```

Memory caching requires no additional services and is suitable for single-process or local fast verification.

## Enable Redis second-level cache and distributed invalidation

```ts
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'app',
    config: { uri: 'mongodb://127.0.0.1:27017' },
    cache: {
        memory: { maxEntries: 5_000, ttl: 30_000 },
        redis: { url: 'redis://127.0.0.1:6379', timeoutMs: 300 },
        distributed: {
            redisUrl: 'redis://127.0.0.1:6379',
            channel: 'app:cache:invalidate',
        },
    },
});

await msq.connect();
```

`ioredis` has been installed by default with `monsqlize`; what needs to be configured here is the Redis address and whether to enable distributed failure, rather than installing dependencies.

## Connect to intranet MongoDB through SSH tunnel

```ts
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'app',
    config: {
        uri: 'mongodb://mongo.internal:27017/app',
        ssh: {
            host: 'bastion.example.com',
            username: 'deploy',
            privateKeyPath: '~/.ssh/id_rsa',
        },
    },
});

await msq.connect();
```

`ssh2` is installed by default with `monsqlize`. As long as `config.ssh` is passed in, the runtime will establish a local tunnel and forward the MongoDB connection to the intranet address.

## Configure multiple connection pools

```ts
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'app',
    pools: [
        { name: 'primary', uri: 'mongodb://primary:27017/app', role: 'primary' },
        { name: 'analytics', uri: 'mongodb://analytics:27017/app', role: 'analytics', tags: ['reporting'] },
    ],
    poolStrategy: 'auto',
    poolFallback: { enabled: true, fallbackStrategy: 'secondary' },
});

await msq.connect();
const reports = msq.pool('analytics').collection('reports');
```

A connection pool configuration error will throw `INVALID_CONFIG`; specifying a non-existent pool will throw `POOL_NOT_FOUND`; unavailability of all pools will throw `INVALID_OPERATION`.

## Enable Model layer

```ts
import MonSQLize, { Model } from 'monsqlize';

Model.define('users', {
    schema: (dsl) => dsl({
        name: 'string:1-64!',
        email: 'email!',
    }),
});

const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'app',
    config: { uri: 'mongodb://127.0.0.1:27017' },
});

await msq.connect();
const User = msq.model('users');
await User.insertOne({ name: 'Ada', email: 'ada@example.com' });
```

`schema-dsl` is installed by default with `monsqlize`. Model schema callbacks use the MonSQLize instance's isolated `schema-dsl/runtime`; if application code owns the same custom types or messages, configure that runtime directly and pass it through `schemaDsl`. Runtime load or API-shape failures throw `INVALID_CONFIG` unless validation is explicitly disabled.

## Troubleshoot according to error code

```ts
import { ErrorCodes } from 'monsqlize';

try {
    await msq.connect();
} catch (error) {
    const code = (error as { code?: string }).code;
    if (code === ErrorCodes.INVALID_CONFIG) {
        console.error('Check the MonSQLize construct configuration');
    } else if (code === ErrorCodes.CONNECTION_FAILED) {
        console.error('Check MongoDB network, authentication and URI');
    } else {
        throw error;
    }
}
```

For more error codes and handling suggestions, see [`error-codes.md`](./error-codes.md).
