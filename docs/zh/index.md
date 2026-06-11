---
pageType: home

hero:
  badge: v2.0.3 TypeScript 正式版
  name: monSQLize
  text: TypeScript MongoDB 增强引擎
  tagline: 保留 MongoDB 原生体验，整合 cache-hub 两级缓存、多连接池路由、Saga 编排与可选 Model 层。
  image:
    src: /hero-mark.svg
    alt: monSQLize hero mark
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/getting-started.html
    - theme: alt
      text: 示例
      link: /zh/examples.html
    - theme: alt
      text: API 参考
      link: /zh/api-index.html
    - theme: alt
      text: GitHub
      link: https://github.com/vextjs/monSQLize

features:
  - icon: ⚡
    title: 智能两级缓存
    details: L1 内存 LRU 加可选 L2 Redis，基于 cache-hub 提供模式化失效与分布式缓存同步。
    link: /zh/cache-and-function-cache.html
  - icon: 🔎
    title: 56+ 增强查询方法
    details: findPage、findAndCount、stream、explain、ID 便利方法与链式 builder，不偏离 MongoDB 语义。
    link: /zh/api-index.html
  - icon: 🏢
    title: 生产级运行能力
    details: 分布式锁、SSH 隧道、Change Stream 同步、慢查询日志，外部服务均通过显式配置启用。
    link: /zh/capability-index.html
  - icon: 🌐
    title: 多连接池与读写分离
    details: 支持池路由、负载均衡、故障转移，以及 pool().use().scopedCollection() 链式访问。
    link: /zh/multi-pool.html
  - icon: 🧩
    title: 可选 Model 层
    details: Schema 验证、生命周期 hooks、Relations 与 Populate 支持，可渐进式接入。
    link: /zh/model.html
  - icon: 🔷
    title: 完整 TypeScript
    details: 类型化运行时 API、v1 兼容守卫，以及 CJS/ESM/类型定义的统一发布出口。
    link: /zh/getting-started.html
  - icon: 🔄
    title: Saga 事务
    details: 面向多步骤业务流程的编排能力，支持显式补偿与回滚语义。
    link: /zh/saga-transaction.html
  - icon: 📊
    title: 慢查询日志
    details: 支持可配置阈值的慢查询检测，并内置 MongoDB 与内存存储适配器。
    link: /zh/slow-query-log.html
  - icon: 🔗
    title: 链式查询 API
    details: find().where().select().sort().skip().limit().lean() 流式 builder，兼顾表达力与类型推断。
    link: /zh/chaining-api.html
---
