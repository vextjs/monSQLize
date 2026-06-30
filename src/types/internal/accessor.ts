/**
 * Shared internal contract types for the accessor layer.
 *
 * Notes:
 * - Centralises the internal types shared during CollectionFacade / DbFacade assembly
 * - Prevents accumulation of anonymous inline types in the accessor layer;
 *   types here are reusable across runtime / accessor / test helpers
 * - Internal only; not part of the public API
 */

import type { Logger } from '../../core/logger';
import type { BookmarkCacheLike } from '../../adapters/mongodb/management';
import type { QueryCacheLike, RuntimeDefaults } from './query';

/**
 * Management options used during Collection accessor construction.
 */
export interface CollectionAccessorManagementOptions {
    cache?: BookmarkCacheLike | null;
    queryCache?: QueryCacheLike | null;
    getCache?: () => BookmarkCacheLike | null | undefined;
    getQueryCache?: () => QueryCacheLike | null | undefined;
    logger?: Logger;
    defaults?: RuntimeDefaults;
    cacheAutoInvalidate?: boolean;
    poolName?: string;
}

/**
 * Collection namespace view returned by `getNamespace()`.
 */
export interface CollectionNamespaceView {
    iid: string;
    type: 'mongodb';
    db: string;
    collection: string;
    pool?: string;
}
