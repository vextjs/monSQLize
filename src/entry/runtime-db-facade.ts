import type { MongoClient } from 'mongodb';
import type { Logger } from '../core/logger';
import type { MemoryCache } from '../capabilities/cache';
import {
    MongoDbAccessor as DbFacadeImpl,
    MongoCollectionAccessor as CollectionFacade,
} from '../adapters/mongodb/common/accessors';
import type { RuntimeDefaults } from '../types/internal/query';
import type { ConnectResult, ScopedUseResult } from '../types/internal/runtime';
import type { MonSQLizeOptions } from '../../types/monsqlize';
import type { MongoDbAccessor as DbFacade } from '../adapters/mongodb/common/accessors';

export type RuntimeDbFacadeHost = {
    options: MonSQLizeOptions;
    _client: MongoClient;
    _logger: Logger;
    _runtimeDefaults: RuntimeDefaults;
    resolveAdapterCache(): MemoryCache | null;
};

type RuntimeAccessorConfig<TRuntime> = {
    defaultDb: DbFacade;
    runtime: TRuntime;
    db: (name?: string) => DbFacade;
    use: (name: string) => ScopedUseResult;
    getIidCache: () => Map<string, string> | null;
    setIidCache: (value: Map<string, string>) => void;
};

export function createRuntimeDbFacade(host: RuntimeDbFacadeHost, databaseName: string): DbFacade {
    return new DbFacadeImpl(
        databaseName,
        host._client.db(databaseName),
        {
            cache: host.resolveAdapterCache(),
            queryCache: host.resolveAdapterCache(),
            getCache: () => host.resolveAdapterCache(),
            getQueryCache: () => host.resolveAdapterCache(),
            logger: host._logger,
            defaults: host._runtimeDefaults,
            cacheAutoInvalidate: !!(host.options.cache as Record<string, unknown> | undefined)?.autoInvalidate,
        },
    ) as DbFacade;
}

export function resolveDatabaseName(options: MonSQLizeOptions): string {
    return (options as Record<string, unknown>)['database'] as string | undefined
        ?? options.databaseName
        ?? 'default';
}

export function createRuntimeAccessors<TRuntime>(config: RuntimeAccessorConfig<TRuntime>): ConnectResult<TRuntime> {
    return {
        collection: (name: string) => {
            if (!name || typeof name !== 'string' || !name.trim()) {
                const error = new Error('Collection name must be a non-empty string') as Error & { code: string };
                error.code = 'INVALID_COLLECTION_NAME';
                throw error;
            }
            if (!config.getIidCache()) {
                config.setIidCache(new Map<string, string>());
            }
            return config.defaultDb.collection(name) as CollectionFacade;
        },
        db: (name?: string) => config.db(name),
        use: (name: string) => config.use(name),
        instance: config.runtime,
    };
}
