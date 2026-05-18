# monSQLize 性能基线报告

**测试日期**: 2025-11-06  
**版本**: v0.1.0  
**测试环境**:
- Node.js: v20.19.4
- MongoDB: Memory Server
- OS: Windows 11
- 测试数据规模: Users (1000条) + Products (500条)

---

## 📊 性能排行（按 ops/sec 降序）

| 排名 | 测试项 | ops/sec | RME |
|------|--------|---------|-----|
| 1 | findOne - 带缓存 | 14,763 | ±1.16% |
| 2 | count - 带缓存 | 14,723 | ±0.97% |
| 3 | count - 空查询（estimatedDocumentCount） | 6,647 | ±5.74% |
| 4 | find - 查询 10 条 | 3,706 | ±3.91% |
| 5 | findOne - 简单查询 | 3,361 | ±5.65% |
| 6 | distinct - 去重查询 | 1,673 | ±1.83% |
| 7 | findPage - 游标分页（after） | 1,563 | ±1.59% |
| 8 | findPage - 跳页分页（page=1） | 1,537 | ±1.90% |
| 9 | find - 查询 50 条 | 1,404 | ±5.25% |
| 10 | aggregate - 简单聚合 | 1,287 | ±1.77% |
| 11 | aggregate - 复杂聚合 | 1,012 | ±1.33% |
| 12 | count - 条件查询 | 994 | ±1.63% |
| 13 | find - 带排序 | 393 | ±4.32% |

---

## 🔍 关键观察

### 1. 缓存效果显著
- **findOne 带缓存**: 14,763 ops/sec vs 简单查询 3,361 ops/sec → **4.4倍提升** 🚀
- **count 带缓存**: 14,723 ops/sec vs 条件查询 994 ops/sec → **14.8倍提升** 🚀
- **缓存命中率**: 接近100%（Memory Server无网络延迟，纯计算性能）

### 2. find 性能特征
- **查询量影响**: 10条 (3,706 ops/sec) vs 50条 (1,404 ops/sec) → **2.6倍差距**
- **排序代价**: 带排序 (393 ops/sec) vs 10条无排序 (3,706 ops/sec) → **9.4倍下降**
- **最佳实践**: 小批量查询 + 避免复杂排序

### 3. count 性能特征
- **estimatedDocumentCount**: 6,647 ops/sec（最快，无条件统计）
- **countDocuments**: 994 ops/sec（带条件，需要扫描）
- **差距**: 6.7倍，优先使用 estimatedDocumentCount

### 4. 分页性能对比
- **游标分页 (after)**: 1,563 ops/sec
- **跳页分页 (page=1)**: 1,537 ops/sec
- **结论**: 两种分页策略性能接近，游标分页略快 1.7%

### 5. 聚合管道性能
- **简单聚合**: 1,287 ops/sec（1个 $match + 1个 $group）
- **复杂聚合**: 1,012 ops/sec（$match + $group + $sort）
- **差距**: 27%，多一个 $sort 阶段导致性能下降

---

## 📈 性能分层

### 🟢 高性能区 (>10,000 ops/sec)
- findOne - 带缓存
- count - 带缓存
- **特点**: 缓存直接命中，无数据库查询

### 🟡 中等性能区 (1,000-10,000 ops/sec)
- count - 空查询
- find - 查询 10 条
- findOne - 简单查询
- distinct - 去重查询
- findPage - 游标/跳页分页
- find - 查询 50 条
- aggregate - 简单/复杂聚合
- count - 条件查询
- **特点**: 实际数据库操作，性能依赖查询复杂度

### 🔴 低性能区 (<1,000 ops/sec)
- find - 带排序 (393 ops/sec)
- **特点**: 涉及全表扫描或复杂计算

---

## 💡 性能优化建议

### 1. 充分利用缓存
```javascript
// ✅ 推荐：为读多写少的查询开启缓存
collection('users').findOne({ query: { userId: 'xxx' }, cache: 60000 });
collection('products').count({ query: { status: 'active' }, cache: 300000 });
```

### 2. 限制 find 返回数量
```javascript
// ❌ 避免：无限制查询
collection('users').find({ query: { status: 'active' } });

// ✅ 推荐：始终指定 limit
collection('users').find({ query: { status: 'active' }, limit: 100 });
```

### 3. 优先使用 estimatedDocumentCount
```javascript
// ❌ 慢：带条件统计
collection('users').count({ query: {} });  // 994 ops/sec

// ✅ 快：无条件统计
collection('users').count();  // 6,647 ops/sec
```

### 4. 避免复杂排序
```javascript
// ❌ 慢：带排序查询
collection('users').find({ 
    query: { status: 'active' }, 
    sort: { createdAt: -1 }, 
    limit: 20 
});  // 393 ops/sec

// ✅ 快：简单查询 + 应用层排序（小数据集）
const results = await collection('users').find({ 
    query: { status: 'active' }, 
    limit: 20 
});  // 3,706 ops/sec
results.sort((a, b) => b.createdAt - a.createdAt);
```

### 5. 分页策略选择
```javascript
// 游标分页和跳页分页性能接近
// 选择依据：业务需求而非性能

// 游标分页：适合无限滚动
collection('products').findPage({ 
    query: {}, 
    sort: { _id: 1 }, 
    limit: 20, 
    after: lastId 
});

// 跳页分页：适合传统翻页
collection('products').findPage({ 
    query: {}, 
    sort: { _id: 1 }, 
    limit: 20, 
    page: 1 
});
```

---

## 🎯 基线用途

本基线用于：
1. **性能回归测试**: 代码改动后对比性能变化
2. **优化效果验证**: 优化后量化性能提升
3. **瓶颈识别**: 识别慢查询场景
4. **容量规划**: 估算系统吞吐量

**运行基准测试**:
```bash
npm run benchmark
```

**环境说明**:
- 本基线基于 MongoDB Memory Server
- 生产环境性能取决于：网络延迟、磁盘 IO、索引、数据规模
- 建议在生产环境测量实际性能指标

---

**生成时间**: 2025-11-06  
**下次更新**: 重大性能优化后或版本 v0.2.0
