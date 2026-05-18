import { createError, ErrorCodes } from '../../core/errors';
import type { LoggerLike } from '../../core/logger';
import type { CacheLike } from '../../../types/runtime';
import type { RedisLike } from './redis-cache-adapter';

export interface DistributedCacheInvalidatorOptions {
    cache?: CacheLike | { local?: CacheLike; remote?: CacheLike; };
    channel?: string;
    instanceId?: string;
    logger?: LoggerLike | null;
    redis?: RedisLike;
    redisUrl?: string;
    pub?: RedisLike;
    sub?: RedisLike;
}

export class DistributedCacheInvalidator {
    channel: string;
    instanceId: string;
    private logger?: LoggerLike | null;
    private local?: CacheLike;
    private remote?: CacheLike;
    pub?: RedisLike;
    sub?: RedisLike;
    private _ownsConnections = false;
    private stats = {
        messagesSent: 0,
        messagesReceived: 0,
        invalidationsTriggered: 0,
        errors: 0,
    };

    constructor(options: DistributedCacheInvalidatorOptions = {}) {
        if (!options.cache) {
            throw createError(ErrorCodes.INVALID_CONFIG, 'DistributedCacheInvalidator requires a cache instance');
        }

        this.channel = options.channel ?? 'monsqlize:cache:invalidate';
        this.instanceId = options.instanceId ?? `instance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.logger = options.logger;

        const cache = options.cache as Record<string, unknown>;
        if ('local' in cache || 'remote' in cache) {
            const scopedCache = options.cache as { local?: CacheLike; remote?: CacheLike; };
            this.local = scopedCache.local;
            this.remote = scopedCache.remote;
        } else {
            this.local = options.cache as CacheLike;
        }

        if (options.redis) {
            this.pub = options.redis;
            this.sub = options.redis;
            this._ownsConnections = false;
        } else if (options.redisUrl) {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const IoRedis = require('ioredis');
            this.pub = new IoRedis(options.redisUrl) as RedisLike;
            this.sub = new IoRedis(options.redisUrl) as RedisLike;
            this._ownsConnections = true;
        } else {
            this.pub = options.pub;
            this.sub = options.sub;
        }

        if (this.pub && this.pub.on) {
            this.pub.on('error', (err: unknown) => {
                this.stats.errors++;
                this.logger?.error?.('[DistributedCacheInvalidator] Redis pub error:', (err as Error).message);
            });
        }
        if (this.sub && this.sub !== this.pub && this.sub.on) {
            this.sub.on('error', (err: unknown) => {
                this.stats.errors++;
                this.logger?.error?.('[DistributedCacheInvalidator] Redis sub error:', (err as Error).message);
            });
        }

        if (this.sub) {
            this._setupSubscription();
        }
    }

    private _setupSubscription(): void {
        this.sub!.subscribe!(this.channel, (err?: Error | null) => {
            if (err) {
                this.stats.errors++;
                this.logger?.error?.('[DistributedCacheInvalidator] Subscribe error:', err.message);
            } else {
                this.logger?.info?.(`[DistributedCacheInvalidator] Subscribed to channel: ${this.channel}`);
            }
        });

        this.sub!.on!('message', async (channel: unknown, message: unknown) => {
            if (channel !== this.channel) return;
            this.stats.messagesReceived++;
            try {
                const data = JSON.parse(message as string) as { type?: string; pattern?: string; instanceId?: string; };
                if (data.instanceId === this.instanceId) return;
                if (data.type === 'invalidate' && data.pattern) {
                    await this._handleInvalidation(data.pattern);
                }
            } catch (error) {
                this.stats.errors++;
                this.logger?.error?.('[DistributedCacheInvalidator] Message parse error:', (error as Error).message);
            }
        });
    }

    private async _handleInvalidation(pattern: string): Promise<void> {
        try {
            if (this.local?.delPattern) {
                const localDeleted = Number(await Promise.resolve(this.local.delPattern(pattern)));
                this.logger?.debug?.(`[DistributedCacheInvalidator] Invalidated local cache: ${pattern}, deleted: ${localDeleted} keys`);
            }
            if (this.remote?.delPattern) {
                const remoteDeleted = Number(await Promise.resolve(this.remote.delPattern(pattern)));
                this.logger?.debug?.(`[DistributedCacheInvalidator] Invalidated remote cache: ${pattern}, deleted: ${remoteDeleted} keys`);
            }
            this.stats.invalidationsTriggered++;
        } catch (error) {
            this.stats.errors++;
            this.logger?.error?.('[DistributedCacheInvalidator] Invalidation error:', (error as Error).message);
        }
    }

    async invalidate(pattern: string): Promise<void> {
        if (!pattern) return;

        await this._handleInvalidation(pattern);
        if (!this.pub) return;

        const message = JSON.stringify({
            type: 'invalidate',
            pattern,
            instanceId: this.instanceId,
            timestamp: Date.now(),
        });

        try {
            await Promise.resolve(this.pub.publish!(this.channel, message));
            this.stats.messagesSent++;
            this.logger?.debug?.(`[DistributedCacheInvalidator] Published invalidation: ${pattern}`);
        } catch (error) {
            this.stats.errors++;
            this.logger?.error?.('[DistributedCacheInvalidator] Publish error:', (error as Error).message);
            throw error;
        }
    }

    async handleMessage(channel: string, message: string): Promise<void> {
        if (channel !== this.channel) return;
        this.stats.messagesReceived++;
        try {
            const data = JSON.parse(message) as { type?: string; pattern?: string; instanceId?: string; };
            if (data.instanceId === this.instanceId || data.type !== 'invalidate' || !data.pattern) return;
            await this._handleInvalidation(data.pattern);
        } catch (cause) {
            this.stats.errors++;
            this.logger?.error?.('[DistributedCacheInvalidator] Failed to parse message', cause);
        }
    }

    getStats(): Record<string, unknown> {
        return {
            ...this.stats,
            channel: this.channel,
            instanceId: this.instanceId,
        };
    }

    async close(): Promise<void> {
        try {
            if (this.sub?.unsubscribe) {
                await Promise.resolve(this.sub.unsubscribe(this.channel));
            }
            if (this.pub?.quit) {
                await Promise.resolve(this.pub.quit());
            }
            if (this.sub?.quit) {
                await Promise.resolve(this.sub.quit());
            }
            this.logger?.info?.('[DistributedCacheInvalidator] Closed');
        } catch (error) {
            this.logger?.error?.('[DistributedCacheInvalidator] Close error:', (error as Error).message);
        }
    }
}
