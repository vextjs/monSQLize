/**
 * Model registry and features capability.
 *
 * Description:
 * - Responsible for the Model registry, instance wrapping, and full implementation of relations / virtuals / populate.
 * - Public and shared types are managed by `types/model.d.ts`; only runtime implementation and internal helper types are kept here.
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

// ── optional schema-dsl dependency (used for v1 compat schema validation) ───────────────────────
type SchemaDslFn = (fn: (dslArg: unknown) => unknown) => unknown;
type SchemaValidateFn = (
    schema: unknown,
    data: unknown,
) => { valid: boolean; errors?: Array<{ field?: string; path?: string; message?: string; type?: string; expected?: string }> };

let _schemaDslFn: SchemaDslFn | null = null;
let _schemaValidateFn: SchemaValidateFn | null = null;
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('schema-dsl') as { dsl: SchemaDslFn; validate: SchemaValidateFn };
    _schemaDslFn = mod.dsl;
    _schemaValidateFn = mod.validate;
} catch {
    // schema-dsl not available – schema validation will be skipped
}

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
    findOneById(id: unknown, options?: unknown): Promise<unknown>;
    findByIds(ids: unknown[], options?: unknown): Promise<unknown[]>;
    findAndCount(query?: unknown, options?: unknown): Promise<{ data: TDocument[]; total: number; }>;
    count(query?: unknown, options?: unknown): Promise<number>;
    insertOne(document?: unknown, options?: unknown): Promise<{ acknowledged: boolean; insertedId: unknown; }>;
    insertMany(documents?: unknown[], options?: unknown): Promise<unknown>;
    updateOne(filter?: unknown, update?: unknown, options?: unknown): Promise<unknown>;
    updateMany(filter?: unknown, update?: unknown, options?: unknown): Promise<unknown>;
    replaceOne(filter?: unknown, replacement?: unknown, options?: unknown): Promise<unknown>;
    findOneAndUpdate(filter?: unknown, update?: unknown, options?: unknown): Promise<TDocument | null>;
    findOneAndReplace(filter?: unknown, replacement?: unknown, options?: unknown): Promise<TDocument | null>;
    findOneAndDelete(filter?: unknown, options?: unknown): Promise<TDocument | null>;
    upsertOne(filter?: unknown, update?: unknown, options?: unknown): Promise<unknown>;
    incrementOne(filter?: unknown, field?: string, increment?: number, options?: unknown): Promise<unknown>;
    deleteOne(filter?: unknown, options?: unknown): Promise<unknown>;
    deleteMany(filter?: unknown, options?: unknown): Promise<unknown>;
    createIndex(keys: unknown, options?: unknown): Promise<unknown>;
    createIndexes(specs: Array<{ key: unknown; } & Record<string, unknown>>): Promise<string[]>;
    listIndexes(): Promise<Record<string, unknown>[]>;
    dropIndex(name: string): Promise<unknown>;
    dropIndexes(): Promise<unknown>;
    distinct(key: string, query?: unknown, options?: unknown): Promise<unknown[]>;
    aggregate(pipeline?: unknown[], options?: unknown): Promise<unknown[]>;
    findPage(options?: unknown): Promise<{
        items: TDocument[];
        pageInfo: {
            hasNext: boolean;
            hasPrev: boolean;
            startCursor: string | null;
            endCursor: string | null;
            currentPage?: number;
        };
        totals?: Record<string, unknown>;
    }>;
    watch(pipeline?: unknown[], options?: unknown): unknown;
}


class PopulatePromise<T> implements PopulateProxy<T> {
    readonly [Symbol.toStringTag] = 'Promise';

    constructor(
        private readonly executor: (paths: PopulatePath[]) => Promise<T>,
        private readonly paths: PopulatePath[] = [],
    ) {}

    populate(path: string | PopulateConfig, options?: Partial<Omit<PopulateConfig, 'path'>>): PopulateProxy<T> {
        const config: PopulateConfig = typeof path === 'string'
            ? { path, ...options }
            : { ...path, ...options };
        return new PopulatePromise(this.executor, [...this.paths, config]);
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

/**
 * Static registry for named model definitions.
 * Use {@link Model.define} to register a schema before querying.
 * @since v1.0.0
 */
export class Model {
    private static registry = new Map<string, RegisteredModel<any>>();

    private static revisions = new Map<string, number>();

    static _redefinedNames = new Set<string>();

    static define<TDocument = Record<string, unknown>>(collectionName: string, definition: ModelDefinition<TDocument>): void {
        const normalizedName = validateCollectionName(collectionName);
        if (this.registry.has(normalizedName)) {
        throw createError(ErrorCodes.MODEL_ALREADY_EXISTS, `Model '${normalizedName}' is already defined.`);
        }
        validateDefinition<TDocument>(definition);
        processTimestamps(definition);
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
        const normalizedName = validateCollectionName(collectionName);
        // v1 compat: delete before validate — if validate throws, old entry is removed
        this.registry.delete(normalizedName);
        validateDefinition<TDocument>(definition);
        processTimestamps(definition);
        this._redefinedNames.add(normalizedName);
        this.registry.set(normalizedName, {
            collectionName: normalizedName,
            definition,
        } as RegisteredModel<any>);
        this.bumpRevision(normalizedName);
    }

    static _clear(): void {
        const names = [...this.registry.keys()];
        for (const name of names) {
            this._redefinedNames.add(name);
            this.bumpRevision(name);
        }
        this.registry.clear();
    }

    static getRevision(collectionName: string): number {
        return this.revisions.get(collectionName) ?? 0;
    }

    private static bumpRevision(collectionName: string): void {
        this.revisions.set(collectionName, (this.revisions.get(collectionName) ?? 0) + 1);
    }
}

/**
 * An instantiated model bound to a specific collection and database.
 * Created by calling {@link MonSQLize#model}.
 * @since v1.0.0
 */
export class ModelInstance<TDocument = Record<string, unknown>> {
    readonly collectionName: string;
    readonly dbName: string;
    readonly poolName?: string;
    readonly definition: ModelDefinition<TDocument>;

    private readonly relations: Map<string, RelationConfig>;

    /** v1 compat: expose relations map as _relations */
    get _relations(): Map<string, RelationConfig> { return this.relations; }

    /** v1 compat: get relations as plain object */
    getRelations(): Record<string, RelationConfig> {
        return Object.fromEntries(this.relations);
    }

    /** v1 compat: get enums from definition */
    getEnums(): Record<string, string[]> {
        return (this.definition as any).enums ?? {};
    }

    // ── v1 compatibility private state ──────────────────────────────────────────
    private _schemaCache: unknown = null;
    private _schemaError: Error | null = null;
    private _validateEnabled = true; // true = validate on insert; false = skip globally
    private _timestampsConfig: { createdAt: string | false; updatedAt: string | false } | null = null;
    private _softDeleteConfig: { enabled: boolean; field: string; type: string; ttl: number | null } | null = null;
    private _versionConfig: { enabled: boolean; field: string } | null = null;
    private _v1HooksFactory: ((model: unknown) => Record<string, { before?: (...args: unknown[]) => unknown; after?: (...args: unknown[]) => unknown }>) | null = null;
    private _v1InstanceMethods: Record<string, (...args: unknown[]) => unknown> = {};
    // Expose softDeleteConfig for v1 test assertions
    softDeleteConfig: { enabled: boolean; field: string; type: string; ttl: number | null } | null = null;

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

        // ── v2 statics ──────────────────────────────────────────────────────────
        if (typeof (options.definition as any).methods !== 'function') {
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

        // ── schema-dsl compile ────────────────────────────────────────────────────
        if (_schemaDslFn !== null && typeof (options.definition as any).schema === 'function') {
            try {
                this._schemaCache = ((options.definition as any).schema as (dslFn: unknown) => unknown).call(
                    options.definition,
                    _schemaDslFn,
                );
            } catch (err) {
                this._schemaCache = null;
                this._schemaError = err instanceof Error ? err : new Error(String(err));
            }
        }

        // ── validate config ──────────────────────────────────────────────────────
        const validateOpt = (options.definition as any).options?.validate;
        if (validateOpt === false) this._validateEnabled = false;

        // ── timestamps config ────────────────────────────────────────────────────
        const tsOpts = (options.definition as any).options?.timestamps;
        if (tsOpts && tsOpts !== false) {
            if (tsOpts === true) {
                this._timestampsConfig = { createdAt: 'createdAt', updatedAt: 'updatedAt' };
            } else if (typeof tsOpts === 'object') {
                const ca = tsOpts.createdAt;
                const ua = tsOpts.updatedAt;
                this._timestampsConfig = {
                    createdAt: ca === false ? false : (typeof ca === 'string' ? ca : 'createdAt'),
                    updatedAt: ua === false ? false : (typeof ua === 'string' ? ua : 'updatedAt'),
                };
            }
        }

        // ── soft-delete config ───────────────────────────────────────────────────
        const sdOpts = (options.definition as any).options?.softDelete;
        if (sdOpts) {
            this._softDeleteConfig = sdOpts === true
                ? { enabled: true, field: 'deletedAt', type: 'timestamp', ttl: null }
                : {
                    enabled: sdOpts.enabled !== false,
                    field: sdOpts.field ?? 'deletedAt',
                    type: sdOpts.type ?? 'timestamp',
                    ttl: sdOpts.ttl ?? null,
                };
            this.softDeleteConfig = this._softDeleteConfig;
            // Auto-create TTL index for timestamp+ttl soft-delete
            if (this._softDeleteConfig.enabled && this._softDeleteConfig.type === 'timestamp' && this._softDeleteConfig.ttl) {
                const sd = this._softDeleteConfig;
                setImmediate(() => {
                    (this.collection as any).createIndex({ [sd.field]: 1 }, { expireAfterSeconds: sd.ttl }).catch(() => {});
                });
            }
        }

        // ── version config ───────────────────────────────────────────────────────
        const vOpts = (options.definition as any).options?.version;
        if (vOpts) {
            this._versionConfig = vOpts === true
                ? { enabled: true, field: 'version' }
                : { enabled: vOpts.enabled !== false, field: vOpts.field ?? 'version' };
        }

        // ── v1 hooks factory ──────────────────────────────────────────────────────
        if (typeof (options.definition as any).hooks === 'function') {
            this._v1HooksFactory = (options.definition as any).hooks as typeof this._v1HooksFactory;
        }

        // ── indexes auto-create ───────────────────────────────────────────────────
        const definedIndexes = (options.definition as any).indexes;
        if (Array.isArray(definedIndexes) && definedIndexes.length > 0) {
            setImmediate(() => {
                for (const idxSpec of definedIndexes) {
                    if (!idxSpec?.key) continue;
                    const { key, ...idxOpts } = idxSpec;
                    (this.collection as any).createIndex(key, idxOpts).catch(() => {});
                }
            });
        }

        // ── v1 methods factory ────────────────────────────────────────────────────
        if (typeof (options.definition as any).methods === 'function') {
            try {
                const methodsFactory = (options.definition as any).methods as (instance: ModelInstance<TDocument>) => {
                    instance?: Record<string, (...args: unknown[]) => unknown>;
                    static?: Record<string, (...args: unknown[]) => unknown>;
                };
                const customMethods = methodsFactory(this);
                this._v1InstanceMethods = customMethods.instance ?? {};
                for (const [name, fn] of Object.entries(customMethods.static ?? {})) {
                    if (typeof fn === 'function' && !(name in this)) {
                        Object.defineProperty(this, name, {
                            configurable: true,
                            enumerable: false,
                            writable: false,
                            value: (...args: unknown[]) => fn.apply(this, args),
                        });
                    }
                }
            } catch {
                this._v1InstanceMethods = {};
            }
        }
    }

    getNamespace(): { iid: string; type: 'mongodb'; db: string; collection: string; } {
        return this.collection.getNamespace();
    }

    raw(): unknown {
        return this.collection.raw();
    }

    // ── v1 hooks helpers ──────────────────────────────────────────────────────────
    private _v1GetOpType(method: string): 'find' | 'insert' | 'update' | 'delete' {
        if (/^(find|count|distinct|aggregate)/i.test(method)) return 'find';
        if (/^insert/i.test(method)) return 'insert';
        if (/^(update|replace|upsert|findOneAnd(Update|Replace)|increment)/i.test(method)) return 'update';
        if (/^(delete|findOneAndDelete)/i.test(method)) return 'delete';
        return 'find';
    }

    private async _runV1Hook(
        opType: 'find' | 'insert' | 'update' | 'delete',
        phase: 'before' | 'after',
        ctx: Record<string, unknown>,
        ...args: unknown[]
    ): Promise<unknown> {
        if (!this._v1HooksFactory) return undefined;
        const hooks = this._v1HooksFactory(this);
        const opHooks = hooks[opType];
        if (!opHooks) return undefined;
        const hookFn = (opHooks as Record<string, unknown>)[phase];
        if (typeof hookFn !== 'function') return undefined;
        return hookFn(ctx, ...args);
    }

    // ── v1 schema validation ──────────────────────────────────────────────────────
    private async _validateDoc(doc: Record<string, unknown>, opts?: Record<string, unknown>): Promise<void> {
        if (!this._validateEnabled) return;
        if (opts?.skipValidation) return;
        if (!this._schemaCache || !_schemaValidateFn) return;
        const result = _schemaValidateFn(this._schemaCache, doc);
        if (!result.valid) {
            const errors: Array<{ path?: string; field?: string; message?: string }> = result.errors ?? [];
            const fields = [...new Set(errors.map((e) => e.path ?? e.field).filter(Boolean))];
            const summary = fields.length > 0 ? ` (${fields.join(', ')})` : '';
            const err = createError(ErrorCodes.VALIDATION_ERROR, `Schema validation failed${summary}`);
            (err as any).errors = errors;
            throw err;
        }
    }

    // ── v1 soft-delete filter ─────────────────────────────────────────────────────
    private _applySoftDeleteFilter(query?: unknown, options?: unknown): unknown {
        const sd = this._softDeleteConfig;
        if (!sd || !sd.enabled) return query ?? {};
        const opts = (options ?? {}) as Record<string, unknown>;
        const q = (query ?? {}) as Record<string, unknown>;
        // If query already mentions the deletedAt field, don't modify
        if (q[sd.field] !== undefined) return q;
        if (opts.withDeleted) return q;
        if (opts.onlyDeleted) return { ...q, [sd.field]: { $ne: null } };
        return { ...q, [sd.field]: null };
    }

    // ── timestamps helpers ────────────────────────────────────────────────────────
    private _nowDate(): Date {
        return new Date();
    }

    private _applyInsertTimestamps(doc: Record<string, unknown>): Record<string, unknown> {
        const ts = this._timestampsConfig;
        if (!ts) return doc;
        const now = this._nowDate();
        const result = { ...doc };
        if (ts.createdAt !== false && result[ts.createdAt] === undefined) result[ts.createdAt] = now;
        if (ts.updatedAt !== false && result[ts.updatedAt] === undefined) result[ts.updatedAt] = now;
        return result;
    }

    private _applyUpdateTimestamps(update: unknown): unknown {
        const ts = this._timestampsConfig;
        if (!ts || ts.updatedAt === false) return update;
        const u = (update ?? {}) as Record<string, unknown>;
        const $set = { ...((u['$set'] ?? {}) as Record<string, unknown>), [ts.updatedAt as string]: this._nowDate() };
        return { ...u, $set };
    }

    private _applyVersionIncrement(update: unknown): unknown {
        const vc = this._versionConfig;
        if (!vc?.enabled) return update;
        const u = (update ?? {}) as Record<string, unknown>;
        const $inc = (u['$inc'] ?? {}) as Record<string, unknown>;
        if ($inc[vc.field] !== undefined) return update;
        return { ...u, $inc: { ...$inc, [vc.field]: 1 } };
    }

    private _applyUpsertTimestamps(update: unknown): unknown {
        const ts = this._timestampsConfig;
        if (!ts) return update;
        const u = (update ?? {}) as Record<string, unknown>;
        const result: Record<string, unknown> = { ...u };
        if (ts.updatedAt !== false) {
            const $set = { ...((u['$set'] ?? {}) as Record<string, unknown>), [ts.updatedAt as string]: this._nowDate() };
            result['$set'] = $set;
        }
        if (ts.createdAt !== false) {
            const $setOnInsert = { ...((u['$setOnInsert'] ?? {}) as Record<string, unknown>) };
            if ($setOnInsert[ts.createdAt as string] === undefined) $setOnInsert[ts.createdAt as string] = this._nowDate();
            result['$setOnInsert'] = $setOnInsert;
        }
        return result;
    }

    private _applyReplaceTimestamps(replacement: unknown): unknown {
        const ts = this._timestampsConfig;
        if (!ts || ts.updatedAt === false) return replacement;
        const r = (replacement ?? {}) as Record<string, unknown>;
        if (r[ts.updatedAt as string] !== undefined) return r;
        return { ...r, [ts.updatedAt as string]: this._nowDate() };
    }

    // ── public API ────────────────────────────────────────────────────────────────

    find(query?: unknown, options?: unknown): PopulateProxy<Array<TDocument & Record<string, unknown>>> {
        return new PopulatePromise(async (paths) => {
            const ctx: Record<string, unknown> = {};
            const filteredQuery = this._applySoftDeleteFilter(query, options);

            if (this._v1HooksFactory) {
                await this._runV1Hook('find', 'before', ctx, options);
            } else {
                await this.runHook('beforeFind', { operation: 'find', collection: this.collectionName, filter: filteredQuery });
            }

            const docs = await this.collection.find(filteredQuery, options) as Array<TDocument | null | undefined>;
            let result = await this.populateDocuments(this.hydrateDocuments(docs), paths);

            if (this._v1HooksFactory) {
                try {
                    const hookResult = await this._runV1Hook('find', 'after', ctx, result);
                    if (hookResult !== undefined) result = hookResult as typeof result;
                } catch { /* after hooks don't affect operation */ }
            } else {
                await this.runHook('afterFind', { operation: 'find', collection: this.collectionName, filter: filteredQuery, result });
            }

            return result;
        });
    }

    findOne(query?: unknown, options?: unknown): PopulateProxy<(TDocument & Record<string, unknown>) | null> {
        return new PopulatePromise(async (paths) => {
            const ctx: Record<string, unknown> = {};
            const filteredQuery = this._applySoftDeleteFilter(query, options);

            if (this._v1HooksFactory) {
                await this._runV1Hook('find', 'before', ctx, options);
            }

            const doc = await this.collection.findOne(filteredQuery, options) as TDocument | null | undefined;
            let result = await this.populateSingle(this.hydrateDocument(doc), paths);

            if (this._v1HooksFactory) {
                try {
                    const hookResult = await this._runV1Hook('find', 'after', ctx, result);
                    if (hookResult !== undefined) result = hookResult as typeof result;
                } catch { /* after hooks don't affect operation */ }
            }

            return result;
        });
    }

    findOneById(id: unknown, options?: unknown): PopulateProxy<(TDocument & Record<string, unknown>) | null> {
        return new PopulatePromise(async (paths) => {
            const doc = await this.collection.findOneById(id, options) as TDocument | null | undefined;
            return this.populateSingle(this.hydrateDocument(doc), paths);
        });
    }

    findById(id: unknown, options?: unknown): PopulateProxy<(TDocument & Record<string, unknown>) | null> {
        return this.findOneById(id, options);
    }

    findByIds(ids: unknown[], options?: unknown): PopulateProxy<Array<TDocument & Record<string, unknown>>> {
        return new PopulatePromise(async (paths) => {
            const docs = await this.collection.findByIds(ids, options) as Array<TDocument | null | undefined>;
            return this.populateDocuments(this.hydrateDocuments(docs), paths);
        });
    }

    findPage(options?: unknown): PopulateProxy<{
        items: Array<TDocument & Record<string, unknown>>;
        pageInfo: {
            hasNext: boolean;
            hasPrev: boolean;
            startCursor: string | null;
            endCursor: string | null;
            currentPage?: number;
        };
        totals?: Record<string, unknown>;
    }> {
        return new PopulatePromise(async (paths) => {
            const result = await this.collection.findPage(options);
            return {
                ...result,
                items: await this.populateDocuments(this.hydrateDocuments(result.items), paths),
            };
        });
    }

    findAndCount(query?: unknown, options?: unknown): PopulateProxy<{
        data: Array<TDocument & Record<string, unknown>>;
        total: number;
    }> {
        return new PopulatePromise(async (paths) => {
            const filteredQuery = this._applySoftDeleteFilter(query, options);
            const result = await this.collection.findAndCount(filteredQuery, options);
            return {
                data: await this.populateDocuments(this.hydrateDocuments(result.data as Array<TDocument | null | undefined>), paths),
                total: result.total,
            };
        });
    }

    count(query?: unknown, options?: unknown): Promise<number> {
        const filteredQuery = this._applySoftDeleteFilter(query, options);
        return this.collection.count(filteredQuery, options);
    }

    async insertOne(document?: unknown, options?: unknown): Promise<{ acknowledged: boolean; insertedId: unknown; }> {
        const ctx: Record<string, unknown> = {};
        let payload = this.applyDefaults(document as Record<string, unknown> | undefined);

        // v1 before-insert hook (may modify args)
        if (this._v1HooksFactory) {
            const hookResult = await this._runV1Hook('insert', 'before', ctx, payload);
            if (hookResult !== undefined && typeof hookResult === 'object') payload = hookResult as Record<string, unknown>;
        } else {
            await this.runHook('beforeCreate', { operation: 'insertOne', collection: this.collectionName, data: payload });
        }

        // schema validation
        await this._validateDoc(payload, options as Record<string, unknown> | undefined);

        // timestamps
        payload = this._applyInsertTimestamps(payload);

        // version
        if (this._versionConfig?.enabled) {
            if (payload[this._versionConfig.field] === undefined) {
                payload = { ...payload, [this._versionConfig.field]: 0 };
            }
        }

        const result = await this.collection.insertOne(payload, options);

        if (this._v1HooksFactory) {
            try {
                await this._runV1Hook('insert', 'after', ctx, result);
            } catch { /* after hooks don't affect operation */ }
        } else {
            await this.runHook('afterCreate', { operation: 'insertOne', collection: this.collectionName, data: payload, result });
        }
        return result;
    }

    async insertMany(documents?: unknown[], options?: unknown): Promise<unknown> {
        const opts = (options ?? {}) as Record<string, unknown>;
        const docs: Record<string, unknown>[] = [];
        for (let i = 0; i < (documents ?? []).length; i++) {
            let d = this.applyDefaults((documents ?? [])[i] as Record<string, unknown>);
            // schema validation per-document with index
            if (!opts.skipValidation && this._validateEnabled && this._schemaCache && _schemaValidateFn) {
                const vr = _schemaValidateFn(this._schemaCache, d);
                if (!vr.valid) {
                    const errors: Array<{ path?: string; field?: string; message?: string }> = vr.errors ?? [];
                    const fields = [...new Set(errors.map((e) => e.path ?? e.field).filter(Boolean))];
                    const summary = fields.length > 0 ? ` (${fields.join(', ')})` : '';
                    const err = createError(ErrorCodes.VALIDATION_ERROR, `Schema validation failed${summary}`);
                    (err as any).errors = errors;
                    (err as any).index = i;
                    throw err;
                }
            }
            d = this._applyInsertTimestamps(d);
            if (this._versionConfig?.enabled && d[this._versionConfig.field] === undefined) {
                d = { ...d, [this._versionConfig.field]: 0 };
            }
            docs.push(d);
        }
        return this.collection.insertMany(docs, options);
    }

    async updateOne(filter?: unknown, update?: unknown, options?: unknown): Promise<unknown> {
        const ctx: Record<string, unknown> = {};
        let u = update;

        if (this._v1HooksFactory) {
            await this._runV1Hook('update', 'before', ctx, filter, u);
        } else {
            await this.runHook('beforeUpdate', { operation: 'updateOne', collection: this.collectionName, filter, update: u });
        }

        u = this._applyVersionIncrement(this._applyUpdateTimestamps(u));
        const result = await this.collection.updateOne(filter, u, options);

        if (this._v1HooksFactory) {
            try {
                await this._runV1Hook('update', 'after', ctx, result);
            } catch { /* after hooks don't affect operation */ }
        } else {
            await this.runHook('afterUpdate', { operation: 'updateOne', collection: this.collectionName, filter, update: u, result });
        }
        return result;
    }

    async updateMany(filter?: unknown, update?: unknown, options?: unknown): Promise<unknown> {
        const u = this._applyVersionIncrement(this._applyUpdateTimestamps(update));
        return this.collection.updateMany(filter, u, options);
    }

    async replaceOne(filter?: unknown, replacement?: unknown, options?: unknown): Promise<unknown> {
        const r = this._applyReplaceTimestamps(replacement);
        return this.collection.replaceOne(filter, r, options);
    }

    findOneAndUpdate(filter?: unknown, update?: unknown, options?: unknown): Promise<TDocument | null> {
        const u = this._applyUpdateTimestamps(update);
        return this.collection.findOneAndUpdate(filter, u, options);
    }

    findOneAndReplace(filter?: unknown, replacement?: unknown, options?: unknown): Promise<TDocument | null> {
        const r = this._applyReplaceTimestamps(replacement);
        return (this.collection as any).findOneAndReplace(filter, r, options);
    }

    findOneAndDelete(filter?: unknown, options?: unknown): Promise<TDocument | null> {
        return this.collection.findOneAndDelete(filter, options);
    }

    async upsertOne(filter?: unknown, update?: unknown, options?: unknown): Promise<unknown> {
        const u = this._applyUpsertTimestamps(update);
        return this.collection.upsertOne(filter, u, options);
    }

    async incrementOne(filter?: unknown, field?: string | Record<string, number>, increment?: number, options?: unknown): Promise<unknown> {
        const ts = this._timestampsConfig;
        if (ts && ts.updatedAt !== false) {
            const opts = (options ?? {}) as Record<string, unknown>;
            const $set = { ...((opts['$set'] ?? {}) as Record<string, unknown>), [ts.updatedAt as string]: this._nowDate() };
            return (this.collection as any).incrementOne(filter, field, increment, { ...opts, $set });
        }
        return (this.collection as any).incrementOne(filter, field, increment, options);
    }

    async insertBatch(docs: unknown[], options?: unknown): Promise<unknown> {
        const ts = this._timestampsConfig;
        const docsToInsert = ts ? docs.map(d => this._applyInsertTimestamps(d as Record<string, unknown>)) : docs;
        return (this.collection as any).insertBatch(docsToInsert, options);
    }

    async updateBatch(filter?: unknown, update?: unknown, options?: unknown): Promise<unknown> {
        const u = this._applyUpdateTimestamps(update);
        return (this.collection as any).updateBatch(filter, u, options);
    }

    async deleteOne(filter?: unknown, options?: unknown): Promise<unknown> {
        const sd = this._softDeleteConfig;
        const opts = (options ?? {}) as Record<string, unknown>;
        const ctx: Record<string, unknown> = {};

        if (this._v1HooksFactory) {
            await this._runV1Hook('delete', 'before', ctx, filter);
        } else {
            await this.runHook('beforeDelete', { operation: 'deleteOne', collection: this.collectionName, filter });
        }

        let result: unknown;
        if (sd?.enabled && !opts._forceDelete) {
            result = await this.collection.updateOne(
                { ...(filter as Record<string, unknown> ?? {}), [sd.field]: null },
                { $set: { [sd.field]: sd.type === 'boolean' ? true : this._nowDate() } },
                options,
            );
        } else {
            result = await this.collection.deleteOne(filter, options);
        }

        if (this._v1HooksFactory) {
            try {
                await this._runV1Hook('delete', 'after', ctx, result);
            } catch { /* after hooks don't affect operation */ }
        } else {
            await this.runHook('afterDelete', { operation: 'deleteOne', collection: this.collectionName, filter, result });
        }
        return result;
    }

    async deleteMany(filter?: unknown, options?: unknown): Promise<unknown> {
        const sd = this._softDeleteConfig;
        const opts = (options ?? {}) as Record<string, unknown>;
        if (sd?.enabled && !opts._forceDelete) {
            return this.collection.updateMany(
                { ...(filter as Record<string, unknown> ?? {}), [sd.field]: null },
                { $set: { [sd.field]: sd.type === 'boolean' ? true : this._nowDate() } },
                options,
            );
        }
        return this.collection.deleteMany(filter, options);
    }

    // ── soft-delete extended methods (only meaningful when softDelete is enabled) ──

    findWithDeleted(query?: unknown, options?: unknown): PopulateProxy<Array<TDocument & Record<string, unknown>>> {
        return new PopulatePromise(async (paths) => {
            const opts = { ...(options as Record<string, unknown> ?? {}), withDeleted: true };
            const docs = await this.collection.find(query, opts) as Array<TDocument | null | undefined>;
            return this.populateDocuments(this.hydrateDocuments(docs), paths);
        });
    }

    findOnlyDeleted(query?: unknown, options?: unknown): PopulateProxy<Array<TDocument & Record<string, unknown>>> {
        return new PopulatePromise(async (paths) => {
            const sd = this._softDeleteConfig;
            const deletedFilter = sd ? { ...(query as Record<string, unknown> ?? {}), [sd.field]: { $ne: null } } : (query ?? {});
            const docs = await this.collection.find(deletedFilter, options) as Array<TDocument | null | undefined>;
            return this.populateDocuments(this.hydrateDocuments(docs), paths);
        });
    }

    findOneWithDeleted(query?: unknown, options?: unknown): PopulateProxy<(TDocument & Record<string, unknown>) | null> {
        return new PopulatePromise(async (paths) => {
            const opts = { ...(options as Record<string, unknown> ?? {}), withDeleted: true };
            const doc = await this.collection.findOne(query, opts) as TDocument | null | undefined;
            return this.populateSingle(this.hydrateDocument(doc), paths);
        });
    }

    findOneOnlyDeleted(query?: unknown, options?: unknown): PopulateProxy<(TDocument & Record<string, unknown>) | null> {
        return new PopulatePromise(async (paths) => {
            const sd = this._softDeleteConfig;
            const deletedFilter = sd ? { ...(query as Record<string, unknown> ?? {}), [sd.field]: { $ne: null } } : (query ?? {});
            const doc = await this.collection.findOne(deletedFilter, options) as TDocument | null | undefined;
            return this.populateSingle(this.hydrateDocument(doc), paths);
        });
    }

    countWithDeleted(query?: unknown, options?: unknown): Promise<number> {
        return this.collection.count(query, { ...(options as Record<string, unknown> ?? {}), withDeleted: true });
    }

    countOnlyDeleted(query?: unknown, options?: unknown): Promise<number> {
        const sd = this._softDeleteConfig;
        const deletedFilter = sd ? { ...(query as Record<string, unknown> ?? {}), [sd.field]: { $ne: null } } : (query ?? {});
        return this.collection.count(deletedFilter, { ...(options as Record<string, unknown> ?? {}), withDeleted: true });
    }

    async restore(filter?: unknown, options?: unknown): Promise<unknown> {
        const sd = this._softDeleteConfig;
        if (!sd?.enabled) return { modifiedCount: 0 };
        return this.collection.updateOne(
            { ...(filter as Record<string, unknown> ?? {}), [sd.field]: { $ne: null } },
            { $unset: { [sd.field]: 1 } },
            options,
        );
    }

    async restoreMany(filter?: unknown, options?: unknown): Promise<unknown> {
        const sd = this._softDeleteConfig;
        if (!sd?.enabled) return { modifiedCount: 0 };
        return this.collection.updateMany(
            { ...(filter as Record<string, unknown> ?? {}), [sd.field]: { $ne: null } },
            { $unset: { [sd.field]: 1 } },
            options,
        );
    }

    async forceDelete(filter?: unknown, options?: unknown): Promise<unknown> {
        return this.collection.deleteOne(filter, options);
    }

    async forceDeleteMany(filter?: unknown, options?: unknown): Promise<unknown> {
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

    validate(document?: unknown): ValidationResult {
        try {
            if (this._schemaError) {
                return {
                    valid: false,
                    errors: [{ field: '_schema', message: `Schema validation failed: ${this._schemaError.message}` }],
                };
            }
            if (!this._schemaCache || !_schemaValidateFn) return { valid: true, errors: [] };
            const result = _schemaValidateFn(this._schemaCache, document ?? {});
            return { valid: result.valid, errors: (result.errors ?? []).map(e => ({
                field: e.field ?? e.path ?? '',
                message: e.message ?? '',
            })) };
        } catch (err) {
            return {
                valid: false,
                errors: [{ field: '_schema', message: `Schema validation failed: ${err instanceof Error ? err.message : String(err)}` }],
            };
        }
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
        if (docs.length === 0) {
            return docs;
        }
        const relation = this.relations.get(config.path);
        if (!relation) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, `未定义的关系: ${config.path}`);
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

        if (config.populate) {
            const nestedRaw = config.populate as unknown;
            const isValidNestedConfig = (n: unknown): boolean => {
                if (typeof n === 'string') return true;
                if (Array.isArray(n)) return true;
                if (typeof n === 'object' && n !== null && (n as PopulateConfig).path) return true;
                return false;
            };
            if (!isValidNestedConfig(nestedRaw)) {
                throw createError(ErrorCodes.INVALID_ARGUMENT, '嵌套 populate 参数必须是字符串、数组或对象');
            }
            if (relatedModel) {
                const nestedPaths = Array.isArray(config.populate) ? config.populate : [config.populate];
                hydrated = await relatedModel.populateDocuments(hydrated, nestedPaths);
            }
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

        // Virtuals
        for (const [name, virtual] of Object.entries(this.definition.virtuals ?? {})) {
            Object.defineProperty(hydrated, name, {
                configurable: true,
                enumerable: true,
                get: () => virtual.get.call(hydrated),
                set: virtual.set ? (value) => virtual.set?.call(hydrated, value) : undefined,
            });
        }

        // Methods: v1 factory format or v2 static dict
        if (typeof (this.definition as any).methods === 'function') {
            // v1 instance methods from _v1InstanceMethods
            for (const [name, method] of Object.entries(this._v1InstanceMethods)) {
                Object.defineProperty(hydrated, name, {
                    configurable: true,
                    enumerable: false,
                    writable: false,
                    value: (...args: unknown[]) => method.apply(hydrated, args),
                });
            }
        } else {
            for (const [name, method] of Object.entries(this.definition.methods ?? {})) {
                Object.defineProperty(hydrated, name, {
                    configurable: true,
                    enumerable: false,
                    writable: false,
                    value: (...args: unknown[]) => method.apply(hydrated, args),
                });
            }
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
        hookName: string,
        context: HookContext,
    ): Promise<void> {
        if (typeof (this.definition as any).hooks === 'function') return; // v1 factory – handled separately
        const hook = (this.definition.hooks as Record<string, unknown> | undefined)?.[hookName as string];
        if (typeof hook === 'function') {
            await (hook as (ctx: HookContext) => Promise<void> | void)(context);
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

/**
 * Processes the timestamps option and writes the normalized result into definition._internalHooks.timestamps.
 * Progressive rules (consistent with v1):
 *  - true              → { createdAt: 'createdAt', updatedAt: 'updatedAt' }
 *  - false / undefined → _internalHooks.timestamps = undefined
 *  - { createdAt }     → when createdAt is specified, updatedAt defaults to 'updatedAt' (asymmetric)
 *  - { updatedAt }     → only updatedAt is specified; createdAt has no default
 */
function processTimestamps<TDocument>(definition: ModelDefinition<TDocument>): void {
    const tsOpt = (definition as any).options?.timestamps as
        | boolean
        | { createdAt?: string | boolean; updatedAt?: string | boolean }
        | undefined;

    // v1-compat: null is treated same as false (no timestamps)
    if (tsOpt === null) return;
    // Validate timestamps option type (matches v1 behavior)
    if (tsOpt !== undefined && typeof tsOpt !== 'boolean' && typeof tsOpt !== 'object') {
        throw createError(ErrorCodes.INVALID_MODEL_DEFINITION, 'options.timestamps must be boolean or object.');
    }

    if (!tsOpt && tsOpt !== false) {
        return;
    }

    const defAny = definition as any;
    if (!defAny._internalHooks) defAny._internalHooks = {};

    if (tsOpt === false) {
        defAny._internalHooks.timestamps = undefined;
        return;
    }
    if (tsOpt === true) {
        defAny._internalHooks.timestamps = { createdAt: 'createdAt', updatedAt: 'updatedAt' };
        return;
    }

    const result: { createdAt?: string; updatedAt?: string } = {};
    let createdAtAdded = false;

    const ca = tsOpt.createdAt;
    if (ca === false) {
        // omit
    } else if (ca === true) {
        result.createdAt = 'createdAt';
        createdAtAdded = true;
    } else if (typeof ca === 'string') {
        result.createdAt = ca;
        createdAtAdded = true;
    }

    const ua = tsOpt.updatedAt;
    if (ua === false) {
        // omit
    } else if (ua === true) {
        result.updatedAt = 'updatedAt';
    } else if (typeof ua === 'string') {
        result.updatedAt = ua;
    } else if (ua === undefined && createdAtAdded) {
        // Asymmetric: when createdAt is specified, updatedAt defaults to 'updatedAt'
        result.updatedAt = 'updatedAt';
    }

    defAny._internalHooks.timestamps = Object.keys(result).length ? result : undefined;
}

function validateDefinition<TDocument>(definition: ModelDefinition<TDocument> | undefined): void {
    if (!definition || typeof definition !== 'object') {
        throw createError(ErrorCodes.INVALID_MODEL_DEFINITION, 'Model definition must be an object.');
    }
    if (definition.schema === undefined || definition.schema === null) {
        throw createError(ErrorCodes.MISSING_SCHEMA, 'Model definition must include a schema property.');
    }
    if (typeof definition.schema !== 'function' && (typeof definition.schema !== 'object' || definition.schema === null)) {
        throw createError(ErrorCodes.INVALID_SCHEMA_TYPE, 'Schema must be a function or object.');
    }
    if (definition.connection) {
        if (definition.connection.pool !== undefined && (typeof definition.connection.pool !== 'string' || definition.connection.pool.trim() === '')) {
            throw createError(ErrorCodes.INVALID_MODEL_DEFINITION, 'connection.pool must be a non-empty string.');
        }
        if (definition.connection.database !== undefined && (typeof definition.connection.database !== 'string' || definition.connection.database.trim() === '')) {
            throw createError(ErrorCodes.INVALID_MODEL_DEFINITION, 'connection.database must be a non-empty string.');
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
        const value = config[field];
        if (value === undefined || value === null) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, `relations 配置缺少必需字段: ${field}`);
        }
        if (typeof value !== 'string' || (value as string).trim() === '') {
            throw createError(ErrorCodes.INVALID_ARGUMENT, `relations.${field} 必须是字符串`);
        }
    }
    if (config.single !== undefined && typeof config.single !== 'boolean') {
        throw createError(ErrorCodes.INVALID_ARGUMENT, `relations.single 必须是布尔值`);
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




