# 路线图边界说明

## 当前明确支持

monSQLize 当前是 **MongoDB 增强层**，包括：

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

- 可以说“长期愿景是统一查询语法”。
- 必须同时明确“**当前正式支持范围仅为 MongoDB**”。
- 新增文档或示例时，不得把路线图能力写成当前可用能力。
