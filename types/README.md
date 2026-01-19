# Types 模块说明

本目录包含 monSQLize 的所有 TypeScript 类型定义，已按功能模块拆分。

## 📁 目录结构

```
types/
├── base.ts              # 基础类型（ErrorCodes, LoggerLike, ExpressionObject）
├── expression.ts        # 统一表达式操作符（67个操作符）
├── cache.ts             # 缓存接口（CacheLike, MultiLevelCache）
├── options.ts           # 配置选项（BaseOptions, SSH, Transaction）
├── query.ts             # 查询选项（Find, Count, Aggregate, Distinct）
├── write.ts             # 写操作（InsertOne, InsertMany, WriteConcern）
├── batch.ts             # 批量操作（InsertBatch, UpdateBatch, DeleteBatch）
├── pagination.ts        # 分页系统（FindPage, PageResult, Bookmark）
├── stream.ts            # 流式查询（Stream, Explain）
├── transaction.ts       # 事务（Transaction, MongoSession）
├── lock.ts              # 业务锁（Lock, LockOptions）
├── chain.ts             # 链式调用（FindChain, AggregateChain）
├── pool.ts              # 连接池（ConnectionPoolManager, PoolConfig）
├── saga.ts              # Saga事务（SagaOrchestrator, SagaDefinition）
├── sync.ts              # 数据同步（Change Stream, SyncConfig）
├── collection.ts        # Collection API（CollectionAccessor, 所有查询方法）
├── monsqlize.ts         # MonSQLize主类
└── model/               # Model 层
    ├── definition.ts    # Model定义（ModelDefinition, Schema）
    ├── relations.ts     # 关系定义（Populate, RelationConfig）
    ├── virtuals.ts      # 虚拟字段（VirtualConfig）
    ├── instance.ts      # Model实例和静态方法
    └── index.ts         # Model 类型汇总
```

## 🔍 模块依赖关系

```
base.ts (基础)
  ↓
options.ts, query.ts (配置)
  ↓
write.ts, batch.ts, pagination.ts, stream.ts, chain.ts (操作)
  ↓
transaction.ts, lock.ts, pool.ts, saga.ts, sync.ts (功能)
  ↓
collection.ts (集合)
  ↓
model/* (Model层)
  ↓
monsqlize.ts (主类)
  ↓
index.d.ts (统一导出)
```

## 📖 使用指南

### 导入类型

所有类型统一从 `monsqlize` 模块导入：

```typescript
import type { FindOptions, CollectionAccessor, Model } from 'monsqlize';
```

### 查找类型定义

1. **按功能查找**：参考上面的目录结构
2. **使用 IDE**：使用 VS Code 的"转到定义"功能（F12）
3. **全局搜索**：在 `types/` 目录中搜索类型名称

## 🛠️ 开发指南

### 修改类型定义

1. 找到对应的模块文件（如 `types/query.ts`）
2. 修改类型定义
3. 如果是新类型，需要在 `index.d.ts` 中添加导出
4. 运行 `npx tsc --noEmit` 验证编译通过
5. 运行 `npm test` 验证测试通过

### 添加新类型

1. 选择合适的模块文件（或创建新模块）
2. 添加类型定义
3. 在 `index.d.ts` 中添加导出语句
   ```typescript
   export import NewType = ModuleName.NewType;
   ```
4. 验证编译和测试
5. 更新本 README

### 模块划分原则

1. **单一职责**：每个文件只包含相关的类型
2. **依赖清晰**：避免循环依赖
3. **大小适中**：单个文件不超过 500 行
4. **命名规范**：使用 kebab-case（如 `multi-level-cache.ts`）

## 📦 版本历史

- **v1.0.10** (2026-01-19): 将 index.d.ts 拆分为 21 个模块（2932 行 → 21 文件）
- **v1.0.9**: 原始单文件结构（index.d.ts 2932 行）

## 🔗 相关文档

- [CHANGELOG.md](../CHANGELOG.md)
- [CONTRIBUTING.md](../CONTRIBUTING.md)
- [实施方案](../plans/refactoring/ref-types-modularization-v1.0.10-revised.md)

## 📊 统计信息

- **总文件数**: 21 个
- **总代码行数**: ~2500 行（包含注释）
- **模块数**: 17 个主模块 + 4 个 Model 子模块
- **导出类型数**: 100+ 个

## ✅ 质量保证

- ✅ 所有模块通过 TypeScript 编译
- ✅ 保持向后兼容（原有导入方式不变）
- ✅ 完整的依赖关系管理
- ✅ 清晰的模块职责划分

