# 路线图边界说明

## 产品定位

monSQLize 是**面向 TypeScript 服务的多数据库生产数据运行时增强层**。

当前稳定适配器是 MongoDB。MySQL 与 PostgreSQL 将作为后续数据库原生 adapter 接入同一运行时契约。这里统一的是生产运行时能力：缓存一致性、连接生命周期、事务与锁编排、模型约束、业务流程、同步与可观测性。

## Adapter 状态

| Adapter | 状态 | 说明 |
|---------|------|------|
| MongoDB | Stable | 当前生产可用稳定适配器 |
| MySQL | Planned / in development | 尚不属于当前 npm runtime |
| PostgreSQL | Planned / in development | 尚不属于当前 npm runtime |

## 当前明确支持

当前 MongoDB adapter 包括：

- MongoDB 查询扩展
- Cache / Function Cache
- Model
- Transaction / Lock / Saga
- Pool / Sync / Slow Query Log

## 当前明确不支持

以下内容仍是路线图，不属于当前版本交付承诺：

- MySQL 运行时支持
- PostgreSQL 运行时支持
- “一套查询语法自动适配所有数据库”的生产可用实现

## 为什么要写清楚

README 中保留了长期愿景，但实际交付必须和当前验证资产一致。否则用户会误以为：

1. 当前 npm 包已经支持非 MongoDB 数据库；
2. 只要改配置就能无缝切换到底层 SQL 数据库。

## 对外表达规则

- 可以说“MySQL 与 PostgreSQL 将作为数据库原生 runtime adapter 接入”。
- 必须同时明确“**当前正式支持范围仅为 MongoDB**”。
- 新增文档或示例时，不得把路线图能力写成当前可用能力。
- 不要承诺 SQL adapter 会透明伪装成 MongoDB 方言。等 SQL adapter 接入时，SQL 查询、事务、prepared statement 与连接上下文语义都必须保持显式。
