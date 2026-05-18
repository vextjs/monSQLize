/**
 * Query adapter internal contracts.
 *
 * 说明：
 * - 这里存放查询层的内部运行时契约，避免这些类型继续散落在 `queries/index.ts`、
 *   `accessors.ts` 和 `runtime-core.ts` 中。
 * - 这些类型不是最终对外 API 的一部分，而是查询适配层、访问器层和 runtime 之间的
 *   共享“内部领域类型”。
 */

/**
 * Minimal interface for a query-result cache that supports TTL.
 * Satisfied by MemoryCache; injected from runtime to avoid circular deps.
 */
export interface QueryCacheLike {
    get(key: string): unknown;
    set(key: string, value: unknown, ttl: number): boolean;
    delPattern?: (pattern: string) => number | Promise<number>;
}

export interface CountQueueLike {
    execute<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * Runtime defaults threaded from MonSQLizeOptions down through
 * DbFacade → CollectionFacade → query functions.
 *
 * 约束：
 * - 字段全部可选，缺失时回退到 v1 默认值
 * - 这是查询层使用的“裁剪后 defaults”，不是完整的 MonSQLizeOptions
 */
export interface RuntimeDefaults {
    maxTimeMS?: number;
    findLimit?: number;
    findPageMaxLimit?: number;
    autoConvertObjectId?: boolean | Record<string, boolean>;
    cursorSecret?: string;
    slowQueryMs?: number;
    namespace?: { scope?: 'database' | 'connection'; instanceId?: string };
    countQueue?: CountQueueLike;
}

export interface CursorPayload {
    v: 1;
    values: unknown[];
}

export type SortShape = Record<string, 1 | -1>;
