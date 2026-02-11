/**
 * 表达式检测器
 * 检测对象是否为表达式对象
 */

/**
 * 检测对象是否为表达式对象
 * @param {*} obj - 要检测的对象
 * @returns {boolean} 是否为表达式对象
 */
function isExpressionObject(obj) {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  return (
    obj.__expr__ !== undefined &&
    typeof obj.__expr__ === 'string' &&
    obj.__compiled__ !== undefined &&
    typeof obj.__compiled__ === 'boolean'
  );
}

/**
 * 递归检测管道中是否包含表达式对象
 * @param {Array} pipeline - 聚合管道
 * @returns {boolean} 是否包含表达式对象
 */
function hasExpressionInPipeline(pipeline) {
  if (!Array.isArray(pipeline)) {
    return false;
  }

  for (const stage of pipeline) {
    if (hasExpressionInObject(stage)) {
      return true;
    }
  }

  return false;
}

/**
 * 递归检测对象中是否包含表达式对象
 * @param {*} obj - 要检测的对象
 * @returns {boolean} 是否包含表达式对象
 */
function hasExpressionInObject(obj) {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  // 检查当前对象
  if (isExpressionObject(obj)) {
    return true;
  }

  // 递归检查对象属性
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (hasExpressionInObject(item)) {
        return true;
      }
    }
  } else {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (hasExpressionInObject(obj[key])) {
          return true;
        }
      }
    }
  }

  return false;
}

module.exports = {
  isExpressionObject,
  hasExpressionInPipeline,
  hasExpressionInObject
};


