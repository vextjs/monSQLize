import { createRedisCacheAdapter as createHubRedisCacheAdapter } from 'cache-hub/redis';
import { createError, ErrorCodes } from '../../core/errors';

const LEGACY_INVALID_REDIS_ARG_ERROR = 'redisUrlOrInstance 必须是 Redis URL 字符串或 ioredis 实例';
const LEGACY_IOREDIS_MISSING_ERROR = 'ioredis 未安装。请运行: npm install ioredis\n或传入已创建的 ioredis 实例';

function isMissingIoredisError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    return error.message.includes('ioredis')
        && (error.message.includes('Cannot find module') || error.message.includes('not installed'));
}

function createLegacyRedisError(message: string, code: string = ErrorCodes.INVALID_ARGUMENT) {
    return createError(code, message);
}

/**
 * v1 兼容的 Redis 缓存适配器工厂。
 *
 * v2 运行时由 `cache-hub` 驱动，但这里保留旧版参数校验与错误文案，
 * 让下游服务无需修改启动路径的错误处理逻辑。
 */
export function createRedisCacheAdapter(redisUrlOrInstance: string | object | undefined) {
    if (typeof redisUrlOrInstance === 'string') {
        const redisUrl = redisUrlOrInstance.trim();
        if (!redisUrl) {
            throw createLegacyRedisError(LEGACY_INVALID_REDIS_ARG_ERROR);
        }

        try {
            return createHubRedisCacheAdapter(redisUrl);
        } catch (error) {
            if (isMissingIoredisError(error)) {
                throw createLegacyRedisError(LEGACY_IOREDIS_MISSING_ERROR, ErrorCodes.CACHE_UNAVAILABLE);
            }
            throw error;
        }
    }

    if (redisUrlOrInstance && typeof redisUrlOrInstance === 'object') {
        return createHubRedisCacheAdapter(redisUrlOrInstance);
    }

    throw createLegacyRedisError(LEGACY_INVALID_REDIS_ARG_ERROR);
}
