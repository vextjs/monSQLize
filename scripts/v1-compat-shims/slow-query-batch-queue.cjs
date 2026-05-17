'use strict';

class BatchQueue {
  constructor(storage, options = {}, logger = null) {
    this.storage = storage;
    this.buffer = [];
    this.batchSize = options.batchSize ?? options.size ?? 10;
    this.flushInterval = options.flushInterval ?? options.interval ?? 5000;
    this.maxBufferSize = options.maxBufferSize ?? 100;
    this.logger = logger;
    this.timer = null;
    this.flushing = false;
  }

  async add(log) {
    this.buffer.push(log);
    if (this.buffer.length >= this.maxBufferSize || this.buffer.length >= this.batchSize) {
      await this.flush();
      return;
    }
    if (!this.timer) {
      this.timer = setTimeout(() => {
        void this.flush();
      }, this.flushInterval);
    }
  }

  async flush() {
    if (this.flushing || this.buffer.length === 0) {
      return;
    }

    this.flushing = true;
    const logs = this.buffer.splice(0, this.buffer.length);

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    try {
      await this.storage.saveBatch(logs);
    } catch (error) {
      this.logger?.error?.(error);
    } finally {
      this.flushing = false;
    }
  }

  async close() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.flush();
  }
}

module.exports = {
  BatchQueue,
};
