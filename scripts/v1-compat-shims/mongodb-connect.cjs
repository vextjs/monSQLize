'use strict';

const { MongoClient } = require('mongodb');

async function stopMemoryServer(instance) {
  if (instance && typeof instance.stop === 'function') {
    await instance.stop();
  }
}

async function closeMongo(client, logger, stopMemory = false) {
  if (client && typeof client.close === 'function') {
    try {
      await client.close();
    } catch (error) {
      logger?.warn?.('[MongoDB] close error', error);
    }
  }

  if (stopMemory) {
    await stopMemoryServer(null);
  }
}

async function connectMongo(params = {}) {
  const { config = {}, databaseName, logger } = params;
  if (!config.uri && !config.useMemoryServer) {
    throw new Error('[MongoDB] connect requires config.uri when useMemoryServer is false');
  }

  if (config.useMemoryServer) {
    return {
      client: null,
      db: null,
      uri: config.uri ?? `mongodb://127.0.0.1:27017/${databaseName ?? 'test'}`,
    };
  }

  try {
    const clientOptions = { ...(config.options || {}) };
    if (config.readPreference) {
      clientOptions.readPreference = config.readPreference;
    }

    const client = new MongoClient(config.uri, clientOptions);
    await client.connect();

    const dbName = databaseName || config.databaseName;
    return {
      client,
      db: client.db(dbName),
      uri: config.uri,
    };
  } catch (error) {
    logger?.error?.('[MongoDB] connection failed', {}, error);
    throw error;
  }
}

module.exports = {
  connectMongo,
  closeMongo,
  stopMemoryServer,
};
