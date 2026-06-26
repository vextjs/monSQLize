/**
 * Short-lived cache invalidation barrier helpers.
 *
 * The barrier is intentionally small and cache-backed: writers mark a namespace
 * dirty before clearing old read-cache entries, and readers bypass cache while
 * the marker exists. This narrows crash windows without claiming DB/cache atomicity.
 */

export const DEFAULT_CACHE_INVALIDATION_BARRIER_TTL_MS = 5000;

export type CacheInvalidationBarrierCache = {
    get?(key: string): unknown | Promise<unknown>;
    set?(key: string, value: unknown, ttl: number): unknown | Promise<unknown>;
    del?(key: string): unknown | Promise<unknown>;
    delete?(key: string): unknown | Promise<unknown>;
};

const READ_CACHE_PATTERN_PREFIXES = new Set([
    'find',
    'findOne',
    'count',
    'findOneById',
    'findByIds',
    'findPage',
    'findPageTotals',
    'aggregate',
    'distinct',
]);

export function buildCacheInvalidationBarrierKey(namespace: string): string {
    return `cacheDirty:${namespace}`;
}

export function extractCacheInvalidationBarrierNamespaces(values: Iterable<string>): string[] {
    const namespaces = new Set<string>();
    for (const value of values) {
        if (!value) {
            continue;
        }
        if (!value.includes('*')) {
            namespaces.add(value);
            continue;
        }
        const match = /^([^:]+):(.+):\*$/.exec(value);
        if (match && READ_CACHE_PATTERN_PREFIXES.has(match[1])) {
            namespaces.add(match[2]);
        }
    }
    return [...namespaces];
}

export async function markCacheInvalidationBarrier(
    cache: CacheInvalidationBarrierCache | null | undefined,
    namespacesOrPatterns: Iterable<string>,
    ttl = DEFAULT_CACHE_INVALIDATION_BARRIER_TTL_MS,
): Promise<string[]> {
    if (!cache?.set) {
        return [];
    }
    const namespaces = extractCacheInvalidationBarrierNamespaces(namespacesOrPatterns);
    const marker = { dirty: true, ts: Date.now() };
    for (const namespace of namespaces) {
        await Promise.resolve(cache.set(buildCacheInvalidationBarrierKey(namespace), marker, ttl));
    }
    return namespaces;
}

export async function clearCacheInvalidationBarrier(
    cache: CacheInvalidationBarrierCache | null | undefined,
    namespacesOrPatterns: Iterable<string>,
): Promise<void> {
    if (!cache) {
        return;
    }
    const remove = cache.del ?? cache.delete;
    if (!remove) {
        return;
    }
    const namespaces = extractCacheInvalidationBarrierNamespaces(namespacesOrPatterns);
    for (const namespace of namespaces) {
        await Promise.resolve(remove.call(cache, buildCacheInvalidationBarrierKey(namespace)));
    }
}

export async function isCacheInvalidationBarrierActive(
    cache: CacheInvalidationBarrierCache | null | undefined,
    namespaces: Iterable<string>,
): Promise<boolean> {
    if (!cache?.get) {
        return false;
    }
    for (const namespace of namespaces) {
        const value = await Promise.resolve(cache.get(buildCacheInvalidationBarrierKey(namespace)));
        if (value !== undefined && value !== null && value !== false) {
            return true;
        }
    }
    return false;
}
