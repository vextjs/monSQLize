#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = packageJson.version;
const packageLockPath = path.join(root, 'package-lock.json');

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

function ensureNoLocalDependencySpecs(dependencies, label) {
    if (!dependencies) return;

    for (const [name, spec] of Object.entries(dependencies)) {
        if (typeof spec !== 'string') continue;
        if (/^(file:|workspace:|link:)/.test(spec)) {
            console.error(`[release-preflight] ${label} contains non-publishable local dependency: ${name} -> ${spec}`);
            process.exit(1);
        }
    }
}

function ensureLockfileIsReleaseReady() {
    if (!fs.existsSync(packageLockPath)) {
        console.error('[release-preflight] missing required file: package-lock.json');
        process.exit(1);
    }

    const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));
    const rootPackage = packageLock.packages?.[''] ?? {};

    if (packageLock.name !== packageJson.name || packageLock.version !== version) {
        console.error(`[release-preflight] package-lock root metadata drift: expected ${packageJson.name}@${version}, got ${packageLock.name}@${packageLock.version}`);
        process.exit(1);
    }
    if (rootPackage.name !== packageJson.name || rootPackage.version !== version) {
        console.error(`[release-preflight] package-lock packages[""] drift: expected ${packageJson.name}@${version}, got ${rootPackage.name}@${rootPackage.version}`);
        process.exit(1);
    }

    const localPathEntries = [];
    for (const [entryPath, meta] of Object.entries(packageLock.packages ?? {})) {
        if (entryPath.startsWith('../') || entryPath.startsWith('..\\')) {
            localPathEntries.push(entryPath);
        }

        const resolved = meta && typeof meta === 'object' ? meta.resolved : undefined;
        if (typeof resolved === 'string' && (/^(file:|workspace:|link:)/.test(resolved) || resolved.startsWith('../') || resolved.startsWith('..\\'))) {
            localPathEntries.push(`${entryPath} -> ${resolved}`);
        }
    }

    if (localPathEntries.length) {
        console.error('[release-preflight] package-lock contains local path entries:');
        for (const entry of localPathEntries) {
            console.error(`  - ${entry}`);
        }
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

ensureNoLocalDependencySpecs(packageJson.dependencies, 'dependencies');
ensureNoLocalDependencySpecs(packageJson.optionalDependencies, 'optionalDependencies');
ensureNoLocalDependencySpecs(packageJson.devDependencies, 'devDependencies');
ensureLockfileIsReleaseReady();

console.log(`[release-preflight] validating release assets for v${version}`);
run('npm', ['run', 'verify:fast']);
run('npm', ['test']);
run('npm', ['pack', '--dry-run']);

console.log('[release-preflight] ✅ preflight passed');
console.log('[release-preflight] next steps: review git status, create tag, then publish');
