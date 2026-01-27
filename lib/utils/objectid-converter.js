/**
 * monSQLize - ObjectId 自动转换工具
 * @description 自动将 ObjectId 字符串转换为 ObjectId 实例
 * @version 1.0.0
 *
 * 核心特性：
 * - 字段白名单：只转换 _id, *Id, *Ids 等字段
 * - 官方验证：使用 ObjectId.isValid() 确保有效性
 * - 循环引用检测：使用 WeakSet 防止无限递归
 * - 深度限制：最大递归深度10层
 * - 特殊处理：$expr, $function, 字段引用不转换
 * - 性能优化：无转换时返回原对象（不克隆）
 * - 异常降级：转换失败返回原值
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
 * @param {Array} customPatterns - 自定义字段模式（可选）
 * @returns {boolean}
 */
function shouldConvertField(fieldName, customPatterns = []) {
  if (!fieldName || typeof fieldName !== 'string') {
    return false;
  }

  const allPatterns = [...OBJECTID_FIELD_PATTERNS, ...customPatterns];

  return allPatterns.some(pattern => {
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
 * @param {Object} options - 配置选项
 * @param {Object} options.logger - 日志记录器
 * @param {Array} options.excludeFields - 排除的字段
 * @param {Array} options.customFieldPatterns - 自定义字段模式
 * @param {number} options.maxDepth - 最大递归深度
 * @returns {*} 转换后的对象
 */
function convertObjectIdStrings(obj, fieldPath = '', depth = 0, visited = new WeakSet(), options = {}) {
  const {
    logger = null,
    excludeFields = [],
    customFieldPatterns = [],
    maxDepth = 10
  } = options;

  try {
    // 1. 深度保护（防止栈溢出）
    if (depth > maxDepth) {
      if (logger && logger.warn) {
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

    // 3. 已经是当前版本的 ObjectId 实例
    if (obj instanceof ObjectId) {
      return obj;
    }

    // 🆕 3.5 兼容其他版本的 ObjectId 实例（跨 BSON 版本兼容）
    // 场景：mongoose (bson@4.x/5.x) 与 monSQLize (bson@6.x) 混用
    if (obj && typeof obj === 'object' && obj.constructor && obj.constructor.name === 'ObjectId') {
      try {
        // 通过 toString() 方法获取 hex 字符串，再构造为当前版本的 ObjectId
        const hexString = obj.toString();
        if (isValidObjectIdString(hexString)) {
          const converted = new ObjectId(hexString);
          if (logger && logger.debug) {
            logger.debug('[ObjectId Converter] Cross-version ObjectId converted', {
              from: obj.constructor.name,
              to: 'ObjectId',
              hex: hexString,
              fieldPath
            });
          }
          return converted;
        }
      } catch (error) {
        // 转换失败，返回原对象
        if (logger && logger.warn) {
          logger.warn('[ObjectId Converter] Cross-version ObjectId conversion failed', {
            error: error.message,
            fieldPath,
            objectType: obj.constructor.name
          });
        }
        return obj;
      }
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
          if (logger && logger.debug) {
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
        const newItem = convertObjectIdStrings(item, itemPath, depth + 1, visited, options);
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
        if (logger && logger.warn) {
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

        // 6.3 排除字段不转换
        if (excludeFields.includes(key)) {
          converted[key] = value;
          continue;
        }

        // 6.4 字段名匹配 + 字符串值 → 尝试转换
        if (typeof value === 'string' &&
            shouldConvertField(key, customFieldPatterns) &&
            !isFieldReference(value) &&
            isValidObjectIdString(value)) {
          try {
            converted[key] = new ObjectId(value);
            hasConverted = true;
          } catch (error) {
            // 转换失败，保持原值
            if (logger && logger.debug) {
              logger.debug('[ObjectId Converter] Field conversion failed', {
                field: key,
                value,
                error: error.message
              });
            }
            converted[key] = value;
          }
        } else {
          // 6.5 递归处理
          const newValue = convertObjectIdStrings(value, currentPath, depth + 1, visited, options);
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
    if (logger && logger.error) {
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
 * @param {Object} options - 配置选项
 * @returns {Array} 转换后的聚合管道
 */
function convertAggregationPipeline(pipeline, depth = 0, options = {}) {
  const { logger = null, maxDepth = 5 } = options;

  if (!Array.isArray(pipeline)) {
    return pipeline;
  }

  // 深度保护（防止 $lookup 等嵌套 pipeline 导致栈溢出）
  if (depth > maxDepth) {
    if (logger && logger.warn) {
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
        const convertedValue = convertObjectIdStrings(value, `pipeline[${index}].$match`, 0, new WeakSet(), options);
        if (convertedValue !== value) hasConverted = true;
        convertedStage[op] = convertedValue;
      }

      // $addFields / $set - 转换字段值
      else if (op === '$addFields' || op === '$set') {
        const convertedValue = convertObjectIdStrings(value, `pipeline[${index}].${op}`, 0, new WeakSet(), options);
        if (convertedValue !== value) hasConverted = true;
        convertedStage[op] = convertedValue;
      }

      // $project - 转换计算字段
      else if (op === '$project') {
        const convertedValue = convertObjectIdStrings(value, `pipeline[${index}].$project`, 0, new WeakSet(), options);
        if (convertedValue !== value) hasConverted = true;
        convertedStage[op] = convertedValue;
      }

      // $group - 转换分组字段
      else if (op === '$group') {
        const convertedValue = convertObjectIdStrings(value, `pipeline[${index}].$group`, 0, new WeakSet(), options);
        if (convertedValue !== value) hasConverted = true;
        convertedStage[op] = convertedValue;
      }

      // $lookup - 特殊处理（嵌套 pipeline）
      else if (op === '$lookup') {
        const lookup = { ...value };
        let lookupConverted = false;

        // 转换 let 变量
        if (lookup.let) {
          const convertedLet = convertObjectIdStrings(lookup.let, `pipeline[${index}].$lookup.let`, 0, new WeakSet(), options);
          if (convertedLet !== lookup.let) {
            lookup.let = convertedLet;
            lookupConverted = true;
          }
        }

        // 递归转换嵌套 pipeline
        if (lookup.pipeline) {
          const convertedPipeline = convertAggregationPipeline(lookup.pipeline, depth + 1, options);
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
            const convertedSubPipeline = convertAggregationPipeline(subPipeline, depth + 1, options);
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
            options
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
            options
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
          const convertedWhenMatched = convertAggregationPipeline(merge.whenMatched, depth + 1, options);
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
 * @param {Object} options - 配置选项
 * @returns {Object} 转换后的 update 文档
 */
function convertUpdateDocument(update, options = {}) {
  if (!update || typeof update !== 'object') {
    return update;
  }

  const converted = {};
  let hasConverted = false;

  for (const [op, value] of Object.entries(update)) {
    // $set / $setOnInsert - 转换设置的值
    if (op === '$set' || op === '$setOnInsert') {
      const convertedValue = convertObjectIdStrings(value, `update.${op}`, 0, new WeakSet(), options);
      if (convertedValue !== value) hasConverted = true;
      converted[op] = convertedValue;
    }

    // $push - 转换数组元素
    else if (op === '$push') {
      const convertedValue = convertObjectIdStrings(value, 'update.$push', 0, new WeakSet(), options);
      if (convertedValue !== value) hasConverted = true;
      converted[op] = convertedValue;
    }

    // $addToSet - 转换集合元素
    else if (op === '$addToSet') {
      const convertedValue = convertObjectIdStrings(value, 'update.$addToSet', 0, new WeakSet(), options);
      if (convertedValue !== value) hasConverted = true;
      converted[op] = convertedValue;
    }

    // $pull - 转换匹配条件
    else if (op === '$pull') {
      const convertedValue = convertObjectIdStrings(value, 'update.$pull', 0, new WeakSet(), options);
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
  isFieldReference,

  // 导出配置（用于测试和自定义）
  OBJECTID_FIELD_PATTERNS,
  SPECIAL_OPERATORS
};

