/**
 * Cache normalizer for the runtime constructor.
 *
 * Converts the `cache` option (plain config object, v1 CacheLike, or MemoryCache instance)
 * into a concrete CacheLike that the runtime can use internally.
 */

import {
    createRedisCacheAdapter,
    MemoryCache,
    MultiLevelCache,
    type CacheLike,
} from '../capabilities/cache';

function isCacheLike(value: unknown): value is CacheLike {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return typeof v['get'] === 'function' && typeof v['set'] === 'function' && typeof v['del'] === 'function';
}

function toOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

type RuntimeCachePublishMessage = {
    type: string;
    pattern?: string;
    tag?: string;
    ts: number;
};

type RuntimeCachePublish = (msg: RuntimeCachePublishMessage) => void;

function buildMemoryCache(input: unknown, fallback: Record<string, unknown> = {}): CacheLike {
    if (input instanceof MemoryCache) return input;
    if (isCacheLike(input)) return input;

    const opts = isObjectRecord(input) ? input : {};
    return new MemoryCache({
        maxEntries: toOptionalNumber(opts.maxEntries ?? opts.maxSize ?? fallback.maxEntries ?? fallback.maxSize),
        maxMemory: toOptionalNumber(opts.maxMemory ?? fallback.maxMemory),
        defaultTtl: toOptionalNumber(opts.defaultTtl ?? opts.ttl ?? fallback.defaultTtl ?? fallback.ttl),
        enableStats: toOptionalBoolean(opts.enableStats ?? fallback.enableStats),
        enableTags: toOptionalBoolean(opts.enableTags ?? fallback.enableTags),
        cleanupInterval: toOptionalNumber(opts.cleanupInterval ?? fallback.cleanupInterval),
        enabled: toOptionalBoolean(opts.enabled ?? fallback.enabled),
    });
}

function prefixKey(prefix: string | undefined, key: string): string {
    if (!prefix || key.startsWith(prefix)) return key;
    return `${prefix}${key}`;
}

function unprefixKey(prefix: string | undefined, key: string): string {
    if (!prefix || !key.startsWith(prefix)) return key;
    return key.slice(prefix.length);
}

function wrapRemoteCache(
    cache: CacheLike,
    options: { prefix?: string; defaultTtl?: number } = {},
): CacheLike {
    const prefix = typeof options.prefix === 'string' && options.prefix.length > 0
        ? options.prefix
        : undefined;
    const defaultTtl = options.defaultTtl;

    if (!prefix && defaultTtl === undefined) return cache;

    const key = (value: string) => prefixKey(prefix, value);
    const keys = (values: string[]) => values.map(key);
    const resolveTtl = (ttl: number | undefined) => ttl ?? defaultTtl;

    return new Proxy(cache, {
        get(target, prop, receiver) {
            switch (prop) {
                case 'get':
                    return (cacheKey: string) => target.get(key(cacheKey));
                case 'set':
                    return (cacheKey: string, value: unknown, ttl?: number) => target.set(key(cacheKey), value, resolveTtl(ttl));
                case 'del':
                    return (cacheKey: string) => target.del(key(cacheKey));
                case 'exists':
                    return (cacheKey: string) => target.exists(key(cacheKey));
                case 'has':
                    return (cacheKey: string) => target.has(key(cacheKey));
                case 'getMany':
                    return async (cacheKeys: string[]) => {
                        const result = await target.getMany(keys(cacheKeys));
                        return Object.fromEntries(
                            Object.entries(result).map(([cacheKey, value]) => [unprefixKey(prefix, cacheKey), value]),
                        );
                    };
                case 'setMany':
                    return (entries: Record<string, unknown>, ttl?: number) => target.setMany(
                        Object.fromEntries(
                            Object.entries(entries).map(([cacheKey, value]) => [key(cacheKey), value]),
                        ),
                        resolveTtl(ttl),
                    );
                case 'delMany':
                    return (cacheKeys: string[]) => target.delMany(keys(cacheKeys));
                case 'delPattern':
                    return (pattern: string) => target.delPattern(key(pattern));
                case 'keys':
                    return async (pattern?: string) => {
                        const result = await target.keys(pattern ? key(pattern) : undefined);
                        return result.map((cacheKey) => unprefixKey(prefix, cacheKey));
                    };
                default: {
                    const value = Reflect.get(target, prop, receiver) as unknown;
                    return typeof value === 'function' ? value.bind(target) : value;
                }
            }
        },
    });
}

function buildRedisCache(input: unknown): CacheLike | undefined {
    if (!input || !isObjectRecord(input)) return undefined;

    const prefix = typeof input.prefix === 'string' ? input.prefix : undefined;
    const defaultTtl = toOptionalNumber(input.defaultTtl ?? input.ttl);

    if (isCacheLike(input)) {
        return wrapRemoteCache(input, { prefix, defaultTtl });
    }

    if (input.enabled === false) return undefined;

    const embeddedCache = input.cache ?? input.adapter;
    if (isCacheLike(embeddedCache)) {
        return wrapRemoteCache(embeddedCache, { prefix, defaultTtl });
    }

    const redisTarget = input.url ?? input.uri ?? input.instance ?? input.client ?? input.redis;
    if (redisTarget === undefined && input.enabled !== true) {
        return undefined;
    }

    const redisCache = createRedisCacheAdapter(redisTarget as string | object | undefined);
    return wrapRemoteCache(redisCache, { prefix, defaultTtl });
}

function isVextCacheShape(input: Record<string, unknown>): boolean {
    return isObjectRecord(input.memory) || isObjectRecord(input.redis);
}

export function normalizeRuntimeCache(
    cache?: Record<string, unknown> | MemoryCache | CacheLike,
): CacheLike {
    if (cache instanceof MemoryCache) return cache;
    if (isCacheLike(cache)) return cache;

    const input = (cache ?? {}) as Record<string, unknown>;

    // vext compat: `cache: { memory, redis }` maps to cache-hub's local/remote model.
    if (isVextCacheShape(input)) {
        const memoryInput = isObjectRecord(input.memory) ? input.memory : {};
        const local = buildMemoryCache(
            input.memory,
            {
                ...input,
                enabled: memoryInput.enabled === false ? false : input.enabled,
            },
        );
        const remote = buildRedisCache(input.redis);
        const policy = (input.policy ?? {}) as Record<string, unknown>;
        return new MultiLevelCache({
            local,
            remote,
            writePolicy: (policy.writePolicy as 'both' | 'local-first-async-remote') ?? 'both',
            backfillOnRemoteHit: (policy.backfillLocalOnRemoteHit as boolean | undefined) ?? true,
            remoteTimeoutMs: isObjectRecord(input.redis)
                ? toOptionalNumber(input.redis.timeoutMs)
                : undefined,
            publish: input.publish as RuntimeCachePublish | undefined,
        });
    }

    // v1 compat: `cache: { local, remote, policy }` without explicit `multiLevel: true`
    if (input.multiLevel === true || (input.local !== undefined && typeof input.local === 'object')) {
        const local = buildMemoryCache(input.local);
        const remoteInput = input.remote;
        const remote = isCacheLike(remoteInput)
            ? remoteInput
            : remoteInput
                ? buildMemoryCache(remoteInput)
                : undefined;
        const policy = (input.policy ?? {}) as Record<string, unknown>;
        return new MultiLevelCache({
            local,
            remote,
            writePolicy: (policy.writePolicy as 'both' | 'local-first-async-remote') ?? 'both',
            backfillOnRemoteHit: (policy.backfillLocalOnRemoteHit as boolean | undefined) ?? true,
            remoteTimeoutMs: remoteInput && !isCacheLike(remoteInput)
                ? toOptionalNumber((remoteInput as Record<string, unknown>).timeoutMs)
                : undefined,
            publish: input.publish as RuntimeCachePublish | undefined,
        });
    }

    return buildMemoryCache(input);
}
