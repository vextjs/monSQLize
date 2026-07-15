#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const contributing = fs.readFileSync(path.join(root, 'CONTRIBUTING.md'), 'utf8');
const required = [
    'npm run verify:fast',
    'npm test',
    'npm run test:coverage',
    'npm run test:pack-install',
    'npm --prefix website run verify',
    'npm run release:preflight',
    'Node.js 22',
];
const failures = required.filter((entry) => !contributing.includes(entry)).map((entry) => `missing ${entry}`);
if (/注释（中文）|JSDoc 注释（中文）|覆盖率链路若需补强|旧时代的覆盖率/.test(contributing)) {
    failures.push('stale language or coverage guidance remains');
}
if (failures.length > 0) {
    console.error('[contributor-contract] failed:');
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exit(1);
}
console.log(`[contributor-contract] verified ${required.length} contributor and release entrypoints.`);
