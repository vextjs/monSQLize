import type { DeleteResult, IndexCreateResult, InsertOneResult, UpdateResult } from './collection';

export interface ValidationResult {
    valid: boolean;
    errors?: Array<{
        field: string;
        message: string;
        value?: unknown;
    }>;
}

export interface HookContext {
    operation: string;
    collection: string;
    data?: unknown;
    filter?: unknown;
    update?: unknown;
    result?: unknown;
    error?: Error;
    [key: string]: unknown;
}

export interface ModelConnection {
    pool?: string;
    database?: string;
}

export interface RelationConfig {
    from: string;
    localField: string;
    foreignField: string;
    single?: boolean;
}

export interface PopulateConfig {
    path: string;
    select?: string | string[];
    match?: Record<string, unknown>;
    sort?: Record<string, 1 | -1>;
    limit?: number;
    skip?: number;
    populate?: string | PopulateConfig | Array<string | PopulateConfig>;
}

export interface VirtualConfig {
    get: (this: Record<string, unknown>) => unknown;
    set?: (this: Record<string, unknown>, value: unknown) => void;
}

export interface ModelDefinition<TDocument = Record<string, unknown>> {
    enums?: Record<string, string>;
    schema?: unknown;
    defaults?: Record<string, unknown | ((context?: unknown, doc?: TDocument) => unknown)>;
    hooks?: {
        beforeCreate?: (context: HookContext) => Promise<void> | void;
        afterCreate?: (context: HookContext) => Promise<void> | void;
        beforeUpdate?: (context: HookContext) => Promise<void> | void;
        afterUpdate?: (context: HookContext) => Promise<void> | void;
        beforeDelete?: (context: HookContext) => Promise<void> | void;
        afterDelete?: (context: HookContext) => Promise<void> | void;
        beforeFind?: (context: HookContext) => Promise<void> | void;
        afterFind?: (context: HookContext) => Promise<void> | void;
    };
    methods?: Record<string, (this: TDocument & Record<string, unknown>, ...args: unknown[]) => unknown>;
    statics?: Record<string, (...args: unknown[]) => unknown>;
    relations?: Record<string, RelationConfig>;
    virtuals?: Record<string, VirtualConfig>;
    connection?: ModelConnection;
}

export interface RegisteredModel<TDocument = Record<string, unknown>> {
    collectionName: string;
    definition: ModelDefinition<TDocument>;
}

export interface ModelScopeOptions {
    database?: string;
    pool?: string;
}

export interface PopulateProxy<T = unknown> extends Promise<T> {
    populate(path: string | PopulateConfig): PopulateProxy<T>;
    exec(): Promise<T>;
}

export type ModelDocument<TDocument = Record<string, unknown>> = TDocument & Record<string, unknown> & {
    save(): Promise<ModelDocument<TDocument>>;
    remove(): Promise<boolean>;
    validate(): Promise<ValidationResult>;
    toObject(): TDocument & Record<string, unknown>;
    toJSON(): TDocument & Record<string, unknown>;
};

export interface ModelInstance<TDocument = Record<string, unknown>> {
    readonly collectionName: string;
    readonly dbName: string;
    readonly poolName?: string;
    readonly definition: ModelDefinition<TDocument>;
    getNamespace(): { iid: string; type: 'mongodb'; db: string; collection: string; };
    raw(): unknown;
    find(query?: unknown, options?: unknown): PopulateProxy<Array<ModelDocument<TDocument>>>;
    findOne(query?: unknown, options?: unknown): PopulateProxy<ModelDocument<TDocument> | null>;
    findById(id: unknown, options?: unknown): PopulateProxy<ModelDocument<TDocument> | null>;
    findByIds(ids: unknown[], options?: unknown): PopulateProxy<Array<ModelDocument<TDocument>>>;
    findPage(options?: unknown): PopulateProxy<{
        data: Array<ModelDocument<TDocument>>;
        page: { page: number; limit: number; };
        totals: { total: number; totalPages: number; };
    }>;
    findAndCount(query?: unknown, options?: unknown): PopulateProxy<{
        rows: Array<ModelDocument<TDocument>>;
        count: number;
    }>;
    count(query?: unknown, options?: unknown): Promise<number>;
    insertOne(document?: unknown, options?: unknown): Promise<InsertOneResult>;
    insertMany(documents?: unknown[], options?: unknown): Promise<unknown>;
    updateOne(filter?: unknown, update?: unknown, options?: unknown): Promise<unknown>;
    updateMany(filter?: unknown, update?: unknown, options?: unknown): Promise<unknown>;
    replaceOne(filter?: unknown, replacement?: unknown, options?: unknown): Promise<unknown>;
    findOneAndUpdate(filter?: unknown, update?: unknown, options?: unknown): Promise<TDocument | null>;
    findOneAndDelete(filter?: unknown, options?: unknown): Promise<TDocument | null>;
    upsertOne(filter?: unknown, update?: unknown, options?: unknown): Promise<UpdateResult>;
    deleteOne(filter?: unknown, options?: unknown): Promise<DeleteResult>;
    deleteMany(filter?: unknown, options?: unknown): Promise<DeleteResult>;
    createIndex(keys: unknown, options?: unknown): Promise<IndexCreateResult>;
    createIndexes(specs: Array<{ key: unknown; } & Record<string, unknown>>): Promise<string[]>;
    listIndexes(): Promise<Record<string, unknown>[]>;
    dropIndex(name: string): Promise<unknown>;
    dropIndexes(): Promise<unknown>;
    distinct(key: string, query?: unknown, options?: unknown): Promise<unknown[]>;
    aggregate(pipeline?: unknown[], options?: unknown): Promise<unknown[]>;
    watch(pipeline?: unknown[], options?: unknown): unknown;
    validate(document?: unknown): Promise<ValidationResult>;
}

export declare class Model {
    static define<TDocument = Record<string, unknown>>(collectionName: string, definition: ModelDefinition<TDocument>): void;
    static get<TDocument = Record<string, unknown>>(collectionName: string): RegisteredModel<TDocument> | undefined;
    static has(collectionName: string): boolean;
    static list(): string[];
    static undefine(collectionName: string): boolean;
    static redefine<TDocument = Record<string, unknown>>(collectionName: string, definition: ModelDefinition<TDocument>): void;
    static _clear(): void;
}



