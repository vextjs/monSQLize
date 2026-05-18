import { MemoryCache as HubMemoryCache } from 'cache-hub';
import type {
    CacheLike,
    CacheLockLike,
    CacheStats,
    MemoryCacheOptions,
} from '../../../types/runtime';

export class MemoryCache implements CacheLike {
    private readonly _hub: HubMemoryCache;
    private _lockManager: CacheLockLike | null = null;
    private _calls = 0;

    constructor(options: MemoryCacheOptions = {}) {
        const { maxSize, ...rest } = options as MemoryCacheOptions & { maxSize?: number };
        this._hub = new HubMemoryCache({
            ...rest,
            maxEntries: (rest as Record<string, unknown>).maxEntries as number | undefined ?? maxSize,
        });
    }

    setLockManager(lockManager: CacheLockLike | null): void {
        this._lockManager = lockManager;
    }

    getLockManager(): CacheLockLike | null {
        return this._lockManager;
    }

    get(key: string): unknown {
        this._calls += 1;
        return this._hub.get(key);
    }

    set(key: string, value: unknown, ttl = 0): boolean {
        if (this._lockManager?.isLocked(key)) {
            return false;
        }
        this._hub.set(key, value, ttl);
        return true;
    }

    delete(key: string): boolean {
        return this._hub.del(key);
    }

    del(key: string): boolean {
        return this.delete(key);
    }

    exists(key: string): boolean {
        return this._hub.exists(key);
    }

    getMany(keys: string[]): Record<string, unknown> {
        const output: Record<string, unknown> = {};
        for (const key of keys) {
            const value = this.get(key);
            if (value !== undefined) {
                output[key] = value;
            }
        }
        return output;
    }

    setMany(values: Record<string, unknown>, ttl = 0): boolean {
        for (const [key, value] of Object.entries(values)) {
            this.set(key, value, ttl);
        }
        return true;
    }

    delMany(keys: string[]): number {
        let deleted = 0;
        for (const key of keys) {
            if (this.delete(key)) {
                deleted += 1;
            }
        }
        return deleted;
    }

    clear(): void {
        this._hub.clear();
    }

    keys(pattern = '*'): string[] {
        return this._hub.keys(pattern);
    }

    delPattern(pattern = '*'): number {
        return this._hub.delPattern(pattern);
    }

    getStats(): CacheStats {
        const s = this._hub.getStats();
        const calls = this._calls;
        return {
            hits: s.hits,
            misses: s.misses,
            calls,
            hitRate: calls > 0 ? s.hits / calls : 0,
            sets: s.sets,
            deletes: s.deletes,
            evictions: s.evictions,
            size: s.entries,
            memoryUsage: s.memoryUsage,
            memoryUsageMB: s.memoryUsageMB,
        };
    }

    resetStats(): void {
        this._hub.resetStats();
        this._calls = 0;
    }

    static getOrCreateCache(cache?: Record<string, unknown> | MemoryCache): MemoryCache {
        return cache instanceof MemoryCache ? cache : new MemoryCache(cache as MemoryCacheOptions);
    }
}
