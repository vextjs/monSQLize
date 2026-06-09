import { randomBytes } from 'crypto';
import { createError, ErrorCodes } from '../../core/errors';

export interface DistributedCacheInvalidatorOptions {
    cache: any;
    _connections?: { pub: any; sub: any };
    redis?: any;
    redisUrl?: string;
    channel?: string;
    instanceId?: string;
    logger?: any;
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
    public pub: any;
    public sub: any;

    private _cache: any;
    private _logger: any;
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
            // v1 compat: pub === sub so close() calls quit twice on the same instance
            this.pub = options.redis;
            this.sub = options.redis;
        } else if (options.redisUrl) {
            // Use require (not createRequire) so Module.prototype.require mocks intercept it
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const Redis = require('ioredis');
            this.pub = new Redis(options.redisUrl);
            this.sub = new Redis(options.redisUrl);
        } else {
            throw createError(ErrorCodes.INVALID_CONFIG, 'DistributedCacheInvalidator requires either redis or redisUrl');
        }

        this._setupSubscription();
    }

    private _setupSubscription(): void {
        this.sub.subscribe(this.channel, () => {});
        this.sub.on('message', async (channel: string, rawMessage: string) => {
            if (channel !== this.channel) return;

            let message: any;
            try {
                message = JSON.parse(rawMessage);
            } catch {
                this._stats.errors++;
                return;
            }

            if (message.type !== 'invalidate') return;
            if (message.instanceId === this.instanceId) return;

            this._stats.messagesReceived++;

            try {
                for (const targetCache of this._getTargetCaches()) {
                    await targetCache.delPattern(message.pattern);
                }
                this._logger?.debug(`[DistributedCacheInvalidator] Invalidated cache targets: ${message.pattern}`);
                this._stats.invalidationsTriggered++;
            } catch (err: any) {
                this._stats.errors++;
                this._logger?.error(`[DistributedCacheInvalidator] Cache invalidation error: ${err.message}`);
            }
        });
    }

    private _getTargetCaches(): any[] {
        const targets = new Set<any>();

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
            this._logger?.debug(`[DistributedCacheInvalidator] Published invalidation: ${pattern}`);
        } catch (err: any) {
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
            await this.pub.quit();
        } catch (err: any) {
            this._logger?.error(`[DistributedCacheInvalidator] Error closing connections: ${err.message}`);
        }
    }
}
