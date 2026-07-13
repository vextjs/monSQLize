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

function job(name = 'cli-job') {
    const connection = {
        type: 'mongodb',
        databaseName: 'data_task_cli',
        config: { uri: 'mongodb://127.0.0.1:1', serverSelectionTimeoutMS: 50 },
    };
    return {
        name,
        source: connection,
        target: connection,
        targetEnvironment: 'test',
        collections: [{ name: 'items', data: { all: true, identity: { mode: 'source-id' } } }],
    };
}

test('data-task CLI exposes only the four Job actions plus help and version', () => {
    const help = runCli(['--help']);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /data-task preview --task/);
    assert.match(help.stdout, /data-task apply --task/);
    assert.match(help.stdout, /data-task preview-restore --task/);
    assert.match(help.stdout, /data-task restore --task/);
    assert.doesNotMatch(help.stdout, /\bplan\b|\bdry-run\b|\brun\b|\bsnapshot\b|--confirm-production/);

    assert.equal(runCli(['data-task', '--help']).status, 0);
    assert.equal(runCli(['--version']).stdout.trim(), packageJson.version);
    assert.equal(runCli(['-v']).stdout.trim(), packageJson.version);
    assert.match(runCli([]).stdout, /Usage:/);
    assert.match(runCli(['data-task']).stdout, /Usage:/);
});

test('data-task CLI rejects unknown actions, arguments, and missing task files', () => {
    const unknown = runCli(['unknown']);
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /Unknown data-task action/);

    const unknownArgument = runCli(['preview', '--unknown']);
    assert.equal(unknownArgument.status, 1);
    assert.match(unknownArgument.stderr, /Unknown argument/);

    const missingTask = runCli(['preview']);
    assert.equal(missingTask.status, 1);
    assert.match(missingTask.stderr, /--task <file> is required/);
});

test('data-task CLI validates four-action inputs before database execution', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'monsqlize-data-task-cli-inputs-'));
    const jobPath = path.join(dir, 'job.json');
    fs.writeFileSync(jobPath, JSON.stringify(job()), 'utf8');
    try {
        const apply = runCli(['apply', '--task', jobPath]);
        assert.equal(apply.status, 1);
        assert.match(apply.stderr, /requires --approval/);

        const previewRestore = runCli(['preview-restore', '--task', jobPath]);
        assert.equal(previewRestore.status, 1);
        assert.match(previewRestore.stderr, /requires --backup/);

        const restore = runCli(['restore', '--task', jobPath, '--backup', jobPath]);
        assert.equal(restore.status, 1);
        assert.match(restore.stderr, /must reference a dataTasks manifest/);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('data-task CLI accepts direct JSON, CJS, and ESM Job configs and rejects wrappers', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'monsqlize-data-task-cli-configs-'));
    const direct = job('direct-job');
    const jsonPath = path.join(dir, 'job.json');
    const cjsPath = path.join(dir, 'job.cjs');
    const mjsPath = path.join(dir, 'job.mjs');
    const malformedPath = path.join(dir, 'malformed.cjs');
    fs.writeFileSync(jsonPath, JSON.stringify(direct), 'utf8');
    fs.writeFileSync(cjsPath, `module.exports = ${JSON.stringify({ ...direct, name: 'cjs-job' })};\n`, 'utf8');
    fs.writeFileSync(mjsPath, `export default ${JSON.stringify({ ...direct, name: 'esm-job' })};\n`, 'utf8');
    fs.writeFileSync(malformedPath, `module.exports = { config: ${JSON.stringify(direct)} };\n`, 'utf8');
    try {
        for (const [file, expectedName] of [[jsonPath, 'direct-job'], [cjsPath, 'cjs-job'], [mjsPath, 'esm-job']] as const) {
            const result = runCli(['preview', '--task', file, '--json']);
            assert.equal(result.status, 1);
            const parsed = JSON.parse(result.stdout);
            assert.equal(parsed.jobName, expectedName);
            assert.equal(parsed.passed, false);
            assert.doesNotMatch(parsed.errors.join(' '), /directly export a DataTaskJob/);
        }

        const malformed = runCli(['preview', '--task', malformedPath]);
        assert.equal(malformed.status, 1);
        assert.match(malformed.stderr, /directly export a DataTaskJob/);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
