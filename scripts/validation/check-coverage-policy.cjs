#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const policy = require('../../config/coverage-policy.json');
const summaryPath = path.join(root, 'coverage', 'coverage-summary.json');

function walkJs(directory) {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) return walkJs(target);
        return entry.isFile() && entry.name.endsWith('.js') ? [target] : [];
    });
}

function toPosix(value) {
    return value.split(path.sep).join('/');
}

function matchesExcluded(relativePath) {
    return policy.excludedGeneratedSources.some((pattern) => {
        const prefix = pattern.replace(/\*\*$/, '');
        return relativePath.startsWith(prefix);
    });
}

if (!fs.existsSync(summaryPath)) {
    console.error('[coverage-policy] coverage/coverage-summary.json is missing.');
    process.exit(1);
}

const compiledSources = walkJs(path.join(root, '.generated', 'test-dist', 'src'));
const includedSources = compiledSources.filter((file) => !matchesExcluded(toPosix(path.relative(root, file))));
const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const coveredEntries = Object.entries(summary).filter(([name]) => name !== 'total');

const failures = [];
if (coveredEntries.length !== includedSources.length) {
    failures.push(`source denominator mismatch: expected ${includedSources.length}, coverage contains ${coveredEntries.length}`);
}

const byRelativePath = new Map(coveredEntries.map(([file, metrics]) => [
    toPosix(path.relative(root, file)),
    metrics,
]));

for (const floor of policy.riskFloors) {
    const metrics = byRelativePath.get(floor.path);
    if (!metrics) {
        failures.push(`${floor.path}: missing from coverage summary`);
        continue;
    }
    for (const metric of ['statements', 'branches', 'functions', 'lines']) {
        const actual = metrics[metric]?.pct;
        if (typeof actual !== 'number' || actual < floor[metric]) {
            failures.push(`${floor.path}: ${metric} ${String(actual)} < ${floor[metric]}`);
        }
    }
}

if (failures.length > 0) {
    console.error('[coverage-policy] failed:');
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exit(1);
}

console.log(`[coverage-policy] verified ${coveredEntries.length}/${compiledSources.length} emitted source files and ${policy.riskFloors.length} risk floors.`);
console.log(`[coverage-policy] explicit exclusions: ${compiledSources.length - includedSources.length} type-only/compatibility wrapper files.`);
