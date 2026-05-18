import {
    DEFAULT_SLOW_QUERY_LOG_CONFIG,
    SlowQueryLogConfigManager,
} from './slow-query-log-config';
import { BatchQueue } from './slow-query-log-batch-queue';
import { SlowQueryLogMemoryStorage, MongoDBSlowQueryLogStorage } from './slow-query-log-storage';
import { SlowQueryLogManager } from './slow-query-log-manager';
import {
    generateQueryHash,
    getSlowQueryThreshold,
    withSlowQueryLog,
} from './slow-query-log-records';

export type {
    SlowQueryLogConfig,
    SlowQueryLogConfigInput,
    SlowQueryLogEntry,
    SlowQueryLogFilter,
    SlowQueryLogQueryOptions,
    SlowQueryLogRecord,
    SlowQueryLogStorage,
    SlowQueryLogStorageConfig,
} from '../../../types/slow-query-log';
export {
    DEFAULT_SLOW_QUERY_LOG_CONFIG,
    BatchQueue,
    MongoDBSlowQueryLogStorage,
    SlowQueryLogMemoryStorage,
    SlowQueryLogConfigManager,
    SlowQueryLogManager,
    generateQueryHash,
    getSlowQueryThreshold,
    withSlowQueryLog,
};

