/**
 * 缓存相关类型定义
 * @module types/cache
 */

/**
 * 缓存接口
 */
export interface CacheLike {
    get(key: string): Promise<any>;
    set(key: string, val: any, ttl?: number): Promise<void>;
    del(key: string): Promise<boolean>;
    exists(key: string): Promise<boolean>;
    getMany(keys: string[]): Promise<Record<string, any>>;
    setMany(obj: Record<string, any>, ttl?: number): Promise<boolean>;
    delMany(keys: string[]): Promise<number>;
    delPattern(pattern: string): Promise<number>;
    clear(): void;
    keys(pattern?: string): string[];
    getStats?(): any;
}

/**
 * 内置内存缓存的配置（MemoryCacheOptions）
 * - maxSize: 最大键数量（默认 100000）
 * - maxMemory: 最大内存占用（字节；0 表示不限制）
 * - enableStats: 是否启用统计，默认 true
 * - autoInvalidate: 是否启用精准缓存失效，默认 false（v1.1.5+）
 */
export interface MemoryCacheOptions {
    maxSize?: number;
    maxMemory?: number;
    enableStats?: boolean;
    /** 🆕 v1.1.5: 是否启用精准缓存失效（默认 false） */
    autoInvalidate?: boolean;
    // 允许透传其他实现细节，但不做强约束
    [k: string]: any;
}

/**
 * 多层缓存写策略
 * - both：本地+远端双写（等待远端完成）
 * - local-first-async-remote：本地先返回，远端异步写（降低尾延迟）
 */
export type WritePolicy = 'both' | 'local-first-async-remote';

/**
 * 多层缓存策略配置
 */
export interface MultiLevelCachePolicy {
    writePolicy?: WritePolicy;
    /** 远端命中后是否回填本地，默认 true */
    backfillLocalOnRemoteHit?: boolean;
}

/**
 * 多层缓存配置对象（配置式启用双层缓存）
 * 说明：当 BaseOptions.cache 传入该对象时（且 multiLevel=true），框架会自动创建 MultiLevelCache：
 * - local：始终使用内置内存缓存（仅接受配置对象 MemoryCacheOptions）
 * - remote：可传 CacheLike 实例（推荐生产），或传配置对象以退化为"内存占位"
 * - remote.timeoutMs：远端操作超时（毫秒，默认 50）
 * - publish：可选的广播函数（例如用于 pub/sub 触发跨进程本地失效）
 */
export interface MultiLevelCacheOptions {
    multiLevel: true;
    local?: MemoryCacheOptions;
    remote?: CacheLike | (MemoryCacheOptions & { timeoutMs?: number });
    policy?: MultiLevelCachePolicy;
    publish?: (msg: any) => void;
}

