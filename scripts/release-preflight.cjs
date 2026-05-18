#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = packageJson.version;

const requiredFiles = [
    'CHANGELOG.md',
    `changelogs/v${version}.md`,
    'docs/support-matrix.md',
    'docs/file-dependency-governance.md',
    'docs/verification-entrypoints.md',
];

function ensureExists(relativePath) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
        console.error(`[release-preflight] missing required file: ${relativePath}`);
        process.exit(1);
    }
}

function run(command, args) {
    const result = spawnSync(command, args, {
        cwd: root,
        stdio: 'inherit',
        shell: process.platform === 'win32',
    });
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

for (const file of requiredFiles) {
    ensureExists(file);
}

console.log(`[release-preflight] validating release assets for v${version}`);
run('npm', ['run', 'verify:fast']);
run('npm', ['pack', '--dry-run']);

console.log('[release-preflight] ✅ preflight passed');
console.log('[release-preflight] next steps: review git status, create tag, then publish');
