/**
 * 统一表达式系统类型定义
 * @module types/expression
 * @since v1.0.9
 */

/**
 * 支持的统一表达式操作符（67个）
 * @since v1.0.9
 */
export namespace UnifiedExpressionOperators {
    /** 三元运算符 */
    export type TernaryOperator = '? :';
    /** 空值合并运算符 */
    export type NullishCoalescing = '??';
    export type ComparisonOperators = '>' | '>=' | '<' | '<=' | '===' | '!==';
    export type LogicalOperators = '&&' | '||' | 'NOT';
    export type ArithmeticOperators = '+' | '-' | '*' | '/' | '%';
    export type MathFunctions = 'ABS' | 'CEIL' | 'FLOOR' | 'ROUND' | 'SQRT' | 'POW';
    export type StringBasicFunctions = 'CONCAT' | 'UPPER' | 'LOWER' | 'TRIM' | 'SUBSTR' | 'LENGTH';
    export type StringAdvancedFunctions = 'SPLIT' | 'REPLACE' | 'INDEX_OF_STR' | 'LTRIM' | 'RTRIM' | 'SUBSTR_CP';
    export type ArrayBasicFunctions = 'SIZE' | 'ARRAY_ELEM_AT' | 'IN' | 'SLICE' | 'FIRST' | 'LAST';
    export type ArrayAdvancedFunctions = 'FILTER' | 'MAP' | 'INDEX_OF' | 'CONCAT_ARRAYS';
    export type DateFunctions = 'YEAR' | 'MONTH' | 'DAY_OF_MONTH' | 'HOUR' | 'MINUTE' | 'SECOND';
    export type TypeFunctions = 'TYPE' | 'IS_NUMBER' | 'IS_ARRAY' | 'EXISTS';
    export type TypeConversionFunctions = 'TO_INT' | 'TO_STRING' | 'OBJECT_TO_ARRAY' | 'ARRAY_TO_OBJECT';
    export type HighFrequencyFunctions = 'REGEX' | 'MERGE_OBJECTS' | 'SET_UNION';
    export type ConditionalExtended = 'SWITCH';
    export type AggregateFunctions = 'SUM' | 'AVG' | 'MAX' | 'MIN' | 'COUNT' | 'PUSH' | 'ADD_TO_SET' | 'FIRST' | 'LAST';
    export type AllOperators = TernaryOperator | NullishCoalescing | ComparisonOperators | LogicalOperators |
        ArithmeticOperators | MathFunctions | StringBasicFunctions | StringAdvancedFunctions |
        ArrayBasicFunctions | ArrayAdvancedFunctions | DateFunctions | TypeFunctions |
        TypeConversionFunctions | HighFrequencyFunctions | ConditionalExtended | AggregateFunctions;
}

