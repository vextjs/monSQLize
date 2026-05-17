'use strict';

const { EventEmitter } = require('events');

function isTransientError(error) {
  const message = String(error?.message ?? '').toLowerCase();
  return error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT' || message.includes('connection') || message.includes('timeout');
}

function isResumableError(error) {
  return String(error?.message ?? '').toLowerCase().includes('resume token');
}

class ChangeStreamWrapper extends EventEmitter {
  constructor(stream, collection, pipeline = [], options = {}, context = {}) {
    super();
    this.stream = stream;
    this.collection = collection;
    this.pipeline = pipeline;
    this.options = options;
    this.context = context;
    this.closed = false;
    this._reconnecting = false;
    this._lastResumeToken = null;
    this._startedAt = Date.now();
    this._stats = {
      totalChanges: 0,
      reconnectAttempts: 0,
      cacheInvalidations: 0,
      errors: 0,
    };
    this._bindStream(stream);
  }

  _bindStream(stream) {
    if (!stream?.on) {
      return;
    }

    stream.on('change', (change) => {
      this._stats.totalChanges += 1;
      this._lastResumeToken = change?._id ?? null;
      if (this.options.autoInvalidateCache) {
        this._invalidateCache(change).catch(() => {});
      }
      this.emit('change', change);
    });

    stream.on('error', (error) => {
      this._stats.errors += 1;
      if (this.closed) {
        return;
      }
      if (isResumableError(error)) {
        this._lastResumeToken = null;
        this.emit('error', error);
        return;
      }
      if (isTransientError(error)) {
        this._scheduleReconnect();
        return;
      }
      this.emit('fatal', error);
      this.close().catch(() => {});
    });
  }

  async _invalidateCache(change) {
    const cache = this.context.cache;
    if (!cache?.delPattern) {
      return;
    }

    const collectionName = change?.ns?.coll ?? this.collection?.collectionName ?? 'unknown';
    const patterns = [];
    if (change?.operationType === 'insert') {
      patterns.push(`*:${collectionName}:find:*`, `*:${collectionName}:findPage:*`, `*:${collectionName}:count:*`);
    } else if (change?.operationType === 'update') {
      patterns.push(`*:${collectionName}:findOne:*`, `*:${collectionName}:find:*`, `*:${collectionName}:findPage:*`);
    } else if (change?.operationType === 'delete') {
      patterns.push(`*:${collectionName}:findOne:*`, `*:${collectionName}:find:*`, `*:${collectionName}:count:*`);
    }

    for (const pattern of patterns) {
      this._stats.cacheInvalidations += Number(await Promise.resolve(cache.delPattern(pattern))) || 0;
    }
  }

  _scheduleReconnect() {
    if (this.closed || this._reconnecting) {
      return;
    }
    this._reconnecting = true;
    const attempt = ++this._stats.reconnectAttempts;
    this.emit('reconnect', { attempt });
    setTimeout(() => this._performReconnect(), this.options.reconnectInterval ?? 100);
  }

  _performReconnect() {
    if (this.closed) {
      this._reconnecting = false;
      return;
    }
    try {
      const nextStream = this.collection.watch(this.pipeline, this.options);
      this.stream = nextStream;
      this._bindStream(nextStream);
      this._reconnecting = false;
    } catch {
      this._reconnecting = false;
      if (!this.closed) {
        this._scheduleReconnect();
      }
    }
  }

  getResumeToken() {
    return this._lastResumeToken;
  }

  isClosed() {
    return this.closed;
  }

  async close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (typeof this.stream?.close === 'function') {
      await this.stream.close();
    }
    this.emit('close');
  }

  getStats() {
    return {
      ...this._stats,
      uptime: Date.now() - this._startedAt,
      isActive: !this.closed,
    };
  }
}

module.exports = { ChangeStreamWrapper };
