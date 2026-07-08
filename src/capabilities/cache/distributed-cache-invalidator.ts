import { randomBytes } from 'crypto';
import { createError, ErrorCodes } from '../../core/errors';

export interface DistributedCacheLike {
    delPattern?(pattern: string): Promise<unknown> | unknown;
    del?(key: string): Promise<unknown> | unknown;
    delete?(key: string): Promise<unknown> | unknown;
    local?: DistributedCacheLike;
    remote?: DistributedCacheLike;
}

export interface RedisPubSubLike {
    publish(channel: string, message: string): Promise<unknown> | unknown;
    subscribe(channel: string, callback: (err?: Error | null) => void): unknown;
    on(event: 'message', callback: (channel: string, message: string) => void | Promise<void>): unknown;
    unsubscribe(): Promise<unknown> | unknown;
    quit(): Promise<unknown> | unknown;
    duplicate?(): RedisPubSubLike;
}

export interface DistributedLoggerLike {
    debug?(message: string): void;
    error?(message: string): void;
}

export interface DistributedCacheInvalidatorOptions {
    cache: DistributedCacheLike;
    _connections?: { pub: RedisPubSubLike; sub: RedisPubSubLike };
    redis?: RedisPubSubLike;
    redisUrl?: string;
    url?: string;
    uri?: string;
    channel?: string;
    instanceId?: string;
    logger?: DistributedLoggerLike;
}

interface Stats {
    messagesSent: number;
    messagesReceived: number;
    invalidationsTriggered: number;
    errors: number;
}

export class DistributedCacheInvalidator {
    public channel: string;
    public instanceId: string;
    public pub: RedisPubSubLike;
    public sub: RedisPubSubLike;

    private _cache: DistributedCacheLike;
    private _logger: DistributedLoggerLike | null;
    private _stats: Stats;

    constructor(options: DistributedCacheInvalidatorOptions) {
        if (!options.cache) {
            throw createError(ErrorCodes.CACHE_UNAVAILABLE, 'DistributedCacheInvalidator requires a cache instance');
        }

        this._cache = options.cache;
        this._logger = options.logger ?? null;
        this.channel = options.channel ?? 'monsqlize:cache:invalidate';
        this.instanceId = options.instanceId ?? `instance-${Date.now()}-${randomBytes(4).toString('hex')}`;
        this._stats = { messagesSent: 0, messagesReceived: 0, invalidationsTriggered: 0, errors: 0 };

        if (options._connections?.pub && options._connections?.sub) {
            this.pub = options._connections.pub;
            this.sub = options._connections.sub;
        } else if (options.redis) {
            this.pub = options.redis;
            if (typeof options.redis.duplicate !== 'function') {
                throw createError(ErrorCodes.INVALID_CONFIG, 'DistributedCacheInvalidator requires redis.duplicate() for pub/sub compatibility');
            }
            this.sub = options.redis.duplicate();
        } else if (options.redisUrl ?? options.url ?? options.uri) {
            // Use require (not createRequire) so Module.prototype.require mocks intercept it
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const Redis = require('ioredis');
            const redisUrl = options.redisUrl ?? options.url ?? options.uri;
            this.pub = new Redis(redisUrl);
            this.sub = new Redis(redisUrl);
        } else {
            throw createError(ErrorCodes.INVALID_CONFIG, 'DistributedCacheInvalidator requires either redis or redisUrl');
        }

        this._setupSubscription();
    }

    private _setupSubscription(): void {
        this.sub.subscribe(this.channel, (err: Error | null | undefined) => {
            if (err) {
                this._stats.errors++;
                this._logger?.error?.(`[DistributedCacheInvalidator] Subscribe failed: ${err.message}`);
            }
        });
        this.sub.on('message', async (channel: string, rawMessage: string) => {
            if (channel !== this.channel) return;

            let message: { type?: unknown; instanceId?: unknown; pattern?: unknown; key?: unknown };
            try {
                message = JSON.parse(rawMessage);
            } catch {
                this._stats.errors++;
                return;
            }

            const messageType = String(message.type ?? '');
            const isPatternInvalidation = messageType === 'invalidate' || messageType === 'delPattern';
            const isKeyInvalidation = messageType === 'invalidateKey' || messageType === 'del' || messageType === 'delete';
            if (!isPatternInvalidation && !isKeyInvalidation) return;
            if (message.instanceId === this.instanceId) return;

            this._stats.messagesReceived++;

            try {
                if (isPatternInvalidation) {
                    for (const targetCache of this._getPatternTargetCaches()) {
                        await targetCache.delPattern?.(String(message.pattern));
                    }
                    this._logger?.debug?.(`[DistributedCacheInvalidator] Invalidated cache targets: ${String(message.pattern)}`);
                } else {
                    for (const targetCache of this._getKeyTargetCaches()) {
                        if (typeof targetCache.del === 'function') {
                            await targetCache.del(String(message.key));
                        } else {
                            await targetCache.delete?.(String(message.key));
                        }
                    }
                    this._logger?.debug?.(`[DistributedCacheInvalidator] Invalidated cache key targets: ${String(message.key)}`);
                }
                this._stats.invalidationsTriggered++;
            } catch (err: unknown) {
                this._stats.errors++;
                this._logger?.error?.(`[DistributedCacheInvalidator] Cache invalidation error: ${err instanceof Error ? err.message : String(err)}`);
            }
        });
    }

    private _getPatternTargetCaches(): DistributedCacheLike[] {
        const targets = new Set<DistributedCacheLike>();

        if (typeof this._cache?.delPattern === 'function') {
            targets.add(this._cache);
        }
        if (this._cache?.local && typeof this._cache.local.delPattern === 'function') {
            targets.add(this._cache.local);
        }
        if (this._cache?.remote && typeof this._cache.remote.delPattern === 'function') {
            targets.add(this._cache.remote);
        }

        return [...targets];
    }

    private _getKeyTargetCaches(): DistributedCacheLike[] {
        const targets = new Set<DistributedCacheLike>();
        const supportsKeyDelete = (cache: DistributedCacheLike | undefined): cache is DistributedCacheLike =>
            typeof cache?.del === 'function' || typeof cache?.delete === 'function';

        if (supportsKeyDelete(this._cache)) {
            targets.add(this._cache);
        }
        if (supportsKeyDelete(this._cache?.local)) {
            targets.add(this._cache.local);
        }
        if (supportsKeyDelete(this._cache?.remote)) {
            targets.add(this._cache.remote);
        }

        return [...targets];
    }

    async invalidate(pattern: string): Promise<void> {
        if (!pattern) return;

        const message = JSON.stringify({
            type: 'invalidate',
            pattern,
            instanceId: this.instanceId,
            timestamp: Date.now(),
        });

        try {
            await this.pub.publish(this.channel, message);
            this._stats.messagesSent++;
            this._logger?.debug?.(`[DistributedCacheInvalidator] Published invalidation: ${pattern}`);
        } catch (err: unknown) {
            this._stats.errors++;
            throw err;
        }
    }

    async invalidateKey(key: string): Promise<void> {
        if (!key) return;

        const message = JSON.stringify({
            type: 'invalidateKey',
            key,
            instanceId: this.instanceId,
            timestamp: Date.now(),
        });

        try {
            await this.pub.publish(this.channel, message);
            this._stats.messagesSent++;
            this._logger?.debug?.(`[DistributedCacheInvalidator] Published key invalidation: ${key}`);
        } catch (err: unknown) {
            this._stats.errors++;
            throw err;
        }
    }

    getStats(): Stats & { instanceId: string; channel: string } {
        return { ...this._stats, instanceId: this.instanceId, channel: this.channel };
    }

    async close(): Promise<void> {
        try {
            await this.sub.unsubscribe();
            await this.sub.quit();
            if (this.pub !== this.sub) {
                await this.pub.quit();
            }
        } catch (err: unknown) {
            this._logger?.error?.(`[DistributedCacheInvalidator] Error closing connections: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}
