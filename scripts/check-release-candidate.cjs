#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');

const root = require('node:path').resolve(__dirname, '..');

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: root,
        encoding: 'utf8',
        shell: process.platform === 'win32',
        ...options,
    });
    if (result.status !== 0) {
        const detail = (result.stderr || result.stdout || '').trim();
        throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
    }
    return result.stdout.trim();
}

function fail(message) {
    console.error(`[release-candidate] ${message}`);
    process.exit(1);
}

try {
    const status = run('git', ['status', '--porcelain=v1', '--untracked-files=all']);
    if (status) fail(`worktree is not clean:\n${status}`);

    run('npm', ['ls', '--all', '--json'], { stdio: 'pipe' });

    const head = run('git', ['rev-parse', 'HEAD']);
    const remoteRefs = run('git', ['ls-remote', 'origin']).split(/\r?\n/).filter(Boolean);
    const containingRefs = remoteRefs
        .map((line) => line.split(/\s+/, 2))
        .filter(([commit]) => commit === head)
        .map(([, ref]) => ref);
    if (containingRefs.length === 0) {
        fail(`HEAD ${head} is not present on origin; push the reviewed commit before release preflight.`);
    }

    console.log(`[release-candidate] passed: clean tree, valid installed dependency graph, origin contains ${head}`);
    console.log(`[release-candidate] remote refs: ${containingRefs.join(', ')}`);
} catch (error) {
    fail(error instanceof Error ? error.message : String(error));
}
