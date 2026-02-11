/**
 * 表达式工厂函数
 * 创建表达式对象，用于标记需要编译的表达式
 *
 * @param {string} expression - 表达式字符串
 * @returns {Object} 表达式对象
 *
 * @example
 * const expr = $("amount > 100");
 * // 返回: { __expr__: "amount > 100", __compiled__: false }
 */
function createExpression(expression) {
  if (typeof expression !== 'string') {
    throw new TypeError('Expression must be a string');
  }

  if (!expression || expression.trim().length === 0) {
    throw new Error('Expression cannot be empty');
  }

  return {
    __expr__: expression,
    __compiled__: false
  };
}

module.exports = createExpression;


