#!/usr/bin/env node
/**
 * Unified test runner with consolidated summary statistics.
 *
 * Runs all test suites in a single `node --test` invocation,
 * then prints a final summary:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  monSQLize Test Suite                                        │
 *   │  ✅ 142 passed   ❌ 0 failed   ⏭  5 skipped  │  Total: 147  │
 *   └─────────────────────────────────────────────────────────────┘
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ─── Ordered test suites (run sequentially inside one node --test call) ───────

const SMOKE = [
    'test/smoke/root-cjs.test.js',
    'test/smoke/root-esm.test.js',
    'test/smoke/pack-artifacts.test.js',
];

const COMPAT = [
    'test/compatibility/exports/exports.test.js',
    'test/compatibility/matrix.test.js',
];

const UNIT = [
    'test/unit/expression/expression.test.js',
    'test/unit/expression/operators.test.js',
    'test/unit/errors/errors.test.js',
    'test/unit/management/management.test.js',
    'test/unit/writes/batch.test.js',
    'test/unit/cache/cache.test.js',
    'test/unit/function-cache/function-cache.test.js',
    'test/unit/model/model-registry.test.js',
    'test/unit/lock/lock.test.js',
    'test/unit/transaction/transaction.test.js',
    'test/unit/pool/pool.test.js',
    'test/unit/sync/sync.test.js',
    'test/unit/slow-query-log/slow-query-log.test.js',
    'test/unit/saga/saga.test.js',
];

const INTEGRATION = [
    'test/integration/cache/cache.test.js',
    'test/integration/mongodb/connect.test.js',
    'test/integration/mongodb/queries.test.js',
    'test/integration/mongodb/management.test.js',
    'test/integration/mongodb/writes-batch.test.js',
    'test/integration/model/model-features.test.js',
    'test/integration/transaction/transaction.test.js',
    'test/integration/pool/pool.test.js',
    'test/integration/runtime/runtime-core-regression.test.js',
    'test/integration/sync/sync.test.js',
    'test/integration/slow-query-log/slow-query-log.test.js',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function banner(label) {
    const line = '─'.repeat(60);
    console.log(`\n${line}`);
    console.log(`  ${label}`);
    console.log(line);
}

function parseStats(output) {
    let pass = 0, fail = 0, skip = 0;
    for (const line of output.split('\n')) {
        const passMatch = line.match(/^# pass\s+(\d+)/);
        const failMatch = line.match(/^# fail\s+(\d+)/);
        const skipMatch = line.match(/^# skip\s+(\d+)/);
        if (passMatch) pass += parseInt(passMatch[1], 10);
        if (failMatch) fail += parseInt(failMatch[1], 10);
        if (skipMatch) skip += parseInt(skipMatch[1], 10);
    }
    return { pass, fail, skip };
}

function runCommand(label, args) {
    banner(label);
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, args, {
            cwd: ROOT,
            stdio: ['inherit', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk) => {
            const text = chunk.toString();
            stdout += text;
            process.stdout.write(text);
        });
        child.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            stderr += text;
            process.stderr.write(text);
        });
        child.on('error', reject);
        child.on('close', (code) => {
            resolve({ stdout, stderr, exitCode: code ?? 1 });
        });
    });
}

async function runSuite(label, files) {
    const result = await runCommand(label, ['--test', '--test-concurrency=1', ...files]);
    const stats = parseStats(result.stdout || '');
    return { ...stats, exitCode: result.exitCode };
}

// ─── v1 Compat Runner (separate process, custom output format) ────────────────

async function runV1Compat() {
    const result = await runCommand('v1 Compatibility Tests (2500+ cases)', [
        path.join(__dirname, 'v1-compat-runner.cjs'),
        'all-v2',
    ]);

    const out = result.stdout || '';
    let pass = 0, fail = 0, skip = 0;

    // Use last match (per-file lines also have same pattern; summary is last)
    const passMatches = [...out.matchAll(/通过[:：]\s*(\d+)/g)];
    const failMatches = [...out.matchAll(/失败[:：]\s*(\d+)/g)];
    const skipMatches = [...out.matchAll(/跳过[:：]\s*(\d+)/g)];
    if (passMatches.length) pass = parseInt(passMatches[passMatches.length - 1][1], 10);
    if (failMatches.length) fail = parseInt(failMatches[failMatches.length - 1][1], 10);
    if (skipMatches.length) skip = parseInt(skipMatches[skipMatches.length - 1][1], 10);
    return { pass, fail, skip, exitCode: result.exitCode };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const suites = [
    { label: 'Smoke Tests', files: SMOKE },
    { label: 'Compatibility Tests', files: COMPAT },
    { label: 'Unit Tests', files: UNIT },
    { label: 'Integration Tests', files: INTEGRATION },
];

async function main() {
    let totalPass = 0;
    let totalFail = 0;
    let totalSkip = 0;
    let anyFailed = false;

    for (const { label, files } of suites) {
        const stats = await runSuite(label, files);
        totalPass += stats.pass;
        totalFail += stats.fail;
        totalSkip += stats.skip;
        if (stats.exitCode !== 0 || stats.fail > 0) {
            anyFailed = true;
        }
    }

    const v1Stats = await runV1Compat();
    totalPass += v1Stats.pass;
    totalFail += v1Stats.fail;
    totalSkip += v1Stats.skip;
    if (v1Stats.exitCode !== 0 || v1Stats.fail > 0) {
        anyFailed = true;
    }

    const total = totalPass + totalFail + totalSkip;
    const line = '─'.repeat(65);

    console.log(`\n${'═'.repeat(65)}`);
    console.log('  monSQLize Test Suite — Final Summary');
    console.log(`${'─'.repeat(65)}`);
    console.log(`  ✅  Passed :  ${String(totalPass).padStart(5)}`);
    console.log(`  ❌  Failed :  ${String(totalFail).padStart(5)}`);
    console.log(`  ⏭   Skipped:  ${String(totalSkip).padStart(5)}`);
    console.log(`${line}`);
    console.log(`  📊  Total  :  ${String(total).padStart(5)}`);
    console.log(`${'═'.repeat(65)}\n`);

    if (anyFailed) {
        console.error('❌ One or more test suites FAILED.\n');
        process.exit(1);
    }

    console.log('✅ All test suites passed.\n');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
