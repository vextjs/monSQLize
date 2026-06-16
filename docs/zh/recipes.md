# 场景配方

## 目录导航

- [只连接 MongoDB](#只连接-mongodb)
- [开启内存缓存](#开启内存缓存)
- [开启 Redis 二级缓存与分布式失效](#开启-redis-二级缓存与分布式失效)
- [通过 SSH 隧道连接内网 MongoDB](#通过-ssh-隧道连接内网-mongodb)
- [配置多连接池](#配置多连接池)
- [启用 Model 层](#启用-model-层)
- [按错误码排障](#按错误码排障)

## 只连接 MongoDB

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

适合先验证连接、CRUD 和包入口。缺少 `config.uri` 会抛出 `INVALID_CONFIG`，未 `connect()` 直接访问数据会抛出 `NOT_CONNECTED`。

## 开启内存缓存

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

内存缓存不需要额外服务，适合单进程或本地快速验证。

## 开启 Redis 二级缓存与分布式失效

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

`ioredis` 已随 `monsqlize` 默认安装；这里需要配置的是 Redis 地址和是否启用分布式失效，而不是再安装依赖。

## 通过 SSH 隧道连接内网 MongoDB

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

`ssh2` 已随 `monsqlize` 默认安装。只要传入 `config.ssh`，运行时会建立本地隧道并把 MongoDB 连接转发到内网地址。

## 配置多连接池

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

连接池配置错误会抛出 `INVALID_CONFIG`；指定不存在的池会抛出 `POOL_NOT_FOUND`；所有池不可用会抛出 `INVALID_OPERATION`。

## 启用 Model 层

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

`schema-dsl` 已随 `monsqlize` 默认安装。只有应用代码直接导入 `schema-dsl` 时，才需要在应用自己的依赖里声明它。

## 按错误码排障

```ts
import { ErrorCodes } from 'monsqlize';

try {
    await msq.connect();
} catch (error) {
    const code = (error as { code?: string }).code;
    if (code === ErrorCodes.INVALID_CONFIG) {
        console.error('检查 MonSQLize 构造配置');
    } else if (code === ErrorCodes.CONNECTION_FAILED) {
        console.error('检查 MongoDB 网络、认证和 URI');
    } else {
        throw error;
    }
}
```

更多错误码与处理建议见 [`error-codes.md`](./error-codes.md)。
