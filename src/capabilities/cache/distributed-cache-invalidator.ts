import { DistributedCacheInvalidator as HubDistributedCacheInvalidator } from 'cache-hub';
import { createError, ErrorCodes } from '../../core/errors';
import type { LoggerLike } from '../../core/logger';
import type {
    CacheLike,
    DistributedCacheInvalidatorOptions,
    RedisLike,
} from '../../../types/runtime';

type InvalidatorStats = {
    messagesSent: number;
    messagesReceived: number;
    invalidationsTriggered: number;
    errors: number;
    channel: string;
    instanceId: string;
};

/**
 * 基于 cache-hub 的分布式失效兼容层。
 *
 * 兼容目标：
 * - 保留 monSQLize 现有的 `cache: { local, remote }` 双缓存失效语义。
 * - 保留 `handleMessage()` 测试入口与 `pub/sub` 注入能力。
 * - 在具备 Redis Pub/Sub 条件时，底层复用 cache-hub 的失效器实现。
 */
export class DistributedCacheInvalidator {
    channel: string;
    instanceId: string;
    pub?: RedisLike;
    sub?: RedisLike;

    private readonly logger?: LoggerLike | null;
    private readonly local?: CacheLike;
    private readonly remote?: CacheLike;
    private readonly delegate?: HubDistributedCacheInvalidator;
    private readonly manualStats = {
        messagesSent: 0,
        messagesReceived: 0,
        errors: 0,
    };
    private invalidationsTriggered = 0;

    constructor(options: DistributedCacheInvalidatorOptions = {}) {
        if (!options.cache) {
            throw createError(ErrorCodes.INVALID_CONFIG, 'DistributedCacheInvalidator requires a cache instance');
        }

        this.channel = options.channel ?? 'monsqlize:cache:invalidate';
        this.instanceId = options.instanceId ?? `instance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.logger = options.logger;

        const scopedCache = resolveCacheScope(options.cache);
        this.local = scopedCache.local;
        this.remote = scopedCache.remote;

        const delegateOptions = this.buildDelegateOptions(options);
        if (delegateOptions) {
            this.delegate = new HubDistributedCacheInvalidator(delegateOptions);
        }
    }

    async invalidate(pattern: string): Promise<void> {
        if (!pattern) {
            return;
        }

        await this.invalidateCaches(pattern);

        if (this.delegate) {
            try {
                await this.delegate.invalidate(pattern);
                this.logger?.debug?.(`[DistributedCacheInvalidator] Published invalidation: ${pattern}`);
                return;
            } catch (error) {
                this.logger?.error?.('[DistributedCacheInvalidator] Publish error:', (error as Error).message);
                throw error;
            }
        }

        if (!this.pub?.publish) {
            return;
        }

        const message = JSON.stringify({
            type: 'invalidate',
            pattern,
            instanceId: this.instanceId,
            timestamp: Date.now(),
        });

        try {
            await Promise.resolve(this.pub.publish(this.channel, message));
            this.manualStats.messagesSent++;
            this.logger?.debug?.(`[DistributedCacheInvalidator] Published invalidation: ${pattern}`);
        } catch (error) {
            this.manualStats.errors++;
            this.logger?.error?.('[DistributedCacheInvalidator] Publish error:', (error as Error).message);
            throw error;
        }
    }

    async handleMessage(channel: string, message: string): Promise<void> {
        if (channel !== this.channel) {
            return;
        }

        this.manualStats.messagesReceived++;

        try {
            const data = JSON.parse(message) as { type?: string; pattern?: string; instanceId?: string; };
            if (data.instanceId === this.instanceId || data.type !== 'invalidate' || !data.pattern) {
                return;
            }
            await this.invalidateCaches(data.pattern);
        } catch (cause) {
            this.manualStats.errors++;
            this.logger?.error?.('[DistributedCacheInvalidator] Failed to parse message', cause);
        }
    }

    getStats(): InvalidatorStats {
        const delegateStats = this.delegate?.getStats();
        return {
            messagesSent: (delegateStats?.messagesSent ?? 0) + this.manualStats.messagesSent,
            messagesReceived: (delegateStats?.messagesReceived ?? 0) + this.manualStats.messagesReceived,
            invalidationsTriggered: this.invalidationsTriggered,
            errors: (delegateStats?.errors ?? 0) + this.manualStats.errors,
            channel: this.channel,
            instanceId: this.instanceId,
        };
    }

    async close(): Promise<void> {
        if (this.delegate) {
            await this.delegate.close();
            return;
        }

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

    private buildDelegateOptions(options: DistributedCacheInvalidatorOptions): ConstructorParameters<typeof HubDistributedCacheInvalidator>[0] | null {
        const cache = {
            async get() {
                return undefined;
            },
            async set() {
                return true;
            },
            async has() {
                return false;
            },
            delPattern: async (pattern: string) => this.invalidateCaches(pattern),
        };

        const logger = createDelegateLogger(this.logger);

        const connections = resolveConnections(options);
        if (connections) {
            this.pub = connections.pub;
            this.sub = connections.sub;
            return {
                cache: cache as unknown as ConstructorParameters<typeof HubDistributedCacheInvalidator>[0]['cache'],
                channel: this.channel,
                instanceId: this.instanceId,
                logger,
                _connections: {
                    pub: normalizePubConnection(connections.pub),
                    sub: normalizeSubConnection(connections.sub),
                    _shouldClosePub: true,
                },
            };
        }

        return null;
    }

    private async invalidateCaches(pattern: string): Promise<number> {
        let deleted = 0;
        try {
            if (this.local?.delPattern) {
                const localDeleted = Number(await Promise.resolve(this.local.delPattern(pattern)));
                deleted += localDeleted;
                this.logger?.debug?.(`[DistributedCacheInvalidator] Invalidated local cache: ${pattern}`);
            }
            if (this.remote?.delPattern) {
                const remoteDeleted = Number(await Promise.resolve(this.remote.delPattern(pattern)));
                deleted += remoteDeleted;
                this.logger?.debug?.(`[DistributedCacheInvalidator] Invalidated remote cache: ${pattern}`);
            }
            this.invalidationsTriggered++;
            this.logger?.debug?.(`[DistributedCacheInvalidator] Invalidated pattern: ${pattern}, deleted: ${deleted} keys`);
            return deleted;
        } catch (error) {
            if (!this.delegate) {
                this.manualStats.errors++;
            }
            this.logger?.error?.('[DistributedCacheInvalidator] Invalidation error:', (error as Error).message);
            throw error;
        }
    }
}

function resolveCacheScope(cache: CacheLike | { local?: CacheLike; remote?: CacheLike; }): { local?: CacheLike; remote?: CacheLike; } {
    const record = cache as Record<string, unknown>;
    if ('local' in record || 'remote' in record) {
        return cache as { local?: CacheLike; remote?: CacheLike; };
    }
    return { local: cache as CacheLike };
}

function createDelegateLogger(logger?: LoggerLike | null) {
    if (!logger) {
        return undefined;
    }
    return {
        debug(message: string) {
            logger.debug?.(message);
        },
        info(message: string) {
            logger.info?.(message);
        },
        warn(message: string) {
            logger.warn?.(message);
        },
        error(message: string) {
            logger.error?.(message);
        },
    };
}

function resolveConnections(options: DistributedCacheInvalidatorOptions): { pub: RedisLike; sub: RedisLike; } | null {
    if (options.pub || options.sub) {
        const pub = options.pub ?? options.sub;
        const sub = options.sub ?? options.pub;
        if (pub && sub) {
            return { pub, sub };
        }
    }

    if (options.redis) {
        const pub = options.redis;
        const duplicated = duplicateRedis(options.redis);
        return { pub, sub: duplicated ?? options.redis };
    }

    if (options.redisUrl) {
        const RedisCtor = loadRedisCtor();
        return {
            pub: new RedisCtor(options.redisUrl),
            sub: new RedisCtor(options.redisUrl),
        };
    }

    return null;
}

function duplicateRedis(redis: RedisLike): RedisLike | null {
    const candidate = redis as RedisLike & {
        duplicate?: () => RedisLike;
    };
    if (typeof candidate.duplicate === 'function') {
        return candidate.duplicate();
    }
    return null;
}

function loadRedisCtor(): new (url: string) => RedisLike {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('ioredis');
    return (mod?.default ?? mod) as new (url: string) => RedisLike;
}

function normalizePubConnection(pub?: RedisLike): Required<Pick<RedisLike, 'publish' | 'on' | 'quit'>> {
    return {
        publish(channel: string, message: string) {
            const normalizedMessage = normalizePublishedMessage(message);
            return pub?.publish ? pub.publish(channel, normalizedMessage) : 0;
        },
        on(event: string, handler: (...args: unknown[]) => void) {
            pub?.on?.(event, handler);
        },
        quit() {
            return pub?.quit ? pub.quit() : undefined;
        },
    };
}

function normalizeSubConnection(sub?: RedisLike): Required<Pick<RedisLike, 'on' | 'subscribe' | 'unsubscribe' | 'quit'>> {
    return {
        on(event: string, handler: (...args: unknown[]) => void) {
            if (!sub?.on) {
                return;
            }
            if (event === 'message') {
                sub.on(event, async (...args: unknown[]) => {
                    handler(...args);
                    await new Promise((resolve) => setImmediate(resolve));
                });
                return;
            }
            sub.on(event, handler);
        },
        subscribe(channel: string, handler?: (error?: Error | null) => void) {
            return sub?.subscribe ? sub.subscribe(channel, handler) : handler?.(null);
        },
        unsubscribe(channel: string) {
            return sub?.unsubscribe ? sub.unsubscribe(channel) : undefined;
        },
        quit() {
            return sub?.quit ? sub.quit() : undefined;
        },
    };
}

function normalizePublishedMessage(message: string): string {
    try {
        const payload = JSON.parse(message) as {
            ts?: number;
            timestamp?: number;
        };
        if (payload.ts !== undefined && payload.timestamp === undefined) {
            payload.timestamp = payload.ts;
            delete payload.ts;
        }
        return JSON.stringify(payload);
    } catch {
        return message;
    }
}
