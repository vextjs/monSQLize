import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import packageJson from '../../package.json';

const projectRoot = path.resolve(__dirname, '../..');
const cliPath = 'dist/cjs/cli/data-task.cjs';

function runCli(args: string[]) {
    return spawnSync(process.execPath, [cliPath, ...args], { cwd: projectRoot, encoding: 'utf8' });
}

test('data-task CLI exposes successful help and version paths', () => {
    const help = runCli(['--help']);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /monsqlize data-task run/);
    assert.match(help.stdout, /monsqlize data-task snapshot/);
    assert.match(help.stdout, /--snapshot-checksum/);

    const nestedHelp = runCli(['data-task', '--help']);
    assert.equal(nestedHelp.status, 0, nestedHelp.stderr);
    assert.match(nestedHelp.stdout, /Usage:/);

    const version = runCli(['--version']);
    assert.equal(version.status, 0, version.stderr);
    assert.equal(version.stdout.trim(), packageJson.version);

    assert.equal(runCli(['-h']).status, 0);
    assert.equal(runCli(['-v']).stdout.trim(), packageJson.version);
    assert.match(runCli([]).stdout, /Usage:/);
    assert.match(runCli(['data-task']).stdout, /Usage:/);
    assert.match(runCli(['plan', '-h']).stdout, /Usage:/);
    assert.equal(runCli(['plan', '-v']).stdout.trim(), packageJson.version);
});

test('data-task CLI rejects unknown actions', () => {
    const result = runCli(['unknown']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unknown data-task action/);

    const unknownArgument = runCli(['plan', '--unknown']);
    assert.equal(unknownArgument.status, 1);
    assert.match(unknownArgument.stderr, /Unknown argument/);

    const missingTask = runCli(['plan']);
    assert.equal(missingTask.status, 1);
    assert.match(missingTask.stderr, /--task <file> is required/);
});

test('data-task CLI can plan a JSON task without a database connection', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'monsqlize-data-task-cli-'));
    const taskPath = path.join(dir, 'task.json');
    fs.writeFileSync(taskPath, JSON.stringify({
        name: 'cli-plan-smoke',
        environment: 'test',
        source: { collection: 'sourceUsers' },
        target: { collection: 'targetUsers' },
        filter: { status: 'active' },
        matchBy: ['email'],
        steps: [{ type: 'syncData' }],
    }), 'utf8');

    try {
        const result = runCli(['data-task', 'plan', '--task', taskPath, '--json']);
        assert.equal(result.status, 0, result.stderr);
        const parsed = JSON.parse(result.stdout);
        assert.equal(parsed.mode, 'plan');
        assert.equal(parsed.taskName, 'cli-plan-smoke');
        assert.equal(parsed.requiresSnapshot, true);
        assert.equal(parsed.errors.length, 0);

        const dryRun = runCli(['data-task', 'dry-run', '--task', taskPath]);
        assert.equal(dryRun.status, 1);
        assert.match(dryRun.stderr, /requires the task file to export \{ runtime, task \}/);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('data-task CLI exits non-zero when plan validation fails', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'monsqlize-data-task-cli-invalid-'));
    const taskPath = path.join(dir, 'task.json');
    fs.writeFileSync(taskPath, JSON.stringify({
        name: 'cli-invalid-plan',
        environment: 'test',
        source: { collection: 'sourceUsers' },
        target: { collection: 'targetUsers' },
        matchBy: ['email'],
        steps: [{ type: 'syncData' }],
    }), 'utf8');
    try {
        const result = runCli(['plan', '--task', taskPath, '--json']);
        assert.equal(result.status, 1);
        const parsed = JSON.parse(result.stdout);
        assert.equal(parsed.passed, false);
        assert.match(parsed.errors.join(' '), /requires filter/);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('data-task CLI loads CJS and ESM configs and rejects malformed exports', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'monsqlize-data-task-cli-modules-'));
    const task = {
        name: 'cli-module-plan',
        environment: 'production',
        source: { collection: 'sourceUsers' },
        target: { collection: 'targetUsers' },
        filter: { status: 'active' },
        matchBy: ['email'],
        steps: [{ type: 'syncData' }],
    };
    const cjsPath = path.join(dir, 'task.cjs');
    const mjsPath = path.join(dir, 'task.mjs');
    const primitivePath = path.join(dir, 'primitive.json');
    const invalidConfigPath = path.join(dir, 'invalid-config.json');
    fs.writeFileSync(cjsPath, `module.exports = { default: { task: ${JSON.stringify(task)} } };\n`, 'utf8');
    fs.writeFileSync(mjsPath, `export default ${JSON.stringify(task)};\n`, 'utf8');
    fs.writeFileSync(primitivePath, JSON.stringify('invalid'), 'utf8');
    fs.writeFileSync(invalidConfigPath, JSON.stringify({ runtime: {} }), 'utf8');

    try {
        const human = runCli([
            'plan', '--task', cjsPath, '--confirm-production',
            '--snapshot-dir', dir, '--snapshot-checksum', 'reviewed-checksum',
        ]);
        assert.equal(human.status, 0, human.stderr);
        assert.match(human.stdout, /monSQLize data-task plan: cli-module-plan/);
        assert.match(human.stdout, /passed: true/);
        assert.match(human.stdout, /warnings: 2/);

        const esm = runCli(['plan', '--task', mjsPath, '--json']);
        assert.equal(esm.status, 0, esm.stderr);
        assert.equal(JSON.parse(esm.stdout).taskName, 'cli-module-plan');

        const primitive = runCli(['plan', '--task', primitivePath]);
        assert.equal(primitive.status, 1);
        assert.match(primitive.stderr, /must export a data task definition/);

        const invalidConfig = runCli(['plan', '--task', invalidConfigPath]);
        assert.equal(invalidConfig.status, 1);
        assert.match(invalidConfig.stderr, /must include a valid task definition/);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
