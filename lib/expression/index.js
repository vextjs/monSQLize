/**
 * 表达式模块主入口
 */

const createExpression = require('./factory');
const { isExpressionObject, hasExpressionInPipeline, hasExpressionInObject } = require('./detector');
const ExpressionCompiler = require('./compiler/ExpressionCompiler');

// 导出工厂函数为默认导出（用于 $ 函数）
module.exports = createExpression;

// 导出其他功能
module.exports.createExpression = createExpression;
module.exports.isExpressionObject = isExpressionObject;
module.exports.hasExpressionInPipeline = hasExpressionInPipeline;
module.exports.hasExpressionInObject = hasExpressionInObject;
module.exports.ExpressionCompiler = ExpressionCompiler;


