/**
 * MultiLevelCache: 组合本地与远端缓存，实现 CacheLike 接口
 * 设计要点：
 * - 读：本地优先；本地未命中查远端，命中则异步回填本地；远端失败需优雅降级
 * - 写：默认本地+远端双写；可配置本地优先、远端异步
 * - 删：本地删除；远端删除尽力而为；delPattern 默认仅本地执行并返回删除数（重型场景交由远端广播/索引）
 * - keys/clear：仅作用于本地层（避免误伤远端）
 * - TTL 单位毫秒，与上层保持一致
 */

class MultiLevelCache {
  /**
   * @param {Object} options
   * @param {Object} options.local - 本地 CacheLike
   * @param {Object} options.remote - 远端 CacheLike（可选）
   * @param {Object} [options.policy]
   * @param {'both'|'local-first-async-remote'} [options.policy.writePolicy='both']
   * @param {boolean} [options.policy.backfillLocalOnRemoteHit=true]
   * @param {number} [options.remoteTimeoutMs=50] - 远端单次操作超时
   * @param {(msg:object)=>void} [options.publish] - 可选：失效广播发布器
   */
  constructor(options = {}) {
    const { local, remote, policy = {}, remoteTimeoutMs = 50, publish } = options;
    if (!local || typeof local.get !== 'function') {
      throw new Error('MultiLevelCache requires a valid local cache');
    }
    this.local = local;
    this.remote = remote;
    this.policy = {
      writePolicy: policy.writePolicy || 'both',
      backfillLocalOnRemoteHit: policy.backfillLocalOnRemoteHit !== false,
    };
    this.remoteTimeoutMs = Number(remoteTimeoutMs) || 50;
    this.publish = typeof publish === 'function' ? publish : null;
  }

  /**
   * 动态设置 publish 回调（用于分布式缓存失效）
   * @param {Function} publishFn - 发布函数，接收 { type, pattern, ts } 对象
   */
  setPublish(publishFn) {
    if (typeof publishFn === 'function') {
      this.publish = publishFn;
    }
  }

  /**
   * 设置锁管理器（透传到本地缓存）
   * @param {Object} lockManager
   */
  setLockManager(lockManager) {
    if (this.local && typeof this.local.setLockManager === 'function') {
      this.local.setLockManager(lockManager);
    }
  }

  // 工具：为远端操作加超时与降级
  async _withTimeout(promise) {
    if (!this.remote) return Promise.reject(new Error('NO_REMOTE'));
    let timer;
    const t = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('REMOTE_TIMEOUT')), this.remoteTimeoutMs);
      if (timer && typeof timer.unref === 'function') try { timer.unref(); } catch(_) {}
    });
    try {
      const val = await Promise.race([promise, t]);
      return val;
    } finally {
      clearTimeout(timer);
    }
  }

  async get(key) {
    const v = await this.local.get(key);
    if (v !== undefined) return v;
    try {
      const r = await this._withTimeout(this.remote.get(key));
      if (r !== undefined && this.policy.backfillLocalOnRemoteHit) {
        // 无剩余 TTL 信息，采用一个保守的回填策略：原 TTL 由上层 set 决定；这里回填一个短 TTL（例如 50ms）不合适
        // 因为我们无法得知原始 TTL，这里直接不设置 TTL（等同于本地不持久）。但为了可用性，设置 50% 的常用短 TTL可配置。
        // 为保持简单，我们不传 TTL（由本地实现解释，等价于无过期）。
        // 若调用方强依赖 TTL 严格一致性，应在远端适配器中扩展 getWithTTL。
        try { await this.local.set(key, r); } catch(_) {}
      }
      return r;
    } catch(_) {
      return undefined; // 远端异常降级
    }
  }

  async set(key, val, ttl = 0) {
    await this.local.set(key, val, ttl);
    if (!this.remote) return;
    if (this.policy.writePolicy === 'both') {
      try { await this._withTimeout(this.remote.set(key, val, ttl)); } catch(_) {}
    } else {
      // local-first-async-remote
      this._withTimeout(this.remote.set(key, val, ttl)).catch(() => {});
    }
  }

  async del(key) {
    let a = false, b = false;
    try { a = await this.local.del(key); } catch(_) {}
    if (this.remote) {
      try { b = await this._withTimeout(this.remote.del(key)).then(Boolean).catch(() => false); } catch(_) {}
    }
    return !!(a || b);
  }

  async exists(key) {
    const a = await this.local.exists(key);
    if (a) return true;
    if (!this.remote) return false;
    try { return !!(await this._withTimeout(this.remote.exists(key))); } catch(_) { return false; }
  }

  async getMany(keys) {
    const out = {};
    // 先批量从本地取
    const localRes = await this.local.getMany(keys);
    const misses = [];
    for (const k of keys) {
      const v = localRes[k];
      if (v !== undefined) out[k] = v; else misses.push(k);
    }
    if (!misses.length || !this.remote) return out;
    try {
      const remoteRes = await this._withTimeout(this.remote.getMany(misses));
      if (remoteRes && typeof remoteRes === 'object') {
        // 回填本地（异步）
        if (this.policy.backfillLocalOnRemoteHit) this.local.setMany(remoteRes).catch(() => {});
        for (const k of misses) { if (remoteRes[k] !== undefined) out[k] = remoteRes[k]; }
      }
    } catch(_) { /* 降级 */ }
    return out;
  }

  async setMany(obj, ttl = 0) {
    await this.local.setMany(obj, ttl);
    if (!this.remote) return true;
    if (this.policy.writePolicy === 'both') {
      try { await this._withTimeout(this.remote.setMany(obj, ttl)); } catch(_) {}
    } else {
      this._withTimeout(this.remote.setMany(obj, ttl)).catch(() => {});
    }
    return true;
  }

  async delMany(keys) {
    let n = 0;
    try { n += await this.local.delMany(keys); } catch(_) {}
    if (this.remote) {
      try { await this._withTimeout(this.remote.delMany(keys)); } catch(_) {}
    }
    return n;
  }

  async delPattern(pattern) {
    let deleted = 0;

    // 删除本地缓存
    try {
      deleted = await this.local.delPattern(pattern);
    } catch(err) {
      // 忽略本地删除错误
    }

    // 删除远端缓存（如果存在）
    if (this.remote && typeof this.remote.delPattern === 'function') {
      try {
        await this._withTimeout(this.remote.delPattern(pattern));
      } catch(err) {
        // 远端删除失败，降级处理
      }
    }

    // 向集群广播（可选）
    try {
      if (this.publish) {
        this.publish({ type: 'invalidate', pattern, ts: Date.now() });
      }
    } catch(err) {
      // 忽略广播错误
    }

    return deleted;
  }

  clear() {
    // 仅清理本地
    try { this.local.clear(); } catch(_) {}
  }

  keys(pattern = '*') {
    try { return this.local.keys(pattern); } catch(_) { return []; }
  }

  getStats() {
    const local = this.local.getStats ? this.local.getStats() : null;
    const remote = this.remote && this.remote.getStats ? this.remote.getStats() : null;
    const hits = (local?.hits || 0) + (remote?.hits || 0);
    const misses = (local?.misses || 0) + (remote?.misses || 0);
    return {
      local,
      remote,
      hitRateApprox: hits / (hits + misses) || 0,
    };
  }
}

module.exports = MultiLevelCache;

