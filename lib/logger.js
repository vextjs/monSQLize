/**
 * 默认日志记录器工具类
 * 提供标准的日志记录功能，支持不同级别的日志输出
 *
 * v2.0 新增功能：
 * - traceId 支持（用于分布式追踪）
 * - 结构化日志输出（JSON 格式）
 * - 上下文信息（数据库、集合、操作等）
 */

const crypto = require('crypto');

/**
 * 生成唯一的 traceId
 * @returns {string} 16 字符的唯一 ID
 */
function generateTraceId() {
    return crypto.randomBytes(8).toString('hex');
}

/**
 * 异步本地存储（用于在异步调用链中传递 traceId）
 */
let AsyncLocalStorage;
try {
    AsyncLocalStorage = require('async_hooks').AsyncLocalStorage;
} catch (e) {
    // Node.js < 12.17.0 不支持 AsyncLocalStorage
    AsyncLocalStorage = null;
}

const traceStorage = AsyncLocalStorage ? new AsyncLocalStorage() : null;

module.exports = class Logger {

    /**
     * 创建日志记录器实例
     * @param {Object} [customLogger] - 自定义日志记录器
     * @param {Function} customLogger.debug - debug级别日志方法
     * @param {Function} customLogger.info - info级别日志方法
     * @param {Function} customLogger.warn - warn级别日志方法
     * @param {Function} customLogger.error - error级别日志方法
     * @param {Object} [options] - 日志选项
     * @param {boolean} [options.structured=false] - 是否使用结构化日志（JSON）
     * @param {boolean} [options.enableTraceId=false] - 是否启用 traceId
     * @returns {Object} 日志记录器对象
     */
    static create(customLogger, options = {}) {
        if (customLogger && this.isValidLogger(customLogger)) {
            // 如果提供自定义 logger，包装它以支持新特性
            return this.wrapLogger(customLogger, options);
        }

        return this.createDefaultLogger(options);
    }

    /**
     * 验证自定义日志记录器是否有效
     * @param {Object} logger - 待验证的日志记录器
     * @returns {boolean} 是否为有效的日志记录器
     */
    static isValidLogger(logger) {
        const requiredMethods = ['debug', 'info', 'warn', 'error'];
        return requiredMethods.every(method =>
            typeof logger[method] === 'function'
        );
    }

    /**
     * 包装自定义 logger 以支持新特性
     * @param {Object} baseLogger - 基础 logger
     * @param {Object} options - 选项
     * @returns {Object} 包装后的 logger
     */
    static wrapLogger(baseLogger, options = {}) {
        const { structured = false, enableTraceId = false } = options;

        const wrap = (level) => (msg, ...args) => {
            const logData = this._prepareLogData(level, msg, args, { structured, enableTraceId });

            if (structured) {
                baseLogger[level](JSON.stringify(logData));
            } else {
                const prefix = enableTraceId && logData.traceId ? `[${logData.traceId}] ` : '';
                baseLogger[level](`${prefix}${msg}`, ...args);
            }
        };

        return {
            debug: wrap('debug'),
            info: wrap('info'),
            warn: wrap('warn'),
            error: wrap('error'),
            // 暴露 traceId 管理方法
            withTraceId: enableTraceId ? this.withTraceId : undefined,
            getTraceId: enableTraceId ? this.getTraceId : undefined,
        };
    }

    /**
     * 准备日志数据
     * @private
     */
    static _prepareLogData(level, msg, args, options) {
        const logData = {
            timestamp: new Date().toISOString(),
            level: level.toUpperCase(),
            message: msg,
        };

        // 添加 traceId
        if (options.enableTraceId) {
            const traceId = this.getTraceId();
            if (traceId) logData.traceId = traceId;
        }

        // 处理额外参数（上下文信息）
        if (args.length > 0) {
            const context = args[0];
            if (context && typeof context === 'object') {
                logData.context = context;
            }
        }

        return logData;
    }

    /**
     * 创建默认的控制台日志记录器
     * @param {Object} [options] - 日志选项
     * @returns {Object} 默认日志记录器对象
     */
    static createDefaultLogger(options = {}) {
        const { structured = false, enableTraceId = false } = options;

        const createLogFn = (level, consoleFn) => {
            return (msg, ...args) => {
                const logData = this._prepareLogData(level, msg, args, { structured, enableTraceId });

                if (structured) {
                    consoleFn(JSON.stringify(logData));
                } else {
                    const prefix = enableTraceId && logData.traceId ? `[${logData.traceId}] ` : '';
                    consoleFn(`[${level.toUpperCase()}] ${prefix}${msg}`, ...args);
                }
            };
        };

        return {
            debug: createLogFn('debug', console.debug),
            info: createLogFn('info', console.log),
            warn: createLogFn('warn', console.warn),
            error: createLogFn('error', console.error),
            // 暴露 traceId 管理方法
            withTraceId: enableTraceId ? this.withTraceId.bind(this) : undefined,
            getTraceId: enableTraceId ? this.getTraceId.bind(this) : undefined,
        };
    }

    /**
     * 创建带时间戳的日志记录器
     * @param {Object} [customLogger] - 自定义日志记录器
     * @returns {Object} 带时间戳的日志记录器
     */
    static createWithTimestamp(customLogger) {
        const baseLogger = this.create(customLogger);
        const getTimestamp = () => new Date().toISOString();

        return {
            debug: (msg, ...args) => baseLogger.debug(`${getTimestamp()} ${msg}`, ...args),
            info: (msg, ...args) => baseLogger.info(`${getTimestamp()} ${msg}`, ...args),
            warn: (msg, ...args) => baseLogger.warn(`${getTimestamp()} ${msg}`, ...args),
            error: (msg, ...args) => baseLogger.error(`${getTimestamp()} ${msg}`, ...args)
        };
    }

    /**
     * 创建静默日志记录器（不输出任何内容）
     * @returns {Object} 静默日志记录器
     */
    static createSilent() {
        const noop = () => {};
        return {
            debug: noop,
            info: noop,
            warn: noop,
            error: noop
        };
    }

    /**
     * 在指定的 traceId 上下文中运行函数
     * @param {Function} fn - 要执行的函数
     * @param {string} [traceId] - 可选的 traceId，不提供则自动生成
     * @returns {*} 函数执行结果
     */
    static withTraceId(fn, traceId = null) {
        if (!traceStorage) {
            // 不支持 AsyncLocalStorage，直接执行
            return fn();
        }

        const id = traceId || generateTraceId();
        return traceStorage.run(id, fn);
    }

    /**
     * 获取当前上下文的 traceId
     * @returns {string|null} traceId 或 null
     */
    static getTraceId() {
        if (!traceStorage) return null;
        return traceStorage.getStore() || null;
    }

    /**
     * 生成新的 traceId
     * @returns {string} 新的 traceId
     */
    static generateTraceId() {
        return generateTraceId();
    }
};


