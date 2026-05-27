/**
 * Re-export of cache-hub MemoryCache with v1-compat `size` field added to getStats().
 *
 * v1 tests access `cache.getStats().size`; cache-hub returns `entries` instead.
 * This subclass adds `size` as an alias for `entries` to preserve the v1 API surface.
 */

import { MemoryCache as BaseMemoryCache } from 'cache-hub';
import type { LockManager } from 'cache-hub';

class MemoryCache extends BaseMemoryCache {
    private _compatLockManager: LockManager | null = null;

    override setLockManager(lockManager: LockManager): void {
        this._compatLockManager = lockManager;
        super.setLockManager(lockManager);
    }

    getLockManager(): LockManager | null {
        return this._compatLockManager;
    }

    override getStats() {
        const s = super.getStats();
        return { ...s, size: s.entries };
    }
}

export { MemoryCache };
