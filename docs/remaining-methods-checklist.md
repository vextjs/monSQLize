# 剩余方法批量实施清单

> **创建日期**: 2025-12-12  
> **当前进度**: 9/26 (35%)  
> **剩余方法**: 17个  
> **预计时间**: 5小时

---

## 📋 剩余方法清单

### 查询方法（3个）

#### 1. find-by-ids.js（5分钟）
```javascript
// 导入
const { convertObjectIdStrings } = require('../../utils/objectid-converter');

// 在 findByIds 方法中
const convertedIds = Array.isArray(ids)
    ? ids.map(id => {
        if (typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id)) {
            try { return new ObjectId(id); } catch { return id; }
        }
        return id;
      })
    : ids;

// 使用 convertedIds 替换所有 ids
```

#### 2. find-page.js（10分钟）
```javascript
// 导入
const { convertObjectIdStrings } = require('../../utils/objectid-converter');

// 在 findPage 方法开头
const convertedFilter = convertObjectIdStrings(filter || {}, 'filter', 0, new WeakSet(), {
    logger: ctx.logger,
    excludeFields: ctx.autoConvertConfig?.excludeFields,
    customFieldPatterns: ctx.autoConvertConfig?.customFieldPatterns,
    maxDepth: ctx.autoConvertConfig?.maxDepth
});

// 替换所有使用 filter 的地方为 convertedFilter
```

#### 3. watch.js（5分钟）
```javascript
// 导入
const { convertAggregationPipeline } = require('../../utils/objectid-converter');

// 在 watch 方法中
const convertedPipeline = convertAggregationPipeline(pipeline, 0, {
    logger: context.logger,
    excludeFields: context.autoConvertConfig?.excludeFields,
    customFieldPatterns: context.autoConvertConfig?.customFieldPatterns,
    maxDepth: context.autoConvertConfig?.maxDepth || 5
});

// 使用 convertedPipeline
```

---

### 写入方法（11个）

#### 4. insert-many.js（10分钟）
```javascript
const { convertObjectIdStrings } = require('../../utils/objectid-converter');

const convertedDocuments = Array.isArray(documents)
    ? documents.map(doc => convertObjectIdStrings(doc, 'document', 0, new WeakSet(), {
        logger: context.logger,
        excludeFields: context.autoConvertConfig?.excludeFields,
        customFieldPatterns: context.autoConvertConfig?.customFieldPatterns,
        maxDepth: context.autoConvertConfig?.maxDepth
      }))
    : documents;

// 使用 convertedDocuments
```

#### 5. insert-batch.js（10分钟）
```javascript
// 同 insert-many.js
```

#### 6. update-many.js（10分钟）
```javascript
const { convertObjectIdStrings, convertUpdateDocument } = require('../../utils/objectid-converter');

const convertedFilter = convertObjectIdStrings(filter, ...);
const convertedUpdate = convertUpdateDocument(update, ...);

// 使用 convertedFilter 和 convertedUpdate
```

#### 7. replace-one.js（10分钟）
```javascript
const { convertObjectIdStrings } = require('../../utils/objectid-converter');

const convertedFilter = convertObjectIdStrings(filter, ...);
const convertedDocument = convertObjectIdStrings(document, ...);

// 使用 convertedFilter 和 convertedDocument
```

#### 8. upsert-one.js（10分钟）
```javascript
// 同 replace-one.js
```

#### 9. increment-one.js（5分钟）
```javascript
const { convertObjectIdStrings } = require('../../utils/objectid-converter');

const convertedFilter = convertObjectIdStrings(filter, ...);

// 只需转换 filter，value 是数字不需要转换
```

#### 10. find-one-and-update.js（10分钟）
```javascript
const { convertObjectIdStrings, convertUpdateDocument } = require('../../utils/objectid-converter');

const convertedFilter = convertObjectIdStrings(filter, ...);
const convertedUpdate = convertUpdateDocument(update, ...);
```

#### 11. find-one-and-replace.js（10分钟）
```javascript
const { convertObjectIdStrings } = require('../../utils/objectid-converter');

const convertedFilter = convertObjectIdStrings(filter, ...);
const convertedDocument = convertObjectIdStrings(document, ...);
```

#### 12. delete-one.js（5分钟）
```javascript
const { convertObjectIdStrings } = require('../../utils/objectid-converter');

const convertedFilter = convertObjectIdStrings(filter, ...);
```

#### 13. delete-many.js（5分钟）
```javascript
// 同 delete-one.js
```

#### 14. find-one-and-delete.js（5分钟）
```javascript
// 同 delete-one.js
```

---

### 配置支持（1个，1小时）

#### 15. lib/index.js（60分钟）

**位置**: MonSQLize 类构造函数

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
    
    // 用户禁用
    if (config === false) {
        return { enabled: false };
    }
    
    // 用户配置
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

**传递配置到 context**:

在创建 MongoDB collection accessor 时：

```javascript
const context = {
    // ...existing context properties...
    autoConvertConfig: this.autoConvertConfig  // ✅ 添加这行
};
```

---

### 链式调用（2个，1小时）

#### 16-17. lib/mongodb/queries/chain.js（60分钟）

**FindChain 类**:

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

**AggregateChain 类**:

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

## 🚀 批量实施建议

### 方式1：逐个实施（推荐）

**优点**: 可控、可测试、可追溯

**步骤**:
1. 选择一个方法文件
2. 按照上面的模板添加转换代码
3. 验证无编译错误
4. 提交到 Git
5. 继续下一个

**预计时间**: 5小时

### 方式2：分组实施

**第1组：查询方法**（20分钟）
- find-by-ids.js
- find-page.js
- watch.js

**第2组：简单写入**（30分钟）
- delete-one.js
- delete-many.js
- find-one-and-delete.js
- increment-one.js

**第3组：批量操作**（30分钟）
- insert-many.js
- insert-batch.js
- update-many.js

**第4组：复杂写入**（40分钟）
- replace-one.js
- upsert-one.js
- find-one-and-update.js
- find-one-and-replace.js

**第5组：配置和链式**（2小时）
- lib/index.js（配置）
- chain.js（FindChain + AggregateChain）

---

## ✅ 实施后检查清单

每个方法完成后：

- [ ] 已导入转换函数
- [ ] 已在方法入口添加转换
- [ ] 所有使用参数的地方都用转换后的值
- [ ] 支持的分支（explain, stream等）都已更新
- [ ] 无编译错误
- [ ] 已提交到 Git

配置支持完成后：

- [ ] autoConvertConfig 已初始化
- [ ] 配置已传递到 context
- [ ] 支持 enabled/excludeFields/customFieldPatterns/maxDepth
- [ ] 默认启用
- [ ] 可通过 config 禁用

链式调用完成后：

- [ ] FindChain 构造函数转换 filter
- [ ] AggregateChain 构造函数转换 pipeline
- [ ] 无循环引用问题

---

## 📝 提交规范

每完成一批方法：

```bash
git add lib/mongodb/queries/*.js lib/mongodb/writes/*.js
git commit -m "feat: 自动 ObjectId 转换 - 批量集成（第X组）

集成方法:
- method1.js: 描述
- method2.js: 描述

进度: X/26 方法已完成（X%）"
```

最终提交：

```bash
git add lib/index.js lib/mongodb/queries/chain.js
git commit -m "feat: 自动 ObjectId 转换 - 功能完成

✅ 全部方法已集成（26/26）
✅ 配置支持已添加
✅ 链式调用已支持

完成度: 100%
工作时长: ~19小时
状态: 可发布"
```

---

## 🎯 完成后验证

### 功能验证

```javascript
const { MonSQLize } = require('monsqlize');

// 初始化
const msq = new MonSQLize({
    type: 'mongodb',
    config: { uri: 'mongodb://localhost:27017/test' },
    autoConvertObjectId: {
        enabled: true,
        excludeFields: ['code'], // 业务代码字段不转换
    }
});

// 测试查询
const user = await msq.collection('users').findOne({ 
    _id: '507f1f77bcf86cd799439011' // ✅ 自动转换为 ObjectId
});

// 测试插入
await msq.collection('users').insertOne({ 
    name: 'Alice',
    userId: '507f1f77bcf86cd799439012' // ✅ 自动转换为 ObjectId
});

// 测试更新
await msq.collection('users').updateOne(
    { _id: '507f1f77bcf86cd799439011' }, // ✅ 自动转换
    { $set: { managerId: '507f1f77bcf86cd799439013' } } // ✅ 自动转换
);

// 测试聚合
const result = await msq.collection('orders').aggregate([
    { $match: { userId: '507f1f77bcf86cd799439011' } }, // ✅ 自动转换
    { $group: { _id: '$status' } }
]);

console.log('✅ 所有功能验证通过！');
```

### 性能验证

```bash
node test/performance/objectid-conversion.bench.js
```

预期结果：所有场景开销 < 10%

---

**创建时间**: 2025-12-12  
**预计完成**: 剩余5小时  
**当前状态**: 9/26 (35%)

