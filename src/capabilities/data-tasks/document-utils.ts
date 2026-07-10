import { ErrorCodes, createError } from '../../core/errors';
import { getByPath, isRecord, stringifyExtendedJson, type GenericRecord } from './support';

function isPlainRecord(value: unknown): value is GenericRecord {
    if (!isRecord(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

export function cloneDocumentValue(value: unknown): unknown {
    if (value instanceof Date) return new Date(value.getTime());
    if (Buffer.isBuffer(value)) return Buffer.from(value);
    if (Array.isArray(value)) return value.map(cloneDocumentValue);
    if (isPlainRecord(value)) {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneDocumentValue(item)]));
    }
    return value;
}

export function cloneDocument(document: GenericRecord): GenericRecord {
    return cloneDocumentValue(document) as GenericRecord;
}

function setByPath(document: GenericRecord, field: string, value: unknown): void {
    const parts = field.split('.');
    const finalPart = parts.pop();
    if (!finalPart) return;
    let current = document;
    for (const part of parts) {
        if (!isPlainRecord(current[part])) current[part] = {};
        current = current[part] as GenericRecord;
    }
    current[finalPart] = cloneDocumentValue(value);
}

function deleteByPath(document: GenericRecord, field: string): void {
    const parts = field.split('.');
    const finalPart = parts.pop();
    if (!finalPart) return;
    let current = document;
    for (const part of parts) {
        if (!isPlainRecord(current[part])) return;
        current = current[part] as GenericRecord;
    }
    delete current[finalPart];
}

export function deepMergeDocuments(target: GenericRecord, source: GenericRecord): GenericRecord {
    const merged = cloneDocument(target);
    for (const [key, value] of Object.entries(source)) {
        const current = merged[key];
        merged[key] = isPlainRecord(current) && isPlainRecord(value)
            ? deepMergeDocuments(current, value)
            : cloneDocumentValue(value);
    }
    return merged;
}

function comparableValue(value: unknown): string {
    return stringifyExtendedJson(value);
}

function compareValues(left: unknown, right: unknown): number {
    if (typeof left === 'number' && typeof right === 'number') return left - right;
    if (typeof left === 'string' && typeof right === 'string') return left.localeCompare(right);
    if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime();
    return comparableValue(left).localeCompare(comparableValue(right));
}

function assertNumericOperator(operator: string, field: string, value: unknown): asserts value is number {
    if (typeof value !== 'number') {
        throw createError(ErrorCodes.INVALID_CONFIG, `[DataTask] ${operator} preview requires a numeric value for "${field}".`);
    }
}

export function applyUpdatePreview(document: GenericRecord, update: GenericRecord): GenericRecord {
    const preview = cloneDocument(document);
    for (const [operator, rawPayload] of Object.entries(update)) {
        if (!operator.startsWith('$') || !isRecord(rawPayload)) {
            throw createError(ErrorCodes.INVALID_CONFIG, `[DataTask] dry-run cannot preview update operator "${operator}".`);
        }
        if (operator === '$set') {
            for (const [field, value] of Object.entries(rawPayload)) setByPath(preview, field, value);
        } else if (operator === '$unset') {
            for (const field of Object.keys(rawPayload)) deleteByPath(preview, field);
        } else if (operator === '$inc' || operator === '$mul') {
            for (const [field, value] of Object.entries(rawPayload)) {
                assertNumericOperator(operator, field, value);
                const current = getByPath(preview, field);
                if (current !== undefined && typeof current !== 'number') {
                    throw createError(ErrorCodes.INVALID_CONFIG, `[DataTask] ${operator} preview requires an existing numeric value for "${field}".`);
                }
                setByPath(preview, field, operator === '$inc' ? (current ?? 0) + value : (current ?? 0) * value);
            }
        } else if (operator === '$min' || operator === '$max') {
            for (const [field, value] of Object.entries(rawPayload)) {
                const current = getByPath(preview, field);
                const shouldSet = current === undefined || (operator === '$min' ? compareValues(current, value) > 0 : compareValues(current, value) < 0);
                if (shouldSet) setByPath(preview, field, value);
            }
        } else if (operator === '$rename') {
            for (const [field, destination] of Object.entries(rawPayload)) {
                if (typeof destination !== 'string') {
                    throw createError(ErrorCodes.INVALID_CONFIG, `[DataTask] $rename preview requires a string destination for "${field}".`);
                }
                const current = getByPath(preview, field);
                if (current !== undefined) {
                    deleteByPath(preview, field);
                    setByPath(preview, destination, current);
                }
            }
        } else if (operator === '$currentDate') {
            for (const [field, value] of Object.entries(rawPayload)) {
                if (isRecord(value) && value.$type === 'timestamp') {
                    throw createError(ErrorCodes.INVALID_CONFIG, '[DataTask] dry-run cannot safely preview $currentDate timestamp values; use a pipeline or callback preview.');
                }
                setByPath(preview, field, new Date());
            }
        } else if (operator === '$setOnInsert') {
            continue;
        } else if (operator === '$addToSet' || operator === '$push') {
            for (const [field, value] of Object.entries(rawPayload)) {
                const current = getByPath(preview, field);
                if (current !== undefined && !Array.isArray(current)) {
                    throw createError(ErrorCodes.INVALID_CONFIG, `[DataTask] ${operator} preview requires an array value for "${field}".`);
                }
                const items = [...(Array.isArray(current) ? current : [])];
                const values = isRecord(value) && Array.isArray(value.$each) ? value.$each : [value];
                if (isRecord(value) && Object.keys(value).some((key) => key !== '$each')) {
                    throw createError(ErrorCodes.INVALID_CONFIG, `[DataTask] dry-run does not support ${operator} modifiers other than $each.`);
                }
                for (const item of values) {
                    if (operator === '$push' || !items.some((existing) => comparableValue(existing) === comparableValue(item))) {
                        items.push(cloneDocumentValue(item));
                    }
                }
                setByPath(preview, field, items);
            }
        } else if (operator === '$pop') {
            for (const [field, direction] of Object.entries(rawPayload)) {
                const current = getByPath(preview, field);
                if (!Array.isArray(current) || (direction !== -1 && direction !== 1)) {
                    throw createError(ErrorCodes.INVALID_CONFIG, `[DataTask] $pop preview requires an array and direction -1 or 1 for "${field}".`);
                }
                const items = [...current];
                if (direction === -1) items.shift(); else items.pop();
                setByPath(preview, field, items);
            }
        } else if (operator === '$pullAll') {
            for (const [field, values] of Object.entries(rawPayload)) {
                const current = getByPath(preview, field);
                if (!Array.isArray(current) || !Array.isArray(values)) {
                    throw createError(ErrorCodes.INVALID_CONFIG, `[DataTask] $pullAll preview requires array values for "${field}".`);
                }
                const removals = new Set(values.map(comparableValue));
                setByPath(preview, field, current.filter((item) => !removals.has(comparableValue(item))));
            }
        } else {
            throw createError(ErrorCodes.INVALID_CONFIG, `[DataTask] dry-run does not support update operator "${operator}"; use a pipeline or callback preview.`);
        }
    }
    return preview;
}
