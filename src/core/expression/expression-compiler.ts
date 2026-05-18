/**
 * 表达式编译器（expression-compiler）。
 *
 * 将自定义字符串 DSL 表达式编译为 MongoDB Aggregation Pipeline 格式的
 * 嵌套对象，支持函数调用、逻辑运算符、比较运算符及字段引用。
 */
import { createError, ErrorCodes } from '../errors/index';

const FUNC_REGEX =
    /^(CONCAT|UPPER|LOWER|TRIM|SUBSTR|LENGTH|ABS|CEIL|FLOOR|ROUND|SQRT|POW|SIZE|IN|SLICE|FIRST|LAST|ARRAY_ELEM_AT|FILTER|MAP|INDEX_OF|CONCAT_ARRAYS|TYPE|NOT|EXISTS|IS_NUMBER|IS_ARRAY|SUM|AVG|MAX|MIN|COUNT|PUSH|ADD_TO_SET|YEAR|MONTH|DAY_OF_MONTH|HOUR|MINUTE|SECOND|SPLIT|REPLACE|INDEX_OF_STR|LTRIM|RTRIM|SUBSTR_CP|REGEX|MERGE_OBJECTS|TO_INT|TO_STRING|OBJECT_TO_ARRAY|ARRAY_TO_OBJECT|SET_UNION|SWITCH|DATE_ADD|DATE_SUBTRACT|DATE_DIFF|DATE_TO_STRING|DATE_FROM_STRING|TO_BOOL|TO_DATE|TO_DOUBLE|CONVERT|TO_DECIMAL|TO_LONG|TO_OBJECT_ID|REDUCE|ZIP|REVERSE_ARRAY|RANGE|DATE_FROM_PARTS|DATE_TO_PARTS|ISO_WEEK|ISO_WEEK_YEAR|ISO_DAY_OF_WEEK|DAY_OF_WEEK|DAY_OF_YEAR|WEEK|STR_LEN_BYTES|STR_LEN_CP|SUBSTR_BYTES|LOG|LOG10|ALL_ELEMENTS_TRUE|ANY_ELEMENT_TRUE|COND|IF_NULL|SET_FIELD|UNSET_FIELD|GET_FIELD|SET_DIFFERENCE|SET_EQUALS|SET_INTERSECTION|SET_IS_SUBSET|LET|LITERAL|RAND|SAMPLE_RATE)\s*\((.+)?\)$/i;

const IS_FUNC_CALL_RE =
    /^(CONCAT|UPPER|LOWER|TRIM|SUBSTR|LENGTH|ABS|CEIL|FLOOR|ROUND|SQRT|POW|SIZE|IN|SLICE|FIRST|LAST|ARRAY_ELEM_AT|FILTER|MAP|INDEX_OF|CONCAT_ARRAYS|TYPE|NOT|EXISTS|IS_NUMBER|IS_ARRAY|SUM|AVG|MAX|MIN|COUNT|PUSH|ADD_TO_SET|YEAR|MONTH|DAY_OF_MONTH|HOUR|MINUTE|SECOND|SPLIT|REPLACE|INDEX_OF_STR|LTRIM|RTRIM|SUBSTR_CP|REGEX|MERGE_OBJECTS|TO_INT|TO_STRING|OBJECT_TO_ARRAY|ARRAY_TO_OBJECT|SET_UNION|SWITCH)\s*\(/i;

export function compileInnerExpression(expression: string): unknown {
    const expr = expression.trim();

    const funcMatch = expr.match(FUNC_REGEX);
    if (funcMatch) {
        return dispatchFunction(funcMatch[1].toUpperCase(), funcMatch[2] ?? '');
    }

    const andParts = splitTopLevel(expr, '&&');
    if (andParts.length > 1) {
        return { $and: andParts.map((part) => compileInnerExpression(part.trim())) };
    }

    const orParts = splitTopLevel(expr, '||');
    if (orParts.length > 1) {
        return { $or: orParts.map((part) => compileInnerExpression(part.trim())) };
    }

    const ternary = /^([^?]+)\s*\?\s*([^:]+)\s*:\s*(.+)$/.exec(expr);
    if (ternary) {
        const [, condition, thenPart, elsePart] = ternary;
        return {
            $cond: {
                if: compileInnerExpression(condition.trim()),
                then: parseThenElse(thenPart.trim()),
                else: parseThenElse(elsePart.trim()),
            },
        };
    }

    const nullCoalParts = splitTopLevel(expr, '??');
    if (nullCoalParts.length > 1) {
        return { $ifNull: [parseValue(nullCoalParts[0].trim()), parseValue(nullCoalParts[1].trim())] };
    }

    const addSubMatch = /^(.+?)\s*([+\-])\s*(.+)$/.exec(expr);
    if (addSubMatch) {
        const [, left, operator, right] = addSubMatch;
        const operatorMap: Record<string, string> = { '+': '$add', '-': '$subtract' };
        return { [operatorMap[operator]]: [parseOperand(left.trim()), parseOperand(right.trim())] };
    }

    const mulDivMatch = /^(.+?)\s*([*\/%])\s*(.+)$/.exec(expr);
    if (mulDivMatch) {
        const [, left, operator, right] = mulDivMatch;
        const operatorMap: Record<string, string> = { '*': '$multiply', '/': '$divide', '%': '$mod' };
        return { [operatorMap[operator]]: [parseOperand(left.trim()), parseOperand(right.trim())] };
    }

    const cmpMatch = /^(.+?)\s*(===|!==|>=|<=|>|<)\s*(.+)$/.exec(expr);
    if (cmpMatch) {
        const [, left, operator, right] = cmpMatch;
        const operatorMap: Record<string, string> = {
            '===': '$eq',
            '!==': '$ne',
            '>=': '$gte',
            '<=': '$lte',
            '>': '$gt',
            '<': '$lt',
        };
        const leftValue = IS_FUNC_CALL_RE.test(left.trim())
            ? compileInnerExpression(left.trim())
            : `$${left.trim()}`;
        return { [operatorMap[operator]]: [leftValue, parseValue(right.trim())] };
    }

    const genericFuncCallRe = /^[A-Za-z_][A-Za-z0-9_]*\s*\(.+\)$/;
    if (genericFuncCallRe.test(expr)) {
        const funcName = expr.slice(0, expr.indexOf('(')).trim();
        throw createError(ErrorCodes.INVALID_EXPRESSION, `Unsupported expression function: ${funcName}`);
    }

    return parseValue(expr);
}

function parseThenElse(source: string): unknown {
    return (source.includes('?') && source.includes(':')) ? compileInnerExpression(source) : parseValue(source);
}

function parseValue(value: string): unknown {
    const normalized = stripOuterParentheses(value.trim());

    if ((normalized.startsWith("'") && normalized.endsWith("'")) || (normalized.startsWith('"') && normalized.endsWith('"'))) {
        return normalized.slice(1, -1);
    }
    if (normalized === 'null') return null;
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    if (!isNaN(Number(normalized)) && normalized !== '') return Number(normalized);
    if (IS_FUNC_CALL_RE.test(normalized)) {
        return compileInnerExpression(normalized);
    }
    return `$${normalized}`;
}

function parseOperand(value: string): unknown {
    const normalized = stripOuterParentheses(value);
    if (/[+\-*/%]/.test(normalized)) {
        return compileInnerExpression(normalized);
    }
    return parseValue(normalized);
}

function dispatchFunction(name: string, argsStr: string): unknown {
    const args = splitArgsStr(argsStr);

    switch (name) {
        case 'CONCAT': return { $concat: args.map((arg) => parseValue(arg)) };
        case 'UPPER': return { $toUpper: parseValue(args[0]) };
        case 'LOWER': return { $toLower: parseValue(args[0]) };
        case 'TRIM': return { $trim: { input: parseValue(args[0]) } };
        case 'LENGTH': return { $strLenCP: parseValue(args[0]) };
        case 'SUBSTR': return { $substr: [parseValue(args[0]), parseInt(args[1], 10), parseInt(args[2], 10)] };
        case 'SPLIT': return { $split: [parseValue(args[0]), parseValue(args[1])] };
        case 'REPLACE': return { $replaceOne: { input: parseValue(args[0]), find: parseValue(args[1]), replacement: parseValue(args[2]) } };
        case 'INDEX_OF_STR': {
            const base = [parseValue(args[0]), parseValue(args[1])];
            if (args[2]) return { $indexOfCP: [...base, parseValue(args[2])] };
            return { $indexOfCP: base };
        }
        case 'LTRIM': return { $ltrim: { input: parseValue(args[0]) } };
        case 'RTRIM': return { $rtrim: { input: parseValue(args[0]) } };
        case 'SUBSTR_CP': return { $substrCP: [parseValue(args[0]), parseInt(args[1], 10), parseInt(args[2], 10)] };
        case 'STR_LEN_BYTES': return { $strLenBytes: parseValue(args[0]) };
        case 'STR_LEN_CP': return { $strLenCP: parseValue(args[0]) };
        case 'SUBSTR_BYTES': return { $substrBytes: [parseValue(args[0]), parseValue(args[1]), parseValue(args[2])] };
        case 'ABS': return { $abs: parseValue(args[0]) };
        case 'CEIL': return { $ceil: parseValue(args[0]) };
        case 'FLOOR': return { $floor: parseValue(args[0]) };
        case 'ROUND': return args[1] ? { $round: [parseValue(args[0]), parseValue(args[1])] } : { $round: [parseValue(args[0])] };
        case 'SQRT': return { $sqrt: parseValue(args[0]) };
        case 'POW': return { $pow: [parseValue(args[0]), parseValue(args[1])] };
        case 'LOG': return { $log: [parseValue(args[0]), parseValue(args[1])] };
        case 'LOG10': return { $log10: parseValue(args[0]) };
        case 'SIZE': return { $size: parseValue(args[0]) };
        case 'IN': return { $in: [parseValue(args[0]), parseValue(args[1])] };
        case 'SLICE': return args.length === 3
            ? { $slice: [parseValue(args[0]), parseInt(args[1], 10), parseInt(args[2], 10)] }
            : { $slice: [parseValue(args[0]), parseInt(args[1], 10)] };
        case 'FIRST': return { $first: parseValue(args[0]) };
        case 'LAST': return { $last: parseValue(args[0]) };
        case 'ARRAY_ELEM_AT': return { $arrayElemAt: [parseValue(args[0]), parseInt(args[1], 10)] };
        case 'INDEX_OF': return { $indexOfArray: [parseValue(args[0]), parseValue(args[1])] };
        case 'CONCAT_ARRAYS': return { $concatArrays: args.map((arg) => parseValue(arg)) };
        case 'FILTER': {
            const filterArray = parseValue(args[0]);
            const varName = args[1].replace(/['"]/g, '').trim();
            const filterCondition = compileFilterCondition(args[2], varName);
            return { $filter: { input: filterArray, as: varName, cond: filterCondition } };
        }
        case 'MAP': {
            const mapArray = parseValue(args[0]);
            const varName = args[1].replace(/['"]/g, '').trim();
            const mapExpr = compileMapExpression(args[2], varName);
            return { $map: { input: mapArray, as: varName, in: mapExpr } };
        }
        case 'REDUCE': {
            const lambdaMatch = /\((\w+),\s*(\w+)\)\s*=>\s*(.+)/.exec(args[2]);
            if (!lambdaMatch) throw new Error('REDUCE requires a lambda: (acc, item) => expr');
            const [, accVar, itemVar, lambdaExpr] = lambdaMatch;
            const compiledExpr = lambdaExpr
                .replace(new RegExp(`\\b${accVar}\\b`, 'g'), '$$value')
                .replace(new RegExp(`\\b${itemVar}\\b`, 'g'), '$$this');
            return { $reduce: { input: parseValue(args[0]), initialValue: parseValue(args[1]), in: compileInnerExpression(compiledExpr) } };
        }
        case 'ZIP': return { $zip: { inputs: args.map((arg) => parseValue(arg)) } };
        case 'REVERSE_ARRAY': return { $reverseArray: parseValue(args[0]) };
        case 'RANGE': {
            const rangeArgs: unknown[] = [parseValue(args[0]), parseValue(args[1])];
            if (args[2]) rangeArgs.push(parseValue(args[2]));
            return { $range: rangeArgs };
        }
        case 'TYPE': return { $type: parseValue(args[0]) };
        case 'NOT': return { $not: [compileInnerExpression(args[0])] };
        case 'EXISTS': return { $ne: [parseValue(args[0]), null] };
        case 'IS_NUMBER': return { $isNumber: parseValue(args[0]) };
        case 'IS_ARRAY': return { $isArray: parseValue(args[0]) };
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
            const result: Record<string, unknown> = { $convert: { input: parseValue(args[0]), to: args[1].replace(/['"]/g, '') } };
            if (args[2]) (result.$convert as Record<string, unknown>).onError = parseValue(args[2]);
            if (args[3]) (result.$convert as Record<string, unknown>).onNull = parseValue(args[3]);
            return result;
        }
        case 'SUM': return { $sum: parseValue(args[0]) };
        case 'AVG': return { $avg: parseValue(args[0]) };
        case 'MAX': return { $max: parseValue(args[0]) };
        case 'MIN': return { $min: parseValue(args[0]) };
        case 'COUNT': return { $sum: 1 };
        case 'PUSH': return { $push: parseValue(args[0]) };
        case 'ADD_TO_SET': return { $addToSet: parseValue(args[0]) };
        case 'YEAR': return { $year: parseValue(args[0]) };
        case 'MONTH': return { $month: parseValue(args[0]) };
        case 'DAY_OF_MONTH': return { $dayOfMonth: parseValue(args[0]) };
        case 'HOUR': return { $hour: parseValue(args[0]) };
        case 'MINUTE': return { $minute: parseValue(args[0]) };
        case 'SECOND': return { $second: parseValue(args[0]) };
        case 'DATE_ADD': return { $dateAdd: { startDate: parseValue(args[0]), amount: parseValue(args[1]), unit: args[2].replace(/['"]/g, '') } };
        case 'DATE_SUBTRACT': return { $dateSubtract: { startDate: parseValue(args[0]), amount: parseValue(args[1]), unit: args[2].replace(/['"]/g, '') } };
        case 'DATE_DIFF': return { $dateDiff: { startDate: parseValue(args[0]), endDate: parseValue(args[1]), unit: args[2].replace(/['"]/g, '') } };
        case 'DATE_TO_STRING': {
            const result: Record<string, unknown> = { $dateToString: { format: args[1].replace(/['"]/g, ''), date: parseValue(args[0]) } };
            if (args[2]) (result.$dateToString as Record<string, unknown>).timezone = args[2].replace(/['"]/g, '');
            return result;
        }
        case 'DATE_FROM_STRING': return { $dateFromString: { dateString: parseValue(args[0]) } };
        case 'DATE_FROM_PARTS': {
            const parts: Record<string, unknown> = {};
            const partNames = ['year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond'];
            args.forEach((arg, index) => {
                if (partNames[index]) {
                    parts[partNames[index]] = parseValue(arg);
                }
            });
            return { $dateFromParts: parts };
        }
        case 'DATE_TO_PARTS': {
            const result: Record<string, unknown> = { $dateToParts: { date: parseValue(args[0]) } };
            if (args[1]) (result.$dateToParts as Record<string, unknown>).timezone = args[1].replace(/['"]/g, '');
            return result;
        }
        case 'ISO_WEEK': return { $isoWeek: parseValue(args[0]) };
        case 'ISO_WEEK_YEAR': return { $isoWeekYear: parseValue(args[0]) };
        case 'ISO_DAY_OF_WEEK': return { $isoDayOfWeek: parseValue(args[0]) };
        case 'DAY_OF_WEEK': return { $dayOfWeek: parseValue(args[0]) };
        case 'DAY_OF_YEAR': return { $dayOfYear: parseValue(args[0]) };
        case 'WEEK': return { $week: parseValue(args[0]) };
        case 'REGEX': return { $regexMatch: { input: parseValue(args[0]), regex: args[1].replace(/['"]/g, '') } };
        case 'MERGE_OBJECTS': {
            const mergeArgs = args.map((arg) => {
                if (arg.trim().startsWith('{')) {
                    try { return JSON.parse(arg.trim()); } catch { return parseValue(arg); }
                }
                return parseValue(arg);
            });
            return { $mergeObjects: mergeArgs };
        }
        case 'SET_UNION': {
            const unionArgs = args.map((arg) => {
                if (arg.trim().startsWith('[')) {
                    try { return JSON.parse(arg.trim()); } catch { return parseValue(arg); }
                }
                return parseValue(arg);
            });
            return { $setUnion: unionArgs };
        }
        case 'SWITCH': {
            if (args.length < 2) throw new Error('SWITCH requires at least 2 arguments');
            const branches: Array<{ case: unknown; then: unknown }> = [];
            let defaultValue: unknown = null;
            for (let index = 0; index < args.length - 1; index += 2) {
                if (index + 1 < args.length) {
                    branches.push({ case: compileInnerExpression(args[index]), then: parseValue(args[index + 1]) });
                }
            }
            if (args.length % 2 === 1) defaultValue = parseValue(args[args.length - 1]);
            const result: { $switch: { branches: unknown[]; default?: unknown } } = { $switch: { branches } };
            if (defaultValue !== null) result.$switch.default = defaultValue;
            return result;
        }
        case 'ALL_ELEMENTS_TRUE': return { $allElementsTrue: [parseValue(args[0])] };
        case 'ANY_ELEMENT_TRUE': return { $anyElementTrue: [parseValue(args[0])] };
        case 'COND': {
            if (args.length !== 3) throw new Error('COND requires 3 arguments');
            return { $cond: { if: compileInnerExpression(args[0]), then: parseValue(args[1]), else: parseValue(args[2]) } };
        }
        case 'IF_NULL': {
            if (args.length !== 2) throw new Error('IF_NULL requires 2 arguments');
            return { $ifNull: [parseValue(args[0]), parseValue(args[1])] };
        }
        case 'SET_FIELD': return { $setField: { field: parseValue(args[0]), input: parseValue(args[2]), value: parseValue(args[1]) } };
        case 'UNSET_FIELD': return { $unsetField: { field: parseValue(args[0]), input: parseValue(args[1]) } };
        case 'GET_FIELD': return args.length === 1
            ? { $getField: parseValue(args[0]) }
            : { $getField: { field: parseValue(args[0]), input: parseValue(args[1]) } };
        case 'SET_DIFFERENCE': return { $setDifference: [parseValue(args[0]), parseValue(args[1])] };
        case 'SET_EQUALS': return { $setEquals: args.map((arg) => parseValue(arg)) };
        case 'SET_INTERSECTION': return { $setIntersection: args.map((arg) => parseValue(arg)) };
        case 'SET_IS_SUBSET': return { $setIsSubset: [parseValue(args[0]), parseValue(args[1])] };
        case 'LET': {
            const varsMatch = /\{(.+)\}/.exec(args[0]);
            if (!varsMatch) throw new Error('LET requires an object literal for variables');
            const varPairs = varsMatch[1].split(',').map((pair) => {
                const [key, ...rest] = pair.split(':');
                return [key.trim(), rest.join(':').trim()] as [string, string];
            });
            const vars: Record<string, unknown> = {};
            for (const [key, value] of varPairs) {
                vars[key] = parseValue(value);
            }
            return { $let: { vars, in: compileInnerExpression(args[1]) } };
        }
        case 'LITERAL': return { $literal: parseValue(args[0]) };
        case 'RAND': return { $rand: {} };
        case 'SAMPLE_RATE': return { $sampleRate: parseValue(args[0]) };
        default:
            throw new Error(`Unsupported function: ${name}`);
    }
}

function compileFilterCondition(condition: string, varName: string): unknown {
    const replaced = condition.replace(new RegExp(`\\b${varName}\\.`, 'g'), `$$${varName}.`);
    return compileInnerExpression(replaced);
}

function compileMapExpression(exprStr: string, varName: string): unknown {
    const replaced = exprStr.replace(new RegExp(`\\b${varName}\\.`, 'g'), `$$${varName}.`);
    return compileInnerExpression(replaced);
}

function splitArgsStr(argsStr: string): string[] {
    const args: string[] = [];
    let current = '';
    let inString = false;
    let stringChar = '';
    let parenDepth = 0;

    for (let index = 0; index < argsStr.length; index++) {
        const ch = argsStr[index];
        if ((ch === '"' || ch === "'") && (index === 0 || argsStr[index - 1] !== '\\')) {
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

function splitTopLevel(source: string, separator: string): string[] {
    const parts: string[] = [];
    let current = '';
    let parenDepth = 0;
    let inString = false;
    let stringChar = '';

    for (let index = 0; index < source.length; index++) {
        const ch = source[index];
        if ((ch === '"' || ch === "'") && (index === 0 || source[index - 1] !== '\\')) {
            if (!inString) { inString = true; stringChar = ch; }
            else if (ch === stringChar) { inString = false; stringChar = ''; }
            current += ch;
        } else if (!inString && ch === '(') { parenDepth++; current += ch; }
        else if (!inString && ch === ')') { parenDepth--; current += ch; }
        else if (!inString && parenDepth === 0 && source.startsWith(separator, index)) {
            parts.push(current);
            current = '';
            index += separator.length - 1;
        } else { current += ch; }
    }
    parts.push(current);
    return parts;
}

function stripOuterParentheses(source: string): string {
    let normalized = source.trim();
    while (normalized.startsWith('(') && normalized.endsWith(')') && isWrappedByOuterParentheses(normalized)) {
        normalized = normalized.slice(1, -1).trim();
    }
    return normalized;
}

function isWrappedByOuterParentheses(source: string): boolean {
    let depth = 0;
    let quote: string | null = null;
    for (let index = 0; index < source.length; index++) {
        const ch = source[index];
        const prev = source[index - 1];
        if ((ch === '"' || ch === "'") && prev !== '\\') {
            if (quote === ch) quote = null;
            else if (!quote) quote = ch;
            continue;
        }
        if (quote) continue;
        if (ch === '(') depth++;
        else if (ch === ')') {
            depth--;
            if (depth === 0 && index < source.length - 1) return false;
        }
    }
    return true;
}
