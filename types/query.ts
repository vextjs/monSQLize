/**
 * 查询选项类型定义
 * @module types/query
 */

/**
 * 元信息选项
 */
export interface MetaOptions {
    level?: 'op' | 'sub';            // sub: 返回子步骤耗时（仅 findPage）
    includeCache?: boolean;          // 包含缓存相关信息
}

/**
 * find 查询选项
 */
export interface FindOptions {
    projection?: Record<string, any> | string[];
    sort?: Record<string, 1 | -1>;
    limit?: number;
    skip?: number;
    cache?: number;
    maxTimeMS?: number;
    /** Mongo-only: 透传 hint 到驱动 */
    hint?: any;
    /** Mongo-only: 透传 collation 到驱动 */
    collation?: any;
    /** 查询注释（用于生产环境日志跟踪）*/
    comment?: string;
    meta?: boolean | MetaOptions;    // 返回耗时元信息
}

/**
 * count 查询选项
 */
export interface CountOptions {
    cache?: number;
    maxTimeMS?: number;
    /** Mongo-only: 透传 hint 到 countDocuments */
    hint?: any;
    /** Mongo-only: 透传 collation 到 countDocuments */
    collation?: any;
    /** 查询注释（用于生产环境日志跟踪）*/
    comment?: string;
    meta?: boolean | MetaOptions;
}

/**
 * aggregate 聚合查询选项
 */
export interface AggregateOptions {
    cache?: number;                  // 缓存时间（毫秒），默认 0（不缓存）
    maxTimeMS?: number;              // 查询超时时间（毫秒）
    allowDiskUse?: boolean;          // 是否允许使用磁盘（默认 false）
    collation?: any;                 // 排序规则（可选）
    hint?: string | object;          // 索引提示（可选）
    comment?: string;                // 查询注释（可选）
    meta?: boolean | MetaOptions;    // 返回耗时元信息
}

/**
 * distinct 查询选项
 */
export interface DistinctOptions {
    cache?: number;                  // 缓存时间（毫秒），默认继承实例缓存配置
    maxTimeMS?: number;              // 查询超时时间（毫秒）
    collation?: any;                 // 排序规则（可选）
    hint?: string | object;          // 索引提示（可选）
    meta?: boolean | MetaOptions;    // 返回耗时元信息
}

