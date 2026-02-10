/**
 * 函数缓存类型定义
 * 🆕 v1.1.4: 通用函数缓存
 */

/**
 * withCache 配置选项
 */
export interface WithCacheOptions<T extends (...args: any[]) => any> {
    /** 缓存时间（毫秒） */
    ttl?: number;

    /** 自定义键生成函数 */
    keyBuilder?: (...args: Parameters<T>) => string;

    /** 缓存实例 */
    cache?: import('./cache').CacheLike;

    /** 命名空间 */
    namespace?: string;

    /** 条件缓存函数 */
    condition?: (result: Awaited<ReturnType<T>>) => boolean;

    /** 启用统计 */
    enableStats?: boolean;
}

/**
 * 缓存统计信息
 */
export interface CacheStats {
    /** 命中次数 */
    hits: number;

    /** 未命中次数 */
    misses: number;

    /** 错误次数 */
    errors: number;

    /** 总调用次数 */
    calls: number;

    /** 总耗时（毫秒） */
    totalTime: number;

    /** 命中率 */
    hitRate: number;

    /** 平均耗时（毫秒） */
    avgTime: number;
}

/**
 * FunctionCache 配置选项
 */
export interface FunctionCacheOptions {
    /** 命名空间 */
    namespace?: string;

    /** 默认 TTL（毫秒） */
    defaultTTL?: number;

    /** 启用统计 */
    enableStats?: boolean;
}

/**
 * 包装后的函数（带统计方法）
 */
export type CachedFunction<T extends (...args: any[]) => any> = T & {
    getCacheStats(): CacheStats;
};

/**
 * 为函数添加缓存能力
 */
export function withCache<T extends (...args: any[]) => any>(
    fn: T,
    options?: WithCacheOptions<T>
): CachedFunction<T>;

/**
 * 函数缓存管理类
 */
export class FunctionCache {
    constructor(msq?: any, options?: FunctionCacheOptions);

    /**
     * 注册函数
     * 🔧 v1.1.4-hotfix: 改为异步方法
     */
    register<T extends (...args: any[]) => any>(
        name: string,
        fn: T,
        options?: WithCacheOptions<T>
    ): Promise<void>;

    /**
     * 执行函数
     */
    execute<T = any>(name: string, ...args: any[]): Promise<T>;

    /**
     * 失效缓存
     */
    invalidate(name: string, ...args: any[]): Promise<void>;

    /**
     * 批量失效缓存
     */
    invalidatePattern(pattern: string): Promise<number>;

    /**
     * 获取统计信息
     */
    getStats(name?: string): CacheStats | Record<string, CacheStats> | null;

    /**
     * 列出所有已注册的函数
     */
    list(): string[];

    /**
     * 重置统计信息
     */
    resetStats(name?: string): void;

    /**
     * 清空所有已注册的函数
     */
    clear(): void;
}

