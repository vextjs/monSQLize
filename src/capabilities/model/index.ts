/**
 * P3-C Model registry 与 features 能力。
 *
 * 说明：
 * - 当前模块负责 Model 注册表、实例包装、relations / virtuals / populate 的最小闭环。
 * - 公开与共享类型统一由 `types/model.d.ts` 承接；此处只保留运行时实现与内部辅助类型。
 */

import { ErrorCodes, createError } from '../../core/errors';
import type {
    HookContext,
    ModelConnection,
    ModelDefinition,
    ModelScopeOptions,
    PopulateConfig,
    PopulateProxy,
    RegisteredModel,
    RelationConfig,
    ValidationResult,
    VirtualConfig,
} from '../../../types/model';

export type {
    HookContext,
    ModelConnection,
    ModelDefinition,
    ModelScopeOptions,
    PopulateConfig,
    PopulateProxy,
    RegisteredModel,
    RelationConfig,
    ValidationResult,
    VirtualConfig,
} from '../../../types/model';

type PopulatePath = string | PopulateConfig;

interface ModelRuntimeLike {
    scopedCollection<TDocument = Record<string, unknown>>(name: string, options?: ModelScopeOptions): ModelCollectionLike<TDocument>;
    scopedModel<TDocument = Record<string, unknown>>(name: string, options?: ModelScopeOptions): ModelInstance<TDocument>;
}

interface ModelCollectionLike<TDocument = Record<string, unknown>> {
    getNamespace(): { iid: string; type: 'mongodb'; db: string; collection: string; };
    raw(): unknown;
    findOne(query?: unknown, options?: unknown): Promise<unknown>;
    find(query?: unknown, options?: unknown): Promise<unknown[]>;
    count(query?: unknown, options?: unknown): Promise<number>;
    insertOne(document?: unknown, options?: unknown): Promise<{ acknowledged: boolean; insertedId: unknown; }>;
    insertMany(documents?: unknown[], options?: unknown): Promise<unknown>;
    updateOne(filter?: unknown, update?: unknown, options?: unknown): Promise<unknown>;
    updateMany(filter?: unknown, update?: unknown, options?: unknown): Promise<unknown>;
    replaceOne(filter?: unknown, replacement?: unknown, options?: unknown): Promise<unknown>;
    findOneAndUpdate(filter?: unknown, update?: unknown, options?: unknown): Promise<TDocument | null>;
    findOneAndDelete(filter?: unknown, options?: unknown): Promise<TDocument | null>;
    upsertOne(filter?: unknown, update?: unknown, options?: unknown): Promise<unknown>;
    deleteOne(filter?: unknown, options?: unknown): Promise<unknown>;
    deleteMany(filter?: unknown, options?: unknown): Promise<unknown>;
    createIndex(keys: unknown, options?: unknown): Promise<unknown>;
    createIndexes(specs: Array<{ key: unknown; } & Record<string, unknown>>): Promise<string[]>;
    listIndexes(): Promise<Record<string, unknown>[]>;
    dropIndex(name: string): Promise<unknown>;
    dropIndexes(): Promise<unknown>;
    distinct(key: string, query?: unknown, options?: unknown): Promise<unknown[]>;
    aggregate(pipeline?: unknown[], options?: unknown): Promise<unknown[]>;
    findPage(options?: unknown): Promise<{ data: TDocument[]; page: { page: number; limit: number; }; totals: { total: number; totalPages: number; }; }>;
    watch(pipeline?: unknown[], options?: unknown): unknown;
}


class PopulatePromise<T> implements PopulateProxy<T> {
    readonly [Symbol.toStringTag] = 'Promise';

    constructor(
        private readonly executor: (paths: PopulatePath[]) => Promise<T>,
        private readonly paths: PopulatePath[] = [],
    ) {}

    populate(path: string | PopulateConfig): PopulateProxy<T> {
        return new PopulatePromise(this.executor, [...this.paths, path]);
    }

    exec(): Promise<T> {
        return this.executor(this.paths);
    }

    then<TResult1 = T, TResult2 = never>(
        onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
        return this.exec().then(onfulfilled ?? undefined, onrejected ?? undefined);
    }

    catch<TResult = never>(
        onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
    ): Promise<T | TResult> {
        return this.exec().catch(onrejected ?? undefined);
    }

    finally(onfinally?: (() => void) | null): Promise<T> {
        return this.exec().finally(onfinally ?? undefined);
    }
}

export class Model {
    private static registry = new Map<string, RegisteredModel<any>>();

    private static revisions = new Map<string, number>();

    static define<TDocument = Record<string, unknown>>(collectionName: string, definition: ModelDefinition<TDocument>): void {
        const normalizedName = validateCollectionName(collectionName);
        if (this.registry.has(normalizedName)) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, `Model '${normalizedName}' is already defined.`);
        }
        validateDefinition<TDocument>(definition);
        this.registry.set(normalizedName, {
            collectionName: normalizedName,
            definition,
        } as RegisteredModel<any>);
        this.bumpRevision(normalizedName);
    }

    static get<TDocument = Record<string, unknown>>(collectionName: string): RegisteredModel<TDocument> | undefined {
        return this.registry.get(collectionName) as RegisteredModel<TDocument> | undefined;
    }

    static has(collectionName: string): boolean {
        return this.registry.has(collectionName);
    }

    static list(): string[] {
        return [...this.registry.keys()];
    }

    static undefine(collectionName: string): boolean {
        const existed = this.registry.delete(collectionName);
        this.bumpRevision(collectionName);
        return existed;
    }

    static redefine<TDocument = Record<string, unknown>>(collectionName: string, definition: ModelDefinition<TDocument>): void {
        validateCollectionName(collectionName);
        validateDefinition<TDocument>(definition);
        this.registry.set(collectionName, {
            collectionName,
            definition,
        } as RegisteredModel<any>);
        this.bumpRevision(collectionName);
    }

    static _clear(): void {
        const names = [...this.registry.keys()];
        this.registry.clear();
        for (const name of names) {
            this.bumpRevision(name);
        }
    }

    static getRevision(collectionName: string): number {
        return this.revisions.get(collectionName) ?? 0;
    }

    private static bumpRevision(collectionName: string): void {
        this.revisions.set(collectionName, (this.revisions.get(collectionName) ?? 0) + 1);
    }
}

export class ModelInstance<TDocument = Record<string, unknown>> {
    readonly collectionName: string;
    readonly dbName: string;
    readonly poolName?: string;
    readonly definition: ModelDefinition<TDocument>;

    private readonly relations: Map<string, RelationConfig>;

    constructor(
        private readonly collection: ModelCollectionLike<TDocument>,
        private readonly runtime: ModelRuntimeLike,
        options: {
            collectionName: string;
            dbName: string;
            poolName?: string;
            definition: ModelDefinition<TDocument>;
        },
    ) {
        this.collectionName = options.collectionName;
        this.dbName = options.dbName;
        this.poolName = options.poolName;
        this.definition = options.definition;
        this.relations = new Map(Object.entries(options.definition.relations ?? {}));
        for (const [name, config] of this.relations) {
            validateRelationConfig(name, config);
        }
        for (const [name, handler] of Object.entries(options.definition.statics ?? {})) {
            if (typeof handler === 'function' && !(name in this)) {
                Object.defineProperty(this, name, {
                    configurable: true,
                    enumerable: false,
                    writable: false,
                    value: (...args: unknown[]) => handler.apply(this, args),
                });
            }
        }
    }

    getNamespace(): { iid: string; type: 'mongodb'; db: string; collection: string; } {
        return this.collection.getNamespace();
    }

    raw(): unknown {
        return this.collection.raw();
    }

    find(query?: unknown, options?: unknown): PopulateProxy<Array<TDocument & Record<string, unknown>>> {
        return new PopulatePromise(async (paths) => {
            const docs = await this.collection.find(query, options) as Array<TDocument | null | undefined>;
            return this.populateDocuments(this.hydrateDocuments(docs), paths);
        });
    }

    findOne(query?: unknown, options?: unknown): PopulateProxy<(TDocument & Record<string, unknown>) | null> {
        return new PopulatePromise(async (paths) => {
            const doc = await this.collection.findOne(query, options) as TDocument | null | undefined;
            return this.populateSingle(this.hydrateDocument(doc), paths);
        });
    }

    findById(id: unknown, options?: unknown): PopulateProxy<(TDocument & Record<string, unknown>) | null> {
        return this.findOne({ _id: id }, options);
    }

    findByIds(ids: unknown[], options?: unknown): PopulateProxy<Array<TDocument & Record<string, unknown>>> {
        return this.find({ _id: { $in: ids } }, options);
    }

    findPage(options?: unknown): PopulateProxy<{
        data: Array<TDocument & Record<string, unknown>>;
        page: { page: number; limit: number; };
        totals: { total: number; totalPages: number; };
    }> {
        return new PopulatePromise(async (paths) => {
            const result = await this.collection.findPage(options);
            return {
                ...result,
                data: await this.populateDocuments(this.hydrateDocuments(result.data), paths),
            };
        });
    }

    findAndCount(query?: unknown, options?: unknown): PopulateProxy<{
        rows: Array<TDocument & Record<string, unknown>>;
        count: number;
    }> {
        return new PopulatePromise(async (paths) => {
            const [rows, count] = await Promise.all([
                this.collection.find(query, options),
                this.collection.count(query, options),
            ]);
            return {
                rows: await this.populateDocuments(this.hydrateDocuments(rows as Array<TDocument | null | undefined>), paths),
                count,
            };
        });
    }

    count(query?: unknown, options?: unknown): Promise<number> {
        return this.collection.count(query, options);
    }

    async insertOne(document?: unknown, options?: unknown): Promise<{ acknowledged: boolean; insertedId: unknown; }> {
        const payload = this.applyDefaults(document as Record<string, unknown> | undefined);
        await this.runHook('beforeCreate', { operation: 'insertOne', collection: this.collectionName, data: payload });
        const result = await this.collection.insertOne(payload, options);
        await this.runHook('afterCreate', { operation: 'insertOne', collection: this.collectionName, data: payload, result });
        return result;
    }

    insertMany(documents?: unknown[], options?: unknown): Promise<unknown> {
        return this.collection.insertMany((documents ?? []).map((item) => this.applyDefaults(item as Record<string, unknown>)), options);
    }

    async updateOne(filter?: unknown, update?: unknown, options?: unknown): Promise<unknown> {
        await this.runHook('beforeUpdate', { operation: 'updateOne', collection: this.collectionName, filter, update });
        const result = await this.collection.updateOne(filter, update, options);
        await this.runHook('afterUpdate', { operation: 'updateOne', collection: this.collectionName, filter, update, result });
        return result;
    }

    updateMany(filter?: unknown, update?: unknown, options?: unknown): Promise<unknown> {
        return this.collection.updateMany(filter, update, options);
    }

    replaceOne(filter?: unknown, replacement?: unknown, options?: unknown): Promise<unknown> {
        return this.collection.replaceOne(filter, replacement, options);
    }

    findOneAndUpdate(filter?: unknown, update?: unknown, options?: unknown): Promise<TDocument | null> {
        return this.collection.findOneAndUpdate(filter, update, options);
    }

    findOneAndDelete(filter?: unknown, options?: unknown): Promise<TDocument | null> {
        return this.collection.findOneAndDelete(filter, options);
    }

    upsertOne(filter?: unknown, update?: unknown, options?: unknown): Promise<unknown> {
        return this.collection.upsertOne(filter, update, options);
    }

    async deleteOne(filter?: unknown, options?: unknown): Promise<unknown> {
        await this.runHook('beforeDelete', { operation: 'deleteOne', collection: this.collectionName, filter });
        const result = await this.collection.deleteOne(filter, options);
        await this.runHook('afterDelete', { operation: 'deleteOne', collection: this.collectionName, filter, result });
        return result;
    }

    deleteMany(filter?: unknown, options?: unknown): Promise<unknown> {
        return this.collection.deleteMany(filter, options);
    }

    createIndex(keys: unknown, options?: unknown): Promise<unknown> {
        return this.collection.createIndex(keys, options);
    }

    createIndexes(specs: Array<{ key: unknown; } & Record<string, unknown>>): Promise<string[]> {
        return this.collection.createIndexes(specs);
    }

    listIndexes(): Promise<Record<string, unknown>[]> {
        return this.collection.listIndexes();
    }

    dropIndex(name: string): Promise<unknown> {
        return this.collection.dropIndex(name);
    }

    dropIndexes(): Promise<unknown> {
        return this.collection.dropIndexes();
    }

    distinct(key: string, query?: unknown, options?: unknown): Promise<unknown[]> {
        return this.collection.distinct(key, query, options);
    }

    aggregate(pipeline?: unknown[], options?: unknown): Promise<unknown[]> {
        return this.collection.aggregate(pipeline, options);
    }

    watch(pipeline?: unknown[], options?: unknown): unknown {
        return this.collection.watch(pipeline, options);
    }

    async validate(_document?: unknown): Promise<ValidationResult> {
        return { valid: true };
    }

    private async populateSingle(
        doc: (TDocument & Record<string, unknown>) | null,
        paths: PopulatePath[],
    ): Promise<(TDocument & Record<string, unknown>) | null> {
        if (!doc) {
            return null;
        }
        const [result] = await this.populateDocuments([doc], paths);
        return result ?? null;
    }

    async populateDocuments(
        docs: Array<TDocument & Record<string, unknown>>,
        paths: PopulatePath[],
    ): Promise<Array<TDocument & Record<string, unknown>>> {
        let current = docs;
        for (const path of paths) {
            current = await this.populatePath(current, path);
        }
        return current;
    }

    private async populatePath(
        docs: Array<TDocument & Record<string, unknown>>,
        path: PopulatePath,
    ): Promise<Array<TDocument & Record<string, unknown>>> {
        const config = normalizePopulateConfig(path);
        const relation = this.relations.get(config.path);
        if (!relation || docs.length === 0) {
            return docs;
        }

        const keys = unique(
            docs
                .map((doc) => getByPath(doc, relation.localField))
                .filter((value) => value !== undefined && value !== null),
        );

        if (keys.length === 0) {
            for (const doc of docs) {
                (doc as Record<string, unknown>)[config.path] = relation.single ? null : [];
            }
            return docs;
        }

        const registered = Model.get(relation.from);
        const scope = {
            database: registered?.definition.connection?.database ?? this.dbName,
            pool: registered?.definition.connection?.pool ?? this.poolName,
        };
        const relatedCollection = this.runtime.scopedCollection(relation.from, scope);
        const relatedModel = Model.has(relation.from) ? this.runtime.scopedModel(relation.from, scope) : null;
        const relatedDocs = await relatedCollection.find({
            [relation.foreignField]: { $in: keys },
            ...(config.match ?? {}),
        });

        let hydrated = relatedModel
            ? relatedModel.hydrateDocuments(relatedDocs as Array<Record<string, unknown>>)
            : (relatedDocs as Array<Record<string, unknown>>).map((item) => ({ ...item }));

        if (config.sort) {
            hydrated = applySort(hydrated, config.sort);
        }
        if (config.skip) {
            hydrated = hydrated.slice(config.skip);
        }
        if (config.limit !== undefined) {
            hydrated = hydrated.slice(0, config.limit);
        }
        if (config.select) {
            const select = config.select;
            hydrated = hydrated.map((item) => pickFields(item, select, [relation.foreignField]));
        }

        if (config.populate && relatedModel) {
            const nestedPaths = Array.isArray(config.populate) ? config.populate : [config.populate];
            hydrated = await relatedModel.populateDocuments(hydrated, nestedPaths);
        }

        const grouped = groupBy(hydrated, (item) => getByPath(item, relation.foreignField));
        for (const doc of docs) {
            const localValue = getByPath(doc, relation.localField);
            const matches = grouped.get(toKey(localValue)) ?? [];
            (doc as Record<string, unknown>)[config.path] = relation.single ? (matches[0] ?? null) : [...matches];
        }

        return docs;
    }

    hydrateDocuments(docs: Array<TDocument | null | undefined>): Array<TDocument & Record<string, unknown>> {
        return docs.filter(Boolean).map((doc) => this.hydrateDocument(doc) as TDocument & Record<string, unknown>);
    }

    private hydrateDocument(doc: TDocument | null | undefined): (TDocument & Record<string, unknown>) | null {
        if (!doc || typeof doc !== 'object') {
            return null;
        }
        const hydrated = { ...(doc as Record<string, unknown>) } as TDocument & Record<string, unknown>;
        for (const [name, virtual] of Object.entries(this.definition.virtuals ?? {})) {
            Object.defineProperty(hydrated, name, {
                configurable: true,
                enumerable: true,
                get: () => virtual.get.call(hydrated),
                set: virtual.set ? (value) => virtual.set?.call(hydrated, value) : undefined,
            });
        }
        for (const [name, method] of Object.entries(this.definition.methods ?? {})) {
            Object.defineProperty(hydrated, name, {
                configurable: true,
                enumerable: false,
                writable: false,
                value: (...args: unknown[]) => method.apply(hydrated, args),
            });
        }
        Object.defineProperties(hydrated, {
            save: {
                configurable: true,
                enumerable: false,
                value: async () => this.saveDocument(hydrated),
            },
            remove: {
                configurable: true,
                enumerable: false,
                value: async () => this.removeDocument(hydrated),
            },
            validate: {
                configurable: true,
                enumerable: false,
                value: async () => this.validate(hydrated),
            },
            toObject: {
                configurable: true,
                enumerable: false,
                value: () => serializeDocument(hydrated),
            },
            toJSON: {
                configurable: true,
                enumerable: false,
                value: () => serializeDocument(hydrated),
            },
        });
        return hydrated;
    }

    private async saveDocument(document: TDocument & Record<string, unknown>): Promise<TDocument & Record<string, unknown>> {
        const payload = serializeDocument(document);
        if (payload._id !== undefined) {
            await this.collection.replaceOne({ _id: payload._id }, payload, { upsert: true });
            return document;
        }
        const result = await this.collection.insertOne(payload);
        (document as Record<string, unknown>)._id = result.insertedId;
        return document;
    }

    private async removeDocument(document: TDocument & Record<string, unknown>): Promise<boolean> {
        if (document._id === undefined) {
            return false;
        }
        const result = await this.collection.deleteOne({ _id: document._id });
        return Boolean((result as { deletedCount?: number; }).deletedCount ?? (result as { acknowledged?: boolean; }).acknowledged);
    }

    private applyDefaults(document?: Record<string, unknown>): Record<string, unknown> {
        const payload = { ...(document ?? {}) };
        for (const [key, value] of Object.entries(this.definition.defaults ?? {})) {
            if (payload[key] === undefined) {
                payload[key] = typeof value === 'function'
                    ? (value as (context?: unknown, doc?: Record<string, unknown>) => unknown)(undefined, payload)
                    : value;
            }
        }
        return payload;
    }

    private async runHook(
        hookName: keyof NonNullable<ModelDefinition['hooks']>,
        context: HookContext,
    ): Promise<void> {
        const hook = this.definition.hooks?.[hookName];
        if (typeof hook === 'function') {
            await hook(context);
        }
    }
}

function validateCollectionName(collectionName: string): string {
    if (!collectionName || typeof collectionName !== 'string' || collectionName.trim() === '') {
        throw createError(ErrorCodes.INVALID_COLLECTION_NAME, 'Collection name must be a non-empty string.');
    }
    if (/[$.\s\x00]/.test(collectionName)) {
        throw createError(ErrorCodes.INVALID_COLLECTION_NAME, 'Invalid collection name: contains special characters ($, ., space, or null character).');
    }
    return collectionName;
}

function validateDefinition<TDocument>(definition: ModelDefinition<TDocument> | undefined): void {
    if (!definition || typeof definition !== 'object') {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'Model definition must be an object.');
    }
    if (definition.connection) {
        if (definition.connection.pool !== undefined && (typeof definition.connection.pool !== 'string' || definition.connection.pool.trim() === '')) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'connection.pool must be a non-empty string.');
        }
        if (definition.connection.database !== undefined && (typeof definition.connection.database !== 'string' || definition.connection.database.trim() === '')) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'connection.database must be a non-empty string.');
        }
    }
    for (const [name, config] of Object.entries(definition.relations ?? {})) {
        validateRelationConfig(name, config);
    }
}

function validateRelationConfig(name: string, config: RelationConfig): void {
    if (!name || typeof name !== 'string') {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'Relation name must be a non-empty string.');
    }
    if (!config || typeof config !== 'object') {
        throw createError(ErrorCodes.INVALID_ARGUMENT, `Relation '${name}' must be an object.`);
    }
    for (const field of ['from', 'localField', 'foreignField'] as const) {
        if (typeof config[field] !== 'string' || config[field].trim() === '') {
            throw createError(ErrorCodes.INVALID_ARGUMENT, `Relation '${name}' field '${field}' must be a non-empty string.`);
        }
    }
    if (config.single !== undefined && typeof config.single !== 'boolean') {
        throw createError(ErrorCodes.INVALID_ARGUMENT, `Relation '${name}' field 'single' must be a boolean.`);
    }
}

function normalizePopulateConfig(path: PopulatePath): PopulateConfig {
    return typeof path === 'string' ? { path } : path;
}

function unique(values: unknown[]): unknown[] {
    const map = new Map<string, unknown>();
    for (const value of values) {
        const key = toKey(value);
        if (!map.has(key)) {
            map.set(key, value);
        }
    }
    return [...map.values()];
}

function groupBy<T>(values: T[], keySelector: (value: T) => unknown): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const value of values) {
        const key = toKey(keySelector(value));
        const group = map.get(key);
        if (group) {
            group.push(value);
        } else {
            map.set(key, [value]);
        }
    }
    return map;
}

function toKey(value: unknown): string {
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (typeof value === 'object' && value !== null) {
        const candidate = value as { toHexString?: () => string; toString?: () => string; };
        if (typeof candidate.toHexString === 'function') {
            return candidate.toHexString();
        }
        if (typeof candidate.toString === 'function') {
            return candidate.toString();
        }
    }
    return String(value);
}

function getByPath(source: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((current, key) => {
        if (!current || typeof current !== 'object') {
            return undefined;
        }
        return (current as Record<string, unknown>)[key];
    }, source);
}

function pickFields(document: Record<string, unknown>, select: string | string[], alwaysInclude: string[] = []): Record<string, unknown> {
    const keys = Array.isArray(select) ? select : select.split(/\s+/).filter(Boolean);
    const result: Record<string, unknown> = {};
    for (const key of [...new Set([...keys, ...alwaysInclude])]) {
        if (key in document) {
            result[key] = document[key];
        }
    }
    if ('_id' in document && !('_id' in result)) {
        result._id = document._id;
    }
    return result;
}

function applySort<T extends Record<string, unknown>>(values: T[], sort: Record<string, 1 | -1>): T[] {
    const entries = Object.entries(sort);
    return [...values].sort((left, right) => {
        for (const [field, direction] of entries) {
            const leftValue = getByPath(left, field);
            const rightValue = getByPath(right, field);
            if (leftValue === rightValue) {
                continue;
            }
            const result = leftValue! > rightValue! ? 1 : -1;
            return result * direction;
        }
        return 0;
    });
}

function serializeDocument(document: Record<string, unknown>): Record<string, unknown> {
    const plain: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(document)) {
        if (typeof value !== 'function') {
            plain[key] = value;
        }
    }
    return plain;
}




