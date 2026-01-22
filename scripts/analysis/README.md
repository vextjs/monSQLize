# 项目分析脚本

> **目录**: scripts/analysis/  
> **用途**: 深度分析 monSQLize 项目功能实现情况  
> **维护**: 开发团队

---

## 📋 脚本清单

### verify-expr-operators.js

**用途**: 验证 expr 操作符支持情况

**功能**:
- ✅ 测试所有已实现的表达式函数（54个）
- ✅ 对比 MongoDB 官方操作符（122个）
- ✅ 生成详细的支持情况报告
- ✅ 统计覆盖率和实现进度

**运行方式**:
```bash
# 直接运行
node scripts/analysis/verify-expr-operators.js

# 或通过 npm
npm run analyze:expr
```

**输出**:
- 控制台：实时测试结果和统计信息
- 报告：参见 `reports/monSQLize/analysis/expr-operators-analysis-v1.0.9.md`

**测试覆盖**:
- ✅ 算术运算符（11个）
- ✅ 比较运算符（6个）
- ✅ 逻辑运算符（3个）
- ✅ 字符串函数（12个）
- ✅ 数组函数（10个）
- ✅ 聚合函数（7个）
- ✅ 日期函数（6个）
- ✅ 条件运算符（3个）
- ✅ 类型函数（4个）
- ✅ 高级函数（7个）

**关键发现**:
- 总测试数: 69
- 支持: 68 (98.6%)
- MongoDB 操作符: 122个（已实现73个，59.8%）

---

## 📊 分析报告

所有分析报告保存在 `reports/monSQLize/analysis/` 目录：

### expr-operators-analysis-v1.0.9.md

**内容**:
1. 执行摘要（关键指标）
2. 项目概况（架构分析）
3. 已实现操作符（10大类）
4. 未实现操作符（分类统计）
5. 操作符映射详表（MongoDB → expr）
6. 三轮验证结果
7. 性能与优化
8. 未来路线图

**更新频率**: 每个版本发布前更新

---

## 🔧 开发指南

### 添加新的分析脚本

1. 创建脚本文件：`scripts/analysis/your-script.js`
2. 遵循现有脚本结构：
   - 导出 `main()` 函数
   - 提供详细的控制台输出
   - 生成报告文件到 `reports/monSQLize/analysis/`
3. 更新本 README.md
4. （可选）添加 npm script

### 脚本规范

```javascript
/**
 * 分析脚本模板
 */

// 主函数
function main() {
  try {
    console.log('========================================');
    console.log('开始分析 XXX');
    console.log('========================================\n');
    
    // 执行分析
    const results = analyze();
    
    // 生成报告
    generateReport(results);
    
    console.log('\n✅ 分析完成');
    return results;
  } catch (error) {
    console.error('\n❌ 分析失败:', error);
    throw error;
  }
}

// 分析逻辑
function analyze() {
  // ...
}

// 报告生成
function generateReport(results) {
  // 保存到 reports/monSQLize/analysis/
}

// 导出
if (require.main === module) {
  main();
}

module.exports = { main };
```

---

## 📈 统计数据

### expr 操作符分析（v1.0.9）

| 类别 | 测试数 | 通过 | 通过率 |
|------|-------|------|--------|
| 算术运算 | 11 | 11 | 100% |
| 比较运算 | 6 | 6 | 100% |
| 逻辑运算 | 3 | 2 | 66.7% |
| 字符串函数 | 12 | 12 | 100% |
| 数组函数 | 10 | 10 | 100% |
| 聚合函数 | 7 | 7 | 100% |
| 日期函数 | 6 | 6 | 100% |
| 条件运算 | 3 | 3 | 100% |
| 类型函数 | 4 | 4 | 100% |
| 高级函数 | 7 | 7 | 100% |
| **总计** | **69** | **68** | **98.6%** |

### MongoDB 操作符映射（v1.0.9）

| 类别 | 总数 | 已实现 | 实现率 |
|------|------|--------|--------|
| 算术运算符 | 16 | 11 | 68.8% |
| 数组运算符 | 17 | 13 | 76.5% |
| 布尔运算符 | 3 | 2 | 66.7% |
| 比较运算符 | 7 | 6 | 85.7% |
| 条件运算符 | 3 | 3 | 100% |
| 日期运算符 | 19 | 6 | 31.6% |
| 字符串运算符 | 20 | 13 | 65.0% |
| 类型转换 | 10 | 3 | 30.0% |
| 累加器（$group） | 13 | 10 | 76.9% |
| 累加器（$project） | 6 | 6 | 100% |
| 集合运算符 | 5 | 1 | 20.0% |
| 对象运算符 | 2 | 2 | 100% |
| **总计** | **122** | **73** | **59.8%** |

---

## 🔗 相关文档

- [表达式函数参考](../../docs/expression-functions.md)
- [项目深度分析报告](../../reports/monSQLize/analysis/expr-operators-analysis-v1.0.9.md)
- [MongoDB 聚合操作符官方文档](https://www.mongodb.com/docs/manual/reference/operator/aggregation/)

---

**最后更新**: 2026-01-20  
**维护者**: vext.js Team
