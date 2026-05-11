const { spawnSync } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');

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
        console.error(`[server-matrix] 缺少环境变量: ${name}`);
        process.exit(2);
    }
    return value;
}

const memoryUri = requireEnv('MONSQLIZE_MEMORY_MONGO_URI');
const replSetUri = requireEnv('MONSQLIZE_REPLSET_URI');

console.log('[server-matrix] 使用外部 Mongo 服务执行真实服务端矩阵...');
console.log(`[server-matrix] MONSQLIZE_MEMORY_MONGO_URI: ${memoryUri}`);
console.log(`[server-matrix] MONSQLIZE_REPLSET_URI: ${replSetUri}`);

run('npm', ['run', 'build']);
run('node', ['--test',
    'test/integration/mongodb/connect.test.js',
    'test/integration/mongodb/queries.test.js',
    'test/integration/mongodb/management.test.js',
    'test/integration/mongodb/writes-batch.test.js',
    'test/integration/model/model-features.test.js',
    'test/integration/pool/pool.test.js',
    'test/integration/slow-query-log/slow-query-log.test.js',
], {
    MONSQLIZE_MEMORY_MONGO_URI: memoryUri,
});

run('node', ['--test',
    'test/integration/transaction/transaction.test.js',
    'test/integration/sync/sync.test.js',
], {
    MONSQLIZE_REPLSET_URI: replSetUri,
});

console.log('[server-matrix] ✅ 真实服务端矩阵执行完成');

