"use strict";

// src/capabilities/transaction/index.ts
var import_node_crypto = require("node:crypto");
var Transaction = class {
  constructor(session, options = {}) {
    this.session = session;
    this.options = options;
    this.id = `tx_${(0, import_node_crypto.randomBytes)(8).toString("hex")}`;
    this.state = "pending";
    this.startedAt = null;
    this.timeoutTimer = null;
    this.pendingInvalidations = /* @__PURE__ */ new Set();
    this.session.__monSQLizeTransaction = this;
  }
  /**
   * Start the transaction.
   * @since v1.4.0
   */
  async start() {
    if (this.state !== "pending") {
      throw new Error(`Cannot start transaction in state: ${this.state}`);
    }
    this.session.startTransaction();
    this.state = "active";
    this.startedAt = Date.now();
    const timeout = this.options.timeout ?? 3e4;
    if (timeout > 0) {
      this.timeoutTimer = setTimeout(() => {
        if (this.state === "active") {
          this.options.logger?.warn?.(`[Transaction] auto-abort on timeout: ${this.id}`);
          void this.abort();
        }
      }, timeout);
      this.timeoutTimer.unref?.();
    }
  }
  /**
   * Commit the transaction.
   * @since v1.4.0
   */
  async commit() {
    if (this.state !== "active") {
      throw new Error(`Cannot commit transaction in state: ${this.state}`);
    }
    if (typeof this.session.commitTransaction === "function") {
      await this.session.commitTransaction();
    }
    this.state = "committed";
    this.options.lockManager?.releaseLocks(this.id);
    this.pendingInvalidations.clear();
    this.clearTimeout();
  }
  /**
   * Roll back the transaction.
   * @since v1.4.0
   */
  async abort() {
    if (this.state !== "pending" && this.state !== "active") {
      return;
    }
    if (this.state === "active") {
      if (typeof this.session.abortTransaction === "function") {
        await this.session.abortTransaction();
      }
    }
    this.state = "aborted";
    this.options.lockManager?.releaseLocks(this.id);
    this.pendingInvalidations.clear();
    this.clearTimeout();
  }
  /**
   * End the transaction session.
   * @since v1.4.0
   */
  async end() {
    this.clearTimeout();
    this.options.lockManager?.releaseLocks(this.id);
    await this.session.endSession();
  }
  /**
   * Record a cache invalidation intent.
   * @since v1.4.0
   */
  async recordInvalidation(pattern) {
    this.pendingInvalidations.add(pattern);
    this.options.lockManager?.addLock(pattern, this.id);
    if (this.options.cache?.delPattern) {
      await this.options.cache.delPattern(pattern);
    }
  }
  /**
   * Get the transaction duration.
   * @since v1.4.0
   */
  getDuration() {
    if (!this.startedAt) {
      return 0;
    }
    return Date.now() - this.startedAt;
  }
  /**
   * Get transaction info.
   * @since v1.4.0
   */
  getInfo() {
    return {
      id: this.id,
      status: this.state,
      duration: this.getDuration(),
      sessionId: stringifySessionId(this.session.id)
    };
  }
  clearTimeout() {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }
};
var TransactionManager = class {
  constructor(input, legacyCache, legacyOptions = {}) {
    this.activeTransactions = /* @__PURE__ */ new Map();
    this.durations = [];
    this.stats = {
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0
    };
    const options = "client" in input ? input : {
      client: input,
      cache: legacyCache,
      ...legacyOptions
    };
    this.client = options.client;
    this.cache = options.cache ?? null;
    this.logger = options.logger ?? null;
    this.lockManager = options.lockManager ?? null;
    this.defaultOptions = {
      maxDuration: options.maxDuration ?? 3e4,
      enableRetry: options.enableRetry ?? true,
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 100,
      retryBackoff: options.retryBackoff ?? 2
    };
  }
  /**
   * Create a manual transaction session.
   * @since v1.4.0
   */
  async startSession(options = {}) {
    const session = this.client.startSession({
      causalConsistency: options.causalConsistency !== false
    });
    const transaction = new Transaction(session, {
      cache: this.cache,
      logger: this.logger,
      lockManager: options.enableCacheLock === false ? null : this.lockManager,
      timeout: options.timeout ?? options.maxDuration ?? this.defaultOptions.maxDuration
    });
    const originalEnd = transaction.end.bind(transaction);
    transaction.end = async () => {
      await originalEnd();
      this.activeTransactions.delete(transaction.id);
    };
    this.activeTransactions.set(transaction.id, transaction);
    return transaction;
  }
  /**
   * Automatically manage the transaction lifecycle.
   * @since v1.4.0
   */
  async withTransaction(callback, options = {}) {
    const maxRetries = options.maxRetries ?? this.defaultOptions.maxRetries;
    const retryDelay = options.retryDelay ?? this.defaultOptions.retryDelay;
    const retryBackoff = options.retryBackoff ?? this.defaultOptions.retryBackoff;
    const enableRetry = options.enableRetry ?? this.defaultOptions.enableRetry;
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const transaction = await this.startSession(options);
      const startedAt = Date.now();
      try {
        await transaction.start();
        const result = await callback(transaction);
        await transaction.commit();
        this.recordStats(Date.now() - startedAt, true);
        return result;
      } catch (error) {
        lastError = error;
        await transaction.abort();
        this.recordStats(Date.now() - startedAt, false);
        if (!enableRetry || attempt === maxRetries || !isTransientTransactionError(error)) {
          throw error;
        }
        await sleep(retryDelay * Math.pow(retryBackoff, attempt));
      } finally {
        await transaction.end();
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Transaction failed.");
  }
  /**
   * Get all active transactions.
   * @since v1.4.0
   */
  getActiveTransactions() {
    return [...this.activeTransactions.values()];
  }
  /**
   * Abort all active transactions.
   * @since v1.4.0
   */
  async abortAll() {
    const transactions = this.getActiveTransactions();
    for (const transaction of transactions) {
      await transaction.abort();
      await transaction.end();
      this.activeTransactions.delete(transaction.id);
    }
  }
  /**
   * Get transaction statistics.
   * @since v1.4.0
   */
  getStats() {
    const averageDuration = this.durations.length === 0 ? 0 : this.durations.reduce((sum, item) => sum + item, 0) / this.durations.length;
    return {
      totalTransactions: this.stats.totalTransactions,
      successfulTransactions: this.stats.successfulTransactions,
      failedTransactions: this.stats.failedTransactions,
      activeTransactions: this.activeTransactions.size,
      averageDuration
    };
  }
  recordStats(duration, success) {
    this.stats.totalTransactions += 1;
    if (success) {
      this.stats.successfulTransactions += 1;
    } else {
      this.stats.failedTransactions += 1;
    }
    this.durations.push(duration);
    if (this.durations.length > 100) {
      this.durations.shift();
    }
  }
};
function stringifySessionId(id) {
  if (typeof id === "string") {
    return id;
  }
  if (typeof id === "object" && id !== null) {
    const candidate = id;
    if (typeof candidate.toHexString === "function") {
      return candidate.toHexString();
    }
    if (candidate.id?.buffer) {
      return Buffer.from(candidate.id.buffer).toString("hex");
    }
    if (typeof candidate.toString === "function") {
      return candidate.toString();
    }
  }
  return String(id);
}
function isTransientTransactionError(error) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error;
  if (typeof candidate.hasErrorLabel === "function" && candidate.hasErrorLabel("TransientTransactionError")) {
    return true;
  }
  return candidate.code === 112 || candidate.code === 117;
}
async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// src/entry/compat/transaction/TransactionManager.ts
module.exports = TransactionManager;
