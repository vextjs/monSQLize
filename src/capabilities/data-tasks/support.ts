import type { DataTaskIndexDefinition } from '../../../types/data-tasks';

export type GenericRecord = Record<string, unknown>;

export interface FindChainLike {
    sort?(sort: GenericRecord): FindChainLike;
    limit?(limit: number): FindChainLike;
    batchSize?(batchSize: number): FindChainLike;
    toArray(): Promise<GenericRecord[]>;
}

export interface DataTaskCollectionLike {
    find(query?: GenericRecord, options?: GenericRecord): FindChainLike;
    count(query?: GenericRecord, options?: GenericRecord): Promise<number>;
    findOne(query: GenericRecord, options?: GenericRecord): Promise<GenericRecord | null>;
    insertOne(document: GenericRecord, options?: GenericRecord): Promise<unknown>;
    updateOne(filter: GenericRecord, update: unknown, options?: GenericRecord): Promise<GenericRecord>;
    updateMany(filter: GenericRecord, update: unknown, options?: GenericRecord): Promise<GenericRecord>;
    replaceOne(filter: GenericRecord, replacement: GenericRecord, options?: GenericRecord): Promise<GenericRecord>;
    findOneAndUpdate?(filter: GenericRecord, update: unknown, options?: GenericRecord): Promise<GenericRecord | null>;
    upsertOne?(filter: GenericRecord, update: unknown, options?: GenericRecord): Promise<GenericRecord>;
    createIndex(keys: GenericRecord, options?: GenericRecord): Promise<unknown>;
    listIndexes(): Promise<GenericRecord[]>;
    dropIndex?(name: string): Promise<unknown>;
    deleteOne?(filter: GenericRecord, options?: GenericRecord): Promise<GenericRecord>;
}

export interface DataTaskJobRuntimeHost {
    collection(name: string): DataTaskCollectionLike;
}
const INDEX_OPTION_KEYS = [
    'unique',
    'sparse',
    'expireAfterSeconds',
    'partialFilterExpression',
    'collation',
    'hidden',
    'storageEngine',
    'weights',
    'default_language',
    'language_override',
    'textIndexVersion',
    '2dsphereIndexVersion',
    'bits',
    'min',
    'max',
    'bucketSize',
    'wildcardProjection',
] as const;

export function isRecord(value: unknown): value is GenericRecord {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    if (isRecord(value)) {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function extendedJsonValue(value: unknown): unknown {
    if (value instanceof Date) {
        return { $date: value.toISOString() };
    }
    if (Buffer.isBuffer(value)) {
        return { $binary: value.toString('base64') };
    }
    if (Array.isArray(value)) {
        return value.map(extendedJsonValue);
    }
    if (isRecord(value)) {
        const bsonLike = value as { _bsontype?: string; toHexString?: () => string; toString?: () => string };
        if (typeof bsonLike.toHexString === 'function' && (bsonLike._bsontype === 'ObjectId' || bsonLike._bsontype === 'ObjectID')) {
            return { $oid: bsonLike.toHexString() };
        }
        if (bsonLike._bsontype && typeof bsonLike.toString === 'function') {
            return { [`$${bsonLike._bsontype}`]: bsonLike.toString() };
        }
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, extendedJsonValue(item)]));
    }
    return value;
}

export function stringifyExtendedJson(value: unknown): string {
    return JSON.stringify(extendedJsonValue(value));
}

export function getByPath(document: GenericRecord, field: string): unknown {
    return field.split('.').reduce<unknown>((current, part) => (isRecord(current) ? current[part] : undefined), document);
}

export function indexOptions(definition: DataTaskIndexDefinition): GenericRecord {
    return {
        ...(definition.options ?? {}),
        ...(definition.name ? { name: definition.name } : {}),
    };
}

export function comparableIndexOptions(options: GenericRecord): GenericRecord {
    return {
        unique: options.unique === true,
        sparse: options.sparse === true,
        hidden: options.hidden === true,
        ...Object.fromEntries(INDEX_OPTION_KEYS
        .filter((key) => key !== 'unique' && key !== 'sparse' && key !== 'hidden')
        .filter((key) => options[key] !== undefined)
        .map((key) => [key, options[key]])),
    };
}

export function orderedIndexKeyString(key: unknown): string {
    if (!isRecord(key)) {
        return stableStringify(key);
    }
    return `[${Object.entries(key).map(([field, direction]) => `${JSON.stringify(field)}:${stableStringify(direction)}`).join(',')}]`;
}
