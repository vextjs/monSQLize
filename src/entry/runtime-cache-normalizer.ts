/**
 * Cache normalizer for the runtime constructor.
 *
 * Converts the `cache` option (plain config object, v1 CacheLike, or MemoryCache instance)
 * into a concrete CacheLike that the runtime can use internally.
 */

import {
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

export function normalizeRuntimeCache(
    cache?: Record<string, unknown> | MemoryCache | CacheLike,
): CacheLike {
    if (cache instanceof MemoryCache) return cache;
    if (isCacheLike(cache)) return cache;

    const input = (cache ?? {}) as Record<string, unknown>;

    if (input.multiLevel === true) {
        const localOpts = (input.local ?? {}) as Record<string, unknown>;
        const local = new MemoryCache({
            maxEntries: toOptionalNumber(localOpts.maxEntries ?? localOpts.maxSize),
            maxMemory: toOptionalNumber(localOpts.maxMemory),
            defaultTtl: toOptionalNumber(localOpts.defaultTtl ?? localOpts.ttl),
            enableStats: toOptionalBoolean(localOpts.enableStats),
            enableTags: toOptionalBoolean(localOpts.enableTags),
            cleanupInterval: toOptionalNumber(localOpts.cleanupInterval),
            enabled: toOptionalBoolean(localOpts.enabled),
        });
        const remoteInput = input.remote;
        const remote = isCacheLike(remoteInput)
            ? remoteInput
            : remoteInput
                ? new MemoryCache({
                    maxEntries: toOptionalNumber((remoteInput as Record<string, unknown>).maxEntries ?? (remoteInput as Record<string, unknown>).maxSize),
                    maxMemory: toOptionalNumber((remoteInput as Record<string, unknown>).maxMemory),
                    defaultTtl: toOptionalNumber((remoteInput as Record<string, unknown>).defaultTtl ?? (remoteInput as Record<string, unknown>).ttl),
                    enableStats: toOptionalBoolean((remoteInput as Record<string, unknown>).enableStats),
                    enableTags: toOptionalBoolean((remoteInput as Record<string, unknown>).enableTags),
                    cleanupInterval: toOptionalNumber((remoteInput as Record<string, unknown>).cleanupInterval),
                    enabled: toOptionalBoolean((remoteInput as Record<string, unknown>).enabled),
                })
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
            publish: input.publish as ((msg: { type: string; pattern: string; ts: number }) => void) | undefined,
        });
    }

    return new MemoryCache({
        maxEntries: toOptionalNumber(input.maxEntries ?? input.maxSize),
        maxMemory: toOptionalNumber(input.maxMemory),
        defaultTtl: toOptionalNumber(input.defaultTtl ?? input.ttl),
        enableStats: toOptionalBoolean(input.enableStats),
        enableTags: toOptionalBoolean(input.enableTags),
        cleanupInterval: toOptionalNumber(input.cleanupInterval),
        enabled: toOptionalBoolean(input.enabled),
    });
}
