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
            reason: 'memory-server 单机 + replica set 均可启动',
        };
    }

    const errorText = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
    const unsupported = /KnownVersionIncompatibilityError|Unsupported Architecture|not available for|does not provide binaries|cannot download/i.test(errorText);

    return {
        ready: false,
        reason: unsupported ? '当前平台/版本组合不受 binary 支持，建议跳过' : '启动探测失败，需人工确认',
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
    ? '可执行 npm run test:server-matrix（以内存 MongoDB 版本矩阵运行）'
    : '当前主机无法为目标版本拉起 mongodb-memory-server；请根据 error 字段决定跳过或补环境';

console.log(JSON.stringify(summary, null, 2));
