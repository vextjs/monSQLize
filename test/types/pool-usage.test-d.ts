import { expectAssignable, expectType } from 'tsd';
import MonSQLize, {
    type ConnectionPoolManagerOptions,
    type PoolConfig,
    type PoolHealthStatus,
    type PoolRole,
    type PoolStats,
    type PoolStrategy,
} from 'monsqlize';

const role: PoolRole = 'analytics';
const strategy: PoolStrategy = 'auto';
const poolConfig: PoolConfig = {
    name: 'analytics',
    uri: 'mongodb://analytics-host:27017',
    role,
    tags: ['reporting'],
};

expectAssignable<ConnectionPoolManagerOptions>({
    pools: [poolConfig],
    poolStrategy: strategy,
    poolFallback: { enabled: true, fallbackStrategy: 'primary' },
    maxPoolsCount: 5,
});

const runtime = new MonSQLize({
    type: 'mongodb',
    databaseName: 'app',
    config: { uri: 'mongodb://localhost:27017' },
    pools: [poolConfig],
    poolStrategy: strategy,
    maxPoolsCount: 5,
});

expectType<{ collection: <TSchema = unknown>(name: string) => import('monsqlize').Collection<TSchema>; model: <TDocument = Record<string, unknown>>(name: string) => import('monsqlize').ModelAccessor<TDocument>; use: (dbName: string) => { collection: <TSchema = unknown>(name: string) => import('monsqlize').Collection<TSchema>; model: <TDocument = Record<string, unknown>>(name: string) => import('monsqlize').ModelAccessor<TDocument>; }; }>(runtime.pool('analytics'));

const manager = new MonSQLize.ConnectionPoolManager({ pools: [poolConfig] });
expectType<Record<string, PoolHealthStatus>>(manager.getHealthStatus());
expectType<Record<string, PoolStats>>(manager.getPoolStats());

