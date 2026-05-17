'use strict';

function buildCommonLogExtra(options) {
  if (!options || typeof options !== 'object') {
    return {};
  }

  const result = {};
  for (const key of ['limit', 'skip', 'maxTimeMS', 'cache']) {
    if (options[key] !== undefined) {
      result[key] = options[key];
    }
  }

  if (Array.isArray(options.pipeline)) {
    result.pipelineStages = options.pipeline
      .slice(0, 30)
      .map((stage) => (stage && typeof stage === 'object' ? Object.keys(stage)[0] : undefined))
      .filter(Boolean);
  }

  if (options.after !== undefined) {
    result.hasCursor = true;
    result.cursorDirection = 'after';
  } else if (options.before !== undefined) {
    result.hasCursor = true;
    result.cursorDirection = 'before';
  }

  return result;
}

module.exports = { buildCommonLogExtra };
