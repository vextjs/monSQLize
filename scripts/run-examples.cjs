#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { MongoClient } = require('mongodb');
const {
    configureMemoryServerEnv,
    createMemoryServerDbPath,
    memoryServerCleanupOptions,
    resolveMemoryServerBinaryVersion,
    resolveMemoryServerLaunchTimeoutMs,
    resolveReplSetBinaryVersion,
    seedMemoryServerBinaryCache,
} = require('./validation/memory-server-policy.cjs');

const projectRoot = path.resolve(__dirname, '..');
const exampleScripts = [
    '.generated/examples-dist/examples/quick-start/basic-connect.js',
    '.generated/examples-dist/examples/cache/with-cache.js',
    '.generated/examples-dist/examples/docs/insert.js',
    '.generated/examples-dist/examples/docs/insert-many.js',
    '.generated/examples-dist/examples/docs/update.js',
    '.generated/examples-dist/examples/docs/update-one.js',
    '.generated/examples-dist/examples/docs/delete.js',
    '.generated/examples-dist/examples/docs/delete-many.js',
    '.generated/examples-dist/examples/docs/upsert.js',
    '.generated/examples-dist/examples/docs/upsert-one.js',
    '.generated/examples-dist/examples/docs/find.js',
    '.generated/examples-dist/examples/docs/find-one.js',
    '.generated/examples-dist/examples/docs/find-one-by-id.js',
    '.generated/examples-dist/examples/docs/find-by-ids.js',
    '.generated/examples-dist/examples/docs/find-page.js',
    '.generated/examples-dist/examples/docs/find-and-count.js',
    '.generated/examples-dist/examples/docs/count.js',
    '.generated/examples-dist/examples/docs/distinct.js',
    '.generated/examples-dist/examples/docs/explain.js',
    '.generated/examples-dist/examples/docs/aggregate.js',
    '.generated/examples-dist/examples/docs/chaining-api.js',
    '.generated/examples-dist/examples/docs/expression-functions.js',
    '.generated/examples-dist/examples/docs/model.js',
    '.generated/examples-dist/examples/docs/collection-management.js',
    '.generated/examples-dist/examples/docs/bookmarks.js',
    '.generated/examples-dist/examples/docs/transaction.js',
    '.generated/examples-dist/examples/docs/transaction-rollback.js',
    '.generated/examples-dist/examples/docs/slow-query-log.js',
    '.generated/examples-dist/examples/docs/watch.js',
    '.generated/examples-dist/examples/docs/aggregate-advanced.js',
    '.generated/examples-dist/examples/docs/batch-operations.js',
    '.generated/examples-dist/examples/docs/soft-delete.js',
    '.generated/examples-dist/examples/docs/increment-one.js',
    '.generated/examples-dist/examples/docs/populate-relations.js',
    '.generated/examples-dist/examples/docs/saga.js',
    '.generated/examples-dist/examples/docs/lock.js',
    '.generated/examples-dist/examples/docs/lock-timeout.js',
    '.generated/examples-dist/examples/docs/cache-multilevel.js',
    '.generated/examples-dist/examples/docs/objectid.js',
    '.generated/examples-dist/examples/docs/pool.js',
    '.generated/examples-dist/examples/docs/pool-fallback.js',
    '.generated/examples-dist/examples/docs/sync.js',
    '.generated/examples-dist/examples/docs/sync-target-failure.js',
];

function runExample(script, env) {
    console.log(`[examples] ${script}`);
    const result = spawnSync(process.execPath, [script], {
        cwd: projectRoot,
        stdio: 'inherit',
        shell: false,
        env,
    });

    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`${script} failed with exit code ${result.status ?? 1}`);
    }
}

async function startSharedServers() {
    const singleVersion = resolveMemoryServerBinaryVersion();
    const replSetVersion = resolveReplSetBinaryVersion();
    configureMemoryServerEnv(singleVersion);
    await seedMemoryServerBinaryCache(singleVersion);
    if (replSetVersion !== singleVersion) {
        await seedMemoryServerBinaryCache(replSetVersion);
    }

    const launchTimeout = resolveMemoryServerLaunchTimeoutMs();

    const server = await startStandaloneServer(singleVersion, launchTimeout);
    const replSet = await startReplSetServer(replSetVersion, launchTimeout);

    return { server, replSet, singleVersion, replSetVersion, launchTimeout };
}

async function startStandaloneServer(version, launchTimeout) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    return MongoMemoryServer.create({
        binary: { version },
        instance: {
            dbName: 'monsqlize_examples_shared',
            dbPath: createMemoryServerDbPath('examples-single', 'monsqlize_examples_shared'),
            ...(launchTimeout ? { launchTimeout } : {}),
        },
    });
}

async function startReplSetServer(version, launchTimeout) {
    const { MongoMemoryReplSet } = require('mongodb-memory-server');
    return MongoMemoryReplSet.create({
        binary: { version },
        replSet: {
            count: 1,
            dbName: 'monsqlize_examples_replset',
            storageEngine: 'wiredTiger',
        },
        instanceOpts: [
            {
                dbPath: createMemoryServerDbPath('examples-replset', 'monsqlize_examples_replset'),
                ...(launchTimeout ? { launchTimeout } : {}),
            },
        ],
    });
}

async function pingMongo(uri) {
    const client = new MongoClient(uri, {
        serverSelectionTimeoutMS: Number.parseInt(process.env.MONSQLIZE_EXAMPLES_PING_TIMEOUT_MS || '5000', 10),
    });
    try {
        await client.connect();
        await client.db('admin').command({ ping: 1 });
    } finally {
        await client.close().catch(() => undefined);
    }
}

async function ensureSharedServers(shared) {
    try {
        await pingMongo(shared.server.getUri());
    } catch (error) {
        console.warn(`[examples] standalone health check failed; restarting shared server: ${(error && error.message) || error}`);
        await shared.server.stop(memoryServerCleanupOptions()).catch(() => undefined);
        shared.server = await startStandaloneServer(shared.singleVersion, shared.launchTimeout);
    }

    try {
        await pingMongo(shared.replSet.getUri());
    } catch (error) {
        console.warn(`[examples] replica-set health check failed; restarting shared server: ${(error && error.message) || error}`);
        await shared.replSet.stop(memoryServerCleanupOptions()).catch(() => undefined);
        shared.replSet = await startReplSetServer(shared.replSetVersion, shared.launchTimeout);
    }
}

function createExampleEnv(shared) {
    return {
        ...process.env,
        MONSQLIZE_EXAMPLES_MONGO_URI: shared.server.getUri(),
        MONSQLIZE_MEMORY_MONGO_URI: shared.server.getUri(),
        MONSQLIZE_EXAMPLES_REPLSET_URI: shared.replSet.getUri(),
        MONSQLIZE_REPLSET_URI: shared.replSet.getUri(),
    };
}

(async () => {
    let shared = null;
    let exitCode = 0;

    try {
        shared = await startSharedServers();

        for (const script of exampleScripts) {
            await ensureSharedServers(shared);
            runExample(script, createExampleEnv(shared));
        }
    } catch (error) {
        exitCode = 1;
        console.error(error && error.stack ? error.stack : String(error));
    } finally {
        if (shared?.replSet) {
            await shared.replSet.stop(memoryServerCleanupOptions());
        }
        if (shared?.server) {
            await shared.server.stop(memoryServerCleanupOptions());
        }
    }

    process.exit(exitCode);
})();
