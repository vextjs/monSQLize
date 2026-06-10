---
pageType: home

hero:
  name: monSQLize
  text: Node.js MongoDB 增强引擎
  tagline: Full TypeScript · 56+ 增强方法 · 多连接池 · Saga · 缓存 · 100% v1 兼容
  image:
    src: /favicon.svg
    alt: monSQLize logo
  actions:
    - theme: brand
      text: 🚀 快速开始
      link: /zh/getting-started
    - theme: alt
      text: 🧪 示例
      link: /zh/examples
    - theme: alt
      text: 📖 API 参考
      link: /zh/api-index
    - theme: alt
      text: ⭐ GitHub
      link: https://github.com/vextjs/monSQLize

features:
  - title: ⚡ 智能两级缓存
    details: L1 内存 LRU + L2 Redis，无需改动业务代码即可接入。内置模式化失效与分布式缓存同步。
    link: /zh/cache-and-function-cache
  - title: 🔎 56+ 增强查询方法
    details: findPage（游标 / offset 分页）、findOneById、findByIds、findAndCount、stream、explain 等完整 MongoDB 查询扩展。
    link: /zh/api-index
  - title: 🏢 企业级分布式能力
    details: 分布式锁、SSH 隧道、Saga 分布式事务、Change Stream 同步、慢查询日志；运行时依赖默认安装，外部服务通过显式配置启用。
    link: /zh/capability-index
  - title: 🌐 多连接池与读写分离
    details: 支持负载均衡、自动故障转移，以及 pool().use().scopedCollection() 链式访问，适合高级多数据库架构。
    link: /zh/multi-pool
  - title: 🧩 可选 Model 层
    details: Schema 验证、生命周期 hooks 与 Populate 关联。支持渐进式采用，不要求改写既有代码。
    link: /zh/model
  - title: 🔷 完整 TypeScript
    details: 完整类型声明、v1 兼容守卫与当前功能验证路径；可与 Mongoose 或 MongoDB 原生 driver 项目并存。
    link: /zh/getting-started
  - title: 🔄 Saga 事务
    details: 支持自动补偿的分布式 Saga 编排，可用回滚语义定义多步骤业务流程。
    link: /zh/saga-transaction
  - title: 📊 慢查询日志
    details: 自动检测和记录慢查询，支持可配置阈值，并包含 MongoDB 与内存存储适配器。
    link: /zh/slow-query-log
  - title: 🔗 链式查询 API
    details: 流式 builder API：find().where().select().sort().skip().limit().lean()，以完整 TypeScript 推断组合复杂查询。
    link: /zh/chaining-api
---
