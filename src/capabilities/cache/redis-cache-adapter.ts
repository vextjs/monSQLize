import { createRedisCacheAdapter as createHubRedisCacheAdapter } from 'cache-hub';
import { createError, ErrorCodes } from '../../core/errors';
import type {
    CacheLike,
    RedisCacheAdapterOptions,
    RedisLike,
} from '../../../types/runtime';

type HubRedisCacheAdapter = CacheLike & {
    close?: () => Promise<void>;
    getRedisInstance(): object;
    getMany?(keys: string[]): Promise<Record<string, unknown>>;
    setMany?(values: Record<string, unknown>, ttl?: number): Promise<unknown>;
    delMany?(keys: string[]): Promise<number>;
    delPattern?(pattern: string): Promise<number>;
    keys?(pattern?: string): Promise<string[]>;
};

type PipelineTask = {
    run(): Promise<unknown>;
};

type PrefixState = {
    prefix: string;
    rawClient: RedisLike | null;
};

/**
 * 基于 cache-hub 的 Redis 适配器兼容层。
 *
 * 兼容目标：
 * - 保留 monSQLize 既有的 `prefix` 配置语义。
 * - 保留 `getRedisInstance()` 返回原始 redis client 的能力。
 * - 兼容测试里使用的 fake redis client（缺少 pipeline / varargs mget 时自动补齐）。
 */
export function createRedisCacheAdapter(
    redisUrlOrInstance: string | RedisLike | RedisCacheAdapterOptions,
    adapterOptions: Record<string, unknown> = {},
): CacheLike & { getRedisInstance(): RedisLike; } {
    const { hubInput, prefixState } = resolveRedisClientInput(redisUrlOrInstance, adapterOptions);
    const hubAdapter = createHubRedisCacheAdapter(hubInput) as HubRedisCacheAdapter;

    if (!prefixState.prefix) {
        return Object.assign(hubAdapter, {
            delete(key: string) {
                return Promise.resolve(hubAdapter.del?.(key)).then(Boolean);
            },
            getRedisInstance() {
                return (prefixState.rawClient ?? hubAdapter.getRedisInstance()) as RedisLike;
            },
        });
    }

    return createPrefixedAdapter(hubAdapter, prefixState);
}

function resolveRedisClientInput(
    redisUrlOrInstance: string | RedisLike | RedisCacheAdapterOptions,
    adapterOptions: Record<string, unknown>,
): {
    hubInput: string | object;
    prefixState: PrefixState;
} {
    if (typeof redisUrlOrInstance === 'string') {
        return {
            hubInput: redisUrlOrInstance,
            prefixState: {
                prefix: String(adapterOptions.prefix ?? ''),
                rawClient: null,
            },
        };
    }

    if (redisUrlOrInstance && typeof redisUrlOrInstance === 'object' && 'client' in redisUrlOrInstance && (redisUrlOrInstance as RedisCacheAdapterOptions).client) {
        const options = redisUrlOrInstance as RedisCacheAdapterOptions;
        const client = options.client as RedisLike;
        return {
            hubInput: normalizeRedisClient(client),
            prefixState: {
                prefix: String(options.prefix ?? ''),
                rawClient: client,
            },
        };
    }

    if (redisUrlOrInstance && typeof redisUrlOrInstance === 'object') {
        return {
            hubInput: normalizeRedisClient(redisUrlOrInstance as RedisLike),
            prefixState: {
                prefix: String(adapterOptions.prefix ?? ''),
                rawClient: redisUrlOrInstance as RedisLike,
            },
        };
    }

    throw createError(ErrorCodes.INVALID_ARGUMENT, 'redisUrlOrInstance must be a Redis URL string or Redis client instance.');
}

function createPrefixedAdapter(
    hubAdapter: HubRedisCacheAdapter,
    prefixState: PrefixState,
): CacheLike & { getRedisInstance(): RedisLike; } {
    const withPrefix = (key: string) => `${prefixState.prefix}${key}`;
    const stripPrefix = (key: string) => key.startsWith(prefixState.prefix) ? key.slice(prefixState.prefix.length) : key;

    return {
        async get(key: string) {
            return hubAdapter.get(withPrefix(key));
        },
        async set(key: string, value: unknown, ttl = 0) {
            return hubAdapter.set(withPrefix(key), value, ttl);
        },
        async del(key: string) {
            return Promise.resolve(hubAdapter.del?.(withPrefix(key))).then(Boolean);
        },
        async delete(key: string) {
            return Promise.resolve(hubAdapter.del?.(withPrefix(key))).then(Boolean);
        },
        async exists(key: string) {
            return Promise.resolve(hubAdapter.exists?.(withPrefix(key))).then(Boolean);
        },
        async getMany(keys: string[]) {
            const prefixedKeys = keys.map(withPrefix);
            const values = await Promise.resolve(hubAdapter.getMany?.(prefixedKeys) ?? {});
            const output: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(values)) {
                output[stripPrefix(key)] = value;
            }
            return output;
        },
        async setMany(values: Record<string, unknown>, ttl = 0) {
            const prefixedValues: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(values)) {
                prefixedValues[withPrefix(key)] = value;
            }
            return Promise.resolve(hubAdapter.setMany?.(prefixedValues, ttl) ?? true).then(() => true);
        },
        async delMany(keys: string[]) {
            return Number(await Promise.resolve(hubAdapter.delMany?.(keys.map(withPrefix)) ?? 0));
        },
        async delPattern(pattern = '*') {
            return Number(await Promise.resolve(hubAdapter.delPattern?.(withPrefix(pattern)) ?? 0));
        },
        async clear() {
            await Promise.resolve(hubAdapter.clear?.());
        },
        async keys(pattern = '*') {
            const keys = await Promise.resolve(hubAdapter.keys?.(withPrefix(pattern)) ?? []);
            return keys.map(stripPrefix);
        },
        async close() {
            await Promise.resolve(hubAdapter.close?.());
        },
        getRedisInstance() {
            return (prefixState.rawClient ?? hubAdapter.getRedisInstance()) as RedisLike;
        },
    };
}

function normalizeRedisClient(client: RedisLike): object {
    const get = bindMethod(client, 'get');
    const del = bindMethod(client, 'del');
    const exists = bindMethod(client, 'exists');
    const scan = bindMethod(client, 'scan');
    const flushdb = optionalMethod(client, 'flushdb');
    const quit = optionalMethod(client, 'quit');
    const on = optionalMethod(client, 'on');
    const publish = optionalMethod(client, 'publish');
    const subscribe = optionalMethod(client, 'subscribe');
    const unsubscribe = optionalMethod(client, 'unsubscribe');

    const set = (key: string, value: string, ...args: Array<string | number>) => {
        if (args[0] === 'PX' && typeof args[1] === 'number' && client.psetex) {
            return client.psetex(key, args[1], value);
        }
        return client.set(key, value);
    };

    const mget = (...keys: string[]) => {
        if (client.mget) {
            const invokeMget = client.mget as unknown as {
                (keys: string[]): unknown;
                (...items: string[]): unknown;
            };
            return client.mget.length <= 1
                ? invokeMget(keys)
                : invokeMget(...keys);
        }
        return Promise.all(keys.map(async (key) => {
            const value = await Promise.resolve(client.get(key));
            return value ?? null;
        }));
    };

    const pipeline = () => client.pipeline ? client.pipeline() : createPipelineShim(client, set);

    return {
        get,
        set,
        del,
        exists,
        mget,
        scan,
        flushdb,
        quit,
        on,
        publish,
        subscribe,
        unsubscribe,
        pipeline,
    };
}

function createPipelineShim(
    client: RedisLike,
    setImpl: (key: string, value: string, ...args: Array<string | number>) => unknown,
): { set(key: string, value: string, ...args: Array<string | number>): unknown; del(...keys: string[]): unknown; exec(): Promise<Array<unknown>>; } {
    const tasks: PipelineTask[] = [];
    return {
        set(key: string, value: string, ...args: Array<string | number>) {
            tasks.push({
                run: async () => Promise.resolve(setImpl(key, value, ...args)),
            });
            return this;
        },
        del(...keys: string[]) {
            tasks.push({
                run: async () => Promise.resolve(client.del(...keys)),
            });
            return this;
        },
        async exec() {
            const results: Array<unknown> = [];
            for (const task of tasks) {
                results.push(await task.run());
            }
            return results;
        },
    };
}

function bindMethod<T extends keyof RedisLike>(client: RedisLike, key: T) {
    const method = client[key];
    if (typeof method !== 'function') {
        throw createError(ErrorCodes.INVALID_CONFIG, `Redis client must implement ${String(key)}().`);
    }
    return (...args: unknown[]) => (method as (...callArgs: unknown[]) => unknown).apply(client, args);
}

function optionalMethod<T extends keyof RedisLike>(client: RedisLike, key: T) {
    const method = client[key];
    if (typeof method !== 'function') {
        return undefined;
    }
    return (...args: unknown[]) => (method as (...callArgs: unknown[]) => unknown).apply(client, args);
}
