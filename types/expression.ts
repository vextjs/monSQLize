/**
 * 统一表达式系统类型定义
 * @module types/expression
 * @since v1.0.9
 * @updated v1.1.0 - 新增49个操作符，实现100% MongoDB支持
 */

/**
 * 支持的统一表达式操作符（122个 - 100% MongoDB支持）
 * @since v1.0.9
 * @updated v1.1.0
 */
export namespace UnifiedExpressionOperators {
    /** 三元运算符 */
    export type TernaryOperator = '? :';

    /** 空值合并运算符 */
    export type NullishCoalescing = '??';

    /** 比较运算符 */
    export type ComparisonOperators = '>' | '>=' | '<' | '<=' | '===' | '!==';

    /** 逻辑运算符 */
    export type LogicalOperators = '&&' | '||' | 'NOT';

    /** 算术运算符 */
    export type ArithmeticOperators = '+' | '-' | '*' | '/' | '%';

    /** 数学函数（8个）*/
    export type MathFunctions = 'ABS' | 'CEIL' | 'FLOOR' | 'ROUND' | 'SQRT' | 'POW' | 'LOG' | 'LOG10';

    /** 字符串基础函数（12个）*/
    export type StringBasicFunctions = 'CONCAT' | 'UPPER' | 'LOWER' | 'TRIM' | 'SUBSTR' | 'LENGTH' |
        'SPLIT' | 'REPLACE' | 'INDEX_OF_STR' | 'LTRIM' | 'RTRIM' | 'SUBSTR_CP';

    /** 字符串扩展函数（3个）v1.1.0 */
    export type StringExtendedFunctions = 'STR_LEN_BYTES' | 'STR_LEN_CP' | 'SUBSTR_BYTES';

    /** 数组基础函数（13个）*/
    export type ArrayBasicFunctions = 'SIZE' | 'ARRAY_ELEM_AT' | 'IN' | 'SLICE' | 'FIRST' | 'LAST' |
        'FILTER' | 'MAP' | 'INDEX_OF' | 'CONCAT_ARRAYS';

    /** 数组扩展函数（4个）v1.1.0 */
    export type ArrayExtendedFunctions = 'REDUCE' | 'ZIP' | 'REVERSE_ARRAY' | 'RANGE';

    /** 日期基础函数（6个）*/
    export type DateBasicFunctions = 'YEAR' | 'MONTH' | 'DAY_OF_MONTH' | 'HOUR' | 'MINUTE' | 'SECOND';

    /** 日期高级函数（5个）v1.1.0 */
    export type DateAdvancedFunctions = 'DATE_ADD' | 'DATE_SUBTRACT' | 'DATE_DIFF' | 'DATE_TO_STRING' | 'DATE_FROM_STRING';

    /** 日期扩展函数（8个）v1.1.0 */
    export type DateExtendedFunctions = 'DATE_FROM_PARTS' | 'DATE_TO_PARTS' | 'ISO_WEEK' | 'ISO_WEEK_YEAR' |
        'ISO_DAY_OF_WEEK' | 'DAY_OF_WEEK' | 'DAY_OF_YEAR' | 'WEEK';

    /** 类型检查函数（5个）*/
    export type TypeCheckFunctions = 'TYPE' | 'IS_NUMBER' | 'IS_ARRAY' | 'EXISTS' | 'NOT';

    /** 类型转换基础函数（3个）*/
    export type TypeConversionBasicFunctions = 'TO_INT' | 'TO_STRING' | 'OBJECT_TO_ARRAY' | 'ARRAY_TO_OBJECT';

    /** 类型转换扩展函数（7个）v1.1.0 */
    export type TypeConversionExtendedFunctions = 'TO_BOOL' | 'TO_DATE' | 'TO_DOUBLE' | 'TO_DECIMAL' |
        'TO_LONG' | 'TO_OBJECT_ID' | 'CONVERT';

    /** 逻辑扩展函数（2个）v1.1.0 */
    export type LogicalExtendedFunctions = 'ALL_ELEMENTS_TRUE' | 'ANY_ELEMENT_TRUE';

    /** 条件函数（3个）*/
    export type ConditionalFunctions = 'SWITCH' | 'COND' | 'IF_NULL';

    /** 对象操作函数（5个）*/
    export type ObjectOperationFunctions = 'MERGE_OBJECTS' | 'SET_FIELD' | 'UNSET_FIELD' | 'GET_FIELD' | 'OBJECT_TO_ARRAY';

    /** 集合操作函数（5个）*/
    export type SetOperationFunctions = 'SET_UNION' | 'SET_DIFFERENCE' | 'SET_EQUALS' | 'SET_INTERSECTION' | 'SET_IS_SUBSET';

    /** 高级操作函数（4个）v1.1.0 */
    export type AdvancedOperationFunctions = 'LET' | 'LITERAL' | 'RAND' | 'SAMPLE_RATE' | 'REGEX';

    /** 聚合累加器（7个）*/
    export type AggregateFunctions = 'SUM' | 'AVG' | 'MAX' | 'MIN' | 'COUNT' | 'PUSH' | 'ADD_TO_SET';

    /** 所有操作符联合类型 */
    export type AllOperators =
        | TernaryOperator
        | NullishCoalescing
        | ComparisonOperators
        | LogicalOperators
        | ArithmeticOperators
        | MathFunctions
        | StringBasicFunctions
        | StringExtendedFunctions
        | ArrayBasicFunctions
        | ArrayExtendedFunctions
        | DateBasicFunctions
        | DateAdvancedFunctions
        | DateExtendedFunctions
        | TypeCheckFunctions
        | TypeConversionBasicFunctions
        | TypeConversionExtendedFunctions
        | LogicalExtendedFunctions
        | ConditionalFunctions
        | ObjectOperationFunctions
        | SetOperationFunctions
        | AdvancedOperationFunctions
        | AggregateFunctions;
}

