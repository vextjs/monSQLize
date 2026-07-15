#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const packageJson = require('../../package.json');
const policy = require('../../config/dependency-policy.json');
const failures = [];

function major(version) {
    return Number.parseInt(String(version).replace(/^[^0-9]*/, '').split('.')[0], 10);
}

if (packageJson.engines?.node !== policy.runtimeNode) {
    failures.push(`runtime Node contract ${packageJson.engines?.node} != ${policy.runtimeNode}`);
}
for (const [name, expectedMajor] of Object.entries(policy.majorLines)) {
    const version = packageJson.dependencies?.[name] ?? packageJson.devDependencies?.[name];
    if (!version || major(version) !== expectedMajor) {
        failures.push(`${name}: expected major ${expectedMajor}, got ${version ?? '<missing>'}`);
    }
}

const testWorkflow = fs.readFileSync(path.join(root, '.github/workflows/test.yml'), 'utf8');
for (const nodeVersion of ['18.x', '20.x', '22.x']) {
    if (!testWorkflow.includes(nodeVersion)) failures.push(`CI runtime matrix is missing Node ${nodeVersion}`);
}
if (!new RegExp(`release-gate[\\s\\S]+node-version: ['"]?${policy.releaseNodeMajor}\\.x`).test(testWorkflow)) {
    failures.push(`release-gate must run on Node ${policy.releaseNodeMajor}.x`);
}

if (failures.length > 0) {
    console.error('[dependency-policy] failed:');
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exit(1);
}
console.log(`[dependency-policy] runtime=${policy.runtimeNode}; release=Node ${policy.releaseNodeMajor}; guarded majors=${Object.keys(policy.majorLines).length}.`);
