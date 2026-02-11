/**
 * 表达式编译器
 * 将统一表达式编译为目标数据库语法
 */

const ExpressionCache = require('../cache/ExpressionCache');
const { isExpressionObject } = require('../detector');
const extensions = require('./ExpressionCompilerExtensions');

class ExpressionCompiler {
  /**
   * @param {Object} options - 编译器配置
   * @param {boolean} options.debug - 是否启用调试模式
   * @param {Object} options.cache - 缓存配置
   */
  constructor(options = {}) {
    this.debug = options.debug || false;
    this.cache = new ExpressionCache(options.cache || {});

    // 绑定扩展方法到实例（v1.1.0 新增44个操作符）
    Object.keys(extensions).forEach(key => {
      this[key] = extensions[key].bind(this);
    });
  }

  /**
   * 编译表达式对象
   * @param {Object} exprObj - 表达式对象
   * @param {Object} options - 编译选项
   * @param {string} options.targetDB - 目标数据库，默认 'mongodb'
   * @returns {*} 编译后的结果
   */
  compile(exprObj, options = {}) {
    if (!isExpressionObject(exprObj)) {
      throw new Error('Invalid expression object');
    }

    const targetDB = options.targetDB || 'mongodb';
    const context = options.context || 'match';  // match, project, group
    const expression = exprObj.__expr__;

    // 尝试从缓存获取
    const cacheKey = `${context}:${expression}`;
    const cached = this.cache.get(cacheKey, targetDB);
    if (cached !== null) {
      if (this.debug) {
        console.log(`[Expression] Cache hit: ${expression}`);
      }
      return cached;
    }

    if (this.debug) {
      console.log(`[Expression] Compiling: ${expression} (context: ${context})`);
    }

    // 编译表达式
    const compiled = this._compileExpression(expression, targetDB, context);

    // 缓存编译结果
    this.cache.set(cacheKey, compiled, targetDB);

    return compiled;
  }

  /**
   * 编译表达式字符串
   * @param {string} expression - 表达式字符串
   * @param {string} targetDB - 目标数据库
   * @returns {*} 编译后的结果
   * @private
   */
  _compileExpression(expression, targetDB, context = 'match') {
    // 先编译内部表达式（不带$expr包装）
    const innerExpr = this._compileInnerExpression(expression, targetDB);

    // 根据上下文决定是否包装$expr
    if (context === 'match') {
      return { $expr: innerExpr };
    } else {
      // project, group, addFields 等直接返回表达式
      return innerExpr;
    }
  }

  _compileInnerExpression(expression, targetDB) {
    // 0. 函数调用: 所有支持的函数（122个MongoDB操作符完整支持）
    const funcMatch = expression.match(/^(CONCAT|UPPER|LOWER|TRIM|SUBSTR|LENGTH|ABS|CEIL|FLOOR|ROUND|SQRT|POW|SIZE|IN|SLICE|FIRST|LAST|ARRAY_ELEM_AT|FILTER|MAP|INDEX_OF|CONCAT_ARRAYS|TYPE|NOT|EXISTS|IS_NUMBER|IS_ARRAY|SUM|AVG|MAX|MIN|COUNT|PUSH|ADD_TO_SET|YEAR|MONTH|DAY_OF_MONTH|HOUR|MINUTE|SECOND|SPLIT|REPLACE|INDEX_OF_STR|LTRIM|RTRIM|SUBSTR_CP|REGEX|MERGE_OBJECTS|TO_INT|TO_STRING|OBJECT_TO_ARRAY|ARRAY_TO_OBJECT|SET_UNION|SWITCH|DATE_ADD|DATE_SUBTRACT|DATE_DIFF|DATE_TO_STRING|DATE_FROM_STRING|TO_BOOL|TO_DATE|TO_DOUBLE|CONVERT|TO_DECIMAL|TO_LONG|TO_OBJECT_ID|REDUCE|ZIP|REVERSE_ARRAY|RANGE|DATE_FROM_PARTS|DATE_TO_PARTS|ISO_WEEK|ISO_WEEK_YEAR|ISO_DAY_OF_WEEK|DAY_OF_WEEK|DAY_OF_YEAR|WEEK|STR_LEN_BYTES|STR_LEN_CP|SUBSTR_BYTES|LOG|LOG10|ALL_ELEMENTS_TRUE|ANY_ELEMENT_TRUE|COND|IF_NULL|SET_FIELD|UNSET_FIELD|GET_FIELD|SET_DIFFERENCE|SET_EQUALS|SET_INTERSECTION|SET_IS_SUBSET|LET|LITERAL|RAND|SAMPLE_RATE)\s*\((.+)?\)$/i);
    if (funcMatch) {
      const [, funcName, args] = funcMatch;
      const upperFuncName = funcName.toUpperCase();

      // 字符串函数
      if (['CONCAT', 'UPPER', 'LOWER', 'TRIM', 'SUBSTR', 'LENGTH'].includes(upperFuncName)) {
        return this._compileStringFunction(upperFuncName, args, targetDB);
      }

      // 字符串高级函数
      if (['SPLIT', 'REPLACE', 'INDEX_OF_STR', 'LTRIM', 'RTRIM', 'SUBSTR_CP'].includes(upperFuncName)) {
        return this._compileStringAdvancedFunction(upperFuncName, args, targetDB);
      }

      // 数学函数
      if (['ABS', 'CEIL', 'FLOOR', 'ROUND', 'SQRT', 'POW'].includes(upperFuncName)) {
        return this._compileMathFunction(upperFuncName, args, targetDB);
      }

      // 数组基础函数
      if (['SIZE', 'IN', 'SLICE', 'FIRST', 'LAST', 'ARRAY_ELEM_AT'].includes(upperFuncName)) {
        return this._compileArrayFunction(upperFuncName, args, targetDB);
      }

      // 数组高级函数
      if (['FILTER', 'MAP', 'INDEX_OF', 'CONCAT_ARRAYS'].includes(upperFuncName)) {
        return this._compileArrayAdvancedFunction(upperFuncName, args, targetDB);
      }

      // 聚合累加器
      if (['SUM', 'AVG', 'MAX', 'MIN', 'COUNT', 'PUSH', 'ADD_TO_SET'].includes(upperFuncName)) {
        return this._compileAggregationFunction(upperFuncName, args, targetDB);
      }

      // 日期基础函数
      if (['YEAR', 'MONTH', 'DAY_OF_MONTH', 'HOUR', 'MINUTE', 'SECOND'].includes(upperFuncName)) {
        return this._compileDateFunction(upperFuncName, args, targetDB);
      }

      // 日期高级函数（v1.1.0）
      if (['DATE_ADD', 'DATE_SUBTRACT', 'DATE_DIFF', 'DATE_TO_STRING', 'DATE_FROM_STRING'].includes(upperFuncName)) {
        return this._compileDateAdvancedFunction(upperFuncName, args, targetDB);
      }

      // 日期扩展函数（v1.1.0）
      if (['DATE_FROM_PARTS', 'DATE_TO_PARTS', 'ISO_WEEK', 'ISO_WEEK_YEAR', 'ISO_DAY_OF_WEEK', 'DAY_OF_WEEK', 'DAY_OF_YEAR', 'WEEK'].includes(upperFuncName)) {
        return this._compileDateExtendedFunction(upperFuncName, args, targetDB);
      }

      // 类型转换函数（v1.1.0）
      if (['TO_BOOL', 'TO_DATE', 'TO_DOUBLE', 'TO_DECIMAL', 'TO_LONG', 'TO_OBJECT_ID', 'CONVERT'].includes(upperFuncName)) {
        return this._compileTypeConversionFunction(upperFuncName, args, targetDB);
      }

      // 数组扩展函数（v1.1.0）
      if (['REDUCE', 'ZIP', 'REVERSE_ARRAY', 'RANGE'].includes(upperFuncName)) {
        return this._compileArrayExtendedFunction(upperFuncName, args, targetDB);
      }

      // 字符串扩展函数（v1.1.0）
      if (['STR_LEN_BYTES', 'STR_LEN_CP', 'SUBSTR_BYTES'].includes(upperFuncName)) {
        return this._compileStringExtendedFunction(upperFuncName, args, targetDB);
      }

      // 数学扩展函数（v1.1.0）
      if (['LOG', 'LOG10'].includes(upperFuncName)) {
        return this._compileMathExtendedFunction(upperFuncName, args, targetDB);
      }

      // 逻辑扩展函数（v1.1.0）
      if (['ALL_ELEMENTS_TRUE', 'ANY_ELEMENT_TRUE'].includes(upperFuncName)) {
        return this._compileLogicalExtendedFunction(upperFuncName, args, targetDB);
      }

      // 条件扩展函数（v1.1.0）
      if (['COND', 'IF_NULL'].includes(upperFuncName)) {
        return this._compileConditionalExtendedFunction(upperFuncName, args, targetDB);
      }

      // 对象操作函数（v1.1.0）
      if (['SET_FIELD', 'UNSET_FIELD', 'GET_FIELD'].includes(upperFuncName)) {
        return this._compileObjectOperationFunction(upperFuncName, args, targetDB);
      }

      // 集合操作函数（v1.1.0）
      if (['SET_DIFFERENCE', 'SET_EQUALS', 'SET_INTERSECTION', 'SET_IS_SUBSET'].includes(upperFuncName)) {
        return this._compileSetOperationFunction(upperFuncName, args, targetDB);
      }

      // 高级操作函数（v1.1.0）
      if (['LET', 'LITERAL', 'RAND', 'SAMPLE_RATE'].includes(upperFuncName)) {
        return this._compileAdvancedOperationFunction(upperFuncName, args, targetDB);
      }

      // 高频操作符
      if (['REGEX', 'MERGE_OBJECTS', 'TO_INT', 'TO_STRING', 'OBJECT_TO_ARRAY', 'ARRAY_TO_OBJECT', 'SET_UNION'].includes(upperFuncName)) {
        return this._compileHighFrequencyFunction(upperFuncName, args, targetDB);
      }

      // 条件扩展
      if (upperFuncName === 'SWITCH') {
        return this._compileSwitchFunction(args, targetDB);
      }

      // 类型/逻辑函数
      if (['TYPE', 'NOT', 'EXISTS', 'IS_NUMBER', 'IS_ARRAY'].includes(upperFuncName)) {
        return this._compileTypeFunction(upperFuncName, args, targetDB);
      }
    }

    // 1. 逻辑操作符: && (AND), || (OR)
    // ...existing code...
    if (expression.includes('&&')) {
      const parts = expression.split('&&').map(p => p.trim());
      const compiledParts = parts.map(part => this._compileInnerExpression(part, targetDB));
      return { $and: compiledParts };
    }

    if (expression.includes('||')) {
      const parts = expression.split('||').map(p => p.trim());
      const compiledParts = parts.map(part => this._compileInnerExpression(part, targetDB));
      return { $or: compiledParts };
    }

    // 2. 三元运算符: ? :
    // 注意：需要从左到右匹配，处理嵌套的三元运算符
    const ternaryMatch = expression.match(/^([^?]+)\s*\?\s*([^:]+)\s*:\s*(.+)$/);
    if (ternaryMatch) {
      const [, condition, thenValue, elseValue] = ternaryMatch;
      const compiledCondition = this._compileInnerExpression(condition.trim(), targetDB);

      // else部分可能包含嵌套的三元运算符，需要递归解析
      const parseThenElse = (val) => {
        const trimmed = val.trim();
        // 检查是否是嵌套的三元运算符
        if (trimmed.includes('?') && trimmed.includes(':')) {
          return this._compileInnerExpression(trimmed, targetDB);
        }
        return this._parseValue(trimmed);
      };

      return {
        $cond: {
          if: compiledCondition,
          then: parseThenElse(thenValue),
          else: parseThenElse(elseValue)
        }
      };
    }

    // 3. 空值合并: ??
    if (expression.includes('??')) {
      const parts = expression.split('??').map(p => p.trim());
      if (parts.length === 2) {
        return {
          $ifNull: [this._parseValue(parts[0]), this._parseValue(parts[1])]
        };
      }
    }

    // 4. 算术运算符（低优先级）: +, -
    const addSubMatch = expression.match(/^(.+?)\s*([+\-])\s*(.+)$/);
    if (addSubMatch) {
      const [, left, op, right] = addSubMatch;

      // 排除负号
      if (!(op === '-' && left.trim() === '')) {
        const operatorMap = { '+': '$add', '-': '$subtract' };
        return {
          [operatorMap[op]]: [this._parseOperand(left, targetDB), this._parseOperand(right, targetDB)]
        };
      }
    }

    // 5. 算术运算符（高优先级）: *, /, %
    const mulDivMatch = expression.match(/^(.+?)\s*([*/%])\s*(.+)$/);
    if (mulDivMatch) {
      const [, left, op, right] = mulDivMatch;
      const operatorMap = { '*': '$multiply', '/': '$divide', '%': '$mod' };

      return {
        [operatorMap[op]]: [this._parseOperand(left, targetDB), this._parseOperand(right, targetDB)]
      };
    }

    // 6. 比较操作符
    // 先检查比较链（连续比较运算符）
    const comparisonChainMatch = expression.match(/\b\w+\s*(===|!==|>=|<=|>|<)\s+\w+\s+(===|!==|>=|<=|>|<)/);
    if (comparisonChainMatch) {
      throw new Error(`Invalid comparison chain: ${expression}. Use && to combine comparisons (e.g., "a > b && b > c").`);
    }

    // 支持字段名或函数调用
    const comparisonMatch = expression.match(/^(.+?)\s*(===|!==|>=|<=|>|<)\s*(.+)$/);
    if (comparisonMatch) {
      const [, left, operator, right] = comparisonMatch;
      const operatorMap = {
        '===': '$eq', '!==': '$ne',
        '>=': '$gte', '<=': '$lte',
        '>': '$gt', '<': '$lt'
      };

      // 解析左侧（可能是字段或函数）
      const leftValue = /^(CONCAT|UPPER|LOWER|TRIM|SUBSTR|LENGTH|ABS|CEIL|FLOOR|ROUND|SQRT|POW|SIZE|IN|SLICE|FIRST|LAST|ARRAY_ELEM_AT|FILTER|MAP|INDEX_OF|CONCAT_ARRAYS|TYPE|NOT|EXISTS|IS_NUMBER|IS_ARRAY|SUM|AVG|MAX|MIN|COUNT|PUSH|ADD_TO_SET|YEAR|MONTH|DAY_OF_MONTH|HOUR|MINUTE|SECOND|SPLIT|REPLACE|INDEX_OF_STR|LTRIM|RTRIM|SUBSTR_CP|REGEX|MERGE_OBJECTS|TO_INT|TO_STRING|OBJECT_TO_ARRAY|ARRAY_TO_OBJECT|SET_UNION|SWITCH)\s*\(/i.test(left.trim())
        ? this._compileInnerExpression(left.trim(), targetDB)
        : `$${left.trim()}`;

      return {
        [operatorMap[operator]]: [leftValue, this._parseValue(right.trim())]
      };
    }

    throw new Error(`Unsupported expression: ${expression}`);
  }

  _parseValue(value) {
    // 检查是否是函数调用
    if (/^(CONCAT|UPPER|LOWER|TRIM|SUBSTR|LENGTH|ABS|CEIL|FLOOR|ROUND|SQRT|POW|SIZE|IN|SLICE|FIRST|LAST|ARRAY_ELEM_AT|FILTER|MAP|INDEX_OF|CONCAT_ARRAYS|TYPE|NOT|EXISTS|IS_NUMBER|IS_ARRAY|SUM|AVG|MAX|MIN|COUNT|PUSH|ADD_TO_SET|YEAR|MONTH|DAY_OF_MONTH|HOUR|MINUTE|SECOND|SPLIT|REPLACE|INDEX_OF_STR|LTRIM|RTRIM|SUBSTR_CP|REGEX|MERGE_OBJECTS|TO_INT|TO_STRING|OBJECT_TO_ARRAY|ARRAY_TO_OBJECT|SET_UNION|SWITCH)\s*\(/i.test(value)) {
      return this._compileInnerExpression(value, 'mongodb');
    }

    if (/^['"]/.test(value)) {
      return value.slice(1, -1);  // 字符串
    } else if (value === 'null') {
      return null;
    } else if (value === 'true') {
      return true;
    } else if (value === 'false') {
      return false;
    } else if (!isNaN(value)) {
      return Number(value);  // 数字
    } else {
      return `$${value}`;  // 字段引用
    }
  }

  _parseOperand(operand, targetDB) {
    const trimmed = operand.trim();

    // 如果包含运算符，递归编译
    if (/[+\-*/%]/.test(trimmed)) {
      return this._compileInnerExpression(trimmed, targetDB);
    }

    return this._parseValue(trimmed);
  }

  _compileStringFunction(funcName, argsStr, targetDB) {
    // 解析函数参数
    const args = this._parseFunctionArgs(argsStr);

    switch (funcName) {
      case 'CONCAT': {
        const compiledArgs = args.map(arg => this._parseValue(arg));
        return { $concat: compiledArgs };
      }

      case 'UPPER': {
        return { $toUpper: this._parseValue(args[0]) };
      }

      case 'LOWER': {
        return { $toLower: this._parseValue(args[0]) };
      }

      case 'TRIM': {
        return { $trim: { input: this._parseValue(args[0]) } };
      }

      case 'SUBSTR': {
        return {
          $substr: [
            this._parseValue(args[0]),
            parseInt(args[1]),
            parseInt(args[2])
          ]
        };
      }

      case 'LENGTH': {
        return { $strLenCP: this._parseValue(args[0]) };
      }

      default:
        throw new Error(`Unsupported string function: ${funcName}`);
    }
  }

  _compileStringAdvancedFunction(funcName, argsStr, targetDB) {
    const args = this._parseFunctionArgs(argsStr);

    switch (funcName) {
      case 'SPLIT': {
        return {
          $split: [this._parseValue(args[0]), args[1].replace(/['"]/g, '')]
        };
      }

      case 'REPLACE': {
        return {
          $replaceAll: {
            input: this._parseValue(args[0]),
            find: args[1].replace(/['"]/g, ''),
            replacement: args[2].replace(/['"]/g, '')
          }
        };
      }

      case 'INDEX_OF_STR': {
        return {
          $indexOfBytes: [this._parseValue(args[0]), args[1].replace(/['"]/g, '')]
        };
      }

      case 'LTRIM': {
        return {
          $ltrim: { input: this._parseValue(args[0]) }
        };
      }

      case 'RTRIM': {
        return {
          $rtrim: { input: this._parseValue(args[0]) }
        };
      }

      case 'SUBSTR_CP': {
        return {
          $substrCP: [this._parseValue(args[0]), parseInt(args[1]), parseInt(args[2])]
        };
      }

      default:
        throw new Error(`Unsupported string advanced function: ${funcName}`);
    }
  }

  _compileMathFunction(funcName, argsStr, targetDB) {
    const args = this._parseFunctionArgs(argsStr);

    switch (funcName) {
      case 'ABS': {
        return { $abs: this._parseValue(args[0]) };
      }

      case 'CEIL': {
        return { $ceil: this._parseValue(args[0]) };
      }

      case 'FLOOR': {
        return { $floor: this._parseValue(args[0]) };
      }

      case 'ROUND': {
        return { $round: this._parseValue(args[0]) };
      }

      case 'SQRT': {
        return { $sqrt: this._parseValue(args[0]) };
      }

      case 'POW': {
        return {
          $pow: [
            this._parseValue(args[0]),
            this._parseValue(args[1])
          ]
        };
      }

      default:
        throw new Error(`Unsupported math function: ${funcName}`);
    }
  }

  _compileArrayFunction(funcName, argsStr, targetDB) {
    const args = this._parseFunctionArgs(argsStr);

    switch (funcName) {
      case 'SIZE': {
        return { $size: this._parseValue(args[0]) };
      }

      case 'IN': {
        return {
          $in: [this._parseValue(args[0]), this._parseValue(args[1])]
        };
      }

      case 'SLICE': {
        return {
          $slice: [this._parseValue(args[0]), parseInt(args[1])]
        };
      }

      case 'ARRAY_ELEM_AT': {
        // ARRAY_ELEM_AT(array, index) => { $arrayElemAt: ['$array', index] }
        return {
          $arrayElemAt: [this._parseValue(args[0]), parseInt(args[1])]
        };
      }

      case 'FIRST': {
        return { $first: this._parseValue(args[0]) };
      }

      case 'LAST': {
        return { $last: this._parseValue(args[0]) };
      }

      default:
        throw new Error(`Unsupported array function: ${funcName}`);
    }
  }

  _compileArrayAdvancedFunction(funcName, argsStr, targetDB) {
    const args = this._parseFunctionArgs(argsStr);

    switch (funcName) {
      case 'FILTER': {
        // FILTER(array, varName, condition)
        // Example: FILTER(tags, tag, tag.active === true)
        const arrayExpr = this._parseValue(args[0]);
        const varName = args[1].trim();
        const condition = args[2].trim();

        // 编译条件，替换变量引用
        const compiledCond = this._compileFilterCondition(condition, varName, targetDB);

        return {
          $filter: {
            input: arrayExpr,
            as: varName,
            cond: compiledCond
          }
        };
      }

      case 'MAP': {
        // MAP(array, varName, expression)
        // Example: MAP(tags, tag, tag.name)
        const arrayExpr = this._parseValue(args[0]);
        const varName = args[1].trim();
        const expr = args[2].trim();

        // 编译映射表达式
        const compiledExpr = this._compileMapExpression(expr, varName, targetDB);

        return {
          $map: {
            input: arrayExpr,
            as: varName,
            in: compiledExpr
          }
        };
      }

      case 'INDEX_OF': {
        // INDEX_OF(array, searchValue)
        return {
          $indexOfArray: [this._parseValue(args[0]), this._parseValue(args[1])]
        };
      }

      case 'CONCAT_ARRAYS': {
        // CONCAT_ARRAYS(array1, array2, ...)
        const arrays = args.map(arg => this._parseValue(arg));
        return { $concatArrays: arrays };
      }

      default:
        throw new Error(`Unsupported array advanced function: ${funcName}`);
    }
  }

  _compileFilterCondition(condition, varName, targetDB) {
    // 替换 varName.field 为 $$varName.field
    const replaced = condition.replace(new RegExp(`\\b${varName}\\.`, 'g'), `$$${varName}.`);
    // 编译表达式
    return this._compileInnerExpression(replaced, targetDB);
  }

  _compileMapExpression(expr, varName, targetDB) {
    // 检查是否是简单字段访问: tag.name
    if (expr.startsWith(`${varName}.`)) {
      const field = expr.substring(varName.length + 1);
      return `$$${varName}.${field}`;
    }

    // 检查是否是函数调用: UPPER(tag.name)
    if (/^[A-Z_]+\(/.test(expr)) {
      // 替换变量引用
      const replaced = expr.replace(new RegExp(`\\b${varName}\\.`, 'g'), `$$${varName}.`);
      return this._compileInnerExpression(replaced, targetDB);
    }

    // 默认处理
    return this._parseValue(expr);
  }

  _compileTypeFunction(funcName, argsStr, targetDB) {
    const args = this._parseFunctionArgs(argsStr);

    switch (funcName) {
      case 'TYPE': {
        return { $type: this._parseValue(args[0]) };
      }

      case 'NOT': {
        const expr = this._compileInnerExpression(args[0], targetDB);
        return { $not: [expr] };
      }

      case 'EXISTS': {
        return { $ne: [this._parseValue(args[0]), null] };
      }

      case 'IS_NUMBER': {
        return {
          $eq: [{ $type: this._parseValue(args[0]) }, 'number']
        };
      }

      case 'IS_ARRAY': {
        return { $isArray: this._parseValue(args[0]) };
      }

      default:
        throw new Error(`Unsupported type function: ${funcName}`);
    }
  }

  _compileAggregationFunction(funcName, argsStr, targetDB) {
    const args = argsStr ? this._parseFunctionArgs(argsStr) : [];

    switch (funcName) {
      case 'SUM': {
        // SUM(field) => { $sum: '$field' }
        // SUM(expr) => { $sum: expr }
        if (args.length === 0) {
          return { $sum: 1 };
        }
        return { $sum: this._parseValue(args[0]) };
      }

      case 'AVG': {
        // AVG(field) => { $avg: '$field' }
        return { $avg: this._parseValue(args[0]) };
      }

      case 'MAX': {
        // MAX(field) => { $max: '$field' }
        return { $max: this._parseValue(args[0]) };
      }

      case 'MIN': {
        // MIN(field) => { $min: '$field' }
        return { $min: this._parseValue(args[0]) };
      }

      case 'COUNT': {
        // COUNT() => { $sum: 1 }
        return { $sum: 1 };
      }

      case 'PUSH': {
        // PUSH(field) => { $push: '$field' }
        return { $push: this._parseValue(args[0]) };
      }

      case 'ADD_TO_SET': {
        // ADD_TO_SET(field) => { $addToSet: '$field' }
        return { $addToSet: this._parseValue(args[0]) };
      }

      default:
        throw new Error(`Unsupported aggregation function: ${funcName}`);
    }
  }

  _compileDateFunction(funcName, argsStr, targetDB) {
    const args = this._parseFunctionArgs(argsStr);

    switch (funcName) {
      case 'YEAR': {
        return { $year: this._parseValue(args[0]) };
      }

      case 'MONTH': {
        return { $month: this._parseValue(args[0]) };
      }

      case 'DAY_OF_MONTH': {
        return { $dayOfMonth: this._parseValue(args[0]) };
      }

      case 'HOUR': {
        return { $hour: this._parseValue(args[0]) };
      }

      case 'MINUTE': {
        return { $minute: this._parseValue(args[0]) };
      }

      case 'SECOND': {
        return { $second: this._parseValue(args[0]) };
      }

      default:
        throw new Error(`Unsupported date function: ${funcName}`);
    }
  }

  /**
   * 编译日期高级函数（P0 新增）
   * 支持：DATE_ADD, DATE_SUBTRACT, DATE_DIFF, DATE_TO_STRING, DATE_FROM_STRING
   */
  _compileDateAdvancedFunction(funcName, argsStr, targetDB) {
    const args = this._parseFunctionArgs(argsStr);

    switch (funcName) {
      case 'DATE_ADD': {
        // DATE_ADD(date, amount, unit) => { $dateAdd: { startDate: '$date', unit: 'day', amount: 7 } }
        if (args.length !== 3) {
          throw new Error('DATE_ADD requires 3 arguments: DATE_ADD(date, amount, unit)');
        }

        const dateValue = this._parseValue(args[0]);
        const amount = this._parseValue(args[1]);
        const unit = args[2].replace(/['"]/g, ''); // 移除引号

        // 验证时间单位
        const validUnits = ['year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second', 'millisecond'];
        if (!validUnits.includes(unit)) {
          throw new Error(`Invalid time unit for DATE_ADD: ${unit}. Valid units: ${validUnits.join(', ')}`);
        }

        return {
          $dateAdd: {
            startDate: dateValue,
            unit: unit,
            amount: amount
          }
        };
      }

      case 'DATE_SUBTRACT': {
        // DATE_SUBTRACT(date, amount, unit) => { $dateSubtract: { startDate: '$date', unit: 'day', amount: 7 } }
        if (args.length !== 3) {
          throw new Error('DATE_SUBTRACT requires 3 arguments: DATE_SUBTRACT(date, amount, unit)');
        }

        const dateValue = this._parseValue(args[0]);
        const amount = this._parseValue(args[1]);
        const unit = args[2].replace(/['"]/g, '');

        const validUnits = ['year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second', 'millisecond'];
        if (!validUnits.includes(unit)) {
          throw new Error(`Invalid time unit for DATE_SUBTRACT: ${unit}. Valid units: ${validUnits.join(', ')}`);
        }

        return {
          $dateSubtract: {
            startDate: dateValue,
            unit: unit,
            amount: amount
          }
        };
      }

      case 'DATE_DIFF': {
        // DATE_DIFF(endDate, startDate, unit) => { $dateDiff: { startDate: '$start', endDate: '$end', unit: 'day' } }
        if (args.length !== 3) {
          throw new Error('DATE_DIFF requires 3 arguments: DATE_DIFF(endDate, startDate, unit)');
        }

        const endDate = this._parseValue(args[0]);
        const startDate = this._parseValue(args[1]);
        const unit = args[2].replace(/['"]/g, '');

        const validUnits = ['year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second', 'millisecond'];
        if (!validUnits.includes(unit)) {
          throw new Error(`Invalid time unit for DATE_DIFF: ${unit}. Valid units: ${validUnits.join(', ')}`);
        }

        return {
          $dateDiff: {
            startDate: startDate,
            endDate: endDate,
            unit: unit
          }
        };
      }

      case 'DATE_TO_STRING': {
        // DATE_TO_STRING(date, format) => { $dateToString: { date: '$date', format: '%Y-%m-%d' } }
        if (args.length !== 2) {
          throw new Error('DATE_TO_STRING requires 2 arguments: DATE_TO_STRING(date, format)');
        }

        const dateValue = this._parseValue(args[0]);
        const format = args[1].replace(/['"]/g, ''); // 移除引号

        return {
          $dateToString: {
            date: dateValue,
            format: format
          }
        };
      }

      case 'DATE_FROM_STRING': {
        // DATE_FROM_STRING(dateString, format) => { $dateFromString: { dateString: '$str', format: '%Y-%m-%d' } }
        if (args.length < 1 || args.length > 2) {
          throw new Error('DATE_FROM_STRING requires 1-2 arguments: DATE_FROM_STRING(dateString [, format])');
        }

        const dateString = this._parseValue(args[0]);
        const result = {
          $dateFromString: {
            dateString: dateString
          }
        };

        // format 参数可选
        if (args.length === 2) {
          const format = args[1].replace(/['"]/g, '');
          result.$dateFromString.format = format;
        }

        return result;
      }

      default:
        throw new Error(`Unsupported date advanced function: ${funcName}`);
    }
  }

  _compileHighFrequencyFunction(funcName, argsStr, targetDB) {
    const args = this._parseFunctionArgs(argsStr);

    switch (funcName) {
      case 'REGEX': {
        // REGEX(field, pattern) => { $regexMatch: { input: '$field', regex: 'pattern' } }
        return {
          $regexMatch: {
            input: this._parseValue(args[0]),
            regex: args[1].replace(/['"]/g, '')
          }
        };
      }

      case 'MERGE_OBJECTS': {
        // MERGE_OBJECTS(obj1, obj2) => { $mergeObjects: ['$obj1', {...}] }
        // 处理对象字面量
        const parsedArgs = args.map(arg => {
          if (arg.trim().startsWith('{')) {
            // 对象字面量，需要解析
            try {
              return JSON.parse(arg.trim());
            } catch {
              return this._parseValue(arg);
            }
          }
          return this._parseValue(arg);
        });
        return { $mergeObjects: parsedArgs };
      }

      case 'TO_INT': {
        // TO_INT(value) => { $toInt: '$value' }
        return { $toInt: this._parseValue(args[0]) };
      }

      case 'TO_STRING': {
        // TO_STRING(value) => { $toString: '$value' }
        return { $toString: this._parseValue(args[0]) };
      }

      case 'OBJECT_TO_ARRAY': {
        // OBJECT_TO_ARRAY(obj) => { $objectToArray: '$obj' }
        return { $objectToArray: this._parseValue(args[0]) };
      }

      case 'ARRAY_TO_OBJECT': {
        // ARRAY_TO_OBJECT(array) => { $arrayToObject: '$array' }
        return { $arrayToObject: this._parseValue(args[0]) };
      }

      case 'SET_UNION': {
        // SET_UNION(array1, array2) => { $setUnion: ['$array1', '$array2'] }
        const parsedArgs = args.map(arg => {
          if (arg.trim().startsWith('[')) {
            // 数组字面量
            try {
              return JSON.parse(arg.trim());
            } catch {
              return this._parseValue(arg);
            }
          }
          return this._parseValue(arg);
        });
        return { $setUnion: parsedArgs };
      }

      default:
        throw new Error(`Unsupported high frequency function: ${funcName}`);
    }
  }

  _compileSwitchFunction(argsStr, targetDB) {
    const args = this._parseFunctionArgs(argsStr);

    // SWITCH(cond1, val1, cond2, val2, ..., default)
    // => { $switch: { branches: [{case, then}, ...], default } }

    if (args.length < 2) {
      throw new Error('SWITCH requires at least 2 arguments');
    }

    const branches = [];
    let defaultValue = null;

    // 解析分支：每两个参数一组 (condition, value)
    for (let i = 0; i < args.length - 1; i += 2) {
      if (i + 1 < args.length) {
        const condition = this._compileInnerExpression(args[i], targetDB);
        const value = this._parseValue(args[i + 1]);
        branches.push({ case: condition, then: value });
      }
    }

    // 如果参数是奇数，最后一个是default值
    if (args.length % 2 === 1) {
      defaultValue = this._parseValue(args[args.length - 1]);
    }

    const result = {
      $switch: {
        branches: branches
      }
    };

    if (defaultValue !== null) {
      result.$switch.default = defaultValue;
    }

    return result;
  }

  _parseFunctionArgs(argsStr) {
    // 简单的逗号分隔（处理字符串和嵌套括号）
    const args = [];
    let current = '';
    let inString = false;
    let stringChar = null;
    let parenDepth = 0;

    for (let i = 0; i < argsStr.length; i++) {
      const char = argsStr[i];

      if ((char === '"' || char === "'") && (i === 0 || argsStr[i-1] !== '\\')) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
          stringChar = null;
        }
        current += char;
      } else if (char === '(' && !inString) {
        parenDepth++;
        current += char;
      } else if (char === ')' && !inString) {
        parenDepth--;
        current += char;
      } else if (char === ',' && !inString && parenDepth === 0) {
        args.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      args.push(current.trim());
    }

    return args;
  }

  /**
   * 递归编译管道中的所有表达式
   * @param {Array} pipeline - 聚合管道
   * @param {Object} options - 编译选项
   * @returns {Array} 编译后的管道
   */
  compilePipeline(pipeline, options = {}) {
    if (!Array.isArray(pipeline)) {
      throw new TypeError('Pipeline must be an array');
    }

    return pipeline.map(stage => this._compileStage(stage, options));
  }

  /**
   * 编译单个管道阶段
   * @param {Object} stage - 管道阶段
   * @param {Object} options - 编译选项
   * @returns {Object} 编译后的阶段
   * @private
   */
  _compileStage(stage, options) {
    if (!stage || typeof stage !== 'object') {
      return stage;
    }

    if (Array.isArray(stage)) {
      return stage.map(item => this._compileStage(item, options));
    }

    if (isExpressionObject(stage)) {
      const context = options.context || 'match';
      return this.compile(stage, { ...options, context });
    }

    // 检测阶段类型
    const stageKeys = Object.keys(stage);
    if (stageKeys.length > 0) {
      const stageKey = stageKeys[0];

      // 根据阶段类型设置上下文
      let context = 'match';
      if (stageKey === '$project' || stageKey === '$addFields' || stageKey === '$set') {
        context = 'project';
      } else if (stageKey === '$group') {
        context = 'group';
      }

      // 递归编译阶段内容
      const compiled = {};
      for (const key in stage) {
        if (stage.hasOwnProperty(key)) {
          compiled[key] = this._compileStageValue(stage[key], { ...options, context });
        }
      }

      return compiled;
    }

    // 默认递归处理
    const compiled = {};
    for (const key in stage) {
      if (stage.hasOwnProperty(key)) {
        compiled[key] = this._compileStage(stage[key], options);
      }
    }

    return compiled;
  }

  _compileStageValue(value, options) {
    if (!value || typeof value !== 'object') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map(item => this._compileStageValue(item, options));
    }

    if (isExpressionObject(value)) {
      return this.compile(value, options);
    }

    const compiled = {};
    for (const key in value) {
      if (value.hasOwnProperty(key)) {
        compiled[key] = this._compileStageValue(value[key], options);
      }
    }

    return compiled;
  }

  /**
   * 获取缓存统计
   * @returns {Object} 缓存统计
   */
  getStats() {
    return this.cache.getStats();
  }

  /**
   * 清空缓存
   */
  clearCache() {
    this.cache.clear();
  }
}

module.exports = ExpressionCompiler;


