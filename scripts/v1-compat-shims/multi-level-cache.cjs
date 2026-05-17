'use strict';

const CacheFactory = require('./cache.cjs');

function isObject(value) {
  return value !== null && typeof value === 'object';
}

class MultiLevelCache {
  constructor(options = {}) {
    this.local = options.local ?? CacheFactory.createDefault();
    this.remote = options.remote ?? null;
    this.publish = typeof options.publish === 'function' ? options.publish : null;
    this.remoteTimeoutMs = options.remoteTimeoutMs ?? 500;
    this.policy = {
      backfillLocalOnRemoteHit: options.policy?.backfillLocalOnRemoteHit !== false,
      backfillLocalTTL: Number(options.policy?.backfillLocalTTL ?? 0) || 0,
    };
  }

  setPublish(publish) {
    this.publish = typeof publish === 'function' ? publish : null;
  }

  resolveBackfillTTL(remainingTTL) {
    const ttlFromRemote = Number(remainingTTL);
    if (ttlFromRemote > 0) {
      return ttlFromRemote;
    }
    return this.policy.backfillLocalTTL > 0 ? this.policy.backfillLocalTTL : 0;
  }

  async backfillLocal(key, value, remainingTTL = 0) {
    if (!this.local || !this.policy.backfillLocalOnRemoteHit || value === undefined) {
      return;
    }

    if (value === null && this.policy.backfillLocalTTL === 0 && Number(remainingTTL) <= 0) {
      return;
    }

    const ttl = this.resolveBackfillTTL(remainingTTL);
    await Promise.resolve(this.local.set(key, value, ttl));
  }

  async get(key) {
    if (this.local?.get) {
      const localValue = await Promise.resolve(this.local.get(key));
      if (localValue !== undefined) {
        return localValue;
      }
    }

    if (!this.remote) {
      return undefined;
    }

    if (typeof this.remote.getWithTTL === 'function') {
      const payload = await Promise.resolve(this.remote.getWithTTL(key));
      if (payload !== undefined) {
        const value = isObject(payload) && 'value' in payload ? payload.value : payload;
        const remainingTTL = isObject(payload) ? payload.remainingTTL : 0;
        await this.backfillLocal(key, value, remainingTTL);
        return value;
      }
    }

    if (typeof this.remote.get !== 'function') {
      return undefined;
    }

    const remoteValue = await Promise.resolve(this.remote.get(key));
    await this.backfillLocal(key, remoteValue, 0);
    return remoteValue;
  }

  async getMany(keys = []) {
    const result = this.local?.getMany
      ? await Promise.resolve(this.local.getMany(keys))
      : {};

    const missingKeys = keys.filter((key) => result[key] === undefined);
    if (missingKeys.length === 0 || !this.remote) {
      return result;
    }

    let remoteValues = {};
    if (typeof this.remote.getMany === 'function') {
      remoteValues = await Promise.resolve(this.remote.getMany(missingKeys)) || {};
    } else if (typeof this.remote.get === 'function') {
      for (const key of missingKeys) {
        remoteValues[key] = await Promise.resolve(this.remote.get(key));
      }
    }

    for (const key of missingKeys) {
      if (remoteValues[key] !== undefined) {
        result[key] = remoteValues[key];
        await this.backfillLocal(key, remoteValues[key], 0);
      }
    }

    return result;
  }

  async set(key, value, ttl = 0) {
    await Promise.resolve(this.local?.set?.(key, value, ttl));
    await Promise.resolve(this.remote?.set?.(key, value, ttl));
    return true;
  }

  async setMany(values, ttl = 0) {
    await Promise.resolve(this.local?.setMany?.(values, ttl));
    await Promise.resolve(this.remote?.setMany?.(values, ttl));
    return true;
  }

  async del(key) {
    const localDeleted = Number(await Promise.resolve(this.local?.del?.(key) ?? this.local?.delete?.(key) ?? 0)) || 0;
    const remoteDeleted = Number(await Promise.resolve(this.remote?.del?.(key) ?? this.remote?.delete?.(key) ?? 0)) || 0;
    return localDeleted + remoteDeleted;
  }

  async delMany(keys) {
    const localDeleted = Number(await Promise.resolve(this.local?.delMany?.(keys) ?? 0)) || 0;
    const remoteDeleted = Number(await Promise.resolve(this.remote?.delMany?.(keys) ?? 0)) || 0;
    return localDeleted + remoteDeleted;
  }

  async delPattern(pattern) {
    let localDeleted = 0;
    if (this.local?.delPattern) {
      localDeleted = Number(await Promise.resolve(this.local.delPattern(pattern))) || 0;
    }

    if (this.remote?.delPattern) {
      await Promise.resolve(this.remote.delPattern(pattern));
    }

    if (this.publish) {
      try {
        await Promise.resolve(this.publish({
          type: 'invalidate',
          pattern,
          ts: Date.now(),
        }));
      } catch {
        // ignore publish failures to preserve local invalidation behavior
      }
    }

    return localDeleted;
  }

  async exists(key) {
    if (await Promise.resolve(this.local?.exists?.(key) ?? false)) {
      return true;
    }
    return Boolean(await Promise.resolve(this.remote?.exists?.(key) ?? false));
  }

  clear() {
    this.local?.clear?.();
    this.remote?.clear?.();
  }
}

module.exports = MultiLevelCache;
