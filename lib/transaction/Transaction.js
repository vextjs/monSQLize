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

// src/entry/compat/transaction/Transaction.ts
module.exports = Transaction;
