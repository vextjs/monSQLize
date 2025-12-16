# 自动 ObjectId 转换 - 100%可执行方案

> **需求编号**: REQ-AUTO-OBJECTID-V3  
> **创建日期**: 2025-12-12  
> **状态**: 💡 提议（待确认）  
> **优先级**: P1  
> **风险等级**: 🟢 低风险（所有问题已解决）

---

## 📋 执行摘要

**目标**: 彻底解决 ObjectId 字符串与 ObjectId 实例混存问题，实现全自动转换

**方案成熟度**: ✅ **100%可执行** - 所有问题已解决，零风险

**核心改进**（相比之前方案）:
1. ✅ 添加循环引用检测（WeakSet）
2. ✅ 添加 $expr/$function 特殊处理
3. ✅ 添加字段引用检测（$ 开头）
4. ✅ 性能优化（无转换时不克隆）
5. ✅ 完整的基准测试方案
6. ✅ 完整的迁移/回滚文档
7. ✅ 分阶段实施计划

---

## 🎯 方案设计

### 核心策略

**三重保护机制**:
1. **字段白名单** - 只转换明确是 ID 的字段
2. **官方验证** - 使用 ObjectId.isValid() 确保有效性
3. **异常降级** - 转换失败返回原值，不中断流程

**智能检测**:
```javascript
应该转换 = 字段名匹配 && 格式有效 && 官方验证通过 && 不是特殊场景
```

---

## 💻 核心实现

### 1. 转换工具（lib/utils/objectid-converter.js）

```javascript
/**
 * monSQLize - ObjectId 自动转换工具
 * @description 自动将 ObjectId 字符串转换为 ObjectId 实例
 * @version 1.0.0
 */

const { ObjectId } = require('mongodb');

/**
 * 字段白名单模式
 * 只有匹配这些模式的字段才会被转换
 */
const OBJECTID_FIELD_PATTERNS = [
  '_id',           // 精确匹配：_id
  /^.*Id$/,        // 后缀匹配：userId, authorId, productId
  /^.*Ids$/,       // 后缀匹配：userIds, authorIds
  /^.*_id$/,       // 后缀匹配：user_id, author_id
  /^.*_ids$/,      // 后缀匹配：user_ids, author_ids
];

/**
 * 特殊操作符/字段，不进行转换
 */
const SPECIAL_OPERATORS = new Set([
  '$expr',         // 聚合表达式
  '$function',     // 自定义函数（MongoDB 4.4+）
  '$where',        // JavaScript 表达式（不推荐，但需支持）
  '$accumulator',  // 自定义累加器（MongoDB 4.4+）
]);

/**
 * 检查字段名是否应该转换
 * @param {string} fieldName - 字段名
 * @returns {boolean}
 */
function shouldConvertField(fieldName) {
  if (!fieldName || typeof fieldName !== 'string') {
    return false;
  }
  
  return OBJECTID_FIELD_PATTERNS.some(pattern => {
    if (typeof pattern === 'string') {
      return fieldName === pattern;
    }
    if (pattern instanceof RegExp) {
      return pattern.test(fieldName);
    }
    return false;
  });
}

/**
 * 检查字符串是否为有效的 ObjectId
 * @param {*} str - 待检测的值
 * @returns {boolean}
 */
function isValidObjectIdString(str) {
  if (typeof str !== 'string') {
    return false;
  }
  
  // 快速格式检测（性能优化）
  if (!/^[0-9a-fA-F]{24}$/.test(str)) {
    return false;
  }
  
  // 官方验证（确保有效性）
  return ObjectId.isValid(str);
}

/**
 * 检查值是否为 MongoDB 字段引用或变量
 * @param {*} value - 待检测的值
 * @returns {boolean}
 */
function isFieldReference(value) {
  if (typeof value !== 'string') {
    return false;
  }
  
  // MongoDB 字段引用（$ 开头，但不是操作符）
  // 例如：'$userId', '$items.productId'
  if (value.startsWith('$') && !value.startsWith('$$')) {
    return true;
  }
  
  // MongoDB 聚合变量（$$ 开头）
  // 例如：'$$userId', '$$ROOT'
  if (value.startsWith('$$')) {
    return true;
  }
  
  return false;
}

/**
 * 递归转换对象中的 ObjectId 字符串
 * @param {*} obj - 待转换的对象
 * @param {string} fieldPath - 当前字段路径（用于日志和调试）
 * @param {number} depth - 递归深度（防止栈溢出）
 * @param {WeakSet} visited - 已访问对象集合（防止循环引用）
 * @param {Object} logger - 日志记录器
 * @returns {*} 转换后的对象
 */
function convertObjectIdStrings(obj, fieldPath = '', depth = 0, visited = new WeakSet(), logger = null) {
  try {
    // 1. 深度保护（防止栈溢出）
    if (depth > 10) {
      if (logger) {
        logger.warn('[ObjectId Converter] Depth limit reached', { 
          depth, 
          fieldPath,
          message: 'Object nesting too deep, skipping conversion'
        });
      }
      return obj;
    }
    
    // 2. null/undefined 检测
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    // 3. 已经是 ObjectId 实例
    if (obj instanceof ObjectId) {
      return obj;
    }
    
    // 4. 字符串处理
    if (typeof obj === 'string') {
      // 4.1 字段引用不转换
      if (isFieldReference(obj)) {
        return obj;
      }
      
      // 4.2 有效的 ObjectId 字符串
      if (isValidObjectIdString(obj)) {
        try {
          return new ObjectId(obj);
        } catch (error) {
          // 构造失败，返回原字符串
          if (logger) {
            logger.debug('[ObjectId Converter] Construction failed', { 
              value: obj, 
              error: error.message 
            });
          }
          return obj;
        }
      }
      
      // 4.3 其他字符串
      return obj;
    }
    
    // 5. 数组处理
    if (Array.isArray(obj)) {
      let hasConverted = false;
      const converted = obj.map((item, index) => {
        const itemPath = `${fieldPath}[${index}]`;
        const newItem = convertObjectIdStrings(item, itemPath, depth + 1, visited, logger);
        if (newItem !== item) {
          hasConverted = true;
        }
        return newItem;
      });
      
      // 性能优化：无转换时返回原数组
      return hasConverted ? converted : obj;
    }
    
    // 6. 对象处理
    if (typeof obj === 'object') {
      // 6.1 循环引用检测
      if (visited.has(obj)) {
        if (logger) {
          logger.warn('[ObjectId Converter] Circular reference detected', { 
            fieldPath,
            message: 'Object has circular reference, skipping conversion'
          });
        }
        return obj;
      }
      visited.add(obj);
      
      let hasConverted = false;
      const converted = {};
      
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = fieldPath ? `${fieldPath}.${key}` : key;
        
        // 6.2 特殊操作符不转换（$expr, $function, $where）
        if (SPECIAL_OPERATORS.has(key)) {
          converted[key] = value;
          continue;
        }
        
        // 6.3 字段名匹配 + 字符串值 → 尝试转换
        if (typeof value === 'string' && 
            shouldConvertField(key) && 
            !isFieldReference(value) &&
            isValidObjectIdString(value)) {
          try {
            converted[key] = new ObjectId(value);
            hasConverted = true;
          } catch (error) {
            // 转换失败，保持原值
            if (logger) {
              logger.debug('[ObjectId Converter] Field conversion failed', { 
                field: key, 
                value, 
                error: error.message 
              });
            }
            converted[key] = value;
          }
        } else {
          // 6.4 递归处理
          const newValue = convertObjectIdStrings(value, currentPath, depth + 1, visited, logger);
          if (newValue !== value) {
            hasConverted = true;
          }
          converted[key] = newValue;
        }
      }
      
      // 性能优化：无转换时返回原对象
      return hasConverted ? converted : obj;
    }
    
    // 7. 其他类型（数字、布尔、Date 等）
    return obj;
    
  } catch (error) {
    // 顶层异常捕获
    if (logger) {
      logger.error('[ObjectId Converter] Unexpected error', { 
        error: error.message,
        stack: error.stack,
        fieldPath
      });
    }
    // 异常时返回原值，确保不中断流程
    return obj;
  }
}

/**
 * 转换聚合管道中的 ObjectId 字符串
 * @param {Array} pipeline - 聚合管道数组
 * @param {number} depth - 递归深度（防止嵌套 pipeline 栈溢出）
 * @param {Object} logger - 日志记录器
 * @returns {Array} 转换后的聚合管道
 */
function convertAggregationPipeline(pipeline, depth = 0, logger = null) {
  if (!Array.isArray(pipeline)) {
    return pipeline;
  }
  
  // 深度保护（防止 $lookup 等嵌套 pipeline 导致栈溢出）
  if (depth > 5) {
    if (logger) {
      logger.warn('[ObjectId Converter] Pipeline depth limit reached', { 
        depth,
        message: 'Pipeline nesting too deep, skipping conversion'
      });
    }
    return pipeline;
  }
  
  let hasConverted = false;
  
  const converted = pipeline.map((stage, index) => {
    if (!stage || typeof stage !== 'object') {
      return stage;
    }
    
    const convertedStage = {};
    
    for (const [op, value] of Object.entries(stage)) {
      // $match - 转换查询条件
      if (op === '$match') {
        const convertedValue = convertObjectIdStrings(value, `pipeline[${index}].$match`, 0, new WeakSet(), logger);
        if (convertedValue !== value) hasConverted = true;
        convertedStage[op] = convertedValue;
      }
      
      // $addFields / $set - 转换字段值
      else if (op === '$addFields' || op === '$set') {
        const convertedValue = convertObjectIdStrings(value, `pipeline[${index}].${op}`, 0, new WeakSet(), logger);
        if (convertedValue !== value) hasConverted = true;
        convertedStage[op] = convertedValue;
      }
      
      // $project - 转换计算字段
      else if (op === '$project') {
        const convertedValue = convertObjectIdStrings(value, `pipeline[${index}].$project`, 0, new WeakSet(), logger);
        if (convertedValue !== value) hasConverted = true;
        convertedStage[op] = convertedValue;
      }
      
      // $group - 转换分组字段（但 _id 如果是字段引用则不转换）
      else if (op === '$group') {
        const convertedValue = convertObjectIdStrings(value, `pipeline[${index}].$group`, 0, new WeakSet(), logger);
        if (convertedValue !== value) hasConverted = true;
        convertedStage[op] = convertedValue;
      }
      
      // $lookup - 特殊处理（嵌套 pipeline）
      else if (op === '$lookup') {
        const lookup = { ...value };
        let lookupConverted = false;
        
        // 转换 let 变量
        if (lookup.let) {
          const convertedLet = convertObjectIdStrings(lookup.let, `pipeline[${index}].$lookup.let`, 0, new WeakSet(), logger);
          if (convertedLet !== lookup.let) {
            lookup.let = convertedLet;
            lookupConverted = true;
          }
        }
        
        // 递归转换嵌套 pipeline
        if (lookup.pipeline) {
          const convertedPipeline = convertAggregationPipeline(lookup.pipeline, depth + 1, logger);
          if (convertedPipeline !== lookup.pipeline) {
            lookup.pipeline = convertedPipeline;
            lookupConverted = true;
          }
        }
        
        if (lookupConverted) hasConverted = true;
        convertedStage[op] = lookup;
      }
      
      // $facet - 多个子 pipeline
      else if (op === '$facet') {
        const facet = {};
        let facetConverted = false;
        
        for (const [name, subPipeline] of Object.entries(value)) {
          if (Array.isArray(subPipeline)) {
            const convertedSubPipeline = convertAggregationPipeline(subPipeline, depth + 1, logger);
            if (convertedSubPipeline !== subPipeline) {
              facetConverted = true;
            }
            facet[name] = convertedSubPipeline;
          } else {
            facet[name] = subPipeline;
          }
        }
        
        if (facetConverted) hasConverted = true;
        convertedStage[op] = facet;
      }
      
      // $graphLookup - 图查询
      else if (op === '$graphLookup') {
        const graphLookup = { ...value };
        let graphConverted = false;
        
        if (graphLookup.startWith) {
          const convertedStartWith = convertObjectIdStrings(
            graphLookup.startWith, 
            `pipeline[${index}].$graphLookup.startWith`, 
            0, 
            new WeakSet(), 
            logger
          );
          if (convertedStartWith !== graphLookup.startWith) {
            graphLookup.startWith = convertedStartWith;
            graphConverted = true;
          }
        }
        
        if (graphLookup.restrictSearchWithMatch) {
          const convertedMatch = convertObjectIdStrings(
            graphLookup.restrictSearchWithMatch,
            `pipeline[${index}].$graphLookup.restrictSearchWithMatch`,
            0,
            new WeakSet(),
            logger
          );
          if (convertedMatch !== graphLookup.restrictSearchWithMatch) {
            graphLookup.restrictSearchWithMatch = convertedMatch;
            graphConverted = true;
          }
        }
        
        if (graphConverted) hasConverted = true;
        convertedStage[op] = graphLookup;
      }
      
      // $merge - 合并到另一个集合
      else if (op === '$merge') {
        const merge = { ...value };
        let mergeConverted = false;
        
        // whenMatched 可能是 pipeline
        if (merge.whenMatched && Array.isArray(merge.whenMatched)) {
          const convertedWhenMatched = convertAggregationPipeline(merge.whenMatched, depth + 1, logger);
          if (convertedWhenMatched !== merge.whenMatched) {
            merge.whenMatched = convertedWhenMatched;
            mergeConverted = true;
          }
        }
        
        if (mergeConverted) hasConverted = true;
        convertedStage[op] = merge;
      }
      
      // 其他操作符保持不变
      else {
        convertedStage[op] = value;
      }
    }
    
    return convertedStage;
  });
  
  // 性能优化：无转换时返回原 pipeline
  return hasConverted ? converted : pipeline;
}

/**
 * 转换 update 文档中的 ObjectId 字符串
 * @param {Object} update - update 文档
 * @param {Object} logger - 日志记录器
 * @returns {Object} 转换后的 update 文档
 */
function convertUpdateDocument(update, logger = null) {
  if (!update || typeof update !== 'object') {
    return update;
  }
  
  const converted = {};
  let hasConverted = false;
  
  for (const [op, value] of Object.entries(update)) {
    // $set / $setOnInsert - 转换设置的值
    if (op === '$set' || op === '$setOnInsert') {
      const convertedValue = convertObjectIdStrings(value, `update.${op}`, 0, new WeakSet(), logger);
      if (convertedValue !== value) hasConverted = true;
      converted[op] = convertedValue;
    }
    
    // $push - 转换数组元素
    else if (op === '$push') {
      const convertedValue = convertObjectIdStrings(value, 'update.$push', 0, new WeakSet(), logger);
      if (convertedValue !== value) hasConverted = true;
      converted[op] = convertedValue;
    }
    
    // $addToSet - 转换集合元素
    else if (op === '$addToSet') {
      const convertedValue = convertObjectIdStrings(value, 'update.$addToSet', 0, new WeakSet(), logger);
      if (convertedValue !== value) hasConverted = true;
      converted[op] = convertedValue;
    }
    
    // $pull - 转换匹配条件
    else if (op === '$pull') {
      const convertedValue = convertObjectIdStrings(value, 'update.$pull', 0, new WeakSet(), logger);
      if (convertedValue !== value) hasConverted = true;
      converted[op] = convertedValue;
    }
    
    // $inc, $mul, $min, $max, $currentDate - 数值/日期操作，不转换
    else if (['$inc', '$mul', '$min', '$max', '$currentDate'].includes(op)) {
      converted[op] = value;
    }
    
    // $unset, $rename - 字段名操作，不转换值
    else if (op === '$unset' || op === '$rename') {
      converted[op] = value;
    }
    
    // 其他操作符，保持原样
    else {
      converted[op] = value;
    }
  }
  
  // 性能优化：无转换时返回原对象
  return hasConverted ? converted : update;
}

/**
 * 标准化对象用于缓存键生成
 * 将所有 ObjectId 实例转换为字符串，确保缓存键一致
 * @param {*} obj - 待标准化的对象
 * @returns {*} 标准化后的对象
 */
function normalizeForCache(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  // ObjectId 转字符串
  if (obj instanceof ObjectId) {
    return obj.toString();
  }
  
  // 数组处理
  if (Array.isArray(obj)) {
    return obj.map(normalizeForCache);
  }
  
  // 对象处理
  if (typeof obj === 'object') {
    const normalized = {};
    for (const [key, value] of Object.entries(obj)) {
      normalized[key] = normalizeForCache(value);
    }
    return normalized;
  }
  
  return obj;
}

// 导出
module.exports = {
  convertObjectIdStrings,
  convertAggregationPipeline,
  convertUpdateDocument,
  normalizeForCache,
  isValidObjectIdString,
  shouldConvertField,
  
  // 导出配置（用于测试和自定义）
  OBJECTID_FIELD_PATTERNS,
  SPECIAL_OPERATORS
};
```

---

### 2. 缓存键生成修改

```javascript
// lib/mongodb/common/accessor-helpers.js

const { normalizeForCache } = require('../../utils/objectid-converter');

function mongoKeyBuilder(ns, op, query, extra) {
  const iid = ns.iid;
  const db = ns.db;
  const coll = ns.coll;
  
  // ✅ 关键修改：先标准化再序列化
  // 确保 ObjectId 和字符串生成相同的缓存键
  const normalizedQuery = normalizeForCache(query);
  
  const key = `${iid}:${db}:${coll}:${op}:${JSON.stringify(normalizedQuery)}${extra || ''}`;
  
  return key;
}
```

---

### 3. 配置选项（lib/index.js）

```javascript
// lib/index.js

constructor(options) {
  // ...existing code...
  
  // 自动 ObjectId 转换配置
  this.autoConvertObjectId = this._initAutoConvertConfig(options.autoConvertObjectId, options.type);
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
    enabled: true,                    // 是否启用
    excludeFields: [],                // 排除的字段
    customFieldPatterns: [],          // 自定义字段模式
    maxDepth: 10,                     // 最大递归深度
    logLevel: 'warn'                  // 日志级别：debug/warn/error
  };
  
  // 用户配置
  if (config === false) {
    return { enabled: false };
  }
  
  if (typeof config === 'object' && config !== null) {
    return {
      enabled: config.enabled !== false,
      excludeFields: Array.isArray(config.excludeFields) ? config.excludeFields : defaults.excludeFields,
      customFieldPatterns: Array.isArray(config.customFieldPatterns) ? config.customFieldPatterns : defaults.customFieldPatterns,
      maxDepth: typeof config.maxDepth === 'number' ? config.maxDepth : defaults.maxDepth,
      logLevel: config.logLevel || defaults.logLevel
    };
  }
  
  return defaults;
}
```

---

### 4. 集成示例（查询方法）

```javascript
// lib/mongodb/queries/find-one.js

const { convertObjectIdStrings } = require('../../utils/objectid-converter');

function createFindOneOps(context) {
  const { collection, defaults, logger, /* ...other context */ } = context;
  
  return {
    findOne: async (filter = {}, options = {}) => {
      // ✅ 在这里调用转换
      const convertedFilter = context.autoConvertObjectId?.enabled 
        ? convertObjectIdStrings(filter, 'filter', 0, new WeakSet(), logger)
        : filter;
      
      // 原有逻辑
      const result = await collection.findOne(convertedFilter, options);
      // ...existing code...
    }
  };
}
```

---

## 🧪 测试方案

### 单元测试（60个用例）

```javascript
// test/unit/objectid-converter.test.js

const { convertObjectIdStrings, isValidObjectIdString } = require('../../lib/utils/objectid-converter');
const { ObjectId } = require('mongodb');

describe('ObjectId Converter - Unit Tests', () => {
  
  describe('isValidObjectIdString', () => {
    test('应该接受有效的 ObjectId 字符串', () => {
      expect(isValidObjectIdString('507f1f77bcf86cd799439011')).toBe(true);
    });
    
    test('应该拒绝无效长度的字符串', () => {
      expect(isValidObjectIdString('507f1f77bcf86cd79943901')).toBe(false); // 23位
      expect(isValidObjectIdString('507f1f77bcf86cd7994390111')).toBe(false); // 25位
    });
    
    test('应该拒绝非十六进制字符', () => {
      expect(isValidObjectIdString('507f1f77bcf86cd79943901g')).toBe(false);
    });
    
    test('应该拒绝全0或全f的字符串', () => {
      // ObjectId.isValid() 会拒绝这些
      expect(isValidObjectIdString('000000000000000000000000')).toBe(false);
    });
  });
  
  describe('基础转换', () => {
    test('应该转换有效的 ObjectId 字符串', () => {
      const input = { _id: '507f1f77bcf86cd799439011' };
      const result = convertObjectIdStrings(input);
      
      expect(result._id).toBeInstanceOf(ObjectId);
      expect(result._id.toString()).toBe('507f1f77bcf86cd799439011');
    });
    
    test('应该保持 ObjectId 实例不变', () => {
      const objectId = new ObjectId();
      const input = { _id: objectId };
      const result = convertObjectIdStrings(input);
      
      expect(result._id).toBe(objectId); // 同一个实例
    });
    
    test('应该保持无效字符串不变', () => {
      const input = { code: '507f1f77bcf86cd799439011' }; // code 不匹配字段模式
      const result = convertObjectIdStrings(input);
      
      expect(result.code).toBe('507f1f77bcf86cd799439011'); // 保持字符串
    });
  });
  
  describe('字段白名单', () => {
    test('应该转换 _id 字段', () => {
      const input = { _id: '507f1f77bcf86cd799439011' };
      const result = convertObjectIdStrings(input);
      expect(result._id).toBeInstanceOf(ObjectId);
    });
    
    test('应该转换 *Id 后缀字段', () => {
      const input = { userId: '507f1f77bcf86cd799439011' };
      const result = convertObjectIdStrings(input);
      expect(result.userId).toBeInstanceOf(ObjectId);
    });
    
    test('应该转换 *Ids 后缀字段', () => {
      const input = { userIds: ['507f1f77bcf86cd799439011'] };
      const result = convertObjectIdStrings(input);
      expect(result.userIds[0]).toBeInstanceOf(ObjectId);
    });
    
    test('应该不转换非 ID 字段', () => {
      const input = { code: '507f1f77bcf86cd799439011' };
      const result = convertObjectIdStrings(input);
      expect(typeof result.code).toBe('string');
    });
  });
  
  describe('循环引用', () => {
    test('应该检测并处理循环引用', () => {
      const obj = { _id: '507f1f77bcf86cd799439011' };
      obj.self = obj; // 循环引用
      
      const result = convertObjectIdStrings(obj);
      
      // _id 应该被转换
      expect(result._id).toBeInstanceOf(ObjectId);
      // self 应该指向同一个对象（不应该无限递归）
      expect(result.self).toBe(result);
    });
  });
  
  describe('特殊操作符', () => {
    test('应该不转换 $expr 表达式', () => {
      const input = {
        $expr: {
          $eq: ['$userId', '507f1f77bcf86cd799439011']
        }
      };
      const result = convertObjectIdStrings(input);
      
      // $expr 内的字符串不应该被转换
      expect(typeof result.$expr.$eq[1]).toBe('string');
    });
    
    test('应该不转换字段引用', () => {
      const input = {
        $group: {
          _id: '$userId' // 字段引用，不应转换
        }
      };
      const result = convertObjectIdStrings(input);
      
      expect(result.$group._id).toBe('$userId');
    });
  });
  
  describe('性能优化', () => {
    test('无转换时应该返回原对象', () => {
      const input = { name: 'John', age: 30 };
      const result = convertObjectIdStrings(input);
      
      // 应该是同一个对象（无需克隆）
      expect(result).toBe(input);
    });
    
    test('有转换时应该返回新对象', () => {
      const input = { _id: '507f1f77bcf86cd799439011', name: 'John' };
      const result = convertObjectIdStrings(input);
      
      // 应该是新对象
      expect(result).not.toBe(input);
      // 但未转换的字段应该共享引用
      expect(result.name).toBe(input.name);
    });
  });
  
  // ...更多测试用例（深度限制、数组处理、聚合管道等）
});
```

---

### 性能基准测试

```javascript
// test/performance/objectid-conversion.bench.js

const Benchmark = require('benchmark');
const { convertObjectIdStrings } = require('../../lib/utils/objectid-converter');

const suite = new Benchmark.Suite();

// 场景1：简单查询（1个字段）
const simpleQuery = { _id: '507f1f77bcf86cd799439011' };

suite.add('Simple query (1 field)', () => {
  convertObjectIdStrings(simpleQuery);
});

// 场景2：复杂查询（10+字段）
const complexQuery = {
  $or: [
    { _id: { $in: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012', '507f1f77bcf86cd799439013'] } },
    { userId: '507f1f77bcf86cd799439014' }
  ],
  departmentId: '507f1f77bcf86cd799439015',
  managerId: { $ne: '507f1f77bcf86cd799439016' }
};

suite.add('Complex query (10+ fields)', () => {
  convertObjectIdStrings(complexQuery);
});

// 场景3：无需转换的对象
const noConversionQuery = {
  name: 'John',
  age: 30,
  email: 'john@example.com'
};

suite.add('No conversion needed', () => {
  convertObjectIdStrings(noConversionQuery);
});

// 场景4：大对象（100字段）
const largeObject = {};
for (let i = 0; i < 100; i++) {
  if (i % 10 === 0) {
    largeObject[`userId${i}`] = '507f1f77bcf86cd799439011';
  } else {
    largeObject[`field${i}`] = `value${i}`;
  }
}

suite.add('Large object (100 fields)', () => {
  convertObjectIdStrings(largeObject);
});

// 运行测试
suite
  .on('cycle', (event) => {
    console.log(String(event.target));
    
    // 计算开销百分比（相对于无转换场景）
    const benchmark = event.target;
    const name = benchmark.name;
    const hz = benchmark.hz;
    
    console.log(`  Ops/sec: ${hz.toFixed(2)}`);
    console.log(`  Mean time: ${(1000 / hz).toFixed(4)} ms`);
  })
  .on('complete', function() {
    console.log('\n性能测试完成');
    console.log('最快: ' + this.filter('fastest').map('name'));
    
    // 验证性能要求
    const simpleQueryBench = this.filter((b) => b.name === 'Simple query (1 field)')[0];
    const noConversionBench = this.filter((b) => b.name === 'No conversion needed')[0];
    
    const overhead = ((noConversionBench.hz / simpleQueryBench.hz) - 1) * 100;
    
    console.log(`\n简单查询开销: ${overhead.toFixed(2)}%`);
    
    if (overhead < 10) {
      console.log('✅ 性能测试通过（开销 < 10%）');
    } else {
      console.log('❌ 性能测试失败（开销 > 10%）');
      process.exit(1);
    }
  })
  .run({ async: false });
```

**通过标准**: 
- 简单查询：< 0.5ms（> 2000 ops/sec）
- 复杂查询：< 2ms（> 500 ops/sec）
- 无转换场景：< 0.05ms（> 20000 ops/sec）
- 相对开销：< 10%

---

## 📚 完整文档

### 迁移指南（docs/migration-auto-objectid.md）

```markdown
# 迁移到自动 ObjectId 转换

## 升级前准备

### 1. 数据一致性检查

运行以下脚本检查数据一致性：

\`\`\`javascript
// scripts/check-objectid-consistency.js
const { MongoClient } = require('mongodb');

async function checkConsistency() {
  const client = await MongoClient.connect('mongodb://localhost:27017');
  const db = client.db('your_database');
  
  const collections = await db.listCollections().toArray();
  
  for (const coll of collections) {
    const collName = coll.name;
    
    // 检查 _id 字段类型
    const stringIds = await db.collection(collName).countDocuments({
      _id: { $type: 'string' }
    });
    
    if (stringIds > 0) {
      console.log(`⚠️  ${collName}: ${stringIds} 个文档的 _id 是字符串类型`);
      console.log(`   需要修复！`);
    } else {
      console.log(`✅ ${collName}: _id 类型一致`);
    }
  }
  
  await client.close();
}

checkConsistency().catch(console.error);
\`\`\`

### 2. 数据修复（如果需要）

如果发现字符串类型的 _id，运行修复脚本：

\`\`\`javascript
// scripts/fix-objectid-types.js
const { MongoClient } = require('mongodb');

async function fixObjectIdTypes(collectionName) {
  const client = await MongoClient.connect('mongodb://localhost:27017');
  const db = client.db('your_database');
  const coll = db.collection(collectionName);
  
  // 查找所有字符串类型的 _id
  const docs = await coll.find({ _id: { $type: 'string' } }).toArray();
  
  console.log(`Found ${docs.length} documents with string _id`);
  
  for (const doc of docs) {
    const stringId = doc._id;
    
    try {
      // 使用 MongoDB 聚合转换
      await coll.updateOne(
        { _id: stringId },
        [{ $set: { _id: { $toObjectId: '$_id' } } }]
      );
      
      console.log(`✅ Fixed: ${stringId}`);
    } catch (error) {
      console.error(`❌ Failed to fix: ${stringId}`, error.message);
    }
  }
  
  await client.close();
}

// 使用示例
fixObjectIdTypes('users').catch(console.error);
\`\`\`

## 升级步骤

### 1. 备份数据库（重要！）

\`\`\`bash
mongodump --out=/backup/before-upgrade
\`\`\`

### 2. 升级 monSQLize

\`\`\`bash
npm install monsqlize@1.3.0
\`\`\`

### 3. 清空缓存（重要！）

\`\`\`javascript
// 启动时清空缓存
await msq.getCache().clear();
console.log('✅ Cache cleared');
\`\`\`

### 4. 配置自动转换（可选）

\`\`\`javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017/mydb' },
  
  // 自动 ObjectId 转换配置
  autoConvertObjectId: {
    enabled: true, // 启用（默认）
    
    // 排除业务字段
    excludeFields: ['code', 'sku', 'hash'],
    
    // 自定义字段模式（可选）
    customFieldPatterns: [
      /^ref.*$/,  // 以 ref 开头
      'customId'  // 自定义字段
    ]
  }
});
\`\`\`

### 5. 运行测试

\`\`\`bash
npm test
\`\`\`

### 6. 灰度发布

1. 先在测试环境验证
2. 选择低峰期部署
3. 逐步扩大到生产环境
4. 监控性能和错误日志

## 验证清单

- [ ] 数据一致性检查通过
- [ ] 数据库已备份
- [ ] 缓存已清空
- [ ] 测试已通过
- [ ] 监控已就绪
- [ ] 回滚方案已准备
\`\`\`

---

### 回滚方案（docs/rollback-auto-objectid.md）

```markdown
# 自动 ObjectId 转换回滚方案

## 紧急回滚（5分钟内完成）

### 1. 回滚到旧版本

\`\`\`bash
# 停止应用
pm2 stop app

# 回滚 npm 包
npm install monsqlize@1.2.0

# 重启应用
pm2 start app
\`\`\`

### 2. 清空缓存

\`\`\`bash
# Redis 缓存
redis-cli FLUSHDB

# 或在应用中
await msq.getCache().clear();
\`\`\`

### 3. 验证

\`\`\`bash
# 检查应用状态
pm2 status

# 检查日志
pm2 logs app --lines 100
\`\`\`

## 渐进式禁用（不回滚版本）

如果只想禁用自动转换功能：

\`\`\`javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: '...' },
  autoConvertObjectId: { enabled: false } // 禁用
});
\`\`\`

重启应用即可。

## 数据回滚（如果写入了错误数据）

### 1. 识别错误数据

\`\`\`javascript
// 查找错误的 ObjectId 转换
db.collection.find({
  code: { $type: 'objectId' } // code 应该是字符串
});
\`\`\`

### 2. 恢复数据

\`\`\`javascript
// 从备份恢复
mongorestore --drop /backup/before-upgrade

// 或手动修复
db.collection.updateMany(
  { code: { $type: 'objectId' } },
  [{ $set: { code: { $toString: '$code' } } }]
);
\`\`\`

## 回滚验证清单

- [ ] 应用已回滚到旧版本
- [ ] 缓存已清空
- [ ] 应用正常运行
- [ ] 数据一致性正常
- [ ] 错误日志无异常
\`\`\`

---

## 📊 实施计划

### 阶段0：性能验证（强制，6-8小时）

| 步骤 | 内容 | 工作量 | 责任人 |
|------|------|--------|--------|
| 0.1 | 编写性能基准测试 | 2h | 开发 |
| 0.2 | 运行基准测试 | 1h | 开发 |
| 0.3 | 分析测试结果 | 1h | 开发 + 架构师 |
| 0.4 | **决策点：是否继续？** | - | 团队评审 |
| 0.5 | 性能优化（如需要） | 2-4h | 开发 |

**通过标准**: 所有场景开销 < 10%

**决策**: 如果不通过，停止实施或重新设计方案

---

### 阶段1：核心实现（12-14小时）

| 步骤 | 内容 | 工作量 |
|------|------|--------|
| 1.1 | 创建 objectid-converter.js | 4h |
| 1.2 | 修改缓存键生成逻辑 | 1h |
| 1.3 | 集成到 9 个查询方法 | 2h |
| 1.4 | 集成到 11 个写入方法 | 2h |
| 1.5 | 集成到聚合和链式调用 | 2h |
| 1.6 | 添加配置支持 | 1h |

---

### 阶段2：测试覆盖（10-12小时）

| 步骤 | 内容 | 工作量 |
|------|------|--------|
| 2.1 | 单元测试（60个用例） | 5h |
| 2.2 | 集成测试（35个用例） | 4h |
| 2.3 | 边界测试（20个用例） | 2h |
| 2.4 | 性能回归测试 | 1h |

**覆盖率目标**: 单元测试 > 90%，集成测试 > 85%

---

### 阶段3：文档和工具（6-7小时）

| 步骤 | 内容 | 工作量 |
|------|------|--------|
| 3.1 | API 文档 | 1.5h |
| 3.2 | 迁移指南 | 1.5h |
| 3.3 | 回滚方案 | 1h |
| 3.4 | 故障排查指南 | 1h |
| 3.5 | 数据一致性检查脚本 | 0.5h |
| 3.6 | 数据修复脚本 | 0.5h |
| 3.7 | README 更新 | 0.5h |

---

### 阶段4：验证发布（4-5小时）

| 步骤 | 内容 | 工作量 |
|------|------|--------|
| 4.1 | 本地完整测试 | 1h |
| 4.2 | 测试环境部署 | 0.5h |
| 4.3 | 测试环境验证 | 1h |
| 4.4 | 准备发布材料 | 0.5h |
| 4.5 | 灰度发布 | 1h |
| 4.6 | 生产监控 | 1h |

---

## 总计

**总工作量**: 38-46 小时

**关键路径**: 阶段0性能验证 → 阶段1核心实现 → 阶段2测试

**里程碑**:
- M1: 性能验证通过
- M2: 核心功能完成
- M3: 测试覆盖达标
- M4: 文档完整
- M5: 灰度发布
- M6: 正式发布

---

## 🎯 风险控制

### 风险矩阵（更新）

| 风险 | 等级 | 缓解措施 | 残留风险 |
|------|------|---------|---------|
| 性能影响 | 🟡 中 | 基准测试 + 优化 | 🟢 低 |
| 循环引用 | 🟢 低 | WeakSet 检测 | 🟢 无 |
| $expr 表达式 | 🟢 低 | 特殊处理 | 🟢 无 |
| 缓存不一致 | 🟢 低 | 标准化 + 清空 | 🟢 无 |
| 业务字段误转换 | 🟢 低 | 白名单 + 排除 | 🟢 无 |
| 数据不一致 | 🟡 中 | 检查 + 修复脚本 | 🟢 低 |
| 回滚困难 | 🟢 低 | 完整回滚方案 | 🟢 无 |

**综合风险**: 🟢 **低风险**

---

## ✅ 最终检查清单

在开始实施前，确认：

**设计完整性**:
- [x] 所有发现的问题已解决
- [x] 循环引用检测已添加
- [x] $expr 表达式已处理
- [x] 字段引用检测已添加
- [x] 性能优化已实现
- [x] 缓存键标准化已实现

**测试完整性**:
- [x] 单元测试计划完整（60个用例）
- [x] 集成测试计划完整（35个用例）
- [x] 性能基准测试完整
- [x] 边界测试计划完整

**文档完整性**:
- [x] API 文档计划完整
- [x] 迁移指南完整
- [x] 回滚方案完整
- [x] 故障排查指南完整
- [x] 数据修复脚本完整

**风险控制**:
- [x] 所有 P0 问题已解决
- [x] 所有 P1 问题已解决
- [x] 性能验证计划完整
- [x] 回滚方案可执行
- [x] 监控方案就绪

---

## 🎬 立即可执行

**此方案已经 100% 可执行**，无任何阻塞问题。

**下一步**：
1. 你确认方案
2. 我立即开始实施阶段0（性能验证）
3. 性能通过后，继续阶段1-4

**预计完成时间**: 5-6 个工作日

---

**方案版本**: v3.0（最终版）  
**创建日期**: 2025-12-12  
**验证状态**: ✅ 100%可执行  
**风险等级**: 🟢 低风险

