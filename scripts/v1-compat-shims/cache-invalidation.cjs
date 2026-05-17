'use strict';

const CacheFactory = require('./cache.cjs');

class CacheInvalidationEngine {
  static matchesField(value, condition) {
    if (condition === null || condition === undefined || typeof condition !== 'object' || Array.isArray(condition)) {
      return value === condition;
    }

    for (const [operator, expected] of Object.entries(condition)) {
      switch (operator) {
        case '$in':
          if (!Array.isArray(expected) || !expected.includes(value)) {
            return false;
          }
          break;
        case '$gt':
          if (!(value > expected)) {
            return false;
          }
          break;
        case '$gte':
          if (!(value >= expected)) {
            return false;
          }
          break;
        case '$lt':
          if (!(value < expected)) {
            return false;
          }
          break;
        case '$lte':
          if (!(value <= expected)) {
            return false;
          }
          break;
        case '$ne':
          if (value === expected) {
            return false;
          }
          break;
        case '$exists':
          if (Boolean(expected) !== (value !== undefined)) {
            return false;
          }
          break;
        default:
          return false;
      }
    }

    return true;
  }

  static matchesQuery(document, query) {
    if (!query || typeof query !== 'object') {
      return true;
    }

    return Object.entries(query).every(([field, condition]) => {
      if (field.startsWith('$')) {
        return false;
      }
      return CacheInvalidationEngine.matchesField(document?.[field], condition);
    });
  }

  static hasComplexOperators(query) {
    if (!query || typeof query !== 'object') {
      return false;
    }

    return ['$or', '$nor', '$expr', '$where', '$text'].some((operator) => operator in query);
  }

  static extractQueryFromKey(key) {
    try {
      const parsed = JSON.parse(key);
      return parsed.query ?? parsed.base?.query ?? null;
    } catch {
      return null;
    }
  }

  static mergeFilterAndUpdate(filter, update) {
    const base = filter && typeof filter === 'object' ? { ...filter } : {};
    const mutation = update && typeof update === 'object' ? update : {};

    if (mutation.$set && typeof mutation.$set === 'object') {
      Object.assign(base, mutation.$set);
    }

    if (mutation.$inc && typeof mutation.$inc === 'object') {
      for (const [key, delta] of Object.entries(mutation.$inc)) {
        base[key] = typeof delta === 'number' ? delta : 0;
      }
    }

    if (mutation.$unset && typeof mutation.$unset === 'object') {
      for (const key of Object.keys(mutation.$unset)) {
        delete base[key];
      }
    }

    if (Object.keys(mutation).length > 0 && !Object.keys(mutation).some((key) => key.startsWith('$'))) {
      Object.assign(base, mutation);
    }

    return base;
  }

  static async invalidatePrecise(cache, context = {}) {
    const namespacePattern = CacheFactory.buildNamespacePattern({
      iid: context.instanceId ?? context.iid,
      type: context.type,
      db: context.db,
      collection: context.collection,
    });

    const keys = await Promise.resolve(cache.keys(namespacePattern));
    if (!Array.isArray(keys) || keys.length === 0) {
      return 0;
    }

    const matched = [];
    for (const key of keys) {
      const query = CacheInvalidationEngine.extractQueryFromKey(key);
      if (query === null) {
        continue;
      }
      if (CacheInvalidationEngine.hasComplexOperators(query)) {
        continue;
      }
      if (CacheInvalidationEngine.matchesQuery(context.document ?? {}, query)) {
        matched.push(key);
      }
    }

    if (matched.length === 0) {
      return 0;
    }

    return Number(await Promise.resolve(cache.delMany(matched))) || 0;
  }
}

module.exports = CacheInvalidationEngine;
