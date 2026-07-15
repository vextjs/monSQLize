import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectRoot = process.cwd();
const contract = require(path.join(projectRoot, 'scripts/validation/server-matrix-config.cjs'));
const packageJson = require(path.join(projectRoot, 'package.json'));
const memoryServerPolicy = require(path.join(projectRoot, 'config/mongodb-memory-server.json'));
const runtimePolicy = require(path.join(projectRoot, 'scripts/validation/memory-server-policy.cjs'));
const testPolicy = require(path.join(
    projectRoot,
    '.generated/test-dist/test/bootstrap/memory-server-policy.js',
));

test('server matrix contract: required versions are the latest stable MongoDB 7/8 patches', () => {
    assert.deepEqual(
        contract.REQUIRED_MONGODB_SERVER_VERSIONS.map((item: { version: string }) => item.version),
        ['7.0.37', '8.0.26'],
    );
});

test('server matrix contract: everyday memory-server defaults stay on MongoDB 7.0', () => {
    assert.equal(memoryServerPolicy.defaultVersion, '7.0.37');
    assert.equal(packageJson.config.mongodbMemoryServer.version, memoryServerPolicy.defaultVersion);
    assert.equal(runtimePolicy.DEFAULT_MEMORY_SERVER_VERSION, memoryServerPolicy.defaultVersion);
    assert.equal(testPolicy.DEFAULT_MEMORY_SERVER_VERSION, memoryServerPolicy.defaultVersion);
});

test('server matrix contract: Volta fills only missing Node 20/22 runtimes', () => {
    assert.deepEqual(contract.REQUIRED_NODE_MAJORS, [20, 22]);
    assert.deepEqual(contract.selectAdditionalVoltaNodeMajors(20, true), [22]);
    assert.deepEqual(contract.selectAdditionalVoltaNodeMajors(22, true), [20]);
    assert.deepEqual(contract.selectAdditionalVoltaNodeMajors(18, true), [20, 22]);
    assert.deepEqual(contract.selectAdditionalVoltaNodeMajors(20, false), []);
});

test('server matrix contract: memory-server integration files start serially', () => {
    assert.equal(contract.INTEGRATION_TEST_CONCURRENCY, 1);
});

test('memory-server cleanup: a dead managed examples path is pruned', () => {
    const dbRoot = mkdtempSync(path.join(os.tmpdir(), 'monsqlize-memory-policy-'));
    const managedPath = path.join(dbRoot, 'examples-replset-contract-2147483647-dead');
    const unmanagedPath = path.join(dbRoot, 'example-replset-contract-2147483647-legacy');
    mkdirSync(managedPath);
    mkdirSync(unmanagedPath);

    try {
        runtimePolicy.pruneMemoryServerDbRoot(dbRoot);
        assert.equal(existsSync(managedPath), false);
        assert.equal(existsSync(unmanagedPath), true, 'legacy singular paths must not be auto-deleted');
    } finally {
        rmSync(dbRoot, { recursive: true, force: true });
    }
});

test('server matrix contract: a complete execution matrix is accepted', () => {
    const verdict = contract.summarizeMatrixExecution([
        {
            driver: 'Driver 6',
            status: 'verified',
            results: [
                { node: 'Node 20', mongo: 'MongoDB 7.0', status: 'verified' },
                { node: 'Node 20', mongo: 'MongoDB 8.0', status: 'verified' },
            ],
        },
        {
            driver: 'Driver 7',
            status: 'verified',
            results: [
                { node: 'Node 20', mongo: 'MongoDB 7.0', status: 'verified' },
                { node: 'Node 20', mongo: 'MongoDB 8.0', status: 'verified' },
            ],
        },
    ], 2, 2);

    assert.deepEqual(verdict, { ready: true, failures: [] });
});

test('server matrix contract: partial version readiness is rejected', () => {
    const verdict = contract.summarizeVersionProbes([
        { version: '7.0.37', ready: true },
        { version: '8.0.26', ready: false },
    ]);

    assert.equal(verdict.ready, false);
    assert.deepEqual(verdict.failed, ['8.0.26']);
});

test('server matrix contract: missing and unavailable execution combinations are rejected', () => {
    const verdict = contract.summarizeMatrixExecution([
        {
            driver: 'Driver 6',
            status: 'verified',
            results: [
                { node: 'Node 20', mongo: 'MongoDB 7.0', status: 'verified' },
                { node: 'Node 20', mongo: 'MongoDB 8.0', status: 'unavailable' },
            ],
        },
    ], 2, 2);

    assert.equal(verdict.ready, false);
    assert.ok(verdict.failures.some((failure: string) => failure.includes('expected 2 driver results')));
    assert.ok(verdict.failures.some((failure: string) => failure.includes('unavailable')));
});

test('server matrix probe: one successful version cannot produce a zero exit code', () => {
    const result = spawnSync(process.execPath, ['scripts/validation/probe-memory-server-matrix.cjs'], {
        cwd: projectRoot,
        encoding: 'utf8',
        env: {
            ...process.env,
            MONSQLIZE_MEMORY_SERVER_VERSION_PROBE_SCRIPT: path.join(
                projectRoot,
                'test/fixtures/validation/failing-memory-server-version-probe.cjs',
            ),
        },
    });

    assert.notEqual(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.ready, false);
    assert.deepEqual(summary.verdict.failed, ['8.0.26']);
});
