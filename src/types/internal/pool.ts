/**
 * pool 能力层内部领域类型。
 *
 * 将 pool/index.ts 中与逻辑无关的纯数据结构抽离到此处，
 * 方便跨模块共享与独立维护，避免在能力文件中混入接口定义。
 */

/**
 * 单个连接池的统计数据结构。
 * 由 PoolStatsManager 内部维护，通过 getStats / getAllStats 对外只读暴露。
 */
export interface PoolStatsData {
    /** 当前活跃连接数。 */
    connections: number;
    /** 当前可用连接数。 */
    available: number;
    /** 当前等待连接的请求数。 */
    waiting: number;
    /** 累计请求总数（含选择与实际查询）。 */
    totalRequests: number;
    /** 累计成功请求数。 */
    successRequests: number;
    /** 累计失败请求数。 */
    failedRequests: number;
    /** 累计响应时间之和（毫秒），用于计算均值。 */
    totalResponseTime: number;
    /** 平均响应时间（毫秒）。 */
    avgResponseTime: number;
    /** 错误率（0–1），= failedRequests / totalRequests。 */
    errorRate: number;
}

/**
 * PoolStatsManager 批量写入缓冲区的条目结构。
 * 事件在写入 Map 前先进缓冲区，由定时 flush 批量合并，以减少 Map 操作频次。
 */
export interface PoolBufferItem {
    /** 来源连接池名称。 */
    poolName: string;
    /** 事件类型：连接选择（selection）或查询请求（request）。 */
    type: 'selection' | 'request';
    /** 操作标识（selection 类型时写入）。 */
    operation?: string;
    /** 本次请求耗时（毫秒），request 类型时写入。 */
    responseTime?: number;
    /** 请求是否成功，request 类型时写入。 */
    success?: boolean;
    /** 事件发生时的 Unix 时间戳（毫秒）。 */
    timestamp: number;
}
