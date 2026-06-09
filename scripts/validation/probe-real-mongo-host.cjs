const { spawnSync } = require('node:child_process');
const os = require('node:os');

function commandExists(command) {
    const lookupCommand = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSync(lookupCommand, [command], { stdio: 'pipe', encoding: 'utf8' });

    return {
        available: result.status === 0,
        command,
        locator: lookupCommand,
        output: result.status === 0 ? result.stdout.trim().split(/\r?\n/).filter(Boolean) : [],
    };
}

function buildSummary() {
    const docker = commandExists('docker');
    const podman = commandExists('podman');
    const mongod = commandExists('mongod');
    const mongosh = commandExists('mongosh');

    const env = {
        memoryUri: Boolean(process.env.MONSQLIZE_MEMORY_MONGO_URI),
        replSetUri: Boolean(process.env.MONSQLIZE_REPLSET_URI),
    };

    const ready = (docker.available || podman.available || mongod.available) && env.memoryUri && env.replSetUri;

    return {
        checkedAt: new Date().toISOString(),
        host: {
            platform: process.platform,
            release: os.release(),
        },
        tools: {
            docker,
            podman,
            mongod,
            mongosh,
        },
        env,
        ready,
        nextAction: ready
            ? 'Run npm run test:server-matrix'
            : 'This host is missing external Mongo service requirements or required URIs; prepare real MongoDB 6.x / 7.x services before running npm run test:server-matrix',
    };
}

const summary = buildSummary();
console.log(JSON.stringify(summary, null, 2));

