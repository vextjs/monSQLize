import type { LoggerLike, ExpressionFunction } from './base';

export declare class Logger {
    constructor(logger?: LoggerLike | null);
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
    static create(logger?: LoggerLike | null): Logger;
}

export declare class MemoryCache {
    constructor(options?: Record<string, unknown>);
    get(key: string): unknown;
    set(key: string, value: unknown): boolean;
    delete(key: string): boolean;
    clear(): void;
    keys(pattern?: string): string[];
    delPattern(pattern?: string): number;
    static getOrCreateCache(cache?: Record<string, unknown> | MemoryCache): MemoryCache;
}

export declare function createRedisCacheAdapter(options?: Record<string, unknown>): Record<string, unknown>;

export declare class TransactionManager {
    constructor(options?: Record<string, unknown>);
}

export declare class CacheLockManager {
    constructor(options?: Record<string, unknown>);
}

export declare class DistributedCacheInvalidator {
    constructor(options?: Record<string, unknown>);
}

export declare class ConnectionPoolManager {
    constructor(options?: Record<string, unknown>);
}

export interface WithCacheOptions {
    ttl?: number;
    namespace?: string;
    cache?: unknown;
}

export interface CacheStats {
    hits: number;
    misses: number;
    calls: number;
    hitRate: number;
}

export type CachedFunction<TArgs extends unknown[] = unknown[], TResult = unknown> = ((...args: TArgs) => Promise<TResult>) & {
    invalidate: (...args: TArgs) => Promise<boolean>;
};

export declare function withCache<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    options?: WithCacheOptions,
): CachedFunction<TArgs, TResult>;

export declare class FunctionCache {
    constructor(cacheOrDb: unknown, options?: Record<string, unknown>);
    register(name: string, fn: (...args: unknown[]) => Promise<unknown>): void;
    execute(name: string, ...args: unknown[]): Promise<unknown>;
    invalidate(name: string, ...args: unknown[]): Promise<boolean>;
    getStats(name: string): CacheStats;
}

export declare class Model {
    static define(name: string, definition: Record<string, unknown>): void;
    static undefine(name: string): boolean;
    static redefine(name: string, definition: Record<string, unknown>): void;
}

export declare const expr: ExpressionFunction;
export declare const createExpression: ExpressionFunction;

