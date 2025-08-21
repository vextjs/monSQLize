/**
 * 默认日志记录器工具类
 * 提供标准的日志记录功能，支持不同级别的日志输出
 */
module.exports = class Logger {

    /**
     * 创建日志记录器实例
     * @param {Object} [customLogger] - 自定义日志记录器
     * @param {Function} customLogger.debug - debug级别日志方法
     * @param {Function} customLogger.info - info级别日志方法
     * @param {Function} customLogger.warn - warn级别日志方法
     * @param {Function} customLogger.error - error级别日志方法
     * @returns {Object} 日志记录器对象
     */
    static create(customLogger) {
        if (customLogger && this.isValidLogger(customLogger)) {
            return customLogger;
        }

        return this.createDefaultLogger();
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
     * 创建默认的控制台日志记录器
     * @returns {Object} 默认日志记录器对象
     */
    static createDefaultLogger() {
        return {
            debug: (msg, ...args) => console.debug(`[DEBUG] ${msg}`, ...args),
            info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
            warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
            error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args)
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
}