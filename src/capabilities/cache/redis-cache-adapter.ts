import { createError, ErrorCodes } from '../../core/errors';
import type {
    CacheLike,
    RedisCacheAdapterOptions,
} from '../../../types/runtime';

export interface RedisLike {
    get(key: string): Promise<string | null> | string | null;
    pttl?(key: string): Promise<number> | number;
    set(key: string, value: string): Promise<unknown> | unknown;
    psetex?(key: string, ttl: number, value: string): Promise<unknown> | unknown;
    del(...keys: string[]): Promise<number> | number;
    exists(key: string): Promise<number | boolean> | number | boolean;
    mget?(keys: string[]): Promise<Array<string | null>> | Array<string | null>;
    scan?(cursor: string, ...args: Array<string | number>): Promise<[string, string[]]> | [string, string[]];
    flushdb?(): Promise<unknown> | unknown;
    quit?(): Promise<unknown> | unknown;
    on?(event: string, handler: (...args: unknown[]) => void): void;
    publish?(channel: string, message: string): Promise<unknown> | unknown;
    subscribe?(channel: string, handler?: (error?: Error | null) => void): Promise<unknown> | unknown;
    unsubscribe?(channel: string): Promise<unknown> | unknown;
    pipeline?(): {
        get(key: string): unknown;
        pttl(key: string): unknown;
        set(key: string, value: string): unknown;
        psetex(key: string, ttl: number, value: string): unknown;
        exec(): Promise<Array<[unknown, unknown]>> | Array<[unknown, unknown]>;
    };
}

export function createRedisCacheAdapter(
    redisUrlOrInstance: string | RedisLike | RedisCacheAdapterOptions,
    adapterOptions: Record<string, unknown> = {},
): CacheLike & { getRedisInstance(): RedisLike; } {
    const { client, prefix, ownsConnection } = resolveRedisClient(redisUrlOrInstance, adapterOptions);
    const withPrefix = (key: string) => `${prefix}${key}`;
    const stripPrefix = (key: string) => key.startsWith(prefix) ? key.slice(prefix.length) : key;

    const getValue = async (key: string) => {
        const value = await Promise.resolve(client.get(withPrefix(key)));
        if (value === null || value === undefined) {
            return null;
        }
        try {
            return JSON.parse(String(value));
        } catch {
            return null;
        }
    };

    const keysFn = async (pattern = '*') => {
        const prefixedPattern = withPrefix(pattern);
        const keys: string[] = [];
        if (client.scan) {
            let cursor = '0';
            do {
                const [nextCursor, foundKeys] = await Promise.resolve(client.scan(cursor, 'MATCH', prefixedPattern, 'COUNT', 100));
                cursor = nextCursor;
                keys.push(...foundKeys.map(stripPrefix));
            } while (cursor !== '0');
            return keys;
        }

        throw createError(ErrorCodes.INVALID_CONFIG, 'Redis cache adapter requires scan() support for keys().');
    };

    const delManyFn = async (keys: string[]) => {
        if (keys.length === 0) {
            return 0;
        }
        return Number(await Promise.resolve(client.del(...keys.map(withPrefix))));
    };

    return {
        get: getValue,
        async set(key: string, value: unknown, ttl = 0) {
            const payload = JSON.stringify(value);
            if (ttl > 0 && client.psetex) {
                await Promise.resolve(client.psetex(withPrefix(key), ttl, payload));
            } else {
                await Promise.resolve(client.set(withPrefix(key), payload));
            }
            return true;
        },
        async del(key: string) {
            const deleted = await Promise.resolve(client.del(withPrefix(key)));
            return Number(deleted) > 0;
        },
        async delete(key: string) {
            const deleted = await Promise.resolve(client.del(withPrefix(key)));
            return Number(deleted) > 0;
        },
        async exists(key: string) {
            const exists = await Promise.resolve(client.exists(withPrefix(key)));
            return typeof exists === 'boolean' ? exists : Number(exists) > 0;
        },
        async getMany(keys: string[]) {
            const values: Record<string, unknown> = {};
            if (keys.length === 0) {
                return values;
            }

            if (client.mget) {
                const response = await Promise.resolve(client.mget(keys.map(withPrefix)));
                keys.forEach((key, index) => {
                    const raw = response[index];
                    if (raw === null || raw === undefined) {
                        return;
                    }
                    try {
                        values[key] = JSON.parse(String(raw));
                    } catch {
                        // ignore broken value
                    }
                });
                return values;
            }

            for (const key of keys) {
                const value = await getValue(key);
                if (value !== undefined) {
                    values[key] = value;
                }
            }
            return values;
        },
        async setMany(values: Record<string, unknown>, ttl = 0) {
            for (const [key, value] of Object.entries(values)) {
                await this.set(key, value, ttl);
            }
            return true;
        },
        delMany: delManyFn,
        async delPattern(pattern: string) {
            const keys = await keysFn(pattern);
            return delManyFn(keys);
        },
        async clear() {
            if (client.flushdb) {
                await Promise.resolve(client.flushdb());
            } else {
                const keys = await keysFn('*');
                await delManyFn(keys);
            }
        },
        keys: keysFn,
        async close() {
            if (ownsConnection && client.quit) {
                await Promise.resolve(client.quit());
            }
        },
        getRedisInstance() {
            return client;
        },
    };
}

function resolveRedisClient(
    redisUrlOrInstance: string | RedisLike | RedisCacheAdapterOptions,
    adapterOptions: Record<string, unknown>,
): { client: RedisLike; prefix: string; ownsConnection: boolean; } {
    if (typeof redisUrlOrInstance === 'string') {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const IORedis = require('ioredis');
            return {
                client: new IORedis(redisUrlOrInstance),
                prefix: String(adapterOptions.prefix ?? ''),
                ownsConnection: true,
            };
        } catch {
            throw createError(ErrorCodes.INVALID_CONFIG, 'ioredis is required to create a Redis cache adapter from URL.');
        }
    }

    if (redisUrlOrInstance && typeof redisUrlOrInstance === 'object' && 'client' in redisUrlOrInstance && (redisUrlOrInstance as RedisCacheAdapterOptions).client) {
        const options = redisUrlOrInstance as RedisCacheAdapterOptions;
        return {
            client: options.client as RedisLike,
            prefix: String(options.prefix ?? ''),
            ownsConnection: false,
        };
    }

    if (redisUrlOrInstance && typeof redisUrlOrInstance === 'object') {
        return {
            client: redisUrlOrInstance as RedisLike,
            prefix: String(adapterOptions.prefix ?? ''),
            ownsConnection: false,
        };
    }

    throw createError(ErrorCodes.INVALID_ARGUMENT, 'redisUrlOrInstance must be a Redis URL string or Redis client instance.');
}
