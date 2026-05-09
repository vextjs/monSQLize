/**
 * P2-A 日志适配。
 *
 * 说明：
 * - 先恢复最小 logger 包装层，保持 custom logger 与默认 console logger 的兼容入口。
 * - traceId / structured log 等增强能力留待后续阶段按需补齐。
 */

export interface LoggerLike {
    debug?: (...args: unknown[]) => void;
    info?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
}

export class Logger {
    constructor(private readonly logger: LoggerLike | null = null) {}

    /**
     * 输出 debug 日志。
     * @since v1.3.0
     */
    debug(...args: unknown[]): void {
        this.logger?.debug?.(...args);
    }

    /**
     * 输出 info 日志。
     * @since v1.3.0
     */
    info(...args: unknown[]): void {
        this.logger?.info?.(...args);
    }

    /**
     * 输出 warn 日志。
     * @since v1.3.0
     */
    warn(...args: unknown[]): void {
        this.logger?.warn?.(...args);
    }

    /**
     * 输出 error 日志。
     * @since v1.3.0
     */
    error(...args: unknown[]): void {
        this.logger?.error?.(...args);
    }

    /**
     * 创建日志实例。
     * @since v1.3.0
     */
    static create(logger: LoggerLike | null = null): Logger {
        return new Logger(logger);
    }
}

