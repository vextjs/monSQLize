#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const eslintBin = path.join(path.dirname(require.resolve('eslint/package.json')), 'bin/eslint.js');
const targets = [
    'src/entry/runtime-core.ts',
    'types/index.d.ts',
    'test/unit/validation/server-matrix-contract.test.ts',
    'examples/helpers/bootstrap.ts',
    'website/rspress.config.ts',
];

for (const target of targets) {
    const result = spawnSync(process.execPath, [eslintBin, '--print-config', target], {
        cwd: root,
        encoding: 'utf8',
        shell: false,
    });
    if (result.status !== 0) {
        console.error(`[lint-contract] failed to resolve ${target}: ${result.stderr.trim()}`);
        process.exit(result.status || 1);
    }

    let config;
    try {
        config = JSON.parse(result.stdout);
    } catch {
        console.error(`[lint-contract] ${target} has no JSON ESLint config.`);
        process.exit(1);
    }

    const parserName = String(config.languageOptions?.parser ?? '');
    if (!parserName.includes('typescript-eslint')) {
        console.error(`[lint-contract] ${target} is not using the TypeScript ESLint parser: ${parserName || '<missing>'}`);
        process.exit(1);
    }
    if (!config.rules?.['@typescript-eslint/no-unused-vars']) {
        console.error(`[lint-contract] ${target} is missing the TypeScript rule contract.`);
        process.exit(1);
    }
}

console.log(`[lint-contract] verified TypeScript ESLint config for ${targets.length} representative files.`);
