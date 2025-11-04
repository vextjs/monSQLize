# 脚本目录说明

本目录包含 monSQLize 项目的验证脚本、构建脚本和工具脚本。

## 目录结构

```
scripts/
├── README.md                   # 本文件
├── verify/                     # 验证脚本
│   ├── compliance/            # 合规性验证（一次性执行）
│   └── docs/                  # 文档完整性验证（CI执行）
├── build/                      # 构建脚本（待添加）
└── utils/                      # 辅助工具（待添加）
```

## 验证脚本分类

### 1. 合规性验证（verify/compliance/）

**用途**: 验证项目改进、重构是否正确实施

**特点**:
- ✅ 一次性执行（改进完成后运行）
- ❌ 不纳入 CI 持续集成
- ✅ 验证规范遵守情况

**现有脚本**:
- `verify-p0-improvements.js` - 验证 P0 优先级改进完整性

**运行方式**:
```bash
# 验证 P0 改进
node scripts/verify/compliance/verify-p0-improvements.js
```

### 2. 文档完整性验证（verify/docs/）

**用途**: 验证文档与代码一致性（CI 自动执行）

**特点**:
- ✅ CI 持续执行
- ✅ 属于质量门禁
- ✅ 验证文档完整性

**计划脚本**:
```
verify-docs-completeness.js     # 验证必需文档存在
verify-examples-runnable.js     # 验证示例可运行
verify-api-docs-sync.js         # 验证 API 文档同步
verify-changelog-format.js      # 验证 CHANGELOG 格式
```

## 脚本命名规范

### 验证脚本
```
verify-<目标>-<方面>.js

✅ 正确示例:
- verify-p0-improvements.js
- verify-error-code-system.js
- verify-docs-completeness.js
- verify-api-coverage.js

❌ 错误示例:
- verifyP0.js              # 不使用驼峰命名
- check-p0.js              # 统一使用 verify 前缀
- p0-verify.js             # 前缀应该是 verify
```

## 与其他目录的区别

| 目录 | 用途 | 执行方式 | 纳入CI |
|------|------|---------|--------|
| **test/** | 测试用例 | `npm test` | ✅ 是 |
| **examples/** | 功能示例 | `node examples/<文件>` | ✅ 验证可运行 |
| **scripts/verify/compliance/** | 合规验证 | 手动运行 | ❌ 否 |
| **scripts/verify/docs/** | 文档验证 | CI自动 | ✅ 是 |

## 使用指南

### 运行合规性验证

```bash
# 1. 验证 P0 改进完成情况
node scripts/verify/compliance/verify-p0-improvements.js

# 2. 验证特定改进
node scripts/verify/compliance/verify-<改进名>.js
```

### 添加新的验证脚本

1. **确定脚本类型**:
   - 合规性验证 → `verify/compliance/`
   - 文档验证 → `verify/docs/`

2. **遵循命名规范**:
   ```javascript
   // verify-<目标>-<方面>.js
   // 例如: verify-test-structure.js
   ```

3. **创建脚本文件**:
   ```bash
   # 创建合规性验证脚本
   touch scripts/verify/compliance/verify-<名称>.js
   ```

4. **添加脚本说明到本 README**

## 脚本开发规范

### 验证脚本结构

```javascript
/**
 * <验证目标> 验证脚本
 * 
 * 用途: <简要说明>
 * 执行: node scripts/verify/<分类>/<文件名>.js
 */

const assert = require('assert');

console.log('\n🔍 开始 <验证目标> 验证\n');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✅ ${name}`);
        passed++;
    } catch (error) {
        console.log(`❌ ${name}`);
        console.log(`   错误: ${error.message}`);
        failed++;
    }
}

// 验证项 1
test('验证项目描述', () => {
    // 验证逻辑
    assert.ok(condition);
});

// 验证项 2
test('验证项目描述', () => {
    // 验证逻辑
    assert.ok(condition);
});

// 总结
console.log('\n' + '='.repeat(60));
console.log(`\n📊 验证总结\n`);
console.log(`✅ 通过: ${passed} 项`);
console.log(`❌ 失败: ${failed} 项\n`);

if (failed === 0) {
    console.log('🎉 所有验证通过！\n');
    process.exit(0);
} else {
    console.log('⚠️  部分验证失败，请检查上述错误。\n');
    process.exit(1);
}
```

### 最佳实践

1. **清晰的输出**: 使用表情符号和颜色区分状态
2. **详细的错误**: 失败时提供可操作的错误信息
3. **退出码**: 失败时 exit(1)，成功时 exit(0)
4. **独立运行**: 不依赖外部状态

## 未来扩展

### 计划添加的脚本

**构建脚本** (scripts/build/)
```
build-docs.js              # 构建 API 文档
build-types.js             # 构建类型声明
build-dist.js              # 构建分发包
```

**工具脚本** (scripts/utils/)
```
generate-changelog.js      # 生成 CHANGELOG
update-version.js          # 更新版本号
check-dependencies.js      # 检查依赖更新
```

## 规范参考

- [第22章 验证脚本与工具目录规范](../guidelines/guidelines/v2.md#22-验证脚本与工具目录规范)
- [第21章 验证与测试策略](../guidelines/guidelines/v2.md#21-验证与测试策略完整流程)
- [第19.2章 项目标准目录结构](../guidelines/guidelines/v2.md#192-项目标准目录结构规范)

---

**最后更新**: 2025-11-04  
**维护者**: monSQLize Team

