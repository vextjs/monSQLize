'use strict';

// ─── Internal MemoryCache (used by withCache when no external cache provided) ─

class InternalMemoryCache {
  constructor() {
    this._store = new Map();
  }

  async get(key) {
    const entry = this._store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async set(key, value, ttl) {
    const expiresAt = ttl > 0 ? Date.now() + ttl : 0;
    this._store.set(key, { value, expiresAt });
  }

  async del(key) {
    this._store.delete(key);
  }

  keys() {
    const now = Date.now();
    const result = [];
    for (const [key, entry] of this._store) {
      if (entry.expiresAt === 0 || entry.expiresAt > now) result.push(key);
    }
    return result;
  }

  async delPattern(pattern) {
    const re = new RegExp(
      '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
    );
    for (const key of [...this._store.keys()]) {
      if (re.test(key)) this._store.delete(key);
    }
  }

  clear() {
    this._store.clear();
  }
}

// ─── Stable key serialization ─────────────────────────────────────────────────

function stableSerialize(value, seen) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'function') return '[UNSUPPORTED:function]';
  if (typeof value === 'symbol') return '[UNSUPPORTED:symbol]';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (!Number.isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity';
    return String(value);
  }
  if (typeof value !== 'object') return JSON.stringify(value);

  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  try {
    if (value instanceof Date) return `Date(${value.toISOString()})`;
    if (value instanceof RegExp) return `RegExp(${value.toString()})`;
    if (Array.isArray(value)) {
      return `[${value.map((item) => stableSerialize(item, seen)).join(',')}]`;
    }
    const sortedKeys = Object.keys(value).sort();
    const pairs = sortedKeys.map((k) => `${JSON.stringify(k)}:${stableSerialize(value[k], seen)}`);
    return `{${pairs.join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

function simpleHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function buildKey(ns, args) {
  const serialized = args.map((a) => stableSerialize(a, new Set())).join('|');
  const raw = `${ns}:${serialized}`;
  return raw.length > 1024 ? `${ns}:hash:${simpleHash(raw)}` : raw;
}

// ─── Cache validation ─────────────────────────────────────────────────────────

function isValidCache(cache) {
  return (
    cache !== null &&
    typeof cache === 'object' &&
    typeof cache.get === 'function' &&
    typeof cache.set === 'function'
  );
}

// ─── Stats ────────────────────────────────────────────────────────────────────

class Stats {
  constructor() {
    this.hits = 0;
    this.misses = 0;
    this.errors = 0;
  }

  get calls() { return this.hits + this.misses; }
  get hitRate() { return this.calls === 0 ? 0 : this.hits / this.calls; }

  toObject() {
    return {
      hits: this.hits,
      misses: this.misses,
      errors: this.errors,
      calls: this.calls,
      hitRate: this.hitRate,
    };
  }

  reset() {
    this.hits = 0;
    this.misses = 0;
    this.errors = 0;
  }
}

// ─── withCache ────────────────────────────────────────────────────────────────

function withCache(fn, options = {}) {
  if (typeof fn !== 'function') throw new Error('fn must be a function');

  const { ttl = 0, namespace, keyBuilder, condition, cache: externalCache, enableStats = false } = options;

  if (typeof ttl !== 'number' || Number.isNaN(ttl) || ttl < 0)
    throw new Error('ttl must be a non-negative number');
  if (keyBuilder !== undefined && typeof keyBuilder !== 'function')
    throw new Error('keyBuilder must be a function');
  if (condition !== undefined && typeof condition !== 'function')
    throw new Error('condition must be a function');
  if (externalCache !== undefined && !isValidCache(externalCache))
    throw new Error('Invalid cache instance');

  const cache = externalCache || new InternalMemoryCache();
  const ns = namespace || `_wc_${fn.name || 'fn'}_${Math.random().toString(36).slice(2)}`;
  const stats = new Stats();
  const pending = new Map();

  async function cachedFn(...args) {
    // Build cache key — if keyBuilder throws, degrade to executing without cache
    let key;
    try {
      key = keyBuilder ? `${ns}:${keyBuilder(...args)}` : buildKey(ns, args);
    } catch {
      return fn(...args);
    }

    // Stampede prevention: share in-flight promise
    if (pending.has(key)) return pending.get(key);

    // The IIFE starts executing synchronously and suspends at its first await,
    // so pending.set runs before any concurrent call can check the map.
    const promise = (async () => {
      try {
        let cachedEntry;
        try {
          cachedEntry = await cache.get(key);
        } catch {
          // cache.get failed — degrade gracefully
          return fn(...args);
        }

        if (cachedEntry !== undefined) {
          if (enableStats) stats.hits++;
          return cachedEntry.v;
        }

        if (enableStats) stats.misses++;

        const result = await fn(...args);

        let shouldCache = true;
        if (condition) {
          try { shouldCache = !!condition(result); } catch { shouldCache = true; }
        }

        if (shouldCache) {
          try { await cache.set(key, { v: result }, ttl); } catch { /* silent */ }
        }

        return result;
      } finally {
        pending.delete(key);
      }
    })();

    pending.set(key, promise);
    return promise;
  }

  cachedFn.getCacheStats = function () {
    if (!enableStats) return { hits: 0, misses: 0, errors: 0, calls: 0, hitRate: 0 };
    return stats.toObject();
  };
  cachedFn.stats = cachedFn.getCacheStats;

  return cachedFn;
}

// ─── FunctionCache ────────────────────────────────────────────────────────────

class FunctionCache {
  constructor(cacheOrDb, options) {
    if (
      options !== undefined &&
      (typeof options !== 'object' || options === null || Array.isArray(options))
    ) {
      throw new Error('options must be an object');
    }

    const opts = options || {};

    if (opts.namespace !== undefined && typeof opts.namespace !== 'string')
      throw new Error('namespace must be a string');

    const ttl = opts.ttl !== undefined ? opts.ttl : opts.defaultTTL;
    if (ttl !== undefined && (typeof ttl !== 'number' || Number.isNaN(ttl) || ttl < 0))
      throw new Error('defaultTTL must be a non-negative number');

    if (cacheOrDb && typeof cacheOrDb.getCache === 'function') {
      this._cache = cacheOrDb.getCache();
    } else {
      this._cache = cacheOrDb || new InternalMemoryCache();
    }

    this._namespace = opts.namespace || 'fn-cache';
    this._defaultTTL = ttl !== undefined ? ttl : 0;
    this._enableStats = opts.enableStats !== false;
    this._registrations = new Map(); // name → { fn, ttl, stats, trackedKeys }
  }

  async register(name, fn, options) {
    if (!name || typeof name !== 'string')
      throw new Error('Function name must be a non-empty string');
    if (typeof fn !== 'function')
      throw new Error('fn must be a function');
    if (
      options !== undefined &&
      (typeof options !== 'object' || options === null || Array.isArray(options))
    ) {
      throw new Error('options must be an object');
    }

    const opts = options || {};
    const fnTTL = opts.ttl !== undefined ? opts.ttl : (opts.defaultTTL !== undefined ? opts.defaultTTL : this._defaultTTL);

    this._registrations.set(name, {
      fn,
      ttl: fnTTL,
      stats: new Stats(),
      trackedKeys: new Set(),
    });
  }

  async execute(name, ...args) {
    const reg = this._registrations.get(name);
    if (!reg) throw new Error(`Function '${name}' is not registered`);

    const key = buildKey(`${this._namespace}:${name}`, args);

    let cachedEntry;
    try {
      cachedEntry = await this._cache.get(key);
    } catch {
      return reg.fn(...args);
    }

    if (cachedEntry !== undefined) {
      if (this._enableStats) reg.stats.hits++;
      return cachedEntry.v;
    }

    if (this._enableStats) reg.stats.misses++;

    const result = await reg.fn(...args);

    try {
      await this._cache.set(key, { v: result }, reg.ttl);
      reg.trackedKeys.add(key);
    } catch { /* silent */ }

    return result;
  }

  async invalidate(name, ...args) {
    if (!name || typeof name !== 'string')
      throw new Error('Function name must be a non-empty string');
    const reg = this._registrations.get(name);
    if (!reg) throw new Error(`Function '${name}' is not registered`);

    const key = buildKey(`${this._namespace}:${name}`, args);
    try { await this._cache.del(key); } catch { /* silent */ }
    reg.trackedKeys.delete(key);
  }

  async invalidatePattern(pattern) {
    if (!pattern || typeof pattern !== 'string')
      throw new Error('Pattern must be a non-empty string');

    const prefix = `${this._namespace}:`;
    const re = new RegExp(
      '^' +
      prefix.replace(/[.+?^${}()|[\]\\]/g, '\\$&') +
      pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') +
      '$',
    );

    for (const reg of this._registrations.values()) {
      for (const key of [...reg.trackedKeys]) {
        if (pattern === '*' || re.test(key)) {
          try { await this._cache.del(key); } catch { /* silent */ }
          reg.trackedKeys.delete(key);
        }
      }
    }
  }

  list() {
    return Array.from(this._registrations.keys());
  }

  clear() {
    this._registrations.clear();
  }

  getStats(name) {
    if (!this._enableStats) return null;
    if (name !== undefined) {
      const reg = this._registrations.get(name);
      return reg ? reg.stats.toObject() : null;
    }
    const result = {};
    for (const [n, reg] of this._registrations) result[n] = reg.stats.toObject();
    return result;
  }

  resetStats(name) {
    if (name !== undefined) {
      const reg = this._registrations.get(name);
      if (reg) reg.stats.reset();
    } else {
      for (const reg of this._registrations.values()) reg.stats.reset();
    }
  }
}

module.exports = { withCache, FunctionCache };
