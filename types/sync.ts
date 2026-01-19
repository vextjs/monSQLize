/**
 * Change Stream数据同步相关类型定义
 * @module types/sync
 * @since v1.0.8
 */

/**
 * 同步目标配置
 * @since v1.0.8
 */
export interface SyncTarget {
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
}

/**
 * Resume Token 配置
 * @since v1.0.8
 */
export interface ResumeTokenConfig {
    /** 存储类型（'file' | 'redis'） */
    storage?: 'file' | 'redis';
    /** 文件路径（storage='file' 时使用） */
    path?: string;
    /** Redis 实例（storage='redis' 时使用） */
    redis?: any;
}

/**
 * Change Stream 同步配置
 * @since v1.0.8
 */
export interface SyncConfig {
    /** 是否启用同步 */
    enabled: boolean;
    /** 备份目标数组 */
    targets: SyncTarget[];
    /** 要监听的集合（可选，默认全部） */
    collections?: string[];
    /** Resume Token 配置 */
    resumeToken?: ResumeTokenConfig;
    /** 事件过滤函数 */
    filter?: (event: any) => boolean;
    /** 数据转换函数 */
    transform?: (document: any) => any;
}

/**
 * Change Stream 同步统计
 * @since v1.0.8
 */
export interface SyncStats {
    isRunning: boolean;
    eventCount: number;
    syncedCount: number;
    errorCount: number;
    startTime: Date | null;
    lastEventTime: Date | null;
    targets: Array<{
        name: string;
        syncCount: number;
        errorCount: number;
        lastSyncTime: Date | null;
        lastError: Error | null;
        successRate: string;
    }>;
}

