"use strict";

// src/capabilities/transaction/index.ts
var CacheLockManager = class {
  constructor(options = {}) {
    this.locks = /* @__PURE__ */ new Map();
    this._totalLocksAdded = 0;
    this.logger = options.logger ?? null;
    this.maxDuration = options.maxDuration ?? 3e5;
    this.cleanupInterval = options.cleanupInterval ?? 1e4;
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredLocks();
    }, this.cleanupInterval);
    this.cleanupTimer.unref?.();
  }
  /**
   * Add a cache lock.
   * @since v1.4.0
   */
  addLock(key, owner) {
    const ownerId = typeof owner === "string" ? owner : String(owner.id ?? "unknown");
    this.locks.set(key, {
      ownerId,
      expiresAt: Date.now() + this.maxDuration
    });
    this._totalLocksAdded += 1;
  }
  /**
   * Check whether a cache key is locked.
   * @since v1.4.0
   */
  isLocked(key) {
    this.cleanupExpiredLocks();
    if (this.locks.has(key)) {
      return true;
    }
    for (const pattern of this.locks.keys()) {
      if (!pattern.includes("*")) {
        continue;
      }
      const regex = new RegExp(`^${escapeRegExp(pattern).replace(/\\\*/g, ".*")}$`);
      if (regex.test(key)) {
        return true;
      }
    }
    return false;
  }
  /**
   * Release all cache locks held by the given owner.
   * @since v1.4.0
   */
  releaseLocks(owner) {
    const ownerId = typeof owner === "string" ? owner : String(owner.id ?? "unknown");
    for (const [key, record] of this.locks.entries()) {
      if (record.ownerId === ownerId) {
        this.locks.delete(key);
      }
    }
  }
  /**
   * Get cache lock statistics.
   * @since v1.4.0
   */
  getStats() {
    this.cleanupExpiredLocks();
    return {
      totalLocks: this._totalLocksAdded,
      activeLocks: this.locks.size,
      maxDuration: this.maxDuration
    };
  }
  /**
   * Clear all cache locks.
   * @since v1.4.0
   */
  clear() {
    this.locks.clear();
  }
  /**
   * Stop the cache lock manager.
   * @since v1.4.0
   */
  stop() {
    clearInterval(this.cleanupTimer);
  }
  cleanupExpiredLocks() {
    const now = Date.now();
    for (const [key, value] of this.locks.entries()) {
      if (value.expiresAt <= now) {
        this.locks.delete(key);
      }
    }
  }
};
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/entry/compat/transaction/CacheLockManager.ts
module.exports = CacheLockManager;
