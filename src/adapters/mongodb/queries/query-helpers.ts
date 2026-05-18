import { createHmac } from 'node:crypto';

import { Collection, Document, ObjectId, Sort } from 'mongodb';

import { createError, ErrorCodes } from '../../../core/errors';
import type { CursorPayload, SortShape } from '../../../types/internal/query';

/**
 * 查询层内部 helper。
 *
 * 设计目标：
 * - 收口 `queries/index.ts` 里的 ObjectId / cursor / sort / projection 等横切逻辑
 * - 保持行为与现有实现完全一致，只做结构性拆分
 * - 为后续继续把 find / findPage 拆成薄模块做准备
 */

export function normalizeSortShape(sort?: Sort): SortShape {
    const normalized: SortShape = {};

    if (Array.isArray(sort)) {
        for (const [field, direction] of sort) {
            normalized[String(field)] = direction === -1 || direction === 'desc' || direction === 'descending' ? -1 : 1;
        }
    } else if (sort && typeof sort === 'object') {
        for (const [field, direction] of Object.entries(sort)) {
            normalized[field] = direction === -1 || direction === 'desc' || direction === 'descending' ? -1 : 1;
        }
    }

    if (!normalized._id) {
        normalized._id = 1;
    }

    return normalized;
}

export function isHexObjectIdString(value: string): boolean {
    return /^[0-9a-fA-F]{24}$/.test(value);
}

export function parseRequiredObjectId(id: unknown): ObjectId {
    if (!id) {
        throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            'id 参数是必需的',
            [{ field: 'id', type: 'required', message: 'id must not be empty' }],
        );
    }

    if (typeof id === 'string') {
        if (!isHexObjectIdString(id)) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                `无效的 ObjectId 格式: "${id}"`,
                [{
                    field: 'id',
                    type: 'format',
                    message: 'id must be a 24-character hex string or ObjectId instance',
                    received: id,
                }],
            );
        }
        return new ObjectId(id);
    }

    if (id instanceof ObjectId) {
        return id;
    }

    if (id && typeof id === 'object' && typeof (id as { toHexString?: () => string }).toHexString === 'function') {
        const hex = (id as { toHexString: () => string }).toHexString();
        if (isHexObjectIdString(hex)) {
            return new ObjectId(hex);
        }
    }

    if (id && typeof id === 'object' && typeof (id as { toString?: () => string }).toString === 'function') {
        const value = (id as { toString: () => string }).toString();
        if (isHexObjectIdString(value)) {
            return new ObjectId(value);
        }
    }

    throw createError(
        ErrorCodes.INVALID_ARGUMENT,
        'id 必须是字符串或 ObjectId 实例',
        [{
            field: 'id',
            type: 'type',
            message: `expected: string or ObjectId, received: ${typeof id}`,
            received: typeof id,
        }],
    );
}

export function normalizeIdentifier(value: unknown, autoConvert = true): unknown {
    if (autoConvert && typeof value === 'string' && value.length === 24 && ObjectId.isValid(value)) {
        return new ObjectId(value);
    }

    return value;
}

/**
 * 递归归一化查询条件，把应转换的 24 位十六进制字符串转成 ObjectId。
 *
 * 说明：
 * - 这是查询路径专用的 filter normalizer
 * - 与 `utils/objectid-converter.ts` 面向通用对象遍历不同，这里保留了
 *   `$and/$or/$nor/$elemMatch/$in/$nin/$all/$eq/$ne` 这些查询语义
 */
export function normalizeQueryFilter(
    filter: Record<string, unknown>,
    autoConvert: boolean | Record<string, boolean>,
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(filter)) {
        if (key === '$and' || key === '$or' || key === '$nor') {
            result[key] = Array.isArray(value)
                ? value.map((item) => item && typeof item === 'object'
                    ? normalizeQueryFilter(item as Record<string, unknown>, autoConvert)
                    : item)
                : value;
            continue;
        }

        const shouldConvert = autoConvert === true || (typeof autoConvert === 'object' && autoConvert[key] !== false);

        if (typeof value === 'string' && value.length === 24 && ObjectId.isValid(value)) {
            result[key] = shouldConvert ? new ObjectId(value) : value;
        } else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof ObjectId)) {
            const nested = value as Record<string, unknown>;
            const hasOperators = Object.keys(nested).some((k) => k.startsWith('$'));

            if (hasOperators) {
                const nestedResult: Record<string, unknown> = {};
                for (const [op, opVal] of Object.entries(nested)) {
                    if (shouldConvert && (op === '$in' || op === '$nin' || op === '$all') && Array.isArray(opVal)) {
                        nestedResult[op] = opVal.map((item) =>
                            typeof item === 'string' && item.length === 24 && ObjectId.isValid(item)
                                ? new ObjectId(item)
                                : item,
                        );
                    } else if (shouldConvert && (op === '$eq' || op === '$ne') && typeof opVal === 'string' && opVal.length === 24 && ObjectId.isValid(opVal)) {
                        nestedResult[op] = new ObjectId(opVal);
                    } else if (op === '$elemMatch' && opVal && typeof opVal === 'object' && !Array.isArray(opVal)) {
                        nestedResult[op] = normalizeQueryFilter(opVal as Record<string, unknown>, autoConvert);
                    } else {
                        nestedResult[op] = opVal;
                    }
                }
                result[key] = nestedResult;
            } else {
                result[key] = normalizeQueryFilter(nested, autoConvert);
            }
        } else {
            result[key] = value;
        }
    }

    return result;
}

export function encodeCursor(values: unknown[], secret?: string): string {
    const payload: CursorPayload = { v: 1, values };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

    if (!secret) {
        return encoded;
    }

    const sig = createHmac('sha256', secret).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
}

export function decodeCursor(cursor: string, secret?: string): unknown[] {
    try {
        let raw = cursor;

        if (secret) {
            const dotIndex = cursor.lastIndexOf('.');
            if (dotIndex === -1) {
                throw createError(ErrorCodes.INVALID_PAGINATION, 'Cursor signature missing.');
            }
            const encoded = cursor.slice(0, dotIndex);
            const sig = cursor.slice(dotIndex + 1);
            const expected = createHmac('sha256', secret).update(encoded).digest('base64url');
            if (sig !== expected) {
                throw createError(ErrorCodes.INVALID_PAGINATION, 'Cursor signature invalid.');
            }
            raw = encoded;
        }

        const payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as CursorPayload;
        if (payload?.v !== 1 || !Array.isArray(payload.values)) {
            throw new Error('Invalid cursor payload.');
        }
        return payload.values;
    } catch (cause) {
        if ((cause as { code?: string }).code === ErrorCodes.INVALID_PAGINATION) {
            throw cause;
        }
        throw createError(ErrorCodes.INVALID_PAGINATION, 'Invalid pagination cursor.', undefined, cause as Error);
    }
}

export function reverseSort(sort: SortShape): SortShape {
    return Object.fromEntries(Object.entries(sort).map(([field, direction]) => [field, direction === 1 ? -1 : 1]));
}

/**
 * JSON round-trip 会把 Date 变成 ISO string，这里在 cursor compare 前把它恢复回来。
 */
export function normalizeCursorValue(value: unknown): unknown {
    if (typeof value === 'string') {
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)) {
            const d = new Date(value);
            if (!isNaN(d.getTime())) {
                return d;
            }
        }
        return normalizeIdentifier(value);
    }
    return value;
}

export function buildFindDriverOptions<TSchema extends Document = Document>(
    options: Record<string, unknown> = {},
): Parameters<Collection<TSchema>['find']>[1] {
    const driverOptions: Record<string, unknown> = {
        ...(options.projection ? { projection: options.projection } : {}),
        ...(options.sort ? { sort: options.sort } : {}),
        ...(options.skip !== undefined ? { skip: options.skip } : {}),
        ...(options.limit !== undefined ? { limit: options.limit } : {}),
        ...(options.hint ? { hint: options.hint } : {}),
        ...(options.collation ? { collation: options.collation } : {}),
        ...(options.maxTimeMS !== undefined ? { maxTimeMS: options.maxTimeMS } : {}),
        ...(options.batchSize !== undefined ? { batchSize: options.batchSize } : {}),
        ...(options.comment ? { comment: options.comment } : {}),
    };

    return driverOptions as Parameters<Collection<TSchema>['find']>[1];
}

export function buildAggregateDriverOptions<TSchema extends Document = Document>(
    options: Record<string, unknown> = {},
): Parameters<Collection<TSchema>['aggregate']>[1] {
    const driverOptions: Record<string, unknown> = {
        ...(options.hint ? { hint: options.hint } : {}),
        ...(options.collation ? { collation: options.collation } : {}),
        ...(options.comment ? { comment: options.comment } : {}),
        ...(options.maxTimeMS !== undefined ? { maxTimeMS: options.maxTimeMS } : {}),
        ...(options.allowDiskUse !== undefined ? { allowDiskUse: options.allowDiskUse } : {}),
        ...(options.batchSize !== undefined ? { batchSize: options.batchSize } : {}),
    };

    return driverOptions as Parameters<Collection<TSchema>['aggregate']>[1];
}

export function buildCursorFilter(sort: SortShape, cursorValues: unknown[], direction: 'after' | 'before'): Document {
    const entries = Object.entries(sort);
    const clauses: Document[] = [];

    for (let index = 0; index < entries.length; index += 1) {
        const equalityPrefix = entries.slice(0, index).reduce<Record<string, unknown>>((carry, [field], prefixIndex) => {
            carry[field] = normalizeCursorValue(cursorValues[prefixIndex]);
            return carry;
        }, {});
        const [field, sortDirection] = entries[index];
        const operator = direction === 'after'
            ? (sortDirection === 1 ? '$gt' : '$lt')
            : (sortDirection === 1 ? '$lt' : '$gt');

        clauses.push({
            ...equalityPrefix,
            [field]: {
                [operator]: normalizeCursorValue(cursorValues[index]),
            },
        });
    }

    return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

/**
 * 自动保护排序字段，确保 cursor 锚点不会因为 projection 丢失。
 */
export function buildEffectiveProjection(
    projection: unknown,
    sort: Record<string, 1 | -1>,
): Record<string, unknown> | undefined {
    if (!projection) return undefined;

    let projObj: Record<string, unknown>;
    if (Array.isArray(projection)) {
        projObj = {};
        for (const f of projection as string[]) {
            projObj[f] = 1;
        }
    } else {
        projObj = { ...(projection as Record<string, unknown>) };
    }

    const sortFields = Object.keys(sort || {});
    const isExclusion = Object.entries(projObj).some(
        ([k, v]) => k !== '_id' && (v === 0 || v === false),
    );

    if (isExclusion) {
        for (const k of sortFields) {
            if (projObj[k] === 0 || projObj[k] === false) {
                delete projObj[k];
            }
        }
    } else {
        for (const k of sortFields) {
            if (!projObj[k]) projObj[k] = 1;
        }
    }

    return projObj;
}
