const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { configureMemoryServerEnv } = require('./memory-server-policy.cjs');
const {
    REQUIRED_MONGODB_SERVER_VERSIONS,
    summarizeVersionProbes,
} = require('./server-matrix-config.cjs');

const projectRoot = path.resolve(__dirname, '..', '..');
const memoryServerPolicy = configureMemoryServerEnv();
const memoryServerEnv = {
    MONGOMS_DOWNLOAD_DIR: memoryServerPolicy.downloadDir,
    MONGOMS_PREFER_GLOBAL_PATH: 'false',
    MONGOMS_RUNTIME_DOWNLOAD: 'true',
    MONSQLIZE_MEMORY_SERVER_CACHE_DIR: memoryServerPolicy.cacheRoot,
    MONSQLIZE_MEMORY_SERVER_DB_DIR: memoryServerPolicy.dbRoot,
};
const versionProbeScript = process.env.MONSQLIZE_MEMORY_SERVER_VERSION_PROBE_SCRIPT
    || 'scripts/validation/probe-memory-server-version.cjs';

function commandExists(command) {
    const lookupCommand = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSync(lookupCommand, [command], { stdio: 'pipe', encoding: 'utf8' });

    return {
        available: result.status === 0,
        command,
        output: result.status === 0 ? result.stdout.trim().split(/\r?\n/).filter(Boolean) : [],
    };
}

function probeVersion(version) {
    const result = spawnSync('node', [versionProbeScript, version], {
        cwd: projectRoot,
        stdio: 'pipe',
        encoding: 'utf8',
        env: {
            ...process.env,
            ...memoryServerEnv,
        },
    });

    if (result.status === 0) {
        return {
            ready: true,
            reason: 'memory-server standalone and replica-set probes can start',
        };
    }

    const errorText = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
    const unsupported = /KnownVersionIncompatibilityError|Unsupported Architecture|not available for|does not provide binaries|cannot download/i.test(errorText);

    return {
        ready: false,
        reason: unsupported ? 'current platform/version combination is not supported by the binary' : 'startup probe failed and requires manual confirmation',
        error: errorText,
        unsupported,
    };
}

const summary = {
    checkedAt: new Date().toISOString(),
    host: {
        platform: process.platform,
        release: process.release,
        node: process.version,
    },
    tools: {
        volta: commandExists('volta'),
    },
    matrix: REQUIRED_MONGODB_SERVER_VERSIONS.map((item) => ({
        label: item.label,
        version: item.version,
        ...probeVersion(item.version),
    })),
};

summary.verdict = summarizeVersionProbes(summary.matrix);
summary.ready = summary.verdict.ready;
summary.nextAction = summary.ready
    ? 'Run npm run test:server-matrix with the in-memory MongoDB version matrix'
    : 'At least one required MongoDB version failed; fix the environment before running the release gate';

console.log(JSON.stringify(summary, null, 2));

if (!summary.ready) {
    process.exitCode = 1;
}
