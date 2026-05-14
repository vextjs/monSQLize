/**
 * Expression compilation module — fully ported from the v1 ExpressionCompiler + ExpressionCompilerExtensions.
 * Supports 100+ MongoDB operators with 1:1 behavior compatibility with v1.
 */

import type { ExpressionObject } from '../../../types/base';
import { createError, ErrorCodes } from '../errors/index';

export type { ExpressionObject } from '../../../types/base';

// Full function-name regex (fully aligned with v1 ExpressionCompiler.js line 87)
const FUNC_REGEX =
    /^(CONCAT|UPPER|LOWER|TRIM|SUBSTR|LENGTH|ABS|CEIL|FLOOR|ROUND|SQRT|POW|SIZE|IN|SLICE|FIRST|LAST|ARRAY_ELEM_AT|FILTER|MAP|INDEX_OF|CONCAT_ARRAYS|TYPE|NOT|EXISTS|IS_NUMBER|IS_ARRAY|SUM|AVG|MAX|MIN|COUNT|PUSH|ADD_TO_SET|YEAR|MONTH|DAY_OF_MONTH|HOUR|MINUTE|SECOND|SPLIT|REPLACE|INDEX_OF_STR|LTRIM|RTRIM|SUBSTR_CP|REGEX|MERGE_OBJECTS|TO_INT|TO_STRING|OBJECT_TO_ARRAY|ARRAY_TO_OBJECT|SET_UNION|SWITCH|DATE_ADD|DATE_SUBTRACT|DATE_DIFF|DATE_TO_STRING|DATE_FROM_STRING|TO_BOOL|TO_DATE|TO_DOUBLE|CONVERT|TO_DECIMAL|TO_LONG|TO_OBJECT_ID|REDUCE|ZIP|REVERSE_ARRAY|RANGE|DATE_FROM_PARTS|DATE_TO_PARTS|ISO_WEEK|ISO_WEEK_YEAR|ISO_DAY_OF_WEEK|DAY_OF_WEEK|DAY_OF_YEAR|WEEK|STR_LEN_BYTES|STR_LEN_CP|SUBSTR_BYTES|LOG|LOG10|ALL_ELEMENTS_TRUE|ANY_ELEMENT_TRUE|COND|IF_NULL|SET_FIELD|UNSET_FIELD|GET_FIELD|SET_DIFFERENCE|SET_EQUALS|SET_INTERSECTION|SET_IS_SUBSET|LET|LITERAL|RAND|SAMPLE_RATE)\s*\((.+)?\)$/i;

// Compact function-name regex used by _parseValue and comparison-left-side detection (aligned with v1 lines 291/305; excludes v1.1.0 extended functions)
const IS_FUNC_CALL_RE =
    /^(CONCAT|UPPER|LOWER|TRIM|SUBSTR|LENGTH|ABS|CEIL|FLOOR|ROUND|SQRT|POW|SIZE|IN|SLICE|FIRST|LAST|ARRAY_ELEM_AT|FILTER|MAP|INDEX_OF|CONCAT_ARRAYS|TYPE|NOT|EXISTS|IS_NUMBER|IS_ARRAY|SUM|AVG|MAX|MIN|COUNT|PUSH|ADD_TO_SET|YEAR|MONTH|DAY_OF_MONTH|HOUR|MINUTE|SECOND|SPLIT|REPLACE|INDEX_OF_STR|LTRIM|RTRIM|SUBSTR_CP|REGEX|MERGE_OBJECTS|TO_INT|TO_STRING|OBJECT_TO_ARRAY|ARRAY_TO_OBJECT|SET_UNION|SWITCH)\s*\(/i;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an expression object (aligned with v1 factory.js: non-string input throws TypeError).
 */
export function createExpression(expression: unknown): ExpressionObject {
    if (typeof expression !== 'string') {
        throw new TypeError('Expression must be a string');
    }
    const normalized = expression.trim();
    if (!normalized) {
        throw createError(ErrorCodes.INVALID_EXPRESSION, 'Expression cannot be empty');
    }
    return { __expr__: normalized, __compiled__: false };
}

/**
 * Shorthand alias for {@link createExpression}.
 * @since v1.0.0
 */
export const expr = createExpression;

/** Returns true if the value is an expression object. */
export function isExpressionObject(value: unknown): value is ExpressionObject {
    return Boolean(
        value &&
        typeof value === 'object' &&
        '__expr__' in value &&
        typeof (value as ExpressionObject).__expr__ === 'string' &&
        '__compiled__' in value &&
        typeof (value as ExpressionObject).__compiled__ === 'boolean',
    );
}

/** Recursively checks whether an object contains any expression objects. */
export function hasExpressionInObject(value: unknown): boolean {
    if (isExpressionObject(value)) return true;
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value)) return value.some((item) => hasExpressionInObject(item));
    return Object.values(value).some((item) => hasExpressionInObject(item));
}

/** Recursively checks whether an aggregation pipeline contains any expression objects. */
export function hasExpressionInPipeline(pipeline: unknown): boolean {
    return Array.isArray(pipeline) && pipeline.some((stage) => hasExpressionInObject(stage));
}

/** Compiles expression objects within an aggregation pipeline. */
export function compilePipelineExpressions<TPipeline>(pipeline: TPipeline): TPipeline {
    return transformExpressions(pipeline, 'project') as TPipeline;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage-level traversal (with context tracking, aligned with v1 _compileStage / _compileStageValue)
// ─────────────────────────────────────────────────────────────────────────────

type StageContext = 'match' | 'project' | 'group';

function transformExpressions(value: unknown, context: StageContext): unknown {
    if (isExpressionObject(value)) {
        const compiled = compileInnerExpression((value as ExpressionObject).__expr__);
        return context === 'match' ? { $expr: compiled } : compiled;
    }

    if (Array.isArray(value)) {
        // Each top-level array element is a pipeline stage; context is inferred independently
        return value.map((item) => transformStageEntry(item));
    }

    if (!value || typeof value !== 'object') return value;

    // plain object — process each key
    const entries = Object.entries(value as Record<string, unknown>);
    const result: Record<string, unknown> = {};
    for (const [k, v] of entries) {
        result[k] = transformExpressions(v, context);
    }
    return result;
}

/** Processes a single pipeline stage object, inferring context from the stage key. */
function transformStageEntry(stage: unknown): unknown {
    if (!stage || typeof stage !== 'object' || Array.isArray(stage)) {
        return transformExpressions(stage, 'project');
    }
    const entries = Object.entries(stage as Record<string, unknown>);
    const result: Record<string, unknown> = {};
    for (const [k, v] of entries) {
        const ctx = getStageContext(k);
        result[k] = transformStageValue(v, ctx);
    }
    return result;
}

/** Determines the compilation context based on the stage key. */
function getStageContext(key: string): StageContext {
    if (key === '$project' || key === '$addFields' || key === '$set') return 'project';
    if (key === '$group') return 'group';
    return 'match';
}

/** Recursively processes a stage value (non-array root). */
function transformStageValue(value: unknown, context: StageContext): unknown {
    if (isExpressionObject(value)) {
        const compiled = compileInnerExpression((value as ExpressionObject).__expr__);
        return context === 'match' ? { $expr: compiled } : compiled;
    }
    if (Array.isArray(value)) {
        return value.map((item) => transformStageValue(item, context));
    }
    if (!value || typeof value !== 'object') return value;
    const entries = Object.entries(value as Record<string, unknown>);
    const result: Record<string, unknown> = {};
    for (const [k, v] of entries) {
        result[k] = transformStageValue(v, context);
    }
    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core expression compilation (aligned with v1 _compileInnerExpression full operator precedence chain)
// ─────────────────────────────────────────────────────────────────────────────

function compileInnerExpression(expression: string): unknown {
    const expr2 = expression.trim();

    // 1. Function call (the entire string must be a single function call)
    const funcMatch = expr2.match(FUNC_REGEX);
    if (funcMatch) {
        return dispatchFunction(funcMatch[1].toUpperCase(), funcMatch[2] ?? '');
    }

    // 2. && → $and
    const andParts = splitTopLevel(expr2, '&&');
    if (andParts.length > 1) {
        return { $and: andParts.map((p) => compileInnerExpression(p.trim())) };
    }

    // 3. || → $or
    const orParts = splitTopLevel(expr2, '||');
    if (orParts.length > 1) {
        return { $or: orParts.map((p) => compileInnerExpression(p.trim())) };
    }

    // 4. Ternary ?: → $cond
    const ternary = /^([^?]+)\s*\?\s*([^:]+)\s*:\s*(.+)$/.exec(expr2);
    if (ternary) {
        const [, cond, thenPart, elsePart] = ternary;
        return {
            $cond: {
                if: compileInnerExpression(cond.trim()),
                then: parseThenElse(thenPart.trim()),
                else: parseThenElse(elsePart.trim()),
            },
        };
    }

    // 5. ?? → $ifNull
    const nullCoalParts = splitTopLevel(expr2, '??');
    if (nullCoalParts.length > 1) {
        return { $ifNull: [parseValue(nullCoalParts[0].trim()), parseValue(nullCoalParts[1].trim())] };
    }

    // 6. + / - (non-greedy → first operator)
    const addSubMatch = /^(.+?)\s*([+\-])\s*(.+)$/.exec(expr2);
    if (addSubMatch) {
        const [, left, op, right] = addSubMatch;
        const opMap: Record<string, string> = { '+': '$add', '-': '$subtract' };
        return { [opMap[op]]: [parseOperand(left.trim()), parseOperand(right.trim())] };
    }

    // 7. * / % 
    const mulDivMatch = /^(.+?)\s*([*\/%])\s*(.+)$/.exec(expr2);
    if (mulDivMatch) {
        const [, left, op, right] = mulDivMatch;
        const opMap: Record<string, string> = { '*': '$multiply', '/': '$divide', '%': '$mod' };
        return { [opMap[op]]: [parseOperand(left.trim()), parseOperand(right.trim())] };
    }

    // 8. Comparison operators
    const cmpMatch = /^(.+?)\s*(===|!==|>=|<=|>|<)\s*(.+)$/.exec(expr2);
    if (cmpMatch) {
        const [, left, op, right] = cmpMatch;
        const opMap: Record<string, string> = {
            '===': '$eq', '!==': '$ne',
            '>=': '$gte', '<=': '$lte',
            '>': '$gt', '<': '$lt',
        };
        const leftValue = IS_FUNC_CALL_RE.test(left.trim())
            ? compileInnerExpression(left.trim())
            : `$${left.trim()}`;
        return { [opMap[op]]: [leftValue, parseValue(right.trim())] };
    }

    // 9. Detect unrecognised function call — aligned with v1 throwing `Unsupported expression`
    // If the expression looks like a function call (identifier followed by parentheses) but
    // was not matched by FUNC_REGEX above, the function name is not supported.
    const genericFuncCallRe = /^[A-Za-z_][A-Za-z0-9_]*\s*\(.+\)$/;
    if (genericFuncCallRe.test(expr2)) {
        const funcName = expr2.slice(0, expr2.indexOf('(')).trim();
        throw createError(ErrorCodes.INVALID_EXPRESSION, `Unsupported expression function: ${funcName}`);
    }

    // 10. Literal / field reference
    return parseValue(expr2);
}

/** Handles the then/else branches of a ternary expression (aligned with v1: recurse when ?: is present, otherwise parseValue). */
function parseThenElse(s: string): unknown {
    return (s.includes('?') && s.includes(':')) ? compileInnerExpression(s) : parseValue(s);
}

/** Aligned with v1 _parseValue. */
function parseValue(value: string): unknown {
    const v = value.trim();

    // String literal
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
        return v.slice(1, -1);
    }

    // Special literals
    if (v === 'null') return null;
    if (v === 'true') return true;
    if (v === 'false') return false;

    // Number
    if (!isNaN(Number(v)) && v !== '') return Number(v);

    // Function call (compact regex)
    if (IS_FUNC_CALL_RE.test(v)) {
        return compileInnerExpression(v);
    }

    // Field reference (including $ prefix, dot-path)
    return `$${v}`;
}

/** Aligned with v1 _parseOperand: recursively compiles if the value contains an operator; otherwise uses parseValue. */
function parseOperand(value: string): unknown {
    if (/[+\-*/%]/.test(value)) {
        return compileInnerExpression(value);
    }
    return parseValue(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Function dispatch (aligned with the complete v1 routing table)
// ─────────────────────────────────────────────────────────────────────────────

function dispatchFunction(name: string, argsStr: string): unknown {
    const args = splitArgsStr(argsStr);

    switch (name) {
        // ── String ──────────────────────────────────────────────────────────
        case 'CONCAT': return { $concat: args.map((a) => parseValue(a)) };
        case 'UPPER': return { $toUpper: parseValue(args[0]) };
        case 'LOWER': return { $toLower: parseValue(args[0]) };
        case 'TRIM': return { $trim: { input: parseValue(args[0]) } };
        case 'LENGTH': return { $strLenCP: parseValue(args[0]) };
        case 'SUBSTR': {
            // SUBSTR(string, start, len)
            return { $substr: [parseValue(args[0]), parseInt(args[1], 10), parseInt(args[2], 10)] };
        }
        case 'SPLIT': return { $split: [parseValue(args[0]), parseValue(args[1])] };
        case 'REPLACE': return { $replaceOne: { input: parseValue(args[0]), find: parseValue(args[1]), replacement: parseValue(args[2]) } };
        case 'INDEX_OF_STR': {
            const base = [parseValue(args[0]), parseValue(args[1])];
            if (args[2]) return { $indexOfCP: [...base, parseValue(args[2])] };
            return { $indexOfCP: base };
        }
        case 'LTRIM': return { $ltrim: { input: parseValue(args[0]) } };
        case 'RTRIM': return { $rtrim: { input: parseValue(args[0]) } };
        case 'SUBSTR_CP': {
            return { $substrCP: [parseValue(args[0]), parseInt(args[1], 10), parseInt(args[2], 10)] };
        }
        // ── String Extended ─────────────────────────────────────────────────
        case 'STR_LEN_BYTES': return { $strLenBytes: parseValue(args[0]) };
        case 'STR_LEN_CP': return { $strLenCP: parseValue(args[0]) };
        case 'SUBSTR_BYTES': return { $substrBytes: [parseValue(args[0]), parseValue(args[1]), parseValue(args[2])] };

        // ── Math ─────────────────────────────────────────────────────────────
        case 'ABS': return { $abs: parseValue(args[0]) };
        case 'CEIL': return { $ceil: parseValue(args[0]) };
        case 'FLOOR': return { $floor: parseValue(args[0]) };
        case 'ROUND': {
            if (args[1]) return { $round: [parseValue(args[0]), parseValue(args[1])] };
            return { $round: [parseValue(args[0])] };
        }
        case 'SQRT': return { $sqrt: parseValue(args[0]) };
        case 'POW': return { $pow: [parseValue(args[0]), parseValue(args[1])] };
        // ── Math Extended ────────────────────────────────────────────────────
        case 'LOG': return { $log: [parseValue(args[0]), parseValue(args[1])] };
        case 'LOG10': return { $log10: parseValue(args[0]) };

        // ── Array ─────────────────────────────────────────────────────────────
        case 'SIZE': return { $size: parseValue(args[0]) };
        case 'IN': return { $in: [parseValue(args[0]), parseValue(args[1])] };
        case 'SLICE': {
            if (args.length === 3) return { $slice: [parseValue(args[0]), parseInt(args[1], 10), parseInt(args[2], 10)] };
            return { $slice: [parseValue(args[0]), parseInt(args[1], 10)] };
        }
        case 'FIRST': return { $first: parseValue(args[0]) };
        case 'LAST': return { $last: parseValue(args[0]) };
        case 'ARRAY_ELEM_AT': return { $arrayElemAt: [parseValue(args[0]), parseInt(args[1], 10)] };
        case 'INDEX_OF': return { $indexOfArray: [parseValue(args[0]), parseValue(args[1])] };
        case 'CONCAT_ARRAYS': return { $concatArrays: args.map((a) => parseValue(a)) };
        case 'FILTER': {
            // FILTER(array, varName, condition)
            const filterArray = parseValue(args[0]);
            const varName = args[1].replace(/['"]/g, '').trim();
            const filterCondition = compileFilterCondition(args[2], varName);
            return { $filter: { input: filterArray, as: varName, cond: filterCondition } };
        }
        case 'MAP': {
            // MAP(array, varName, expression)
            const mapArray = parseValue(args[0]);
            const varName = args[1].replace(/['"]/g, '').trim();
            const mapExpr = compileMapExpression(args[2], varName);
            return { $map: { input: mapArray, as: varName, in: mapExpr } };
        }
        // ── Array Extended ───────────────────────────────────────────────────
        case 'REDUCE': {
            const lambdaMatch = /\((\w+),\s*(\w+)\)\s*=>\s*(.+)/.exec(args[2]);
            if (!lambdaMatch) throw new Error('REDUCE requires a lambda: (acc, item) => expr');
            const [, accVar, itemVar, lambdaExpr] = lambdaMatch;
            const compiledExpr = lambdaExpr
                .replace(new RegExp(`\\b${accVar}\\b`, 'g'), '$$value')
                .replace(new RegExp(`\\b${itemVar}\\b`, 'g'), '$$this');
            return { $reduce: { input: parseValue(args[0]), initialValue: parseValue(args[1]), in: compileInnerExpression(compiledExpr) } };
        }
        case 'ZIP': return { $zip: { inputs: args.map((a) => parseValue(a)) } };
        case 'REVERSE_ARRAY': return { $reverseArray: parseValue(args[0]) };
        case 'RANGE': {
            const rangeArgs: unknown[] = [parseValue(args[0]), parseValue(args[1])];
            if (args[2]) rangeArgs.push(parseValue(args[2]));
            return { $range: rangeArgs };
        }

        // ── Type ──────────────────────────────────────────────────────────────
        case 'TYPE': return { $type: parseValue(args[0]) };
        case 'NOT': return { $not: [compileInnerExpression(args[0])] };
        case 'EXISTS': return { $ne: [parseValue(args[0]), null] };
        case 'IS_NUMBER': return { $isNumber: parseValue(args[0]) };
        case 'IS_ARRAY': return { $isArray: parseValue(args[0]) };

        // ── Type Conversion ──────────────────────────────────────────────────
        case 'TO_INT': return { $toInt: parseValue(args[0]) };
        case 'TO_STRING': return { $toString: parseValue(args[0]) };
        case 'OBJECT_TO_ARRAY': return { $objectToArray: parseValue(args[0]) };
        case 'ARRAY_TO_OBJECT': return { $arrayToObject: parseValue(args[0]) };
        case 'TO_BOOL': return { $toBool: parseValue(args[0]) };
        case 'TO_DATE': return { $toDate: parseValue(args[0]) };
        case 'TO_DOUBLE': return { $toDouble: parseValue(args[0]) };
        case 'TO_DECIMAL': return { $toDecimal: parseValue(args[0]) };
        case 'TO_LONG': return { $toLong: parseValue(args[0]) };
        case 'TO_OBJECT_ID': return { $toObjectId: parseValue(args[0]) };
        case 'CONVERT': {
            const convertResult: Record<string, unknown> = { $convert: { input: parseValue(args[0]), to: args[1].replace(/['"]/g, '') } };
            if (args[2]) (convertResult.$convert as Record<string, unknown>).onError = parseValue(args[2]);
            if (args[3]) (convertResult.$convert as Record<string, unknown>).onNull = parseValue(args[3]);
            return convertResult;
        }

        // ── Aggregation ───────────────────────────────────────────────────────
        case 'SUM': return { $sum: parseValue(args[0]) };
        case 'AVG': return { $avg: parseValue(args[0]) };
        case 'MAX': return { $max: parseValue(args[0]) };
        case 'MIN': return { $min: parseValue(args[0]) };
        case 'COUNT': return { $sum: 1 };
        case 'PUSH': return { $push: parseValue(args[0]) };
        case 'ADD_TO_SET': return { $addToSet: parseValue(args[0]) };

        // ── Date ──────────────────────────────────────────────────────────────
        case 'YEAR': return { $year: parseValue(args[0]) };
        case 'MONTH': return { $month: parseValue(args[0]) };
        case 'DAY_OF_MONTH': return { $dayOfMonth: parseValue(args[0]) };
        case 'HOUR': return { $hour: parseValue(args[0]) };
        case 'MINUTE': return { $minute: parseValue(args[0]) };
        case 'SECOND': return { $second: parseValue(args[0]) };
        case 'DATE_ADD': {
            return { $dateAdd: { startDate: parseValue(args[0]), amount: parseValue(args[1]), unit: args[2].replace(/['"]/g, '') } };
        }
        case 'DATE_SUBTRACT': {
            return { $dateSubtract: { startDate: parseValue(args[0]), amount: parseValue(args[1]), unit: args[2].replace(/['"]/g, '') } };
        }
        case 'DATE_DIFF': {
            return { $dateDiff: { startDate: parseValue(args[0]), endDate: parseValue(args[1]), unit: args[2].replace(/['"]/g, '') } };
        }
        case 'DATE_TO_STRING': {
            const dtsResult: Record<string, unknown> = { $dateToString: { format: args[1].replace(/['"]/g, ''), date: parseValue(args[0]) } };
            if (args[2]) (dtsResult.$dateToString as Record<string, unknown>).timezone = args[2].replace(/['"]/g, '');
            return dtsResult;
        }
        case 'DATE_FROM_STRING': {
            return { $dateFromString: { dateString: parseValue(args[0]) } };
        }
        // ── Date Extended ────────────────────────────────────────────────────
        case 'DATE_FROM_PARTS': {
            const dfp: Record<string, unknown> = {};
            const dfpFields = ['year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond'];
            args.forEach((a, i) => { if (dfpFields[i]) dfp[dfpFields[i]] = parseValue(a); });
            return { $dateFromParts: dfp };
        }
        case 'DATE_TO_PARTS': {
            const dtpResult: Record<string, unknown> = { $dateToParts: { date: parseValue(args[0]) } };
            if (args[1]) (dtpResult.$dateToParts as Record<string, unknown>).timezone = args[1].replace(/['"]/g, '');
            return dtpResult;
        }
        case 'ISO_WEEK': return { $isoWeek: parseValue(args[0]) };
        case 'ISO_WEEK_YEAR': return { $isoWeekYear: parseValue(args[0]) };
        case 'ISO_DAY_OF_WEEK': return { $isoDayOfWeek: parseValue(args[0]) };
        case 'DAY_OF_WEEK': return { $dayOfWeek: parseValue(args[0]) };
        case 'DAY_OF_YEAR': return { $dayOfYear: parseValue(args[0]) };
        case 'WEEK': return { $week: parseValue(args[0]) };

        // ── High Frequency ───────────────────────────────────────────────────
        case 'REGEX': return { $regexMatch: { input: parseValue(args[0]), regex: args[1].replace(/['"]/g, '') } };
        case 'MERGE_OBJECTS': {
            const mergeArgs = args.map((a) => {
                if (a.trim().startsWith('{')) { try { return JSON.parse(a.trim()); } catch { return parseValue(a); } }
                return parseValue(a);
            });
            return { $mergeObjects: mergeArgs };
        }
        case 'SET_UNION': {
            const suArgs = args.map((a) => {
                if (a.trim().startsWith('[')) { try { return JSON.parse(a.trim()); } catch { return parseValue(a); } }
                return parseValue(a);
            });
            return { $setUnion: suArgs };
        }

        // ── Switch ───────────────────────────────────────────────────────────
        case 'SWITCH': {
            if (args.length < 2) throw new Error('SWITCH requires at least 2 arguments');
            const branches: Array<{ case: unknown; then: unknown }> = [];
            let defaultValue: unknown = null;
            for (let i = 0; i < args.length - 1; i += 2) {
                if (i + 1 < args.length) {
                    branches.push({ case: compileInnerExpression(args[i]), then: parseValue(args[i + 1]) });
                }
            }
            if (args.length % 2 === 1) defaultValue = parseValue(args[args.length - 1]);
            const switchResult: { $switch: { branches: unknown[]; default?: unknown } } = { $switch: { branches } };
            if (defaultValue !== null) switchResult.$switch.default = defaultValue;
            return switchResult;
        }

        // ── Logical Extended ─────────────────────────────────────────────────
        case 'ALL_ELEMENTS_TRUE': return { $allElementsTrue: [parseValue(args[0])] };
        case 'ANY_ELEMENT_TRUE': return { $anyElementTrue: [parseValue(args[0])] };

        // ── Conditional Extended ─────────────────────────────────────────────
        case 'COND': {
            if (args.length !== 3) throw new Error('COND requires 3 arguments');
            return { $cond: { if: compileInnerExpression(args[0]), then: parseValue(args[1]), else: parseValue(args[2]) } };
        }
        case 'IF_NULL': {
            if (args.length !== 2) throw new Error('IF_NULL requires 2 arguments');
            return { $ifNull: [parseValue(args[0]), parseValue(args[1])] };
        }

        // ── Object Operations ────────────────────────────────────────────────
        case 'SET_FIELD': return { $setField: { field: parseValue(args[0]), input: parseValue(args[2]), value: parseValue(args[1]) } };
        case 'UNSET_FIELD': return { $unsetField: { field: parseValue(args[0]), input: parseValue(args[1]) } };
        case 'GET_FIELD': {
            if (args.length === 1) return { $getField: parseValue(args[0]) };
            return { $getField: { field: parseValue(args[0]), input: parseValue(args[1]) } };
        }

        // ── Set Operations ───────────────────────────────────────────────────
        case 'SET_DIFFERENCE': return { $setDifference: [parseValue(args[0]), parseValue(args[1])] };
        case 'SET_EQUALS': return { $setEquals: args.map((a) => parseValue(a)) };
        case 'SET_INTERSECTION': return { $setIntersection: args.map((a) => parseValue(a)) };
        case 'SET_IS_SUBSET': return { $setIsSubset: [parseValue(args[0]), parseValue(args[1])] };

        // ── Advanced Operations ──────────────────────────────────────────────
        case 'LET': {
            const varsMatch = /\{(.+)\}/.exec(args[0]);
            if (!varsMatch) throw new Error('LET requires an object literal for variables');
            const varPairs = varsMatch[1].split(',').map((pair) => {
                const [k, ...rest] = pair.split(':');
                return [k.trim(), rest.join(':').trim()] as [string, string];
            });
            const vars: Record<string, unknown> = {};
            for (const [k, v] of varPairs) vars[k] = parseValue(v);
            return { $let: { vars, in: compileInnerExpression(args[1]) } };
        }
        case 'LITERAL': return { $literal: parseValue(args[0]) };
        case 'RAND': return { $rand: {} };
        case 'SAMPLE_RATE': return { $sampleRate: parseValue(args[0]) };

        default:
            throw new Error(`Unsupported function: ${name}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────────────────────────────

/** FILTER condition variable substitution (aligned with v1 _compileFilterCondition's $$ semantics). */
function compileFilterCondition(condition: string, varName: string): unknown {
    // JS replacement: in replace(), $$ in the replacement string is the escape sequence → inserts a single $
    const replaced = condition.replace(new RegExp(`\\b${varName}\\.`, 'g'), `$$${varName}.`);
    return compileInnerExpression(replaced);
}

/** MAP expression variable substitution (aligned with v1 _compileMapExpression). */
function compileMapExpression(exprStr: string, varName: string): unknown {
    const replaced = exprStr.replace(new RegExp(`\\b${varName}\\.`, 'g'), `$$${varName}.`);
    return compileInnerExpression(replaced);
}

/** Splits comma-separated arguments in argsStr, respecting parenthesis depth and quoted strings. */
function splitArgsStr(argsStr: string): string[] {
    const args: string[] = [];
    let current = '';
    let inString = false;
    let stringChar = '';
    let parenDepth = 0;

    for (let i = 0; i < argsStr.length; i++) {
        const ch = argsStr[i];
        if ((ch === '"' || ch === "'") && (i === 0 || argsStr[i - 1] !== '\\')) {
            if (!inString) { inString = true; stringChar = ch; }
            else if (ch === stringChar) { inString = false; stringChar = ''; }
            current += ch;
        } else if (ch === '(' && !inString) { parenDepth++; current += ch; }
        else if (ch === ')' && !inString) { parenDepth--; current += ch; }
        else if (ch === ',' && !inString && parenDepth === 0) { args.push(current.trim()); current = ''; }
        else { current += ch; }
    }
    if (current.trim()) args.push(current.trim());
    return args;
}

/** Splits a string by separator at the top level (parenthesis depth = 0, outside quotes). */
function splitTopLevel(source: string, separator: string): string[] {
    const parts: string[] = [];
    let current = '';
    let parenDepth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        if ((ch === '"' || ch === "'") && (i === 0 || source[i - 1] !== '\\')) {
            if (!inString) { inString = true; stringChar = ch; }
            else if (ch === stringChar) { inString = false; stringChar = ''; }
            current += ch;
        } else if (!inString && ch === '(') { parenDepth++; current += ch; }
        else if (!inString && ch === ')') { parenDepth--; current += ch; }
        else if (!inString && parenDepth === 0 && source.startsWith(separator, i)) {
            parts.push(current);
            current = '';
            i += separator.length - 1;
        } else { current += ch; }
    }
    parts.push(current);
    return parts;
}

/** Strips outer parentheses from a string. */
function stripOuterParentheses(source: string): string {
    let s = source.trim();
    while (s.startsWith('(') && s.endsWith(')') && isWrappedByOuterParentheses(s)) {
        s = s.slice(1, -1).trim();
    }
    return s;
}

function isWrappedByOuterParentheses(source: string): boolean {
    let depth = 0;
    let quote: string | null = null;
    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        const prev = source[i - 1];
        if ((ch === '"' || ch === "'") && prev !== '\\') {
            if (quote === ch) quote = null;
            else if (!quote) quote = ch;
            continue;
        }
        if (quote) continue;
        if (ch === '(') depth++;
        else if (ch === ')') {
            depth--;
            if (depth === 0 && i < source.length - 1) return false;
        }
    }
    return true;
}
