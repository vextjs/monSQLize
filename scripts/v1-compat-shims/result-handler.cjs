'use strict';

function normalizeMetadata(result) {
  if (!result || typeof result !== 'object' || !('value' in result)) {
    return null;
  }
  const hasValue = result.value !== null && result.value !== undefined;
  return {
    value: result.value ?? null,
    ok: result.ok ?? 1,
    lastErrorObject: result.lastErrorObject ?? {
      n: hasValue ? 1 : 0,
      ...(hasValue ? { updatedExisting: true } : {}),
    },
  };
}

function handleFindOneAndResult(result, options = {}) {
  if (!result) {
    return options.includeResultMetadata ? {
      value: null,
      ok: 1,
      lastErrorObject: { n: 0 },
    } : null;
  }

  const normalized = normalizeMetadata(result);
  if (!normalized) {
    if (options.includeResultMetadata && typeof result === 'object' && !Array.isArray(result)) {
      return {
        value: result,
        ok: 1,
        lastErrorObject: {
          n: 1,
          updatedExisting: true,
        },
      };
    }
    return null;
  }

  return options.includeResultMetadata ? normalized : normalized.value;
}

function wasDocumentModified(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return false;
  }

  const meta = result.lastErrorObject;
  if (!meta || typeof meta !== 'object') {
    return false;
  }

  if (meta.updatedExisting === true) {
    return true;
  }
  if (meta.upserted !== null && meta.upserted !== undefined) {
    return true;
  }
  if (typeof meta.n === 'number' && meta.n > 0) {
    return true;
  }
  if (result.value !== null && result.value !== undefined) {
    return true;
  }

  return false;
}

module.exports = {
  handleFindOneAndResult,
  wasDocumentModified,
};
