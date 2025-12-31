# 变更日志 (CHANGELOG)

> **说明**: 版本摘要，详细需求见 [STATUS.md](STATUS.md)  
> **最后更新**: 2025-12-31

---

## 版本概览

| 版本 | 日期 | 变更摘要 | 详细 |
|------|------|---------|------|
| [v1.0.3](STATUS.md#v103) | 2025-12-31 | 新增 Model 层（Schema 验证、自定义方法、生命周期钩子、自动时间戳） | [查看](STATUS.md#v103) |
| [v1.0.2](STATUS.md#v102) | 2025-12-30 | 新增批量操作方法（deleteBatch/updateBatch） | [查看](STATUS.md#v102) |
| [v1.0.1](STATUS.md#v101) | 2025-12-29 | 稳定版本，生产就绪 | [查看](STATUS.md#v101) |
| [v1.0.0](STATUS.md#v100) | 2025-12-03 | 正式发布，生产就绪，已发布到 npm | [查看](STATUS.md#v100) |

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

