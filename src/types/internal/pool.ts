/**
 * Internal domain types for the pool capability layer.
 *
 * Extracts pure data structures from pool/index.ts that are unrelated to logic,
 * enabling cross-module sharing and independent maintenance without mixing
 * interface definitions into the capability file.
 */

/**
 * Statistics data structure for a single connection pool.
 * Maintained internally by PoolStatsManager and exposed read-only via getStats / getAllStats.
 */
export interface PoolStatsData {
    /** Current active connection count. */
    connections: number;
    /** Current available (idle) connection count. */
    available: number;
    /** Current number of requests waiting for a connection. */
    waiting: number;
    /** Cumulative total request count (includes selection and actual query requests). */
    totalRequests: number;
    /** Cumulative successful request count. */
    successRequests: number;
    /** Cumulative failed request count. */
    failedRequests: number;
    /** Sum of all response times in milliseconds (used to compute the average). */
    totalResponseTime: number;
    /** Average response time in milliseconds. */
    avgResponseTime: number;
    /** Error rate (0–1) = failedRequests / totalRequests. */
    errorRate: number;
}

/**
 * Entry structure for PoolStatsManager's batch-write buffer.
 * Events are staged in the buffer before being flushed into the Map in bulk
 * on a timer, reducing Map operation frequency.
 */
export interface PoolBufferItem {
    /** Source pool name. */
    poolName: string;
    /** Event type: pool selection or query request. */
    type: 'selection' | 'request';
    /** Operation identifier (written for selection-type events). */
    operation?: string;
    /** Request duration in milliseconds (written for request-type events). */
    responseTime?: number;
    /** Whether the request succeeded (written for request-type events). */
    success?: boolean;
    /** Unix timestamp in milliseconds when the event occurred. */
    timestamp: number;
}
