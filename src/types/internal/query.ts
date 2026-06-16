/**
 * Query adapter internal contracts.
 *
 * Notes:
 * - Houses the query layer's internal runtime contracts, preventing them from
 *   scattering across `queries/index.ts`, `accessors.ts`, and `runtime-core.ts`.
 * - These types are not part of the public API; they are shared “internal domain types”
 *   between the query adapter layer, the accessor layer, and the runtime.
 */

/**
 * Minimal TTL-aware query result cache interface.
 * Satisfied by MemoryCache and similar implementations; injected via the runtime
 * to avoid circular dependencies.
 */
export interface QueryCacheLike {
    get(key: string): unknown;
    set(key: string, value: unknown, ttl: number): void | boolean | Promise<void> | Promise<boolean>;
    delPattern?: (pattern: string) => number | Promise<number>;
}

export interface CountQueueLike {
    execute<T>(fn: () => Promise<T>): Promise<T>;
}

export type CursorValueType = 'date' | 'objectId' | 'string' | 'number' | 'boolean' | 'raw';

export interface CursorValueNormalizationOptions {
    cursorTypes?: Record<string, CursorValueType>;
    cursorValueNormalizer?: (field: string, value: unknown) => unknown;
}

/**
 * Runtime defaults propagated from MonSQLizeOptions down through
 * DbFacade → CollectionFacade → query functions.
 *
 * Constraints:
 * - All fields are optional; fall back to v1 defaults when absent
 * - This is the “trimmed defaults” used by the query layer, not the full MonSQLizeOptions
 */
export interface RuntimeDefaults {
    maxTimeMS?: number;
    findLimit?: number;
    findPageMaxLimit?: number;
    autoConvertObjectId?: boolean | Record<string, unknown>;
    cursorSecret?: string;
    requireCursorSecret?: boolean;
    cursorTypes?: Record<string, CursorValueType>;
    cursorValueNormalizer?: (field: string, value: unknown) => unknown;
    slowQueryMs?: number;
    namespace?: { scope?: 'database' | 'connection'; instanceId?: string };
    countQueue?: CountQueueLike;
}

export interface CursorPayload {
    v: 1;
    values: unknown[];
}

export type SortShape = Record<string, 1 | -1>;
