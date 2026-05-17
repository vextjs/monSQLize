'use strict';

const DEFAULT_CONFIG = {
  enabled: false,
  storage: {
    type: null,
    useBusinessConnection: true,
    uri: null,
    mongodb: {
      database: 'admin',
      collection: 'slow_query_logs',
      ttl: 7 * 24 * 3600,
    },
  },
  deduplication: {
    enabled: true,
    strategy: 'aggregate',
    keepRecentExecutions: 0,
  },
  batch: {
    enabled: true,
    size: 10,
    interval: 5000,
    maxBufferSize: 100,
  },
  filter: {
    excludeDatabases: [],
    excludeCollections: [],
    excludeOperations: [],
    minExecutionTimeMs: 0,
  },
  advanced: {
    errorHandling: 'log',
    autoCreateIndexes: true,
  },
};

function deepClone(value) {
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item));
  }
  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = deepClone(entry);
    }
    return output;
  }
  return value;
}

function deepMerge(target, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return source === undefined ? target : source;
  }

  const output = deepClone(target);
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = deepMerge(output[key] ?? {}, value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

class SlowQueryLogConfigManager {
  static mergeConfig(userConfig, businessType = 'mongodb') {
    if (userConfig === undefined || userConfig === null) {
      return deepClone(DEFAULT_CONFIG);
    }

    if (typeof userConfig === 'boolean') {
      const config = deepClone(DEFAULT_CONFIG);
      config.enabled = userConfig;
      config.storage.type = businessType;
      return config;
    }

    if (typeof userConfig !== 'object' || Array.isArray(userConfig)) {
      throw new Error('Invalid slowQueryLog config type');
    }

    const config = deepMerge(DEFAULT_CONFIG, userConfig);

    if (userConfig.storage && userConfig.enabled === undefined) {
      config.enabled = true;
    }

    if (!config.storage.type) {
      if (config.storage.useBusinessConnection !== false) {
        config.storage.type = businessType;
      } else if (config.storage.uri) {
        config.storage.type = 'mongodb';
      } else {
        config.storage.type = businessType;
      }
    }

    return config;
  }

  static validate(config, businessType = 'mongodb') {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('Invalid slowQueryLog config type');
    }

    const storageType = config.storage?.type;
    if (!storageType || !['mongodb', 'memory', 'postgresql', 'mysql'].includes(storageType)) {
      throw new Error('Invalid storage.type');
    }

    if (config.storage?.useBusinessConnection && storageType !== businessType) {
      throw new Error(`Cannot use business connection when storage type is ${storageType}`);
    }

    if (storageType === 'mongodb' && config.storage?.useBusinessConnection === false && !config.storage?.uri) {
      throw new Error('storage.uri is required when useBusinessConnection=false');
    }

    const strategy = config.deduplication?.strategy;
    if (strategy !== undefined && !['aggregate', 'raw'].includes(strategy)) {
      throw new Error('Invalid deduplication.strategy');
    }

    const ttl = config.storage?.mongodb?.ttl;
    if (ttl !== undefined && ttl <= 0) {
      throw new Error('storage.mongodb.ttl must be positive');
    }

    const batchSize = config.batch?.size;
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
      throw new Error('batch.size must be between 1 and 1000');
    }

    const batchInterval = config.batch?.interval;
    if (!Number.isInteger(batchInterval) || batchInterval < 100) {
      throw new Error('batch.interval must be >= 100ms');
    }

    return true;
  }
}

module.exports = {
  SlowQueryLogConfigManager,
  DEFAULT_CONFIG,
};
