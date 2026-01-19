/**
 * 分页系统相关类型定义
 * @module types/pagination
 */

import type { FindOptions, MetaOptions } from './query';

/**
 * Bookmark 维护 APIs 相关接口
 */
export interface BookmarkKeyDims {
    sort?: Record<string, 1 | -1>;   // 排序配置（与 findPage 一致）
    limit?: number;                  // 每页数量
    query?: object;                  // 查询条件（用于计算 queryShape）
    pipeline?: object[];             // 聚合管道（用于计算 pipelineShape）
}

export interface PrewarmBookmarksResult {
    warmed: number;                  // 成功预热的 bookmark 数量
    failed: number;                  // 预热失败的 bookmark 数量
    keys: string[];                  // 已缓存的 bookmark 键列表
}

export interface ListBookmarksResult {
    count: number;                   // bookmark 总数
    pages: number[];                 // 已缓存的页码列表（排序后）
    keys: string[];                  // 缓存键列表
}

export interface ClearBookmarksResult {
    cleared: number;                 // 清除的 bookmark 数量
    pattern: string;                 // 使用的匹配模式
    keysBefore: number;              // 清除前的 bookmark 数量
}

/**
 * 跳页相关类型
 */
export interface JumpOptions {
    step?: number;                    // 书签密度：每隔 step 页存一个书签；默认 10
    maxHops?: number;                 // 单次跳页允许的"连续 after 次数（累计）"上限；默认 20
    keyDims?: object;                 // 可选；未传则自动生成去敏形状
    getBookmark?: (params: { keyDims: any; page: number }) => Promise<string | null>;
    saveBookmark?: (params: { keyDims: any; page: number; cursor: string; ttlMs?: number }) => Promise<void>;
}

export interface OffsetJumpOptions {
    enable?: boolean;                 // 开启后，当 skip=(page-1)*limit ≤ maxSkip 时走 `$skip+$limit`
    maxSkip?: number;                 // 默认 50_000；超过则回退到"书签跳转"逻辑
}

export interface TotalsOptions {
    mode?: 'none' | 'async' | 'approx' | 'sync'; // 默认 'none'
    maxTimeMS?: number;              // 用于 `countDocuments` 的超时（sync/async）
    ttlMs?: number;                  // 总数缓存 TTL（async/approx），默认 10 分钟
    hint?: any;                      // 计数 hint（可选）
    collation?: any;                 // 计数 collation（可选，与列表一致更安全）
}

/**
 * 深度分页（统一版）选项
 */
export interface FindPageOptions extends FindOptions {
    pipeline?: object[];
    after?: string;
    before?: string;
    limit: number;
    allowDiskUse?: boolean;
    /** Mongo-only: 透传 hint 到 aggregate */
    hint?: any;
    /** Mongo-only: 透传 collation 到 aggregate */
    collation?: any;

    // 新增：跳页相关参数
    page?: number;                   // 目标页（≥1）；与 after/before 互斥
    jump?: JumpOptions;              // 跳页（书签）配置
    offsetJump?: OffsetJumpOptions;  // 小范围 offset 兜底
    totals?: TotalsOptions;          // 总数/总页数配置
    meta?: boolean | MetaOptions;    // 返回耗时元信息
}

/**
 * 元信息
 */
export interface MetaInfo {
    op: string;
    ns: { iid: string; type: string; db: string; coll: string };
    startTs: number;
    endTs: number;
    durationMs: number;
    maxTimeMS?: number;
    fromCache?: boolean;
    cacheHit?: boolean;
    cacheTtl?: number;
    keyHash?: string;
    // findPage 专用字段
    page?: number;
    after?: boolean;
    before?: boolean;
    hops?: number;
    step?: number;
    steps?: Array<{ phase: 'hop' | 'offset'; index?: number; durationMs: number }>; // level='sub' 时提供
    error?: { code?: string; message: string };
}

/**
 * 总数信息
 */
export interface TotalsInfo {
    mode: 'async' | 'sync' | 'approx';
    total?: number | null | undefined;   // async: null（未就绪）；approx: undefined（未知或近似）
    totalPages?: number | null | undefined;
    token?: string;                      // async 时返回的短标识（<keyHash>）
    ts?: number;                         // 写入时间戳（毫秒），如果来自缓存
    error?: string;                      // 仅 async：统计失败时可能附带的错误标识
}

/**
 * 页面信息
 */
export interface PageInfo {
    hasNext: boolean;
    hasPrev: boolean;
    startCursor: string | null;
    endCursor: string | null;
    currentPage?: number;                // 仅跳页/offset 模式回显目标页号（逻辑页号）
}

/**
 * 分页结果
 */
export interface PageResult<T = any> {
    items: T[];
    pageInfo: PageInfo;
    totals?: TotalsInfo;                 // 当启用 totals 时返回
    meta?: MetaInfo;                     // 当启用 meta 时返回
}

/**
 * 带 meta 的返回类型（用于 findOne/find/count）
 */
export interface ResultWithMeta<T = any> {
    data: T;
    meta: MetaInfo;
}

// 重新导出 MetaOptions，方便其他模块使用
export { MetaOptions };

