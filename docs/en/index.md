---
pageType: home

hero:
  name: monSQLize
  text: The MongoDB Powerhouse for Node.js
  tagline: Full TypeScript - 56+ Enhanced Methods - Multi-Pool - Saga - Caching - 100% v1 Compatible
  image:
    src: /favicon.svg
    alt: monSQLize logo
  actions:
    - theme: brand
      text: 🚀 Quick Start
      link: /getting-started
    - theme: alt
      text: 🧪 Examples
      link: /examples
    - theme: alt
      text: 📖 API Reference
      link: /api-index
    - theme: alt
      text: ⭐ GitHub
      link: https://github.com/vextjs/monSQLize

features:
  - title: ⚡ Smart Two-Level Cache
    details: L1 in-memory (LRU) + L2 Redis with zero code changes. Query performance boost 10~100×. Pattern-based invalidation, distributed cache sync built-in.
    link: /cache-and-function-cache
  - title: 🔎 56+ Enhanced Query Methods
    details: findPage (cursor/offset pagination), findOneById, findByIds, findAndCount, stream, explain and more — the most complete MongoDB query extension set.
    link: /api-index
  - title: 🏢 Enterprise-Grade Distributed
    details: Distributed locks, SSH tunnels, Saga distributed transactions, Change Stream sync, slow-query logging — runtime dependencies are installed by default, with external services enabled through explicit configuration.
    link: /capability-index
  - title: 🌐 Multi-Pool & Read/Write Split
    details: Load balancing, automatic failover, and pool().use().scopedCollection() chain access for advanced multi-database architectures.
    link: /multi-pool
  - title: 🧩 Optional Model Layer
    details: Schema validation, lifecycle hooks, and Populate associations (6 methods). Progressive adoption — drop in without touching existing code.
    link: /model
  - title: 🔷 Full TypeScript
    details: Complete type declarations, v1 compatibility guards, and current functional validation paths. Works side-by-side with Mongoose or native driver projects.
    link: /getting-started
  - title: 🔄 Saga Transactions
    details: Distributed saga orchestration with automatic compensation. Define multi-step workflows with rollback semantics across services.
    link: /saga-transaction
  - title: 📊 Slow-Query Logging
    details: Automatic slow-query detection and logging with configurable thresholds. MongoDB and in-memory storage adapters included.
    link: /slow-query-log
  - title: 🔗 Chain Query API
    details: Fluent builder API — find().where().select().sort().skip().limit().lean() — composes complex queries with full TypeScript inference.
    link: /chaining-api
---
