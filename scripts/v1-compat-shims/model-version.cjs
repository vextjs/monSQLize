'use strict';

function parseVersionConfig(config) {
  if (config === false || config == null) {
    return null;
  }
  if (config === true) {
    return { enabled: true, field: 'version' };
  }
  return {
    enabled: config.enabled !== false,
    field: config.field || 'version',
  };
}

module.exports = { parseVersionConfig };
