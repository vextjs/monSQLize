/**
 * P2-B 最小表达式模块。
 *
 * 说明：
 * - 先恢复 `expr()` / `createExpression()` 的合法输入校验。
 * - 先支持一小组可实证验证的 MongoDB 表达式编译能力，完整语法仍在后续阶段补齐。
 */

import { createError, ErrorCodes } from '../errors';

export interface ExpressionObject {
    __expr__: string;
    __compiled__: boolean;
}

const SIMPLE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FUNCTION_CALL = /^([A-Z_][A-Z0-9_]*)\((.*)\)$/;

/**
 * 创建表达式对象。
 * @since v1.3.0
 */
export function createExpression(expression: string): ExpressionObject {
    if (typeof expression !== 'string') {
        throw createError(ErrorCodes.INVALID_EXPRESSION, 'Expression must be a string.');
    }

    const normalized = expression.trim();
    if (!normalized) {
        throw createError(ErrorCodes.INVALID_EXPRESSION, 'Expression cannot be empty.');
    }

    return {
        __expr__: normalized,
        __compiled__: false,
    };
}

export const expr = createExpression;

/**
 * 判断对象是否为表达式对象。
 * @since v1.3.0
 */
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

/**
 * 递归判断对象中是否包含表达式对象。
 * @since v1.3.0
 */
export function hasExpressionInObject(value: unknown): boolean {
    if (isExpressionObject(value)) {
        return true;
    }

    if (!value || typeof value !== 'object') {
        return false;
    }

    if (Array.isArray(value)) {
        return value.some((item) => hasExpressionInObject(item));
    }

    return Object.values(value).some((item) => hasExpressionInObject(item));
}

/**
 * 递归判断聚合管道中是否包含表达式对象。
 * @since v1.3.0
 */
export function hasExpressionInPipeline(pipeline: unknown): boolean {
    return Array.isArray(pipeline) && pipeline.some((stage) => hasExpressionInObject(stage));
}

/**
 * 编译聚合管道中的表达式对象。
 * @since v1.3.0
 */
export function compilePipelineExpressions<TPipeline>(pipeline: TPipeline): TPipeline {
    return transformExpressions(pipeline) as TPipeline;
}

function transformExpressions(value: unknown): unknown {
    if (isExpressionObject(value)) {
        return compileExpressionString(value.__expr__);
    }

    if (Array.isArray(value)) {
        return value.map((item) => transformExpressions(item));
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    return Object.fromEntries(
        Object.entries(value).map(([key, entryValue]) => [key, transformExpressions(entryValue)]),
    );
}

function compileExpressionString(expression: string): unknown {
    const normalized = stripOuterParentheses(expression.trim());

    if (!normalized) {
        throw createError(ErrorCodes.INVALID_EXPRESSION, 'Expression cannot be empty after normalization.');
    }

    const arithmeticOperator = findTopLevelOperator(normalized, ['+', '-', '*', '/']);
    if (arithmeticOperator) {
        const left = normalized.slice(0, arithmeticOperator.index).trim();
        const right = normalized.slice(arithmeticOperator.index + 1).trim();
        if (!left || !right) {
            throw createError(ErrorCodes.INVALID_EXPRESSION, `Invalid arithmetic expression: ${expression}`);
        }

        const operatorMap: Record<string, string> = {
            '+': '$add',
            '-': '$subtract',
            '*': '$multiply',
            '/': '$divide',
        };

        return {
            [operatorMap[arithmeticOperator.operator]]: [
                compileExpressionString(left),
                compileExpressionString(right),
            ],
        };
    }

    const callMatch = normalized.match(FUNCTION_CALL);
    if (callMatch) {
        return compileFunctionCall(callMatch[1], splitArguments(callMatch[2]).map((item) => compileExpressionString(item)));
    }

    if ((normalized.startsWith("'") && normalized.endsWith("'")) || (normalized.startsWith('"') && normalized.endsWith('"'))) {
        return normalized.slice(1, -1);
    }

    if (/^-?\d+(\.\d+)?$/.test(normalized)) {
        return Number(normalized);
    }

    if (normalized === 'true') {
        return true;
    }

    if (normalized === 'false') {
        return false;
    }

    if (normalized === 'null') {
        return null;
    }

    if (normalized === 'CURRENT_DATE' || normalized === 'NOW()') {
        return '$$NOW';
    }

    if (SIMPLE_IDENTIFIER.test(normalized)) {
        return `$${normalized}`;
    }

    throw createError(ErrorCodes.INVALID_EXPRESSION, `Unsupported expression syntax: ${expression}`);
}

function compileFunctionCall(name: string, args: unknown[]): unknown {
    const upperName = name.toUpperCase();

    switch (upperName) {
        case 'COUNT':
            if (args.length !== 0) {
                throw createError(ErrorCodes.INVALID_EXPRESSION, 'COUNT() does not accept arguments in the minimal P2-B compiler.');
            }
            return { $sum: 1 };
        case 'SUM':
            return singleArgumentOperator('$sum', upperName, args);
        case 'AVG':
            return singleArgumentOperator('$avg', upperName, args);
        case 'MAX':
            return singleArgumentOperator('$max', upperName, args);
        case 'MIN':
            return singleArgumentOperator('$min', upperName, args);
        case 'YEAR':
            return singleArgumentOperator('$year', upperName, args);
        case 'MONTH':
            return singleArgumentOperator('$month', upperName, args);
        case 'DAY':
        case 'DAY_OF_MONTH':
            return singleArgumentOperator('$dayOfMonth', upperName, args);
        case 'LOWER':
            return singleArgumentOperator('$toLower', upperName, args);
        case 'UPPER':
            return singleArgumentOperator('$toUpper', upperName, args);
        case 'TRIM':
            return singleArgumentOperator('$trim', upperName, args);
        case 'SIZE':
            return singleArgumentOperator('$size', upperName, args);
        case 'CONCAT':
            if (args.length === 0) {
                throw createError(ErrorCodes.INVALID_EXPRESSION, 'CONCAT() requires at least one argument.');
            }
            return { $concat: args };
        default:
            throw createError(ErrorCodes.INVALID_EXPRESSION, `Unsupported expression function: ${name}`);
    }
}

function singleArgumentOperator(operator: string, name: string, args: unknown[]): unknown {
    if (args.length !== 1) {
        throw createError(ErrorCodes.INVALID_EXPRESSION, `${name}() requires exactly one argument.`);
    }

    if (operator === '$trim') {
        return { $trim: { input: args[0] } };
    }

    return { [operator]: args[0] };
}

function splitArguments(argsSource: string): string[] {
    const normalized = argsSource.trim();
    if (!normalized) {
        return [];
    }

    const result: string[] = [];
    let current = '';
    let depth = 0;
    let quote: string | null = null;

    for (let index = 0; index < normalized.length; index += 1) {
        const char = normalized[index];
        const previous = normalized[index - 1];

        if ((char === '"' || char === "'") && previous !== '\\') {
            if (quote === char) {
                quote = null;
            } else if (!quote) {
                quote = char;
            }
            current += char;
            continue;
        }

        if (!quote) {
            if (char === '(') {
                depth += 1;
                current += char;
                continue;
            }

            if (char === ')') {
                depth -= 1;
                current += char;
                continue;
            }

            if (char === ',' && depth === 0) {
                result.push(current.trim());
                current = '';
                continue;
            }
        }

        current += char;
    }

    if (current.trim()) {
        result.push(current.trim());
    }

    return result;
}

function findTopLevelOperator(source: string, operators: string[]): { operator: string; index: number; } | null {
    let depth = 0;
    let quote: string | null = null;

    for (let index = source.length - 1; index >= 0; index -= 1) {
        const char = source[index];
        const previous = source[index - 1];

        if ((char === '"' || char === "'") && previous !== '\\') {
            if (quote === char) {
                quote = null;
            } else if (!quote) {
                quote = char;
            }
            continue;
        }

        if (quote) {
            continue;
        }

        if (char === ')') {
            depth += 1;
            continue;
        }

        if (char === '(') {
            depth -= 1;
            continue;
        }

        if (depth !== 0) {
            continue;
        }

        if (operators.includes(char) && index > 0 && index < source.length - 1) {
            return { operator: char, index };
        }
    }

    return null;
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

    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        const previous = source[index - 1];

        if ((char === '"' || char === "'") && previous !== '\\') {
            if (quote === char) {
                quote = null;
            } else if (!quote) {
                quote = char;
            }
            continue;
        }

        if (quote) {
            continue;
        }

        if (char === '(') {
            depth += 1;
        } else if (char === ')') {
            depth -= 1;
            if (depth === 0 && index < source.length - 1) {
                return false;
            }
        }
    }

    return true;
}
