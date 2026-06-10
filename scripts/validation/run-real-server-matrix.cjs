const { spawnSync } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');
const testDistRoot = path.join('.generated', 'test-dist');

function distTest(suite) {
    return path.join(testDistRoot, suite);
}

function run(command, args, extraEnv = {}) {
    const result = spawnSync(command, args, {
        cwd: projectRoot,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: {
            ...process.env,
            ...extraEnv,
        },
    });

    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
}

function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        console.error(`[server-matrix] missing environment variable: ${name}`);
        process.exit(2);
    }
    return value;
}

const memoryUri = requireEnv('MONSQLIZE_MEMORY_MONGO_URI');
const replSetUri = requireEnv('MONSQLIZE_REPLSET_URI');

console.log('[server-matrix] running real server matrix with external Mongo services...');
console.log(`[server-matrix] MONSQLIZE_MEMORY_MONGO_URI: ${memoryUri}`);
console.log(`[server-matrix] MONSQLIZE_REPLSET_URI: ${replSetUri}`);

run('npm', ['run', 'build']);
run('npm', ['run', 'build:tests']);
run('node', ['--test',
    distTest('test/integration/mongodb/connect.test.js'),
    distTest('test/integration/mongodb/queries.test.js'),
    distTest('test/integration/mongodb/management.test.js'),
    distTest('test/integration/mongodb/writes-batch.test.js'),
    distTest('test/integration/model/model-features.test.js'),
    distTest('test/integration/pool/pool.test.js'),
    distTest('test/integration/slow-query-log/slow-query-log.test.js'),
], {
    MONSQLIZE_MEMORY_MONGO_URI: memoryUri,
});

run('node', ['--test',
    distTest('test/integration/transaction/transaction.test.js'),
    distTest('test/integration/sync/sync.test.js'),
], {
    MONSQLIZE_MATRIX_MODE: '1',
    MONSQLIZE_REPLSET_URI: replSetUri,
});

console.log('[server-matrix] real server matrix completed');

