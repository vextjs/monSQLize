# 自动 ObjectId 转换 - 剩余工作实施指南

> **日期**: 2025-12-12  
> **状态**: 核心完成，剩余重复性工作  
> **已完成**: 6/25 方法（24%）

---

## ✅ 已完成的工作

### 核心功能（100% 完成）
1. ✅ 性能验证通过（< 10% 开销）
2. ✅ 核心转换工具（620行代码）
3. ✅ 缓存键标准化
4. ✅ 5个关键查询方法集成

### 已集成的方法
- `find.js` - 多条记录查询
- `find-one.js` - 单条记录查询
- `aggregate.js` - 聚合管道
- `count.js` - 文档计数
- `distinct.js` - 字段去重

---

## 📋 剩余工作清单

### 查询方法（剩余4个）
- [ ] `find-and-count.js`
- [ ] `find-by-ids.js`
- [ ] `find-page.js`
- [ ] `watch.js`

### 写入方法（剩余13个）
- [ ] `insert-one.js`
- [ ] `insert-many.js`
- [ ] `insert-batch.js`
- [ ] `update-one.js`
- [ ] `update-many.js`
- [ ] `replace-one.js`
- [ ] `upsert-one.js`
- [ ] `increment-one.js`
- [ ] `find-one-and-update.js`
- [ ] `find-one-and-replace.js`
- [ ] `delete-one.js`
- [ ] `delete-many.js`
- [ ] `find-one-and-delete.js`

### 配置支持（剩余1个）
- [ ] `lib/index.js` - 添加配置选项

### 链式调用（剩余1个）
- [ ] `lib/mongodb/queries/chain.js` - FindChain, AggregateChain

---

## 🔧 实施模板

### 模板1：查询方法（带 filter 参数）

```javascript
// 步骤1：导入转换函数
const { convertObjectIdStrings } = require('../../utils/objectid-converter');

// 步骤2：在方法开头转换 filter/query
methodName: async (filter = {}, options = {}) => {
    // ✅ v1.3.0: 自动转换 ObjectId 字符串
    const convertedFilter = convertObjectIdStrings(filter, 'filter', 0, new WeakSet(), {
        logger: context.logger,
        excludeFields: context.autoConvertConfig?.excludeFields,
        customFieldPatterns: context.autoConvertConfig?.customFieldPatterns,
        maxDepth: context.autoConvertConfig?.maxDepth
    });
    
    // 步骤3：使用 convertedFilter 替换所有原 filter
    // ...existing code 使用 convertedFilter...
}
```

**适用方法**:
- `find-and-count.js`: `findAndCount(filter, options)`
- `find-by-ids.js`: `findByIds(ids, options)` - ids 是数组，直接转换
- `find-page.js`: `findPage(filter, options)`
- `delete-one.js`: `deleteOne(filter, options)`
- `delete-many.js`: `deleteMany(filter, options)`
- `find-one-and-delete.js`: `findOneAndDelete(filter, options)`

---

### 模板2：写入方法（带 document 参数）

```javascript
// 步骤1：导入转换函数
const { convertObjectIdStrings } = require('../../utils/objectid-converter');

// 步骤2：在方法开头转换 document
methodName: async (document, options = {}) => {
    // ✅ v1.3.0: 自动转换 ObjectId 字符串
    const convertedDocument = convertObjectIdStrings(document, 'document', 0, new WeakSet(), {
        logger: context.logger,
        excludeFields: context.autoConvertConfig?.excludeFields,
        customFieldPatterns: context.autoConvertConfig?.customFieldPatterns,
        maxDepth: context.autoConvertConfig?.maxDepth
    });
    
    // 步骤3：使用 convertedDocument
    // ...existing code 使用 convertedDocument...
}
```

**适用方法**:
- `insert-one.js`: `insertOne(document, options)`
- `replace-one.js`: `replaceOne(filter, document, options)` - 转换 filter 和 document
- `upsert-one.js`: `upsertOne(filter, document, options)` - 转换 filter 和 document

---

### 模板3：批量写入方法（带 documents 数组）

```javascript
// 步骤1：导入转换函数
const { convertObjectIdStrings } = require('../../utils/objectid-converter');

// 步骤2：转换数组中的每个 document
methodName: async (documents, options = {}) => {
    // ✅ v1.3.0: 自动转换 ObjectId 字符串
    const convertedDocuments = Array.isArray(documents)
        ? documents.map(doc => convertObjectIdStrings(doc, 'document', 0, new WeakSet(), {
            logger: context.logger,
            excludeFields: context.autoConvertConfig?.excludeFields,
            customFieldPatterns: context.autoConvertConfig?.customFieldPatterns,
            maxDepth: context.autoConvertConfig?.maxDepth
          }))
        : documents;
    
    // 步骤3：使用 convertedDocuments
    // ...existing code 使用 convertedDocuments...
}
```

**适用方法**:
- `insert-many.js`: `insertMany(documents, options)`
- `insert-batch.js`: `insertBatch(documents, batchSize, options)`

---

### 模板4：更新方法（带 filter 和 update）

```javascript
// 步骤1：导入转换函数
const { convertObjectIdStrings, convertUpdateDocument } = require('../../utils/objectid-converter');

// 步骤2：转换 filter 和 update
methodName: async (filter, update, options = {}) => {
    // ✅ v1.3.0: 自动转换 ObjectId 字符串
    const convertedFilter = convertObjectIdStrings(filter, 'filter', 0, new WeakSet(), {
        logger: context.logger,
        excludeFields: context.autoConvertConfig?.excludeFields,
        customFieldPatterns: context.autoConvertConfig?.customFieldPatterns,
        maxDepth: context.autoConvertConfig?.maxDepth
    });
    
    const convertedUpdate = convertUpdateDocument(update, {
        logger: context.logger,
        excludeFields: context.autoConvertConfig?.excludeFields,
        customFieldPatterns: context.autoConvertConfig?.customFieldPatterns,
        maxDepth: context.autoConvertConfig?.maxDepth
    });
    
    // 步骤3：使用转换后的参数
    // ...existing code 使用 convertedFilter 和 convertedUpdate...
}
```

**适用方法**:
- `update-one.js`: `updateOne(filter, update, options)`
- `update-many.js`: `updateMany(filter, update, options)`
- `find-one-and-update.js`: `findOneAndUpdate(filter, update, options)`
- `find-one-and-replace.js`: `findOneAndReplace(filter, document, options)` - 用模板2

---

### 模板5：特殊方法

#### `increment-one.js`
```javascript
// 只需要转换 filter，value 是数字不需要转换
incrementOne: async (filter, field, value = 1, options = {}) => {
    const convertedFilter = convertObjectIdStrings(filter, ...);
    // ...existing code 使用 convertedFilter...
}
```

#### `watch.js`
```javascript
// 需要转换 pipeline（如果有）
watch: (pipeline = [], options = {}) => {
    const convertedPipeline = convertAggregationPipeline(pipeline, ...);
    // ...existing code 使用 convertedPipeline...
}
```

---

## 🔧 链式调用修改

### `lib/mongodb/queries/chain.js`

#### FindChain
```javascript
const { convertObjectIdStrings } = require('../../utils/objectid-converter');

class FindChain {
    constructor(context, filter, options) {
        this.context = context;
        // ✅ 在构造函数中转换
        this.filter = convertObjectIdStrings(filter, 'filter', 0, new WeakSet(), {
            logger: context.logger,
            excludeFields: context.autoConvertConfig?.excludeFields,
            customFieldPatterns: context.autoConvertConfig?.customFieldPatterns,
            maxDepth: context.autoConvertConfig?.maxDepth
        });
        this.options = options;
    }
    
    // ...existing methods use this.filter...
}
```

#### AggregateChain
```javascript
const { convertAggregationPipeline } = require('../../utils/objectid-converter');

class AggregateChain {
    constructor(context, pipeline, options) {
        this.context = context;
        // ✅ 在构造函数中转换
        this.pipeline = convertAggregationPipeline(pipeline, 0, {
            logger: context.logger,
            excludeFields: context.autoConvertConfig?.excludeFields,
            customFieldPatterns: context.autoConvertConfig?.customFieldPatterns,
            maxDepth: context.autoConvertConfig?.maxDepth || 5
        });
        this.options = options;
    }
    
    // ...existing methods use this.pipeline...
}
```

---

## 🔧 配置支持

### `lib/index.js`

在 MonSQLize 类的构造函数中添加：

```javascript
constructor(options) {
    // ...existing code...
    
    // ✅ v1.3.0: 自动 ObjectId 转换配置
    this.autoConvertConfig = this._initAutoConvertConfig(
        options.autoConvertObjectId, 
        options.type
    );
}

/**
 * 初始化 ObjectId 自动转换配置
 * @private
 */
_initAutoConvertConfig(config, dbType) {
    // 只在 MongoDB 类型下启用
    if (dbType !== 'mongodb') {
        return { enabled: false };
    }
    
    // 默认配置
    const defaults = {
        enabled: true,
        excludeFields: [],
        customFieldPatterns: [],
        maxDepth: 10,
        logLevel: 'warn'
    };
    
    // 用户配置
    if (config === false) {
        return { enabled: false };
    }
    
    if (typeof config === 'object' && config !== null) {
        return {
            enabled: config.enabled !== false,
            excludeFields: Array.isArray(config.excludeFields) 
                ? config.excludeFields 
                : defaults.excludeFields,
            customFieldPatterns: Array.isArray(config.customFieldPatterns) 
                ? config.customFieldPatterns 
                : defaults.customFieldPatterns,
            maxDepth: typeof config.maxDepth === 'number' 
                ? config.maxDepth 
                : defaults.maxDepth,
            logLevel: config.logLevel || defaults.logLevel
        };
    }
    
    return defaults;
}
```

然后在创建 context 时传递配置：

```javascript
// 在创建 context 的地方
const context = {
    // ...existing context...
    autoConvertConfig: this.autoConvertConfig  // ✅ 添加这行
};
```

---

## 📊 工作量估算

| 任务 | 方法数 | 预计时间 | 难度 |
|------|--------|---------|------|
| 剩余查询方法 | 4 | 1h | 🟢 简单 |
| 写入方法 | 13 | 3-4h | 🟢 简单 |
| 配置支持 | 1 | 1h | 🟢 简单 |
| 链式调用 | 2类 | 1h | 🟡 中等 |
| **总计** | **20个** | **6-7h** | 🟢 **重复性工作** |

---

## ✅ 验证清单

每个方法修改后检查：

- [ ] 导入了转换函数
- [ ] 在方法入口调用转换
- [ ] 所有使用参数的地方都用转换后的值
- [ ] 支持的分支（explain, stream等）都已更新
- [ ] 传递了 autoConvertConfig 配置

---

## 🎯 提交规范

每完成一批方法后提交：

```bash
git add lib/mongodb/queries/*.js lib/mongodb/writes/*.js
git commit -m "feat: 自动 ObjectId 转换 - 阶段1.X

集成 ObjectId 转换到方法:
- method1.js: 描述
- method2.js: 描述

进度: X/25 方法已完成（X%）"
```

---

## 📝 注意事项

1. **不要修改快捷方法**（已有转换）
   - `find-one-by-id.js` - 已经在内部调用 findOne
   - `find-by-ids.js` - 已经在内部调用 find

2. **特殊方法**
   - `watch.js` - 使用 convertAggregationPipeline
   - `increment-one.js` - 只转换 filter

3. **配置传递**
   - 确保 context 包含 autoConvertConfig
   - 所有转换调用都传递配置

---

**创建时间**: 2025-12-12  
**下次更新**: 完成所有方法后

