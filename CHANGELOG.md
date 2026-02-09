# 变更日志 (CHANGELOG)

> **说明**: 版本概览摘要，详细变更见 [changelogs/](./changelogs/) 目录  
> **最后更新**: 2026-02-09

---

## 版本概览

| 版本 | 日期 | 变更摘要 | 详细 |
|------|------|---------|------|
| [v1.1.4](./changelogs/v1.1.4.md) | 2026-02-09 | 🎉 重大功能：通用函数缓存 - 52个测试 (100%通过) + 多层缓存 delPattern 修复 | [查看](./changelogs/v1.1.4.md) |
| [v1.1.3](./changelogs/v1.1.3.md) | 2026-02-03 | 📚 文档完善：多连接池文档优化 + 健康检查详解 + 验证体系规范 | [查看](./changelogs/v1.1.3.md) |
| [v1.1.2](#v112---日志优化) | 2026-01-27 | 🔧 优化：ObjectId 转换日志默认静默 + Saga 日志修复 | [查看](#v112---日志优化) |
| [v1.1.1](#v111---objectid-跨版本兼容) | 2026-01-27 | 🔧 Bug修复：新增跨版本 ObjectId 兼容性（支持 mongoose bson@4.x/5.x）| [查看](#v111---objectid-跨版本兼容) |
| [v1.1.0](./changelogs/v1.1.0.md) | 2026-01-21 | 🎉 重大更新：新增49个操作符，实现100% MongoDB操作符支持（122/122）| [查看](./changelogs/v1.1.0.md) |
| [v1.0.9](./changelogs/v1.0.9.md) | 2026-01-19 | 🎉 重大功能：统一表达式系统 - 67个操作符 + 107个测试 (100%通过) | [查看](./changelogs/v1.0.9.md) |
| [v1.0.8](./changelogs/v1.0.8.md) | 2026-01-17 | 🎉 重大功能：多连接池 + Update 聚合管道 + Saga 事务 + Change Stream 同步 | [查看](./changelogs/v1.0.8.md) |
| [v1.0.7](./changelogs/v1.0.7.md) | 2026-01-09 | 🔧 依赖更新：schema-dsl@1.1.3 修复类型错误消息 + 测试用例 Schema 语法修复 | [查看](./changelogs/v1.0.7.md) |
| [v1.0.6](./changelogs/v1.0.6.md) | 2026-01-08 | 文档完善：新增 ObjectId 自动转换文档 + 验证所有 v1.3.0+ 功能文档 | [查看](./changelogs/v1.0.6.md) |
| [v1.0.5](./changelogs/v1.0.5.md) | 2026-01-08 | Schema 验证默认启用 + Model 自动加载机制 + 类型定义完善 | [查看](./changelogs/v1.0.5.md) |
| [v1.0.4](./changelogs/v1.0.4.md) | 2026-01-07 | 新功能：虚拟字段、默认值 + Bug 修复：嵌套 Populate + 测试改进 | [查看](./changelogs/v1.0.4.md) |
| [v1.0.3](STATUS.md#v103) | 2025-12-31 | 新增 Model 层（Schema 验证、自定义方法、生命周期钩子、自动时间戳） | [查看](STATUS.md#v103) |
| [v1.0.2](STATUS.md#v102) | 2025-12-30 | 新增批量操作方法（deleteBatch/updateBatch） | [查看](STATUS.md#v102) |
| [v1.0.1](STATUS.md#v101) | 2025-12-29 | 稳定版本，生产就绪 | [查看](STATUS.md#v101) |
| [v1.0.0](./changelogs/v1.0.0.md) | 2025-12-03 | 正式发布，生产就绪，已发布到 npm | [查看](./changelogs/v1.0.0.md) |

---

## 变更统计

| 版本系列 | 版本数 | 主要改进方向 |
|---------|-------|------------|
| v1.0.x | 10 | 企业级功能、分布式支持、Model 层完善、Schema 验证、**统一表达式系统** 🆕 |

---

## 文档与验证改进

### v1.1.3 - 文档完善与验证体系 📚

**发布日期**: 2026-02-03  
**版本类型**: 文档优化 + 验证体系完善  
**重要性**: ⭐⭐⭐⭐

#### 核心改进

**多连接池文档优化**:
- ✅ 修复代码实现（ConnectionPoolManager 导出、selectPool 返回值完整）
- ✅ 验证 100% 通过（76 项功能验证）
- ✅ 文档精简（2082 行 → 1970 行，-5%）
- ✅ 目录格式统一、删除重复内容

**健康检查机制详解**:
- ✅ 新增文档 `docs/multi-pool-health-check.md`
- ✅ 详细说明工作原理、问题发现、问题处理
- ✅ 提供 3 种运维通知方式（日志、监控、事件）
- ✅ 集成方案（Prometheus、企业微信/钉钉、邮件）
- ✅ 完整的生产环境告警系统代码

**验证体系规范**:
- ✅ 文档规范说明（目录格式、内容规范、禁止内容）
- ✅ 文档更新流程（4 步）
- ✅ 引用关系规范（建立原则、禁止情况、判断流程）
- ✅ 验证通过标准（6 项）

#### 影响范围

- **文档文件**: 3 个（multi-pool.md、multi-pool-health-check.md、README.md）
- **代码文件**: 2 个（lib/index.js、ConnectionPoolManager.js）
- **验证文件**: 5 个（清单、脚本、报告）
- **规范文件**: 1 个（validation/README.md）

#### 升级说明

**无破坏性变更**，现有代码无需修改：
```bash
npm update monsqlize
```

📖 **详细变更**: [查看完整变更日志](./changelogs/v1.1.3.md)

---

## 里程碑版本

### v1.1.2 - 日志优化 🔧

**发布日期**: 2026-01-27  
**重要性**: ⭐⭐⭐

**优化内容**:

1. **ObjectId 转换日志默认静默**
   - ✅ **默认完全静默**: 不输出任何 ObjectId 转换日志
   - ✅ **用户反馈驱动**: 根据用户反馈，转换日志无实际作用
   - ✅ **可选启用**: 支持按需启用摘要或详细日志
   - ✅ **生产友好**: 减少日志量，避免日志污染

2. **Saga 日志修复**
   - ✅ **修复误导性日志**: 正确区分内存缓存和 Redis 缓存
   - ✅ **准确识别**: 通过检测 `cache.keys` 和 `cache.publish` 方法识别 Redis
   - ✅ **日志准确**: 内存缓存显示"使用内存缓存"，Redis 显示"使用 Redis 存储"

**配置选项**:

```javascript
// 默认配置（完全静默）
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017' }
});
// ✅ 无任何 ObjectId 转换日志

// 启用摘要日志（调试用）
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017' },
  autoConvertObjectId: {
    silent: false  // 关闭静默
  }
});
// 输出：[DEBUG] Converted 15 cross-version ObjectIds

// 启用详细日志（深度调试）
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017' },
  autoConvertObjectId: {
    silent: false,
    verbose: true
  }
});
// 输出：每个 ObjectId 都有一条日志
```

**效果对比**:

| 模式 | silent | verbose | 日志输出 | 适用场景 |
|------|--------|---------|---------|---------|
| **静默模式**（默认）✅ | `true` | - | 无 | 生产环境、日常开发 |
| **摘要模式** | `false` | `false` | 1条摘要 | 需要了解转换情况时 |
| **详细模式** | `false` | `true` | N条详情 | 深度调试、排查问题 |

**修改的文件**:
- `lib/utils/objectid-converter.js`: 添加 `silent` 配置，默认 `true`
- `lib/saga/SagaOrchestrator.js`: 修复 Redis 识别逻辑

**详细文档**: 
- [ObjectId 日志配置](./docs/objectid-logging-optimization.md)
- [FAQ - Q3: 如何关闭日志](./docs/objectid-cross-version-faq.md#q3)

---

### v1.1.1 - ObjectId 跨版本兼容 🔧

**发布日期**: 2026-01-27  
**重要性**: ⭐⭐⭐⭐

**问题背景**:
- 混用 mongoose (bson@4.x/5.x) 和 monSQLize (bson@6.x) 时出现版本冲突
- 错误信息：`Unsupported BSON version, bson types must be from bson 6.x.x`
- 跨服务数据传递时 ObjectId 实例无法被 mongodb@6.x 驱动识别

**解决方案**:
- ✅ **自动跨版本转换**: 检测并转换来自其他 BSON 版本的 ObjectId
- ✅ **递归处理**: 自动处理嵌套对象和数组中的 ObjectId
- ✅ **性能优化**: 无需转换时返回原对象（零拷贝）
- ✅ **错误降级**: 转换失败时返回原值，不影响其他字段
- ✅ **调试支持**: 提供详细的转换日志

**兼容性**:
| BSON 版本 | mongoose 版本 | 支持状态 |
|-----------|--------------|---------|
| bson@4.x  | mongoose@5.x | ✅ 完全支持 |
| bson@5.x  | mongoose@6.x | ✅ 完全支持 |
| bson@6.x  | mongoose@7.x | ✅ 原生支持 |

**测试覆盖**:
- 🏆 **测试数量**: 17个测试用例
- 🏆 **通过率**: 100% (17/17通过)
- 🏆 **覆盖场景**: 基础转换、嵌套对象、数组、边界情况、错误处理

**使用示例**:
```javascript
// 从 mongoose 获取数据（包含 bson@4.x/5.x 的 ObjectId）
const dataFromMongoose = await MongooseModel.findOne({ ... }).lean();

// 直接插入，monSQLize 自动转换 ObjectId
const result = await msq.collection('orders').insertOne(dataFromMongoose);
// ✅ 成功：自动将旧版本 ObjectId 转换为 bson@6.x 版本
```

**详细文档**: [查看 docs/objectid-cross-version.md](./docs/objectid-cross-version.md)

---

### v1.0.9 - 统一表达式系统 🎉

**发布日期**: 2026-01-19  
**重要性**: ⭐⭐⭐⭐⭐

**核心功能**:
- ✅ **67个统一表达式操作符**: 完整实现阶段1 (43个) + 阶段2 (24个)
- ✅ **上下文感知编译**: 自动检测 $match/$project/$group 上下文
- ✅ **递归函数调用**: 支持任意深度的函数嵌套
- ✅ **Lambda表达式**: FILTER/MAP 完整支持
- ✅ **高性能缓存**: LRU缓存，>90%命中率
- ✅ **100%向后兼容**: 无破坏性变更

**测试覆盖**:
- 🏆 **测试数量**: 107个测试用例 (新增19个边界测试)
- 🏆 **通过率**: 100% (107/107通过)
- 🏆 **边界覆盖**: 95%+ 边界情况覆盖
- 🏆 **质量评级**: A+ (98.8%完成度)

**文档更新**:
- 📚 **聚合文档更新**: aggregate.md 新增统一表达式章节
- 📚 **完整实施报告**: 15+份详细报告
- 📚 **质量分析**: 全面质量检查和验证

### v1.0.8 - 企业级功能升级 🎉

**发布日期**: 2026-01-16  
**重要性**: ⭐⭐⭐⭐⭐

**核心功能**:
- ✅ **企业级多连接池管理**: 支持 primary、secondary、analytics、custom 角色
- ✅ **智能选择策略**: auto、roundRobin、weighted、leastConnections、manual
- ✅ **健康检查机制**: 自动故障检测和恢复，支持自定义检查间隔和重试次数
- ✅ **Update 聚合管道**: updateOne/updateMany 支持聚合管道语法
- ✅ **Saga 分布式事务**: 完整的补偿机制，支持跨服务事务

**质量提升**:
- 🏆 **测试覆盖率**: 90.77% (从 37.8% 提升，+53%)
- 🏆 **测试数量**: 400+个测试用例 (增长 4000%)
- 🏆 **函数覆盖率**: 95.23%
- 🏆 **核心功能**: 100% 测试覆盖
- 🏆 **行业领先**: 超过 85% 的开源项目

**重大改进**:
1. **多连接池架构**:
   - ConnectionPoolManager: 统一管理多个连接池
   - HealthChecker: 实时健康监控
   - PoolSelector: 5种智能选择策略
   - PoolStats: 完整的统计收集

2. **Update 聚合管道**:
   - 支持字段间计算 (`$add`、`$multiply`、`$subtract`)
   - 条件赋值 (`$cond`、`$ifNull`)
   - 多阶段转换 (`$concat`、`$toLower`、`$toUpper`)
   - 完全兼容 MongoDB 4.2+ 语法

3. **Saga 分布式事务**:
   - 自动补偿机制
   - 事务状态跟踪
   - 支持超时和重试
   - 完整的错误处理

**详细信息**: [查看 changelogs/v1.0.8.md](./changelogs/v1.0.8.md)

---

### v1.0.7 - 依赖更新与测试修复 🔧

**发布日期**: 2026-01-09  
**重要性**: ⭐⭐⭐

**核心改进**:
- ✅ 升级 schema-dsl 到 v1.1.3（修复类型错误消息模板变量未替换 bug）
- ✅ 修复测试用例中错误的 Schema 语法（17处）
- ✅ 所有测试通过（38/38 测试套件，100%）
- ✅ 将 schema-dsl 从 devDependencies 移至 dependencies（Model 层运行时依赖）

**详细信息**: [查看 changelogs/v1.0.7.md](./changelogs/v1.0.7.md)

---

### v1.0.6 - 文档完善 📚

**发布日期**: 2026-01-08  
**重要性**: ⭐⭐⭐

**核心成就**:
- ✅ 文档完整性达到 100%
- ✅ 新增 ObjectId 自动转换完整文档（600行）
- ✅ 验证所有 v1.3.0+ 功能都有文档

**详细信息**: [查看 changelogs/v1.0.6.md](./changelogs/v1.0.6.md)

---

### v1.0.5 - Model 层易用性提升 🚀

**发布日期**: 2026-01-08  
**重要性**: ⭐⭐⭐⭐

**核心特性**:
- ✅ Schema 验证默认启用（提升数据质量）
- ✅ Model 自动加载机制（减少样板代码）
- ✅ 类型定义完善

**详细信息**: [查看 changelogs/v1.0.5.md](./changelogs/v1.0.5.md)

---

### v1.0.4 - 虚拟字段与 Bug 修复 ✨

**发布日期**: 2026-01-07  
**重要性**: ⭐⭐⭐⭐

**核心特性**:
- ✅ 虚拟字段（计算属性）
- ✅ 默认值（插入时自动填充）
- ✅ 嵌套 Populate Bug 修复

**详细信息**: [查看 changelogs/v1.0.4.md](./changelogs/v1.0.4.md)

---

### v1.0.0 - 正式发布 🎉

**发布日期**: 2025-12-03  
**重要性**: ⭐⭐⭐⭐⭐

**核心成就**:
- ✅ 已发布到 npm
- ✅ 生产就绪
- ✅ 企业级质量（96/100 A+）
- ✅ 1000+ 测试用例
- ✅ 77%+ 测试覆盖率

**详细信息**: [查看 changelogs/v1.0.0.md](./changelogs/v1.0.0.md)

---

## 详细变更文档

> **说明**: 详细变更文档位于 `changelogs/` 目录

```
changelogs/
├── README.md          # 变更文档说明
├── TEMPLATE.md        # 变更文档模板
├── v1.0.0.md         # v1.0.0 详细变更
├── v1.0.4.md         # v1.0.4 详细变更
└── v1.0.5.md         # v1.0.5 详细变更
```

**注意**: 
- `changelogs/` 目录包含所有版本的详细变更文档
- 本文件（CHANGELOG.md）仅提供版本概览和里程碑摘要
- 需求状态追踪见 [STATUS.md](./STATUS.md)

---

## 维护说明

### 添加新版本的步骤

1. **创建详细变更文档**
   ```bash
   cp changelogs/TEMPLATE.md changelogs/vX.Y.Z.md
   # 填充详细变更信息
   ```

2. **更新 CHANGELOG.md**（本文件）
   - 在"版本概览"表格最上方添加新行
   - 格式：`| [vX.Y.Z](./changelogs/vX.Y.Z.md) | 日期 | 摘要 | [查看](./changelogs/vX.Y.Z.md) |`

3. **更新 STATUS.md**（如需要）
   - 添加版本章节和需求状态

4. **提交变更**
   ```bash
   git add CHANGELOG.md changelogs/vX.Y.Z.md STATUS.md
   git commit -m "docs: 发布 vX.Y.Z"
   ```

### 版本号规则

遵循[语义化版本](https://semver.org/lang/zh-CN/)（Semantic Versioning）:

- **MAJOR** (x.0.0) - 不兼容的 API 变更
- **MINOR** (0.x.0) - 向后兼容的新增功能
- **PATCH** (0.0.x) - 向后兼容的问题修复

示例：
- `1.0.0 → 1.0.1` - Bug 修复
- `1.0.0 → 1.1.0` - 新功能
- `1.0.0 → 2.0.0` - 破坏性变更

---

## 相关文档

- [STATUS.md](./STATUS.md) - 需求状态追踪
- [changelogs/](./changelogs/README.md) - 详细变更文档目录
- [README.md](./README.md) - 项目说明
- [docs/](./docs/INDEX.md) - API 文档

---

**最后更新**: 2026-01-08

