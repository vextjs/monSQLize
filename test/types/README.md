# TypeScript 类型定义说明

> **位置**: `index.d.ts`  
> **版本**: v1.0.9  
> **状态**: ✅ 已完成  

---

## 📝 统一表达式系统类型定义

所有统一表达式系统的 TypeScript 类型定义都在 **`index.d.ts`** 文件中。

### 核心类型

```typescript
// 表达式对象
interface ExpressionObject {
    __expr__: string;
    __compiled__: boolean;
}

// $ 函数类型
type ExpressionFunction = (expr: string) => ExpressionObject;

// MonSQLize 静态方法
class MonSQLize {
    static $: ExpressionFunction;
}
```

---

## 🎯 使用方式

### TypeScript 项目

```typescript
import MonSQLize from 'monsqlize';

// 解构 $ 函数
const { expr } = MonSQLize;

// 类型安全
const expr = expr("age > 18");  // 类型: ExpressionObject

// 在查询中使用
await collection('users').aggregate([
    { $match: expr("age > 18 && status === 'active'") }
]);
```

### JavaScript 项目（有类型提示）

```javascript
const MonSQLize = require('monsqlize');
const { expr } = MonSQLize;

// VS Code 会提供类型提示
const expr = expr("age > 18");
```

---

## ✅ 类型验证

类型定义已经过验证：

- ✅ TypeScript 编译通过
- ✅ 无语法错误
- ✅ JSDoc 注释完整
- ✅ 67个操作符完整定义

---

## 📚 详细文档

- **类型定义**: `index.d.ts` (第1191-1440行)
- **操作符列表**: 见 `UnifiedExpressionOperators` 命名空间
- **使用示例**: 见 JSDoc 注释

---

## 🔍 IDE 智能提示

在支持 TypeScript 的 IDE 中（如 VS Code），你会获得：

- ✅ 自动完成
- ✅ 参数提示
- ✅ 类型检查
- ✅ 悬停文档

---

**最后更新**: 2026-01-19  
**版本**: v1.0.9

