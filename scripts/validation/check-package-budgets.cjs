#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const policy = require('../../config/package-budget.json');
const failures = [];

for (const [relativePath, maximumBytes] of Object.entries(policy.artifacts)) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
        failures.push(`${relativePath}: missing`);
        continue;
    }
    const bytes = fs.statSync(absolutePath).size;
    console.log(`[package-budget] ${relativePath}: ${bytes}/${maximumBytes} bytes`);
    if (bytes > maximumBytes) failures.push(`${relativePath}: ${bytes} > ${maximumBytes}`);
}

if (failures.length > 0) {
    console.error('[package-budget] failed:');
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exit(1);
}
