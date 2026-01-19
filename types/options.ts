/**
 * 配置选项类型定义
 * @module types/options
 */

import type { DbType, LoggerLike } from './base';
import type { CacheLike, MemoryCacheOptions, MultiLevelCacheOptions } from './cache';

/**
 * SSH 隧道配置
 * @since v1.3.0
 */
export interface SSHConfig {
    /** SSH 服务器地址 */
    host: string;
    /** SSH 服务器端口（默认 22） */
    port?: number;
    /** SSH 用户名 */
    username: string;
    /** SSH 密码（与 privateKey 二选一） */
    password?: string;
    /** SSH 私钥（字符串或 Buffer，与 password 二选一） */
    privateKey?: string | Buffer;
    /** 私钥密码（如果私钥有加密） */
    passphrase?: string;
    /** 连接超时时间（毫秒，默认 30000） */
    readyTimeout?: number;
    /** 保持连接的间隔时间（毫秒，默认 10000） */
    keepaliveInterval?: number;
    /** 目标数据库主机（相对于 SSH 服务器，默认 'localhost'） */
    dstHost?: string;
    /** 目标数据库端口（相对于 SSH 服务器） */
    dstPort?: number;
}

/**
 * 事务选项配置
 * @since v0.2.0
 */
export interface TransactionOptions {
    /** 读关注级别（Read Concern） */
    readConcern?: {
        level: 'local' | 'majority' | 'snapshot' | 'linearizable' | 'available';
    };
    /** 读偏好（Read Preference） */
    readPreference?: 'primary' | 'primaryPreferred' | 'secondary' | 'secondaryPreferred' | 'nearest';
    /** 因果一致性（Causal Consistency） */
    causalConsistency?: boolean;
    /** 事务最大执行时间（毫秒） */
    maxDuration?: number;
    /** 是否启用自动重试 */
    enableRetry?: boolean;
    /** 最大重试次数 */
    maxRetries?: number;
    /** 重试延迟（毫秒） */
    retryDelay?: number;
    /** 重试退避系数 */
    retryBackoff?: number;
    /** 是否启用缓存锁 */
    enableCacheLock?: boolean;
    /** 缓存锁清理间隔（毫秒） */
    lockCleanupInterval?: number;
}

/**
 * MonSQLize 基础配置选项
 */
export interface BaseOptions {
    type: DbType;
    databaseName: string;
    config: any;
    /** SSH 隧道配置（v1.3.0+） */
    ssh?: SSHConfig;
    cache?: CacheLike | MemoryCacheOptions | MultiLevelCacheOptions | object;
    logger?: LoggerLike;
    maxTimeMS?: number; // 全局默认查询超时（毫秒）
    findLimit?: number; // 全局默认 find limit（未传 limit 时使用；0 表示不限制）
    namespace?: { instanceId?: string; scope?: 'database' | 'connection' };
    slowQueryMs?: number; // 慢查询日志阈值（毫秒），默认 500
    /** MongoDB 副本集读偏好（全局配置）
     * - 'primary': 仅读主节点（默认）
     * - 'primaryPreferred': 优先读主节点，主节点不可用时读从节点
     * - 'secondary': 仅读从节点
     * - 'secondaryPreferred': 优先读从节点，从节点不可用时读主节点
     * - 'nearest': 读最近的节点（低延迟）
     */
    readPreference?: 'primary' | 'primaryPreferred' | 'secondary' | 'secondaryPreferred' | 'nearest';
    /**
     * 事务配置（MongoDB Transaction API）
     * 需要 MongoDB 4.0+ 且部署在副本集或分片集群上
     * @since v0.2.0
     */
    transaction?: TransactionOptions | false;
    // 统一默认（新增可选项）
    findPageMaxLimit?: number;          // 深分页页大小上限（默认 500）
    cursorSecret?: string;              // 可选：游标签名密钥（如启用 HMAC 验签）
    log?: {
        slowQueryTag?: { event?: string; code?: string };
        formatSlowQuery?: (meta: any) => any;
    };
    /**
     * ObjectId 自动转换配置（v1.3.0+）
     * 自动将字符串 _id 转换为 ObjectId
     * @default true（MongoDB）
     * @since v1.3.0
     */
    autoConvertObjectId?: boolean | {
        /** 是否启用（默认 true） */
        enabled?: boolean;
        /** 排除字段列表 */
        excludeFields?: string[];
        /** 自定义字段模式 */
        customFieldPatterns?: string[];
        /** 最大转换深度（默认 10） */
        maxDepth?: number;
        /** 日志级别（默认 'warn'） */
        logLevel?: 'info' | 'warn' | 'error';
    };
    /**
     * Count 队列配置（高并发控制）
     * 避免大量并发 count 查询压垮数据库
     * @default { enabled: true, concurrency: CPU核心数 }
     * @since v1.0.0
     */
    countQueue?: boolean | {
        /** 是否启用队列（默认 true） */
        enabled?: boolean;
        /** 并发数（默认 CPU 核心数，最少 4，最多 16） */
        concurrency?: number;
        /** 最大队列长度（默认 10000） */
        maxQueueSize?: number;
        /** 超时时间（毫秒，默认 60000） */
        timeout?: number;
    };
    /**
     * Model 自动加载配置（v1.4.0+）
     * 自动扫描指定目录加载 Model 定义文件
     * @default undefined（不启用）
     * @since v1.4.0
     */
    models?: string | {
        /** Model 文件目录路径（相对或绝对路径） */
        path: string;
        /** 文件名模式（支持 glob 格式，默认 '*.model.{js,ts,mjs,cjs}'） */
        pattern?: string;
        /** 是否递归扫描子目录（默认 false） */
        recursive?: boolean;
    };
    /**
     * Change Stream 数据同步配置（v1.0.8+）
     * 实时同步数据到备份库
     * @requires MongoDB Replica Set
     * @requires MongoDB 4.0+
     * @since v1.0.8
     */
    sync?: {
        /** 是否启用同步 */
        enabled: boolean;
        /** 备份目标数组 */
        targets: Array<{
            /** 目标名称 */
            name: string;
            /** MongoDB URI */
            uri: string;
            /** 要同步的集合（['*'] 表示全部） */
            collections?: string[];
            /** 健康检查配置 */
            healthCheck?: {
                enabled?: boolean;
                interval?: number;
                timeout?: number;
                retries?: number;
            };
        }>;
        /** 要监听的集合（可选，默认全部） */
        collections?: string[];
        /** Resume Token 配置 */
        resumeToken?: {
            /** 存储类型（'file' | 'redis'） */
            storage?: 'file' | 'redis';
            /** 文件路径（storage='file' 时使用） */
            path?: string;
            /** Redis 实例（storage='redis' 时使用） */
            redis?: any;
        };
        /** 事件过滤函数 */
        filter?: (event: any) => boolean;
        /** 数据转换函数 */
        transform?: (document: any) => any;
    };
}

