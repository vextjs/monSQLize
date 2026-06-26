import type {
    SyncChangeEvent,
    SyncIdempotencyConfig,
    SyncIdempotencyMarkMode,
    SyncIdempotencyStoreLike,
} from '../../../types/sync';
import { ErrorCodes, createError } from '../../core/errors';

export type SyncIdempotencyRuntime = {
    enabled: boolean;
    store: SyncIdempotencyStoreLike;
    keyPrefix: string;
    ttl?: number;
    markMode: SyncIdempotencyMarkMode;
    keyBuilder?: (event: SyncChangeEvent, targetName: string) => string | null | undefined;
};

export function normalizeSyncKeyValue(value: unknown): unknown {
    if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
        return undefined;
    }
    if (value instanceof Date) {
        return { $date: value.toISOString() };
    }
    if (value instanceof RegExp) {
        return { $regex: value.source, $flags: value.flags };
    }
    if (value && typeof value === 'object') {
        const oid = value as { toHexString?: () => string; _bsontype?: string };
        if (typeof oid.toHexString === 'function' && oid._bsontype === 'ObjectId') {
            return { $oid: oid.toHexString() };
        }
        if (Array.isArray(value)) {
            return value.map(normalizeSyncKeyValue);
        }
        return Object.fromEntries(
            Object.keys(value as Record<string, unknown>)
                .sort()
                .map((key) => [key, normalizeSyncKeyValue((value as Record<string, unknown>)[key])]),
        );
    }
    return value;
}

export function stableSyncKeyString(value: unknown): string {
    return JSON.stringify(normalizeSyncKeyValue(value));
}

export function defaultSyncEventIdentity(event: SyncChangeEvent): unknown {
    return event._id ?? {
        operationType: event.operationType,
        ns: event.ns,
        documentKey: event.documentKey,
    };
}

class MemorySyncIdempotencyStore implements SyncIdempotencyStoreLike {
    private readonly entries = new Map<string, { value: unknown; expiresAt: number | null }>();

    get(key: string): unknown {
        const entry = this.entries.get(key);
        if (!entry) {
            return undefined;
        }
        if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
            this.entries.delete(key);
            return undefined;
        }
        return entry.value;
    }

    set(key: string, value: unknown, ttl?: number): void {
        this.entries.set(key, {
            value,
            expiresAt: typeof ttl === 'number' && ttl > 0 ? Date.now() + ttl : null,
        });
    }

    del(key: string): void {
        this.entries.delete(key);
    }
}

export function resolveSyncIdempotencyRuntime(config: SyncIdempotencyConfig | undefined): SyncIdempotencyRuntime {
    return {
        enabled: config?.enabled === true,
        store: config?.store ?? new MemorySyncIdempotencyStore(),
        keyPrefix: config?.keyPrefix ?? 'monsqlize:sync:idempotency',
        ttl: config?.ttl,
        markMode: config?.markMode ?? 'success',
        keyBuilder: config?.keyBuilder,
    };
}

export function validateSyncIdempotencyConfig(config: SyncIdempotencyConfig | undefined): void {
    if (config === undefined) {
        return;
    }
    if (!config || typeof config !== 'object') {
        throw createError(ErrorCodes.INVALID_CONFIG, '[Sync] idempotency must be an object.');
    }
    if (config.enabled !== undefined && typeof config.enabled !== 'boolean') {
        throw createError(ErrorCodes.INVALID_CONFIG, '[Sync] idempotency.enabled must be a boolean.');
    }
    if (config.store !== undefined) {
        const store = config.store as SyncIdempotencyStoreLike;
        if (!store || typeof store !== 'object' || typeof store.get !== 'function' || typeof store.set !== 'function') {
            throw createError(ErrorCodes.INVALID_CONFIG, '[Sync] idempotency.store must provide get and set functions.');
        }
    }
    if (config.keyPrefix !== undefined && typeof config.keyPrefix !== 'string') {
        throw createError(ErrorCodes.INVALID_CONFIG, '[Sync] idempotency.keyPrefix must be a string.');
    }
    if (config.ttl !== undefined && (!Number.isInteger(config.ttl) || config.ttl < 0)) {
        throw createError(ErrorCodes.INVALID_CONFIG, '[Sync] idempotency.ttl must be a non-negative integer.');
    }
    if (config.markMode !== undefined && config.markMode !== 'success' && config.markMode !== 'start') {
        throw createError(ErrorCodes.INVALID_CONFIG, '[Sync] idempotency.markMode must be "success" or "start".');
    }
    if (config.keyBuilder !== undefined && typeof config.keyBuilder !== 'function') {
        throw createError(ErrorCodes.INVALID_CONFIG, '[Sync] idempotency.keyBuilder must be a function.');
    }
}
