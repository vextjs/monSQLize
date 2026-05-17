'use strict';

const { ObjectId } = require('mongodb');

const OBJECTID_FIELD_PATTERNS = ['_id', /^.*Id$/, /^.*Ids$/, /^.*_id$/, /^.*_ids$/];
const SPECIAL_OPERATORS = new Set(['$expr', '$function', '$where', '$accumulator']);

function shouldConvertField(fieldName) {
  if (!fieldName || typeof fieldName !== 'string') {
    return false;
  }
  return OBJECTID_FIELD_PATTERNS.some((pattern) => typeof pattern === 'string' ? fieldName === pattern : pattern.test(fieldName));
}

function isValidObjectIdString(value) {
  return typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value) && ObjectId.isValid(value);
}

function isFieldReference(value) {
  return typeof value === 'string' && value.startsWith('$');
}

function convertObjectIdStrings(obj, fieldPath = '', depth = 0, visited = new WeakSet()) {
  if (depth > 10 || obj === null || obj === undefined) {
    return obj;
  }
  if (obj instanceof ObjectId) {
    return obj;
  }
  if (obj && typeof obj === 'object' && obj.constructor?.name === 'ObjectId') {
    try {
      const hex = obj.toString();
      return isValidObjectIdString(hex) ? new ObjectId(hex) : obj;
    } catch {
      return obj;
    }
  }
  if (typeof obj === 'string') {
    if (isFieldReference(obj)) {
      return obj;
    }
    return isValidObjectIdString(obj) ? new ObjectId(obj) : obj;
  }
  if (Array.isArray(obj)) {
    let changed = false;
    const converted = obj.map((item, index) => {
      const next = convertObjectIdStrings(item, `${fieldPath}[${index}]`, depth + 1, visited);
      if (next !== item) {
        changed = true;
      }
      return next;
    });
    return changed ? converted : obj;
  }
  if (typeof obj === 'object') {
    if (visited.has(obj)) {
      return obj;
    }
    visited.add(obj);
    let changed = false;
    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      if (SPECIAL_OPERATORS.has(key)) {
        converted[key] = value;
        continue;
      }
      if (typeof value === 'string' && shouldConvertField(key) && !isFieldReference(value) && isValidObjectIdString(value)) {
        converted[key] = new ObjectId(value);
        changed = true;
        continue;
      }
      const next = convertObjectIdStrings(value, fieldPath ? `${fieldPath}.${key}` : key, depth + 1, visited);
      if (next !== value) {
        changed = true;
      }
      converted[key] = next;
    }
    return changed ? converted : obj;
  }
  return obj;
}

module.exports = { convertObjectIdStrings };
