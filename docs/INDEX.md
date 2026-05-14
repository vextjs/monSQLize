---
pageType: home

hero:
  name: monSQLize
  text: 统一数据库查询语法框架
  tagline: MongoDB 增强层 · 10~100x 性能 · 企业级特性 · 零学习成本
  actions:
    - theme: brand
      text: 快速开始
      link: /getting-started
    - theme: alt
      text: API 参考
      link: /api-index
    - theme: alt
      text: GitHub
      link: https://github.com/vextjs/monsqlize

features:
  - title: 智能缓存
    details: L1 内存（LRU）+ L2 Redis 两级缓存，业务代码零改动，查询性能提升 10~100 倍。
  - title: 56+ 增强方法
    details: findPage、findOneById、findByIds、findAndCount、stream、explain 等业界最完整的查询扩展集。
  - title: 企业级分布式
    details: 内置分布式锁、SSH 隧道、Saga 事务、Change Stream 同步、慢查询日志，零配置开箱即用。
  - title: 多连接池
    details: 读写分离、负载均衡、故障自动转移，支持 pool().use().scopedCollection() 链式访问。
  - title: 可选 Model 层
    details: Schema 验证、Hooks、Populate 关联查询（6 个方法支持），渐进式接入，不影响已有代码。
  - title: TypeScript 友好
    details: 完整类型声明，100% v1 API 兼容，可与现有 mongoose / 原生驱动项目平滑共存。
---
