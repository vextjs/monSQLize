# 缓存自动失效功能测试

本目录包含用于测试 monSQLize 查询缓存自动失效功能的测试脚本。

## 测试脚本

### 1. test-cache-invalidation.js（完整集成测试）

完整的集成测试，验证缓存在实际 MongoDB 环境中的自动失效功能。

**测试内容：**
- ✅ TTL 自动过期 - 验证缓存在 TTL 到期后会自动失效
- ✅ insertOne 自动失效 - 验证插入操作会自动失效相关缓存
- ✅ updateOne 自动失效 - 验证更新操作会自动失效相关缓存
- ✅ deleteOne 自动失效 - 验证删除操作会自动失效相关缓存

**运行方式：**

```bash
# 方式 1：使用 MongoDB Memory Server（需要网络连接）
node test-cache-invalidation.js

# 方式 2：使用本地 MongoDB 实例
MONGODB_URI="mongodb://localhost:27017" node test-cache-invalidation.js

# 方式 3：使用远程 MongoDB 实例
MONGODB_URI="mongodb://username:password@host:port" node test-cache-invalidation.js
```

**注意事项：**
- MongoDB Memory Server 需要网络连接来下载 MongoDB 二进制文件
- 如果在没有网络的环境中，请使用本地或远程 MongoDB 实例

### 2. test-cache-invalidation-mock.js（Mock 测试）

基于 Mock 的单元测试，不需要 MongoDB 实例，用于验证缓存失效的核心逻辑。

**测试内容：**
- ✅ TTL 自动过期逻辑
- ✅ 模式匹配删除（模拟写操作失效）
- ✅ 缓存统计信息

**运行方式：**

```bash
node test-cache-invalidation-mock.js
```

**优点：**
- 无需 MongoDB 实例
- 运行速度快
- 可以在任何环境中运行

## 预期输出

### test-cache-invalidation.js 预期输出：

```
🚀 开始测试缓存自动失效功能

=== 测试 1: TTL 自动过期 ===
第一次查询: 2 条记录 (缓存 MISS)
第二次查询: 2 条记录 (缓存 HIT)
等待 2.5 秒...
第三次查询: 2 条记录 (缓存 MISS - TTL 过期)
✓ TTL 自动过期测试通过

=== 测试 2: insertOne 自动失效 ===
查询前: 2 条记录 (缓存)
插入新记录: Charlie
查询后: 3 条记录 (缓存已自动失效)
✓ insertOne 自动失效测试通过

=== 测试 3: updateOne 自动失效 ===
更新前: Alice 的 age = 25
更新 Alice 的 age 为 26
更新后: Alice 的 age = 26 (缓存已自动失效)
✓ updateOne 自动失效测试通过

=== 测试 4: deleteOne 自动失效 ===
删除前: 3 条记录
删除 Charlie
删除后: 2 条记录 (缓存已自动失效)
✓ deleteOne 自动失效测试通过

✅ 所有测试通过！
```

### test-cache-invalidation-mock.js 预期输出：

```
🚀 开始测试缓存逻辑（Mock版本）

=== 测试 1: TTL 自动过期 ===
第一次设置缓存 (TTL = 2秒)
立即获取: 缓存 HIT (hits: 1, misses: 0)
等待 2.5 秒...
TTL过期后获取: 缓存 MISS (hits: 1, misses: 1)
✓ TTL 自动过期测试通过

=== 测试 2: 模式匹配删除（写操作失效） ===
设置了 4 个缓存键
缓存状态: users查询1=true, users查询2=true, users查询3=true, other查询=true
执行模式删除 (*collection:users*): 删除了 3 个键
删除后状态: users查询1=false, users查询2=false, users查询3=false, other查询=true
✓ 模式匹配删除测试通过

=== 测试 3: 缓存统计信息 ===
初始统计: hits=0, misses=0, sets=0, deletes=0
最终统计: hits=2, misses=1, sets=2, deletes=1
✓ 缓存统计信息测试通过

✅ 所有缓存逻辑测试通过！

💡 提示：运行完整的集成测试请使用 `node test-cache-invalidation.js`
```

## 技术实现

### TTL 自动过期

monSQLize 的缓存系统使用惰性过期策略：
- 缓存条目存储 `expireAt` 时间戳
- 在 `get()` 操作时检查是否过期
- 过期的条目会被自动删除并返回 `undefined`

### 写操作自动失效

写操作（insertOne、updateOne、deleteOne）会自动失效相关缓存：
1. 写操作完成后，调用 `cache.delPattern()` 删除匹配的缓存键
2. 使用命名空间模式匹配：`*{iid}:{type}:{db}:{collection}*`
3. 删除该集合的所有查询缓存（find、findOne、count 等）

### 缓存统计

缓存实例维护详细的统计信息：
- `hits` - 缓存命中次数
- `misses` - 缓存未命中次数
- `sets` - 设置缓存次数
- `deletes` - 删除缓存次数
- `evictions` - 淘汰次数（LRU）
- `memoryUsage` - 内存使用量（估算）

## 故障排除

### MongoDB Memory Server 下载失败

**错误信息：**
```
Could NOT download "https://fastdl.mongodb.org/..."
getaddrinfo ENOTFOUND fastdl.mongodb.org
```

**解决方案：**
1. 使用本地 MongoDB 实例：
   ```bash
   # 启动本地 MongoDB
   mongod
   
   # 运行测试
   MONGODB_URI="mongodb://localhost:27017" node test-cache-invalidation.js
   ```

2. 或者运行 Mock 测试：
   ```bash
   node test-cache-invalidation-mock.js
   ```

### 测试超时

如果测试因超时失败，可能是因为：
- MongoDB 连接速度慢
- Memory Server 下载速度慢

**解决方案：**
- 使用本地 MongoDB 实例
- 增加超时时间（修改测试代码）

## 相关文档

- [monSQLize 缓存文档](../docs/cache.md)
- [monSQLize API 文档](../README.md)
