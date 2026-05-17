'use strict';

const { createHash } = require('node:crypto');

function stableStringify(value) {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeLogShape(log = {}) {
  return {
    db: log.db ?? '',
    collection: log.collection ?? log.coll ?? '',
    operation: log.operation ?? log.op ?? '',
    queryShape: log.queryShape ?? {},
  };
}

function generateQueryHash(log) {
  const normalized = normalizeLogShape(log);
  return createHash('sha1').update(stableStringify(normalized)).digest('hex').slice(0, 16);
}

module.exports = {
  generateQueryHash,
};
