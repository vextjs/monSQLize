'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { formatRequiredEnv, getMissingRequiredEnv } = require('./private-real-env-config.cjs');

const projectRoot = path.resolve(__dirname, '..', '..');

function runScript(scriptName) {
    const scriptPath = path.resolve(__dirname, scriptName);
    const result = spawnSync(process.execPath, [scriptPath], {
        cwd: projectRoot,
        stdio: 'inherit',
        env: process.env,
    });

    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
}

function runPrivateRealEnvChecks() {
    console.log('[private-real-env] Running opt-in real environment checks.');
    console.log('[private-real-env] These checks are NOT part of npm run verify or npm run test:server-matrix.');
    console.log(`[private-real-env] Required env: ${formatRequiredEnv()}`);

    const missingEnv = getMissingRequiredEnv();
    if (missingEnv.length > 0) {
        console.error('[private-real-env] Missing required environment variables.');
        console.error(`[private-real-env] Missing: ${missingEnv.join(', ')}`);
        console.error('[private-real-env] This entrypoint is private-only. Use npm run verify:full or npm run release:preflight for the public verification chain.');
        process.exit(1);
    }

    runScript('private-real-env-monSQLize-check.cjs');
    runScript('private-real-env-ssh2-check.cjs');

    console.log('[private-real-env] ✅ real environment checks finished');
}

if (require.main === module) {
    runPrivateRealEnvChecks();
}

module.exports = {
    runPrivateRealEnvChecks,
};
