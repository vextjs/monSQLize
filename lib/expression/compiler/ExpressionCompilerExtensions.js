/**
 * 表达式编译器扩展方法 - 所有未支持功能实现
 * v1.1.0 新增44个操作符的完整实现
 *
 * @module ExpressionCompilerExtensions
 */

/**
 * 日期扩展函数（8个）
 * DATE_FROM_PARTS, DATE_TO_PARTS, ISO_WEEK, ISO_WEEK_YEAR, ISO_DAY_OF_WEEK, DAY_OF_WEEK, DAY_OF_YEAR, WEEK
 */
function _compileDateExtendedFunction(funcName, argsStr, targetDB) {
  const args = this._parseFunctionArgs(argsStr);

  switch (funcName) {
    case 'DATE_FROM_PARTS': {
      // DATE_FROM_PARTS(year, month, day [, hour, minute, second])
      if (args.length < 3) {
        throw new Error('DATE_FROM_PARTS requires at least 3 arguments: year, month, day');
      }

      const result = {
        $dateFromParts: {
          year: this._parseValue(args[0]),
          month: this._parseValue(args[1]),
          day: this._parseValue(args[2])
        }
      };

      if (args[3]) result.$dateFromParts.hour = this._parseValue(args[3]);
      if (args[4]) result.$dateFromParts.minute = this._parseValue(args[4]);
      if (args[5]) result.$dateFromParts.second = this._parseValue(args[5]);

      return result;
    }

    case 'DATE_TO_PARTS': {
      // DATE_TO_PARTS(date)
      if (args.length !== 1) {
        throw new Error('DATE_TO_PARTS requires 1 argument: date');
      }
      return { $dateToParts: { date: this._parseValue(args[0]) } };
    }

    case 'ISO_WEEK': {
      return { $isoWeek: this._parseValue(args[0]) };
    }

    case 'ISO_WEEK_YEAR': {
      return { $isoWeekYear: this._parseValue(args[0]) };
    }

    case 'ISO_DAY_OF_WEEK': {
      return { $isoDayOfWeek: this._parseValue(args[0]) };
    }

    case 'DAY_OF_WEEK': {
      return { $dayOfWeek: this._parseValue(args[0]) };
    }

    case 'DAY_OF_YEAR': {
      return { $dayOfYear: this._parseValue(args[0]) };
    }

    case 'WEEK': {
      return { $week: this._parseValue(args[0]) };
    }

    default:
      throw new Error(`Unsupported date extended function: ${funcName}`);
  }
}

/**
 * 类型转换函数（7个）
 * TO_BOOL, TO_DATE, TO_DOUBLE, TO_DECIMAL, TO_LONG, TO_OBJECT_ID, CONVERT
 */
function _compileTypeConversionFunction(funcName, argsStr, targetDB) {
  const args = this._parseFunctionArgs(argsStr);

  switch (funcName) {
    case 'TO_BOOL': {
      return { $toBool: this._parseValue(args[0]) };
    }

    case 'TO_DATE': {
      return { $toDate: this._parseValue(args[0]) };
    }

    case 'TO_DOUBLE': {
      return { $toDouble: this._parseValue(args[0]) };
    }

    case 'TO_DECIMAL': {
      return { $toDecimal: this._parseValue(args[0]) };
    }

    case 'TO_LONG': {
      return { $toLong: this._parseValue(args[0]) };
    }

    case 'TO_OBJECT_ID': {
      return { $toObjectId: this._parseValue(args[0]) };
    }

    case 'CONVERT': {
      // CONVERT(value, toType [, onError, onNull])
      if (args.length < 2) {
        throw new Error('CONVERT requires at least 2 arguments: value, toType');
      }

      const result = {
        $convert: {
          input: this._parseValue(args[0]),
          to: args[1].replace(/['"]/g, '')
        }
      };

      if (args[2]) result.$convert.onError = this._parseValue(args[2]);
      if (args[3]) result.$convert.onNull = this._parseValue(args[3]);

      return result;
    }

    default:
      throw new Error(`Unsupported type conversion function: ${funcName}`);
  }
}

/**
 * 数组扩展函数（4个）
 * REDUCE, ZIP, REVERSE_ARRAY, RANGE
 */
function _compileArrayExtendedFunction(funcName, argsStr, targetDB) {
  const args = this._parseFunctionArgs(argsStr);

  switch (funcName) {
    case 'REDUCE': {
      // REDUCE(array, initialValue, expression)
      if (args.length !== 3) {
        throw new Error('REDUCE requires 3 arguments: array, initialValue, expression');
      }

      // 解析Lambda表达式
      const lambdaMatch = args[2].match(/\((\w+),\s*(\w+)\)\s*=>\s*(.+)/);
      if (!lambdaMatch) {
        throw new Error('REDUCE requires a lambda expression: (accumulator, item) => expression');
      }

      const [, accVar, itemVar, expression] = lambdaMatch;

      // 替换变量为$$value和$$this
      const compiledExpr = expression
        .replace(new RegExp(`\\b${accVar}\\b`, 'g'), '$$value')
        .replace(new RegExp(`\\b${itemVar}\\b`, 'g'), '$$this');

      return {
        $reduce: {
          input: this._parseValue(args[0]),
          initialValue: this._parseValue(args[1]),
          in: this._compileInnerExpression(compiledExpr, targetDB)
        }
      };
    }

    case 'ZIP': {
      // ZIP(array1, array2, ...)
      if (args.length < 2) {
        throw new Error('ZIP requires at least 2 arrays');
      }

      return {
        $zip: {
          inputs: args.map(arg => this._parseValue(arg))
        }
      };
    }

    case 'REVERSE_ARRAY': {
      return { $reverseArray: this._parseValue(args[0]) };
    }

    case 'RANGE': {
      // RANGE(start, end [, step])
      if (args.length < 2) {
        throw new Error('RANGE requires at least 2 arguments: start, end');
      }

      const result = [
        this._parseValue(args[0]),
        this._parseValue(args[1])
      ];

      if (args[2]) {
        result.push(this._parseValue(args[2]));
      }

      return { $range: result };
    }

    default:
      throw new Error(`Unsupported array extended function: ${funcName}`);
  }
}

/**
 * 字符串扩展函数（3个）
 * STR_LEN_BYTES, STR_LEN_CP, SUBSTR_BYTES
 */
function _compileStringExtendedFunction(funcName, argsStr, targetDB) {
  const args = this._parseFunctionArgs(argsStr);

  switch (funcName) {
    case 'STR_LEN_BYTES': {
      return { $strLenBytes: this._parseValue(args[0]) };
    }

    case 'STR_LEN_CP': {
      return { $strLenCP: this._parseValue(args[0]) };
    }

    case 'SUBSTR_BYTES': {
      // SUBSTR_BYTES(string, start, length)
      if (args.length !== 3) {
        throw new Error('SUBSTR_BYTES requires 3 arguments: string, start, length');
      }

      return {
        $substrBytes: [
          this._parseValue(args[0]),
          this._parseValue(args[1]),
          this._parseValue(args[2])
        ]
      };
    }

    default:
      throw new Error(`Unsupported string extended function: ${funcName}`);
  }
}

/**
 * 数学扩展函数（2个）
 * LOG, LOG10
 */
function _compileMathExtendedFunction(funcName, argsStr, targetDB) {
  const args = this._parseFunctionArgs(argsStr);

  switch (funcName) {
    case 'LOG': {
      // LOG(number, base)
      if (args.length !== 2) {
        throw new Error('LOG requires 2 arguments: number, base');
      }

      return {
        $log: [
          this._parseValue(args[0]),
          this._parseValue(args[1])
        ]
      };
    }

    case 'LOG10': {
      return { $log10: this._parseValue(args[0]) };
    }

    default:
      throw new Error(`Unsupported math extended function: ${funcName}`);
  }
}

/**
 * 逻辑扩展函数（2个）
 * ALL_ELEMENTS_TRUE, ANY_ELEMENT_TRUE
 */
function _compileLogicalExtendedFunction(funcName, argsStr, targetDB) {
  const args = this._parseFunctionArgs(argsStr);

  switch (funcName) {
    case 'ALL_ELEMENTS_TRUE': {
      return { $allElementsTrue: [this._parseValue(args[0])] };
    }

    case 'ANY_ELEMENT_TRUE': {
      return { $anyElementTrue: [this._parseValue(args[0])] };
    }

    default:
      throw new Error(`Unsupported logical extended function: ${funcName}`);
  }
}

/**
 * 条件扩展函数（2个）
 * COND, IF_NULL
 */
function _compileConditionalExtendedFunction(funcName, argsStr, targetDB) {
  const args = this._parseFunctionArgs(argsStr);

  switch (funcName) {
    case 'COND': {
      // COND(condition, thenValue, elseValue)
      if (args.length !== 3) {
        throw new Error('COND requires 3 arguments: condition, thenValue, elseValue');
      }

      return {
        $cond: {
          if: this._compileInnerExpression(args[0], targetDB),
          then: this._parseValue(args[1]),
          else: this._parseValue(args[2])
        }
      };
    }

    case 'IF_NULL': {
      // IF_NULL(expression, replacement)
      if (args.length !== 2) {
        throw new Error('IF_NULL requires 2 arguments: expression, replacement');
      }

      return {
        $ifNull: [
          this._parseValue(args[0]),
          this._parseValue(args[1])
        ]
      };
    }

    default:
      throw new Error(`Unsupported conditional extended function: ${funcName}`);
  }
}

/**
 * 对象操作函数（3个）
 * SET_FIELD, UNSET_FIELD, GET_FIELD
 */
function _compileObjectOperationFunction(funcName, argsStr, targetDB) {
  const args = this._parseFunctionArgs(argsStr);

  switch (funcName) {
    case 'SET_FIELD': {
      // SET_FIELD(fieldName, value, input)
      if (args.length !== 3) {
        throw new Error('SET_FIELD requires 3 arguments: fieldName, value, input');
      }

      return {
        $setField: {
          field: this._parseValue(args[0]),
          input: this._parseValue(args[2]),
          value: this._parseValue(args[1])
        }
      };
    }

    case 'UNSET_FIELD': {
      // UNSET_FIELD(fieldName, input)
      if (args.length !== 2) {
        throw new Error('UNSET_FIELD requires 2 arguments: fieldName, input');
      }

      return {
        $unsetField: {
          field: this._parseValue(args[0]),
          input: this._parseValue(args[1])
        }
      };
    }

    case 'GET_FIELD': {
      // GET_FIELD(fieldName, input)
      if (args.length === 1) {
        return { $getField: this._parseValue(args[0]) };
      } else if (args.length === 2) {
        return {
          $getField: {
            field: this._parseValue(args[0]),
            input: this._parseValue(args[1])
          }
        };
      } else {
        throw new Error('GET_FIELD requires 1 or 2 arguments');
      }
    }

    default:
      throw new Error(`Unsupported object operation function: ${funcName}`);
  }
}

/**
 * 集合操作函数（4个）
 * SET_DIFFERENCE, SET_EQUALS, SET_INTERSECTION, SET_IS_SUBSET
 */
function _compileSetOperationFunction(funcName, argsStr, targetDB) {
  const args = this._parseFunctionArgs(argsStr);

  switch (funcName) {
    case 'SET_DIFFERENCE': {
      // SET_DIFFERENCE(array1, array2)
      if (args.length !== 2) {
        throw new Error('SET_DIFFERENCE requires 2 arguments: array1, array2');
      }

      return {
        $setDifference: [
          this._parseValue(args[0]),
          this._parseValue(args[1])
        ]
      };
    }

    case 'SET_EQUALS': {
      // SET_EQUALS(array1, array2, ...)
      if (args.length < 2) {
        throw new Error('SET_EQUALS requires at least 2 arrays');
      }

      return {
        $setEquals: args.map(arg => this._parseValue(arg))
      };
    }

    case 'SET_INTERSECTION': {
      // SET_INTERSECTION(array1, array2, ...)
      if (args.length < 2) {
        throw new Error('SET_INTERSECTION requires at least 2 arrays');
      }

      return {
        $setIntersection: args.map(arg => this._parseValue(arg))
      };
    }

    case 'SET_IS_SUBSET': {
      // SET_IS_SUBSET(array1, array2)
      if (args.length !== 2) {
        throw new Error('SET_IS_SUBSET requires 2 arguments: array1, array2');
      }

      return {
        $setIsSubset: [
          this._parseValue(args[0]),
          this._parseValue(args[1])
        ]
      };
    }

    default:
      throw new Error(`Unsupported set operation function: ${funcName}`);
  }
}

/**
 * 高级操作函数（4个）
 * LET, LITERAL, RAND, SAMPLE_RATE
 */
function _compileAdvancedOperationFunction(funcName, argsStr, targetDB) {
  const args = argsStr ? this._parseFunctionArgs(argsStr) : [];

  switch (funcName) {
    case 'LET': {
      // LET({var1: value1, var2: value2}, expression)
      if (args.length !== 2) {
        throw new Error('LET requires 2 arguments: variables, expression');
      }

      // 解析变量定义
      const varsMatch = args[0].match(/\{(.+)\}/);
      if (!varsMatch) {
        throw new Error('LET requires an object literal for variables');
      }

      const varsStr = varsMatch[1];
      const varPairs = varsStr.split(',').map(pair => {
        const [key, value] = pair.split(':').map(s => s.trim());
        return [key, value];
      });

      const vars = {};
      varPairs.forEach(([key, value]) => {
        vars[key] = this._parseValue(value);
      });

      return {
        $let: {
          vars: vars,
          in: this._compileInnerExpression(args[1], targetDB)
        }
      };
    }

    case 'LITERAL': {
      return { $literal: this._parseValue(args[0]) };
    }

    case 'RAND': {
      return { $rand: {} };
    }

    case 'SAMPLE_RATE': {
      // SAMPLE_RATE(rate)
      if (args.length !== 1) {
        throw new Error('SAMPLE_RATE requires 1 argument: rate');
      }

      return { $sampleRate: this._parseValue(args[0]) };
    }

    default:
      throw new Error(`Unsupported advanced operation function: ${funcName}`);
  }
}

// 导出所有扩展方法
module.exports = {
  _compileDateExtendedFunction,
  _compileTypeConversionFunction,
  _compileArrayExtendedFunction,
  _compileStringExtendedFunction,
  _compileMathExtendedFunction,
  _compileLogicalExtendedFunction,
  _compileConditionalExtendedFunction,
  _compileObjectOperationFunction,
  _compileSetOperationFunction,
  _compileAdvancedOperationFunction
};

