# 变更日志 (CHANGELOG)

> **说明**: 版本摘要，详细需求见 [STATUS.md](STATUS.md)  
> **最后更新**: 2026-01-07

---

## 版本概览

| 版本 | 日期 | 变更摘要 | 详细 |
|------|------|---------|------|
| [v1.0.6](#-v106-变更详情2026-01-07) | 2026-01-07 | 新功能：虚拟字段、默认值 + Bug 修复：嵌套 Populate + 测试改进 | [查看](#-v106-变更详情2026-01-07) |
| [v1.0.3](STATUS.md#v103) | 2025-12-31 | 新增 Model 层（Schema 验证、自定义方法、生命周期钩子、自动时间戳） | [查看](STATUS.md#v103) |
| [v1.0.2](STATUS.md#v102) | 2025-12-30 | 新增批量操作方法（deleteBatch/updateBatch） | [查看](STATUS.md#v102) |
| [v1.0.1](STATUS.md#v101) | 2025-12-29 | 稳定版本，生产就绪 | [查看](STATUS.md#v101) |
| [v1.0.0](STATUS.md#v100) | 2025-12-03 | 正式发布，生产就绪，已发布到 npm | | [查看](STATUS.md#v100) |

---

## 🆕 v1.0.6 变更详情（2026-01-07）

### 新增功能 ✨

**虚拟字段（Virtuals）** - 计算属性，不存储在数据库中
- ✅ **getter 函数**: 定义计算逻辑（如 firstName + lastName = fullName）
- ✅ **setter 函数**: 反向赋值支持（可选）
- ✅ **自动注入**: 查询结果自动应用虚拟字段
- ✅ **JSON 序列化**: 虚拟字段在 JSON.stringify 中可见

**默认值（Defaults）** - 插入时自动填充
- ✅ **静态默认值**: 如 status: 'active'
- ✅ **函数默认值**: 如 createdAt: () => new Date()
- ✅ **上下文默认值**: 如 createdBy: (ctx) => ctx.userId
- ✅ **自动应用**: insertOne/insertMany 时自动填充

**使用示例**:
```javascript
Model.define('users', {
    schema: (dsl) => dsl({
        firstName: 'string!',
        lastName: 'string!',
        status: 'string?',
        score: 'number?'
    }),
    virtuals: {
        fullName: {
            get: function() {
                return `${this.firstName} ${this.lastName}`;
            }
        }
    },
    defaults: {
        status: 'active',
        score: 0
    }
});

// 使用
await User.insertOne({ firstName: 'John', lastName: 'Doe' });
// 自动应用默认值：status = 'active', score = 0

const user = await User.findOne({ firstName: 'John' });
console.log(user.fullName); // 'John Doe'（虚拟字段）
```

### Bug 修复 🐛

**嵌套 Populate + Select 问题修复**
- ✅ **问题描述**: 嵌套 populate 配置中使用 select 选项时，关联数据未填充
- ✅ **根本原因**: select 选项会过滤掉用于构建关系映射的外键字段
- ✅ **修复方案**: 在 `_selectFields` 方法中保留外键字段（keepField 参数）
- ✅ **影响范围**: 仅影响嵌套 populate + select 的组合使用
- 📄 **详细报告**: [nested-populate-bugfix-v1.3.0.md](../reports/monSQLize/patches/nested-populate-bugfix-v1.3.0.md)

**技术细节**:
```javascript
// 修复前：select 会过滤掉外键字段
_selectFields(doc, select) {
    // 只保留 _id 和 select 中的字段
    // ❌ 外键字段被过滤，导致映射失败
}

// 修复后：保留外键字段用于内部映射
_selectFields(doc, select, keepField) {
    // ✅ 保留外键字段，确保关系映射正确
    if (keepField && doc[keepField] !== undefined) {
        result[keepField] = doc[keepField];
    }
}
```

### 测试改进 ✅

- ✅ 新增 31 个测试用例（全部通过）
  - 嵌套 populate 测试：5 个
  - Relations 边界测试：13 个
  - Populate 高级测试：8 个
  - 虚拟字段和默认值测试：10 个

- ✅ Model 层测试覆盖率：**92.85%**
  - Statements: 92.85% (221/238)
  - Branches: 82.57% (199/241)
  - Functions: 92.59% (25/27)
  - Lines: 92.79% (219/236)

- ✅ 总计测试：**58 个测试**，100% 通过
  - model-coverage-100.test.js: 13 个
  - model-populate-integration.test.js: 9 个
  - model-nested-populate.test.js: 5 个
  - model-relations-edge-cases.test.js: 13 个（新增）
  - model-populate-advanced.test.js: 8 个（新增）
  - model-virtuals-defaults.test.js: 10 个（新增）

### 文档改进 📖

- ✅ 新增 `docs/model/nested-populate.md` - 嵌套 Populate 完整文档
- ✅ 完善 `docs/model/relations.md` - Relations 和 Populate API 文档（753 行）
- ✅ 更新 `docs/INDEX.md` - 添加 relations 文档链接
- ✅ 更新 `index.d.ts` - 完善 TypeScript 类型定义
  - 新增 `VirtualConfig` 接口
  - 新增 `DefaultValue` 类型
  - 更新 `ModelDefinition` 接口（virtuals/defaults）
  - 修复 `RelationConfig` 定义
- ✅ 新增深度分析报告 `reports/monSQLize/analysis/deep-analysis-v1.0.6.md`

### TypeScript 支持完善 ✅

- ✅ 修复 Relations 类型定义（从 ORM 风格改为 MongoDB 原生风格）
- ✅ 新增 PopulateProxy 接口（支持链式 populate）
- ✅ 新增 PopulateConfig 接口（完整的 populate 选项）
- ✅ 新增 VirtualConfig 接口（虚拟字段配置）
- ✅ 新增 DefaultValue 类型（默认值类型）
- ✅ 更新 ModelInstance 查询方法返回类型（6 个）

### 已知问题 ⚠️

- ✅ **已修复**: TypeScript 类型定义已更新，与实际实现完全匹配
- ⚠️ 整体测试覆盖率 71.48%，分支覆盖率 61.66%（持续改进中）
- ✅ **已确认**: 软删除和乐观锁功能已完整实现（覆盖率 >97%）

### 使用建议 💡

如果你在使用嵌套 populate 时遇到关联数据为空的问题，请升级到 v1.0.6：

```bash
npm install monsqlize@1.0.6
```

**受影响的使用场景**:
```javascript
// ❌ v1.0.5 会失败（comments 为空）
const user = await User.findOne({ _id }).populate({
    path: 'posts',
    populate: {
        path: 'comments',
        select: 'content'  // select 会导致问题
    }
});

// ✅ v1.0.6 已修复
// comments 数组正确填充，且只包含 _id 和 content 字段
```

---

## 🆕 v1.0.3 变更详情（2025-12-31）

### 新增功能 ✨

**Model 层** - ORM 式的数据模型功能
- ✅ **Schema 验证** - 集成 schema-dsl，自动验证数据格式
- ✅ **自定义方法** - instance 方法注入到文档，static 方法挂载到 Model
- ✅ **生命周期钩子** - before/after 钩子支持（find/insert/update/delete）
- ✅ **索引自动创建** - 初始化时自动创建索引
- ✅ **枚举配置** - 可在 schema 中引用的枚举定义
- ✅ **自动时间戳** - 自动管理 createdAt/updatedAt，支持自定义字段名

### 核心 API 🔧

```javascript
// 定义 Model
Model.define('users', {
    schema: (dsl) => dsl({ username: 'string!', email: 'email!' }),
    methods: (model) => ({
        instance: { checkPassword(pwd) { return this.password === pwd; } },
        static: { async findByUsername(name) { return await model.findOne({ username: name }); } }
    }),
    hooks: (model) => ({
        insert: { before: async (ctx, docs) => ({ ...docs, createdAt: new Date() }) }
    }),
    indexes: [{ key: { username: 1 }, unique: true }]
});

// 使用 Model
const User = msq.model('users');
const user = await User.findByUsername('admin');
if (user.checkPassword('secret')) console.log('登录成功');
```

### 测试覆盖 ✅

- 新增 45 个单元测试
  - Model 基础功能：16个（100%通过）
  - ModelInstance：23个
  - Hooks：6个
- 测试覆盖率：~90%

### 文档完善 📖

- 新增 `docs/model.md` - 完整 API 文档（495行，精简版）
- 新增 `docs/model-methods-design.md` - 设计文档（295行）
- 新增 `examples/model/basic.js` - 基础使用示例
- 新增 `examples/model/advanced.js` - 高级功能示例
- 新增 TypeScript 类型定义（+300行）
- 更新 `README.md`、`docs/INDEX.md`

### 设计亮点 💡

- ✅ **业界标准** - 参考 Mongoose、Sequelize，降低学习成本
- ✅ **Schema 缓存** - 编译一次，重复使用，性能优化
- ✅ **方法注入** - 自动注入到查询结果，使用自然
- ✅ **TypeScript 支持** - 完整的泛型类型定义
- ✅ **灵活配置** - 所有选项都可选，渐进式采用

### 使用场景 🎯

- ✅ 需要数据验证的场景
- ✅ 需要扩展文档方法的场景
- ✅ 需要生命周期控制的场景
- ✅ 需要类 ORM 体验的场景

---

## 🆕 v1.0.2 变更详情（2025-12-30）

### 新增功能 ✨

**批量操作方法** - 支持大数据量场景
- ✅ **deleteBatch** - 批量删除方法
  - 流式查询，恒定内存占用（12KB）
  - 支持进度监控（实时百分比）
  - 4种错误处理策略（stop/skip/collect/retry）
  - 自动重试机制
  - 性能：36,385 条/秒（100万条数据实测）
  
- ✅ **updateBatch** - 批量更新方法
  - 流式查询，恒定内存占用（12KB）
  - 支持进度监控（实时百分比）
  - 支持所有 MongoDB 更新操作符
  - 4种错误处理策略 + 自动重试
  - 性能：35,365 条/秒（100万条数据实测）

### 性能数据 📊

```
批量操作性能（100万条数据测试）:
- insertBatch: 49,493 条/秒
- deleteBatch: 36,385 条/秒
- updateBatch: 35,365 条/秒
- 内存占用: 恒定 12KB
```

### 测试覆盖 ✅

- 新增 31 个单元测试（deleteBatch: 14个，updateBatch: 17个）
- 性能测试通过（100万条数据）
- 测试覆盖率 > 90%

### 文档完善 📖

- 新增 `docs/deleteBatch.md` - 完整 API 文档（650行）
- 新增 `docs/updateBatch.md` - 完整 API 文档（600行）
- 新增 `examples/batch-operations.examples.js` - 8个真实业务场景
- 更新 `README.md` 和 `docs/INDEX.md`

### 技术亮点 💡

- ✅ **完全复用 find 方法** - 0行重复代码，自动获得流式查询、慢查询日志等功能
- ✅ **架构最简** - 单一流式查询实现，数据一致性有保证
- ✅ **内存优化** - 流式查询，无论处理多少数据，内存占用恒定 12KB
- ✅ **错误处理完善** - 4种策略 + 自动重试，适应不同业务场景

---

## 🆕 v1.0.1 变更详情（2025-12-29）

### 版本说明

- 稳定版本，生产就绪
- 包含完整的 CRUD 功能
- 多级缓存系统
- 事务支持
- 分布式部署支持
- Change Streams 实时监听
- 慢查询日志
- 业务级分布式锁
- SSH 隧道支持

---

## 🆕 v1.0.0 变更详情（2025-12-03）

### 版本说明

- 正式版发布，生产就绪
- 企业级质量标准（96/100 A+）
- 已发布到 npm

---

## 变更统计

| 版本系列 | 版本数 | 主要改进方向 |
|---------|-------|------------|
| v1.0.x | 3 | 稳定运行、生产就绪、批量操作优化 |

---

## 维护说明

### 添加新版本的步骤

1. **创建需求文档**（如需要）
   ```bash
   cp plans/TEMPLATE.md plans/req-your-feature.md
   # 填充需求详细信息
   ```

2. **更新 STATUS.md**
   - 在"发布计划"表格添加新版本行
   - 添加版本章节（### vX.Y.Z）
   - 在版本表格添加需求行
   - 链接到 plans/ 文档（如有）

3. **更新 CHANGELOG.md**
   - 在"版本概览"表格最上方添加新行
   - 格式：`| [vX.Y.Z](STATUS.md#vxyz) | 日期 | 摘要 | [查看](STATUS.md#vxyz) |`

4. **提交变更**
   ```bash
   git add STATUS.md CHANGELOG.md plans/
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

## 快速导航

### 当前版本

- **v1.0.1**: [查看详情](STATUS.md#v101)
- **v1.0.0**: [查看详情](STATUS.md#v100)

---

## 里程碑版本

### v1.0.0 - 正式发布 🎉

**发布日期**: 2025-12-03  
**重要性**: ⭐⭐⭐⭐⭐

**核心成就**:
- ✅ 已发布到 npm
- ✅ 生产就绪
- ✅ 企业级质量（96/100 A+）
- ✅ 1000+ 测试用例
- ✅ 77%+ 测试覆盖率

**详细信息**: [查看 STATUS.md](STATUS.md#v100)

---

## 详细变更文档

> **说明**: 详细变更文档位于 `changelogs/` 目录

```
changelogs/
├── TEMPLATE.md          # 变更文档模板
└── v1.0.0.md           # v1.0.0 详细变更
```

**注意**: 
- changelogs/ 目录包含历史详细变更文档
- 新版本应优先使用 plans/ 目录存储需求文档
- STATUS.md 是主要的需求状态追踪文档

---

## 相关文档

- [STATUS.md](./STATUS.md) - 需求状态追踪
- [plans/](./plans/README.md) - 需求详细文档
- [README.md](./README.md) - 项目说明
- [changelogs/](./changelogs/README.md) - 历史详细变更（供参考）

---

**最后更新**: 2025-12-29

