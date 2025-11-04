/**
 * 统一常量定义
 * 集中管理所有魔法数字和配置常量
 */

module.exports = {
    // 缓存相关
    CACHE: {
        DEFAULT_MAX_SIZE: 100000,           // 默认最大缓存条目数
        DEFAULT_MAX_MEMORY: 0,              // 默认最大内存（字节），0 表示不限制
        TOTALS_INFLIGHT_WINDOW_MS: 5000,   // totals 去重窗口（毫秒）
        REMOTE_TIMEOUT_MS: 50,              // 远端缓存操作超时（毫秒）
    },

    // 查询相关
    QUERY: {
        DEFAULT_SLOW_QUERY_MS: 500,         // 慢查询阈值（毫秒）
        DEFAULT_FIND_LIMIT: 10,             // find 默认 limit
        DEFAULT_FINDPAGE_MAX_LIMIT: 500,    // findPage 最大 limit
        DEFAULT_MAX_TIME_MS: 30000,         // 默认查询超时（毫秒）
    },

    // 分页相关
    PAGINATION: {
        DEFAULT_STEP: 10,                   // 书签密度：每隔多少页存一个书签
        DEFAULT_MAX_HOPS: 20,               // 单次跳页最大 hops
        DEFAULT_MAX_SKIP: 50000,            // offset 跳页最大 skip
    },

    // 流式查询相关
    STREAM: {
        DEFAULT_BATCH_SIZE: 1000,           // 流式查询默认批次大小
    },

    // 连接相关
    CONNECTION: {
        DEFAULT_POOL_SIZE: 10,              // 默认连接池大小
        CONNECTION_TIMEOUT_MS: 30000,       // 连接超时（毫秒）
    },

    // 命名空间相关
    NAMESPACE: {
        DEFAULT_SCOPE: 'database',          // 默认命名空间范围
        BOOKMARK_PREFIX: 'bm:',             // 书签键前缀
        TOTALS_PREFIX: 'tot:',              // 总数键前缀
    },

    // 日志相关
    LOG: {
        MAX_QUERY_SHAPE_LENGTH: 1000,      // 查询形状最大长度（日志）
        MAX_ERROR_MESSAGE_LENGTH: 500,     // 错误消息最大长度
    },
};

