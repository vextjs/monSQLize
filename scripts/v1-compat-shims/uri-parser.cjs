'use strict';

function parseUri(uri) {
  try {
    const parsed = new URL(uri);
    const protocol = parsed.protocol.replace(/:$/, '');
    if (!['mongodb', 'postgresql', 'mysql', 'redis'].includes(protocol)) {
      throw new Error('Unsupported URI format');
    }
    return {
      protocol,
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : undefined,
      auth: parsed.username ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ''}` : null,
    };
  } catch {
    throw new Error('Unsupported URI format');
  }
}

module.exports = { parseUri };
