---
pageType: home

hero:
  badge: v2.0.4 TypeScript release
  name: monSQLize
  text: TypeScript MongoDB Engine
  tagline: MongoDB-native APIs with cache-hub L1/L2 caching, multi-pool routing, Saga workflows, and schema-ready models.
  image:
    src: /hero-mark.svg
    alt: monSQLize hero mark
  actions:
    - theme: brand
      text: Quick Start
      link: /getting-started.html
    - theme: alt
      text: Examples
      link: /examples.html
    - theme: alt
      text: API Reference
      link: /api-index.html
    - theme: alt
      text: GitHub
      link: https://github.com/vextjs/monSQLize

features:
  - icon: ⚡
    title: Smart Two-Level Cache
    details: L1 memory LRU plus optional L2 Redis, powered by cache-hub with pattern invalidation and distributed sync.
    link: /cache-and-function-cache.html
  - icon: 🔎
    title: 56+ Enhanced Query Methods
    details: findPage, findAndCount, stream, explain, ID helpers, and chain builders without leaving MongoDB semantics.
    link: /api-index.html
  - icon: 🏢
    title: Production Runtime Capabilities
    details: Distributed locks, SSH tunnels, Change Stream sync, slow-query logging, and explicit opt-in external services.
    link: /capability-index.html
  - icon: 🌐
    title: Multi-Pool & Read/Write Split
    details: Pool routing, load balancing, failover, and pool().use().scopedCollection() access for advanced database layouts.
    link: /multi-pool.html
  - icon: 🧩
    title: Optional Model Layer
    details: Schema validation, lifecycle hooks, relations, and Populate support that can be adopted gradually.
    link: /model.html
  - icon: 🔷
    title: Full TypeScript
    details: Typed runtime APIs, v1 compatibility guards, and CJS/ESM/type publishing from a single validated source.
    link: /getting-started.html
  - icon: 🔄
    title: Saga Transactions
    details: Multi-step workflow orchestration with explicit compensation and rollback semantics across services.
    link: /saga-transaction.html
  - icon: 📊
    title: Slow-Query Logging
    details: Configurable slow-query detection with MongoDB and memory storage adapters.
    link: /slow-query-log.html
  - icon: 🔗
    title: Chain Query API
    details: Fluent find().where().select().sort().skip().limit().lean() builders with TypeScript inference.
    link: /chaining-api.html
---
