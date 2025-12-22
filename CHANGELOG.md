# 变更日志 (CHANGELOG)

> **说明**: 版本摘要，详细需求见 [STATUS.md](STATUS.md)  
> **最后更新**: 2025-12-22  
> **文档版本**: 2.1（符合 AI 开发规范 v4.22）

---

## 版本概览

| 版本 | 日期 | 变更摘要 | 详细 |
|------|------|---------|------|
| [v1.3.2](STATUS.md#v132) | 2025-12-22 | 🆕 SSH隧道支持 - 安全连接内网数据库 | [查看](STATUS.md#v132) |
| [v1.3.1](STATUS.md#v131) | 2025-12-22 | 🆕 慢查询日志持久化存储 | [查看](STATUS.md#v131) |
| [v1.6.0](STATUS.md#v160) | 2026-03-31 | Python SDK（跨语言客户端） | [查看](STATUS.md#v160) |
| [v1.5.0](STATUS.md#v150) | 2026-02-28 | API服务化（RESTful API + 事务支持） | [查看](STATUS.md#v150) |
| [v1.4.0](STATUS.md#v140) | 2026-01-15 | 短ID支持（Base62编码，缩短33%） | [查看](STATUS.md#v140) |
| [v1.3.0](STATUS.md#v130) | 2025-12-12 | 自动 ObjectId 转换（查询+文档+聚合+配置+链式） | [查看](STATUS.md#v130) |
| [v1.2.0](STATUS.md#v120) | 2025-12-15 | TypeScript增强 + 安全加固 + 工具链现代化 | [查看](STATUS.md#v120) |
| [v1.1.0](STATUS.md#v110) | 2025-12-03 | 新增 Change Streams 实时监听功能（watch方法） | [查看](STATUS.md#v110) |
| [v1.0.0](STATUS.md#v100) | 2025-12-03 | 正式发布，生产就绪，已发布到 npm | [查看](STATUS.md#v100) |
| [v0.3.0](STATUS.md#v030) | 2025-12-02 | 新增完整的 Admin/Management 功能（18个方法） | [查看](STATUS.md#v030) |

---

## 🆕 v1.3.2 变更详情（2025-12-22）

### 新增功能

1. **SSH隧道支持** 🔐
   - 支持通过SSH隧道安全连接防火墙后的MongoDB
   - 支持密码认证和私钥认证
   - 自动管理隧道生命周期（connect建立，close关闭）
   - 基于ssh2库实现，完美跨平台（Windows/Linux/macOS）
   - 开箱即用，零额外配置
   - 详见：[docs/ssh-tunnel.md](docs/ssh-tunnel.md)

2. **配置增强**
   - 新增`config.ssh`配置项（SSH隧道配置）
   - 支持`remoteHost`和`remotePort`指定MongoDB地址
   - 自动从URI解析目标地址

### 使用示例

```javascript
const db = new MonSQLize({
    type: 'mongodb',
    config: {
        ssh: {
            host: 'bastion.example.com',
            username: 'deploy',
            password: 'your-password',  // 或使用 privateKeyPath
        },
        uri: 'mongodb://user:pass@internal-mongo:27017/mydb',
        remoteHost: 'internal-mongo',
        remotePort: 27017
    }
});

await db.connect();  // 自动建立SSH隧道
// 正常使用MongoDB
await db.close();    // 自动关闭SSH隧道
```

### 技术亮点

- **零学习成本**：与现有API无缝集成，无需学习新概念
- **安全性强**：支持多种认证方式，推荐私钥认证
- **扩展性好**：基础设施层独立，未来支持PostgreSQL/MySQL
- **文档完整**：详细文档 + 7个示例 + 故障排查指南

### 核心文件

- `lib/infrastructure/ssh-tunnel-ssh2.js` - SSH隧道实现（ssh2库）
- `lib/infrastructure/ssh-tunnel.js` - 统一入口（工厂模式）
- `lib/infrastructure/uri-parser.js` - URI解析器
- `examples/ssh-tunnel.examples.js` - 7个完整示例
- `docs/ssh-tunnel.md` - 详细使用文档

---

## 🆕 v1.3.1 变更详情（2025-12-22）

### 新增功能

1. **慢查询日志持久化存储** 🎯
   - 支持将慢查询日志自动保存到MongoDB
   - 方案B去重机制（基于queryHash聚合统计）
   - 批量写入队列（性能无损，<2ms额外开销）
   - 配置开箱即用（`slowQueryLog: true` 零配置）
   - 支持查询慢查询日志（`getSlowQueryLogs()`）
   - 详见：[plans/requirements/req-slow-query-log-storage-v1.3.md](plans/requirements/req-slow-query-log-storage-v1.3.md)

2. **存储层架构优化**
   - 适配器模式设计（支持多存储类型扩展）
   - 通用复用连接机制（MongoDB/PostgreSQL/MySQL都支持）
   - 智能配置管理（三层配置架构）

### 技术亮点

- **性能优化**：异步批量写入，主查询额外开销<2ms
- **存储可控**：TTL自动过期（默认7天），方案B去重节省1000倍存储
- **扩展性强**：存储层与业务库解耦，未来可扩展PostgreSQL/MySQL/File存储

### 核心文件

- `lib/slow-query-log/` - 慢查询日志模块（6个文件）
- `examples/slow-query-log.examples.js` - 使用示例
- `test/slow-query-log/` - 单元测试

---

## 变更统计

| 版本系列 | 版本数 | 主要改进方向 |
|---------|-------|------------|
| v1.x | 7 | 核心功能完善、生产发布、实时监听、TypeScript增强、慢查询持久化、短ID支持、API服务化 |
| v0.x | 1 | 基础功能开发、管理功能 |

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

### 按功能类型查找

- **TypeScript增强**: [v1.2.0](STATUS.md#v120)
- **安全加固**: [v1.2.0](STATUS.md#v120)
- **工具链现代化**: [v1.2.0](STATUS.md#v120)
- **实时监听**: [v1.1.0](STATUS.md#v110)
- **生产发布**: [v1.0.0](STATUS.md#v100)
- **管理功能**: [v0.3.0](STATUS.md#v030)

### 按变更类型查找

- **新功能**: v1.1.0, v1.0.0, v0.3.0
- **类型定义**: v1.2.0
- **安全**: v1.2.0
- **工具链**: v1.2.0
- **性能优化**: v1.0.0
- **Bug修复**: v0.3.0, v1.2.0

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

> **说明**: 详细变更文档位于 `changelogs/` 目录（历史版本，保留供参考）

```
changelogs/
├── TEMPLATE.md          # 变更文档模板
├── v1.2.0.md           # v1.2.0 详细变更
├── v1.1.0.md           # v1.1.0 详细变更
├── v1.0.0.md           # v1.0.0 详细变更
└── v0.3.0.md           # v0.3.0 详细变更
```

**注意**: 
- changelogs/ 目录包含历史详细变更文档
- 新版本应优先使用 plans/ 目录存储需求文档
- changelogs/ 文档仅供参考，不再更新

---

## 相关文档

- [STATUS.md](./STATUS.md) - 需求状态追踪
- [plans/](./plans/README.md) - 需求详细文档
- [README.md](./README.md) - 项目说明
- [changelogs/](./changelogs/README.md) - 历史详细变更（供参考）

---

**文档版本**: 2.0  
**最后更新**: 2025-12-12  
**格式标准**: AI 开发规范 v4.6 § 3.3

