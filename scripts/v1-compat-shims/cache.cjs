'use strict';

const MonSQLize = require('../../lib/index.js');

const MemoryCache = MonSQLize.MemoryCache;

function stringifyBson(value) {
  const bsonType = value?._bsontype;
  if (!bsonType) {
    return null;
  }

  try {
    switch (bsonType) {
      case 'ObjectId':
        return `[BSON:ObjectId:${value.toHexString()}]`;
      case 'Decimal128':
        return `[BSON:Decimal128:${value.toString()}]`;
      case 'Long':
        return `[BSON:Long:${value.toString()}]`;
      case 'Binary':
        return `[BSON:Binary:${value.sub_type ?? value.subType ?? 'unknown'}:${typeof value.toString === 'function' ? value.toString('base64') : ''}]`;
      case 'UUID':
        return `[BSON:Binary:4:${typeof value.toString === 'function' ? value.toString() : ''}]`;
      default:
        return `[BSON:${bsonType}:${typeof value.toString === 'function' ? value.toString() : ''}]`;
    }
  } catch {
    return `[BSON:${bsonType}]`;
  }
}

function stableStringify(value, seen = new WeakSet()) {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }

  const bsonMarker = typeof value === 'object' ? stringifyBson(value) : null;
  if (bsonMarker) {
    return JSON.stringify(bsonMarker);
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'bigint') {
    return JSON.stringify(value.toString());
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item, seen)).join(',')}]`;
  }

  if (typeof value === 'function') {
    return JSON.stringify(`[Function:${value.name || 'anonymous'}]`);
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return JSON.stringify('[CIRCULAR]');
    }

    seen.add(value);
    const keys = Object.keys(value).sort((left, right) => left.localeCompare(right));
    const result = `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key], seen)}`).join(',')}}`;
    seen.delete(value);
    return result;
  }

  return JSON.stringify(String(value));
}

function buildNamespace(input = {}) {
  return {
    p: 'monSQLize',
    v: 1,
    iid: input.iid ?? input.instanceId ?? 'default',
    type: input.type ?? 'mongodb',
    db: input.db ?? input.databaseName ?? 'default',
    collection: input.collection ?? 'default',
  };
}

function buildCacheKey(input = {}) {
  const { op = 'find', base = {}, ...rest } = input;
  return {
    ns: buildNamespace(rest),
    op,
    ...base,
  };
}

function buildNamespacePattern(input = {}) {
  return `*"ns":${stableStringify(buildNamespace(input))}*`;
}

function buildNamespaceOpPattern(input = {}, op = '*') {
  return `${buildNamespacePattern(input)}*"op":${JSON.stringify(op)}*`;
}

MemoryCache.createDefault = function createDefault(options = {}) {
  return new MemoryCache(options);
};
MemoryCache.stableStringify = stableStringify;
MemoryCache.buildCacheKey = buildCacheKey;
MemoryCache.buildNamespacePattern = buildNamespacePattern;
MemoryCache.buildNamespaceOpPattern = buildNamespaceOpPattern;

module.exports = MemoryCache;
