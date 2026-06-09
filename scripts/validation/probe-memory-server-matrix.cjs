const { spawnSync } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');
const matrixVersions = [
    { label: 'MongoDB 6.x', version: '6.0.14' },
    { label: 'MongoDB 7.x', version: '7.0.14' },
];

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
    const result = spawnSync('node', ['scripts/validation/probe-memory-server-version.cjs', version], {
        cwd: projectRoot,
        stdio: 'pipe',
        encoding: 'utf8',
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
    matrix: matrixVersions.map((item) => ({
        label: item.label,
        version: item.version,
        ...probeVersion(item.version),
    })),
};

summary.ready = summary.matrix.some((item) => item.ready);
summary.nextAction = summary.ready
    ? 'Run npm run test:server-matrix with the in-memory MongoDB version matrix'
    : 'This host cannot start mongodb-memory-server for the target versions; inspect error to decide whether to skip or provision the environment';

console.log(JSON.stringify(summary, null, 2));
