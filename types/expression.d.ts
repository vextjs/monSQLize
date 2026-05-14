/**
 * Unified expression operator type definitions.
 * @module types/expression
 * @since v1.0.9
 */

/**
 * All 122 expression operators supported by the MonSQLize expression system
 * (100% MongoDB coverage).
 *
 * @since v1.0.9
 */
export namespace UnifiedExpressionOperators {
    /** Ternary conditional operator. */
    export type TernaryOperator = '? :';

    /** Nullish coalescing operator. */
    export type NullishCoalescing = '??';

    /** Comparison operators. */
    export type ComparisonOperators = '>' | '>=' | '<' | '<=' | '===' | '!==';

    /** Logical operators. */
    export type LogicalOperators = '&&' | '||' | 'NOT';

    /** Arithmetic operators. */
    export type ArithmeticOperators = '+' | '-' | '*' | '/' | '%';

    /** Math functions (8). */
    export type MathFunctions = 'ABS' | 'CEIL' | 'FLOOR' | 'ROUND' | 'SQRT' | 'POW' | 'LOG' | 'LOG10';

    /** Basic string functions (12). */
    export type StringBasicFunctions =
        | 'CONCAT' | 'UPPER' | 'LOWER' | 'TRIM' | 'SUBSTR' | 'LENGTH'
        | 'SPLIT' | 'REPLACE' | 'INDEX_OF_STR' | 'LTRIM' | 'RTRIM' | 'SUBSTR_CP';

    /** Extended string functions (3). @since v1.1.0 */
    export type StringExtendedFunctions = 'STR_LEN_BYTES' | 'STR_LEN_CP' | 'SUBSTR_BYTES';

    /** Basic array functions (10). */
    export type ArrayBasicFunctions =
        | 'SIZE' | 'ARRAY_ELEM_AT' | 'IN' | 'SLICE' | 'FIRST' | 'LAST'
        | 'FILTER' | 'MAP' | 'INDEX_OF' | 'CONCAT_ARRAYS';

    /** Extended array functions (4). @since v1.1.0 */
    export type ArrayExtendedFunctions = 'REDUCE' | 'ZIP' | 'REVERSE_ARRAY' | 'RANGE';

    /** Basic date functions (6). */
    export type DateBasicFunctions = 'YEAR' | 'MONTH' | 'DAY_OF_MONTH' | 'HOUR' | 'MINUTE' | 'SECOND';

    /** Advanced date functions (5). @since v1.1.0 */
    export type DateAdvancedFunctions =
        | 'DATE_ADD' | 'DATE_SUBTRACT' | 'DATE_DIFF' | 'DATE_TO_STRING' | 'DATE_FROM_STRING';

    /** Extended date functions (8). @since v1.1.0 */
    export type DateExtendedFunctions =
        | 'DATE_FROM_PARTS' | 'DATE_TO_PARTS' | 'ISO_WEEK' | 'ISO_WEEK_YEAR'
        | 'ISO_DAY_OF_WEEK' | 'DAY_OF_WEEK' | 'DAY_OF_YEAR' | 'WEEK';

    /** Type inspection functions (5). */
    export type TypeCheckFunctions = 'TYPE' | 'IS_NUMBER' | 'IS_ARRAY' | 'EXISTS' | 'NOT';

    /** Basic type conversion functions. */
    export type TypeConversionBasicFunctions = 'TO_INT' | 'TO_STRING' | 'OBJECT_TO_ARRAY' | 'ARRAY_TO_OBJECT';

    /** Extended type conversion functions (7). @since v1.1.0 */
    export type TypeConversionExtendedFunctions =
        | 'TO_BOOL' | 'TO_DATE' | 'TO_DOUBLE' | 'TO_DECIMAL'
        | 'TO_LONG' | 'TO_OBJECT_ID' | 'CONVERT';

    /** Logical extended functions (2). @since v1.1.0 */
    export type LogicalExtendedFunctions = 'ALL_ELEMENTS_TRUE' | 'ANY_ELEMENT_TRUE';

    /** Conditional functions (3). */
    export type ConditionalFunctions = 'SWITCH' | 'COND' | 'IF_NULL';

    /** Object manipulation functions (5). */
    export type ObjectOperationFunctions =
        | 'MERGE_OBJECTS' | 'SET_FIELD' | 'UNSET_FIELD' | 'GET_FIELD' | 'OBJECT_TO_ARRAY';

    /** Set operation functions (5). */
    export type SetOperationFunctions =
        | 'SET_UNION' | 'SET_DIFFERENCE' | 'SET_EQUALS' | 'SET_INTERSECTION' | 'SET_IS_SUBSET';

    /** Advanced operation functions (5). @since v1.1.0 */
    export type AdvancedOperationFunctions = 'LET' | 'LITERAL' | 'RAND' | 'SAMPLE_RATE' | 'REGEX';

    /** Aggregate accumulator functions (7). */
    export type AggregateFunctions = 'SUM' | 'AVG' | 'MAX' | 'MIN' | 'COUNT' | 'PUSH' | 'ADD_TO_SET';

    /** Union of all supported operator strings. */
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
