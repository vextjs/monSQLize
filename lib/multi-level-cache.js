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
   * @param {number} [options.policy.backfillLocalTTL=0] - 回填 L1 时使用的兜底 TTL（毫秒）；
   *   当 remote 支持 getWithTTL 时优先使用 L2 剩余 TTL，否则降级到此值；
   *   0 = 不设 TTL（永不过期，向后兼容）。建议生产环境配置合理值（如 60000）
   * @param {number} [options.remoteTimeoutMs=50] - 远端单次操作超时
   * @param {(msg:object)=>void} [options.publish] - 可选：失效广播发布器
   * @since 1.1.9 backfillLocalTTL 支持
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
      // 🔧 v1.1.9 修复：新增回填 TTL 兜底配置，0 = 不设 TTL（向后兼容）
      backfillLocalTTL: typeof policy.backfillLocalTTL === 'number' ? policy.backfillLocalTTL : 0,
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
      let r;
      // 🔧 v1.1.9 修复：backfillTTL 优先取 L2 剩余 TTL（方案A），降级到 backfillLocalTTL（方案B）
      let backfillTTL = this.policy.backfillLocalTTL;

      if (this.remote && typeof this.remote.getWithTTL === 'function') {
        // 方案A：remote 支持 getWithTTL，单次 RTT 同时获取值与剩余 TTL
        const meta = await this._withTimeout(this.remote.getWithTTL(key));
        if (meta !== undefined) {
          r = meta.value;
          if (meta.remainingTTL > 0) backfillTTL = meta.remainingTTL;
        }
      } else {
        // 方案B：remote 不支持 getWithTTL，使用普通 get + backfillLocalTTL 兜底
        r = await this._withTimeout(this.remote.get(key));
      }

      if (r !== undefined && this.policy.backfillLocalOnRemoteHit) {
        // 🔧 v1.1.9 补充：backfillTTL=0 时跳过 null 回填，防止无配置用户触发永久驻留 Bug
        // - backfillTTL>0：回填所有值（含 null），TTL 保护下能正常过期
        // - backfillTTL=0 + null：跳过——无 TTL 保护的 null 永久驻留 = Bug 本身
        // - backfillTTL=0 + 非 null：回填（保留原有永久缓存行为，向后兼容）
        if (backfillTTL > 0 || r !== null) {
          try { await this.local.set(key, r, backfillTTL); } catch(_) {}
        }
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
        // 🔧 v1.1.9 修复：传入 backfillLocalTTL，防止无 TTL 永久回填（含 null 值）
        // 🔧 v1.1.9 补充：backfillLocalTTL=0 时过滤 null，防止无配置用户触发永久驻留 Bug
        if (this.policy.backfillLocalOnRemoteHit) {
          const backfillData = this.policy.backfillLocalTTL > 0
            ? remoteRes
            : Object.fromEntries(Object.entries(remoteRes).filter(([, v]) => v !== null));
          if (Object.keys(backfillData).length > 0) {
            this.local.setMany(backfillData, this.policy.backfillLocalTTL).catch(() => {});
          }
        }
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

