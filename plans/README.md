# plans/ 目录使用说明

> **说明**: 本目录用于存储 monSQLize 的需求详细文档  
> **规范**: 遵循 AI 开发规范 v4.6 - 文档规范 § 3.4

---

## 📑 目录结构

```
plans/
├── README.md                # 本文件
├── TEMPLATE.md              # 需求文档模板
├── requirements/            # 新功能需求
│   └── req-xxx-v{版本}.md
├── bugs/                    # Bug 修复
│   └── bug-xxx-v{版本}.md
├── optimizations/           # 性能优化
│   └── opt-xxx-v{版本}.md
├── refactoring/             # 代码重构
│   └── ref-xxx-v{版本}.md
├── security/                # 安全加固
│   └── sec-xxx-v{版本}.md
├── database/                # 数据库变更
│   └── db-xxx-v{版本}.md
├── api/                     # API 开发
│   └── api-xxx-v{版本}.md
└── scripts/                 # 脚本开发
    └── script-xxx-v{版本}.md
```

🔴 **强制规则**：
- ❌ 禁止在 plans/ 根目录直接创建文档（除 README.md 和 TEMPLATE.md）
- ✅ 所有文档必须按类型分类到对应子目录
- ✅ 所有文档文件名必须包含版本号（-v{版本号}.md）

---

## 🏷️ 文件命名规范

### 命名格式（强制版本号后置）

🔴 **强制格式**: `{类型前缀}-{功能描述}-v{版本号}.md`

**示例**:
```
req-watch-feature-v1.4.md           # 新功能需求（v1.4实施）
bug-cache-memory-leak-v1.3.md       # Bug修复（v1.3修复）
opt-query-performance-v1.5.md       # 性能优化（v1.5实施）
```

**版本号规则**:
- ✅ 必须添加版本号 - 所有文档都必须有版本号
- ✅ 版本号后置 - 版本号必须在文件名末尾（-v{版本号}.md）
- ✅ 使用实施版本 - 版本号对应该需求首次计划或实施的版本
- ✅ 格式标准 - vX.Y 或 vX.Y.Z（如 v1.4、v1.4.1）
- ✅ 短横线连接 - 使用 -v1.4.md 而不是 _v1.4.md

**禁止格式**:
```
❌ req-watch-feature.md              # 缺少版本号
❌ req-v1.4-watch-feature.md         # 版本号在中间
❌ v1.4-req-watch-feature.md         # 版本号在开头
❌ req-watch-feature_v1.4.md         # 使用下划线
✅ req-watch-feature-v1.4.md         # 正确格式
```

### 类型前缀（必须使用）

| 前缀 | 说明 | 保存目录 | 命名示例 |
|------|------|---------|---------|
| req- | 新功能需求 | plans/requirements/ | req-watch-feature-v1.4.md |
| bug- | Bug 修复 | plans/bugs/ | bug-cache-memory-leak-v1.3.md |
| opt- | 性能优化 | plans/optimizations/ | opt-query-performance-v1.5.md |
| ref- | 代码重构 | plans/refactoring/ | ref-transaction-manager-v1.4.md |
| sec- | 安全加固 | plans/security/ | sec-sql-injection-fix-v1.6.md |
| db- | 数据库变更 | plans/database/ | db-add-index-v1.4.md |
| api- | API 开发 | plans/api/ | api-new-endpoints-v1.5.md |
| script- | 脚本开发 | plans/scripts/ | script-data-migration-v1.4.md |

### 功能描述命名规则

- ✅ 全小写英文
- ✅ 连字符分隔
- ✅ 20个字符以内（不含版本号）
- ✅ 描述准确简洁
- ❌ 禁止纯编号（如 req-001-v1.4.md）
- ❌ 禁止中文（如 req-监听功能-v1.4.md）
- ❌ 禁止无版本号（如 req-watch-feature.md）

---

## 📝 创建需求文档

### 步骤1：确定版本号和类型

- **类型**: 根据需求选择类型前缀（req-/bug-/opt-等）
- **版本号**: 使用计划实施的版本号（如 v1.4、v1.5）

### 步骤2：复制模板

```bash
# 复制到对应子目录
cp plans/TEMPLATE.md plans/requirements/req-your-feature-v1.4.md
```

### 步骤3：填充内容

必须填充的章节：
- ✅ 需求概述
- ✅ 目标
- ✅ 方案设计
- ✅ 实现清单
- ✅ 影响范围
- ✅ 验证方式

### 步骤4：添加到 STATUS.md

在对应版本表格添加一行：

```markdown
| 需求标题 | 状态 | 优先级 | 详细 |
|---------|------|--------|------|
| 监听功能 | 🚧 开发中 | P1 | [详细](plans/requirements/req-watch-feature-v1.4.md) |
```

### 步骤5：更新状态

开发进度更新：
- 💡 提议 → 📋 计划中 → 🚧 开发中 → ✅ 已完成

---

## 🔗 文档关联

### 正向追溯（用户视角）

```
CHANGELOG.md（版本摘要）
     ↓
STATUS.md（版本需求列表）
     ↓
plans/{类型}/xxx-v{版本}.md（需求详细）
```

### 反向追溯（开发视角）

```
plans/{类型}/xxx-v{版本}.md（需求详细）
     ↓
STATUS.md（更新实施状态）
     ↓
CHANGELOG.md（记录变更摘要）
```

```
plans/req-xxx.md
     ↓
STATUS.md（查看版本状态）
     ↓
CHANGELOG.md（查看版本摘要）
```

---

## 📊 需求文档清单

> **说明**: 以下列表由 AI 自动维护

### v1.2.0（开发中）

| 需求文档 | 需求标题 | 状态 | 优先级 |
|---------|---------|------|--------|
| - | - | - | - |

### v1.1.0（已发布）

| 需求文档 | 需求标题 | 状态 | 优先级 |
|---------|---------|------|--------|
| - | watch (Change Streams) | ✅ 已完成 | P1 |

### v1.0.0（已发布）

| 需求文档 | 需求标题 | 状态 | 优先级 |
|---------|---------|------|--------|
| - | 正式发布 | ✅ 已完成 | P0 |

---

## 🛠️ 维护规范

### 创建时机

**AI 自动判断需要创建 plans/ 文档的场景**：

✅ **强制创建**：
- 意图02（开发新功能）
- 意图06（安全加固）
- 意图07（数据库变更）
- 意图08（API开发）
- 意图09（配置变更 Level 3）
- 影响文件 > 3个
- 涉及数据库变更
- 涉及API变更
- 风险等级为 P0

⚠️ **询问用户**：
- 意图03（修复Bug）
- 意图04（代码重构）
- 意图05（性能优化）
- 意图09（配置变更 Level 2）
- 意图15（脚本开发）
- 涉及架构调整

❌ **不创建**：
- 意图01（简单问答）
- 意图09（配置变更 Level 1）
- 意图11（仅测试）
- 意图12（仅文档）
- 意图13（代码审查）

### 更新时机

- **开发开始时**: 状态改为 🚧 开发中
- **开发完成时**: 状态改为 ✅ 已完成，填充完成日期
- **版本发布时**: 添加版本标记

### 清理规则

- ✅ 保留所有需求文档（包括已完成）
- ✅ 可以归档到子目录（如 `plans/archive/v1.0.0/`）
- ❌ 禁止删除需求文档

---

## 📎 相关资源

- [STATUS.md](../STATUS.md) - 需求状态追踪
- [CHANGELOG.md](../CHANGELOG.md) - 版本摘要
- [文档规范](https://link-to-guidelines) - AI 开发规范 v4.6

---

**最后更新**: 2025-12-12  
**文档版本**: 1.0  
**维护者**: AI 开发助手

