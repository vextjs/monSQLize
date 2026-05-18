/**
 * accessor 层共享的内部契约类型。
 *
 * 说明：
 * - 这里集中 CollectionFacade / DbFacade 装配期共用的内部类型；
 * - 避免访问器层继续堆匿名 inline 类型，方便在 runtime / accessor / 测试辅助间复用；
 * - 仅服务内部实现，不属于公开 API。
 */

import type { Logger } from '../../core/logger';
import type { BookmarkCacheLike } from '../../adapters/mongodb/management';
import type { QueryCacheLike, RuntimeDefaults } from './query';

/**
 * Collection accessor 构造阶段使用的管理对象。
 */
export interface CollectionAccessorManagementOptions {
    cache?: BookmarkCacheLike | null;
    queryCache?: QueryCacheLike | null;
    getCache?: () => BookmarkCacheLike | null | undefined;
    getQueryCache?: () => QueryCacheLike | null | undefined;
    logger?: Logger;
    defaults?: RuntimeDefaults;
    cacheAutoInvalidate?: boolean;
}

/**
 * `getNamespace()` 返回的集合命名空间视图。
 */
export interface CollectionNamespaceView {
    iid: string;
    type: 'mongodb';
    db: string;
    collection: string;
}
