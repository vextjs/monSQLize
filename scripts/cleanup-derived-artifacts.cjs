#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function listDirectories(directory, predicate = () => true) {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && predicate(entry.name))
        .map((entry) => path.join(directory, entry.name));
}

function collectTargets(root) {
    return [
        ...listDirectories(path.join(root, '.generated'), (name) => name.startsWith('c8tmp-')),
        ...listDirectories(path.join(root, '.generated', 'coverage-tmp')),
        ...(fs.existsSync(path.join(root, 'coverage', 'tmp')) ? [path.join(root, 'coverage', 'tmp')] : []),
        ...listDirectories(path.join(root, '.cache', 'mongodb-memory-server', 'db'), (name) => /^example-(?:single|replset)-/.test(name)),
    ].map((target) => path.resolve(target));
}

function directoryBytes(directory) {
    if (!fs.existsSync(directory)) return 0;
    return fs.readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
        const target = path.join(directory, entry.name);
        return total + (entry.isDirectory() ? directoryBytes(target) : fs.statSync(target).size);
    }, 0);
}

function removeTargets(root, targets) {
    const resolvedRoot = `${path.resolve(root)}${path.sep}`;
    for (const target of targets) {
        if (!`${target}${path.sep}`.startsWith(resolvedRoot)) {
            throw new Error(`Refusing to remove a path outside the project root: ${target}`);
        }
        fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
}

function main() {
    const root = path.resolve(__dirname, '..');
    const apply = process.argv.includes('--apply');
    const confirmed = process.argv.includes('--confirm=derived-artifacts');
    const targets = collectTargets(root);
    const totalBytes = targets.reduce((total, target) => total + directoryBytes(target), 0);

    console.log(`[derived-cleanup] mode=${apply ? 'apply' : 'dry-run'} targets=${targets.length} bytes=${totalBytes}`);
    targets.forEach((target) => console.log(`  - ${path.relative(root, target).split(path.sep).join('/')}`));

    if (!apply) {
        console.log('[derived-cleanup] dry-run only; no files were removed.');
        return;
    }
    if (!confirmed) {
        throw new Error('Apply mode requires --confirm=derived-artifacts.');
    }
    removeTargets(root, targets);
    console.log(`[derived-cleanup] removed ${targets.length} derived directories.`);
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(`[derived-cleanup] ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    }
}

module.exports = { collectTargets, removeTargets };
