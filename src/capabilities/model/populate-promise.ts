/**
 * populate-promise.ts
 *
 * PopulateProxy 实现：链式 populate API 的 Promise 包装。
 *
 * 设计说明：
 * - PopulatePromise<T> 实现了 PromiseLike<T>（then/catch/finally），
 *   可以被 await 直接使用，也可以通过 .populate().exec() 链式调用。
 * - paths 数组按调用顺序积累，最终由 exec() 一次性传给执行器。
 *
 * 内部接口：
 * - ModelRuntimeLike   — 运行时 scopedCollection/scopedModel 的最小接口（供 ModelInstance 注入）
 * - ModelCollectionLike — 集合操作接口（populate 路径解析时使用）
 * - PopulatePath        — string | PopulateConfig 的联合类型
 */

import type { ModelScopeOptions, PopulateConfig, PopulateProxy } from '../../../types/model';

/** populate 路径：可以是字段名字符串，也可以是完整 PopulateConfig 对象。 */
export type PopulatePath = string | PopulateConfig;

// ── 内部运行时接口（避免循环导入 runtime-core）────────────────────────────────

/** ModelInstance 所需的运行时最小接口，通过构造器注入。 */
export interface ModelRuntimeLike {
    scopedCollection<TDocument = Record<string, unknown>>(name: string, options?: ModelScopeOptions): ModelCollectionLike<TDocument>;
    scopedModel<TDocument = Record<string, unknown>>(name: string, options?: ModelScopeOptions): ModelInstance<TDocument>;
}

/** populate 解析时使用的集合操作接口（仅需子集方法）。 */
export interface ModelCollectionLike<TDocument = Record<string, unknown>> {
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

// 前向类型声明，避免循环依赖（model-instance.ts 导入本文件，本文件需要引用 ModelInstance 类型）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ModelInstance<TDocument = Record<string, unknown>> = import('./index').ModelInstance<TDocument> & any;

// ── PopulatePromise ───────────────────────────────────────────────────────────

/**
 * 链式 populate API 的 Promise 包装器。
 *
 * 用法示例：
 *   const doc = await model.findOne(query).populate('author');
 *   const doc = await model.findOne(query)
 *     .populate('author')
 *     .populate('comments');
 */
export class PopulatePromise<T> implements PopulateProxy<T> {
    readonly [Symbol.toStringTag] = 'Promise';

    constructor(
        private readonly executor: (paths: PopulatePath[]) => Promise<T>,
        private readonly paths: PopulatePath[] = [],
    ) {}

    /**
     * 追加一个 populate 路径，返回新的 PopulatePromise（链式调用）。
     */
    populate(path: string | PopulateConfig, options?: Partial<Omit<PopulateConfig, 'path'>>): PopulateProxy<T> {
        const config: PopulateConfig = typeof path === 'string'
            ? { path, ...options }
            : { ...path, ...options };
        return new PopulatePromise(this.executor, [...this.paths, config]);
    }

    /**
     * 触发实际查询并填充关联文档，返回最终结果 Promise。
     */
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
