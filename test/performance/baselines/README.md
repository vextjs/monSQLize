# 性能基线（回归守卫）

本目录恢复的是 **可持续执行的最小性能基线**，用于发现明显回退；它不是对外宣传材料，也不等价于完整压测体系。

## 当前资产

```text
test/performance/baselines/
├── function-cache.json           # 阈值与场景配置
├── function-cache.benchmark.js   # 可执行 benchmark / regression guard
└── README.md
```

## 当前覆盖场景

### `function-cache hot path`
- 比较同一异步函数在“未缓存”与“缓存命中”路径下的平均耗时
- 验证 `withCache()` 的并发去重能力
- 重点保证：
  - 缓存命中路径明显快于未缓存路径
  - 同 key 并发请求不会触发多次底层执行

## 运行命令

```bash
npm run test:performance
```

## 解释原则

1. **只看回退，不夸数字**：数值主要用于相对比较和阈值守卫。
2. **受控场景优先**：使用受控延迟，避免把机器噪声误判为功能回退。
3. **与 README 分离**：README 只描述当前已恢复的验证资产，不直接引用这里的原始 benchmark 数字做宣传。 

