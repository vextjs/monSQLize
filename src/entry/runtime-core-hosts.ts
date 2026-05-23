import type { CacheLike, MemoryCache } from '../capabilities/cache';
import type { Logger } from '../core/logger';
import { ErrorCodes, createError } from '../core/errors';
import type { MonSQLizeOptions } from '../../types/monsqlize';
import type { MongoDbAccessor as DbFacade } from '../adapters/mongodb/common/accessors';
import type { RuntimeDefaults } from '../types/internal/query';
import type { ConnectResult, ScopedUseResult } from '../types/internal/runtime';
import type { RuntimeAdapterBridgeHost } from './runtime-admin-bridge';
import { createRuntimeAccessors, type RuntimeDbFacadeHost } from './runtime-db-facade';
import { createRuntimeModelHost, type RuntimeModelHost } from './runtime-model';

type RuntimeCoreAdapterBridgeState = {
    options: MonSQLizeOptions;
    _cache: CacheLike;
    _adapterCacheOverride: CacheLike | null | undefined;
} & Pick<
    RuntimeAdapterBridgeHost,
    '_defaultDb' | '_client' | '_iidCache' | '_runtimeDefaults' | '_slowQueryLogManager' |
    'initializeSlowQueryLogManager' | 'ensureConnected' | 'db' | 'emit'
>;

type RuntimeCoreDbFacadeState = {
    options: MonSQLizeOptions;
    _client: RuntimeDbFacadeHost['_client'] | null;
    _logger: Logger;
    _cache: CacheLike;
    _adapterCacheOverride: CacheLike | null | undefined;
    _runtimeDefaults: RuntimeDefaults;
};

type RuntimeCoreModelState = {
    options: MonSQLizeOptions;
    _modelInstances: MemoryCache;
    scopedCollection<TDocument = Record<string, unknown>>(
        name: string,
        options?: { database?: string; pool?: string },
    ): unknown;
};

type RuntimeCoreAccessorsState = {
    _defaultDb: DbFacade | null;
    _iidCache: MemoryCache | null;
    db(name?: string): DbFacade;
    use(name: string): ScopedUseResult;
};

function resolveAdapterCache(state: { _cache: CacheLike; _adapterCacheOverride: CacheLike | null | undefined }): CacheLike | null {
    return state._adapterCacheOverride === undefined ? state._cache : state._adapterCacheOverride;
}

export function createRuntimeCoreAdapterBridgeHost(runtime: unknown): RuntimeAdapterBridgeHost {
    const state = runtime as RuntimeCoreAdapterBridgeState;
    return {
        options: state.options,
        get _defaultDb() { return state._defaultDb; },
        get _client() { return state._client; },
        get _iidCache() { return state._iidCache; },
        set _iidCache(value) { state._iidCache = value; },
        _runtimeDefaults: state._runtimeDefaults,
        get _slowQueryLogManager() { return state._slowQueryLogManager; },
        resolveAdapterCache: () => resolveAdapterCache(state),
        setAdapterCache: (value) => {
            state._adapterCacheOverride = value;
        },
        initializeSlowQueryLogManager: () => state.initializeSlowQueryLogManager(),
        ensureConnected: () => state.ensureConnected(),
        db: (name?: string) => state.db(name),
        emit: (event: string, payload: unknown) => state.emit(event, payload),
    };
}

export function createRuntimeCoreDbFacadeHost(runtime: unknown): RuntimeDbFacadeHost {
    const state = runtime as RuntimeCoreDbFacadeState;
    if (!state._client) {
        throw createError(ErrorCodes.NOT_CONNECTED, 'MonSQLize is not connected yet.');
    }
    return {
        options: state.options,
        _client: state._client,
        _logger: state._logger,
        _runtimeDefaults: state._runtimeDefaults,
        resolveAdapterCache: () => resolveAdapterCache(state),
    };
}

export function createRuntimeCoreModelHost(runtime: unknown): RuntimeModelHost {
    const state = runtime as RuntimeCoreModelState;
    return createRuntimeModelHost({
        options: state.options,
        modelInstances: state._modelInstances,
        runtime,
        scopedCollection: (name, options) => state.scopedCollection(name, options),
    });
}

export function createRuntimeCoreAccessors<TRuntime extends object>(runtime: TRuntime): ConnectResult<TRuntime> {
    const state = runtime as TRuntime & RuntimeCoreAccessorsState;
    return createRuntimeAccessors({
        defaultDb: state._defaultDb!,
        runtime,
        db: (name?: string) => state.db(name),
        use: (name: string) => state.use(name),
        getIidCache: () => state._iidCache,
        setIidCache: (value) => {
            state._iidCache = value;
        },
    });
}