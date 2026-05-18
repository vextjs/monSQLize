# 性能基准测试

本目录包含 monSQLize 的性能基准测试。

## 运行基准测试

### 前提条件
1. MongoDB 服务运行中
2. 已安装依赖: `npm install`

### 执行测试
```bash
npm run benchmark
```

或指定 MongoDB 连接：
```bash
MONGODB_URI=mongodb://localhost:27017 npm run benchmark
```

## 测试场景

### 1. findOne 性能测试
- **simple query**: 简单查询（无缓存）
- **with cache**: 带缓存查询

### 2. find 性能测试
- **limit 10**: 小批量查询
- **limit 100**: 中批量查询

### 3. findPage 性能测试
- **first page**: 首页查询
- **cursor pagination**: 游标分页
- **jump pagination**: 跳页查询

### 4. count 性能测试
- **simple**: 简单统计
- **with query**: 带查询条件统计

### 5. 缓存效率测试
- **cache hit**: 缓存命中性能
- **cache miss**: 缓存未命中性能

## 性能指标

### 关键指标
- **ops/sec**: 每秒操作数（越高越好）
- **ms/op**: 每次操作耗时（越低越好）
- **±RME**: 相对误差百分比（越低越稳定）

### 性能目标
| 操作 | 目标 ops/sec | 目标 ms/op | 状态 |
|------|-------------|-----------|------|
| findOne (simple) | >500 | <2ms | 待测试 |
| findOne (cache) | >5000 | <0.2ms | 待测试 |
| find (limit 10) | >300 | <3ms | 待测试 |
| findPage | >200 | <5ms | 待测试 |
| count | >1000 | <1ms | 待测试 |

## 性能优化建议

### 查询优化
1. 使用索引覆盖查询
2. 合理设置 maxTimeMS
3. 避免深度分页（使用游标）

### 缓存优化
1. 合理设置 TTL
2. 使用多层缓存
3. 监控缓存命中率

### 连接优化
1. 复用连接
2. 设置合理的连接池大小
3. 使用跨库访问而非重新连接

## 添加新的基准测试

编辑 `run-benchmarks.js`，添加新的测试用例：

```javascript
suite.add('your test name', {
    defer: true,
    fn: async function(deferred) {
        // 你的测试代码
        await testCollection.yourMethod({ ... });
        deferred.resolve();
    },
});
```

## 持续集成

基准测试结果应定期记录，用于检测性能回归：

```bash
# 运行并保存结果
npm run benchmark > benchmarks/results-$(date +%Y%m%d).txt
```

## 参考

- [Benchmark.js 文档](https://benchmarkjs.com/)
- [性能测试最佳实践](https://github.com/goldbergyoni/nodebestpractices#6-performance-best-practices)

