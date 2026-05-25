#!/usr/bin/env node
'use strict';

const { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, '.generated', 'test-dist');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');

const result = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.test.json'], {
    cwd: root,
    stdio: 'inherit',
    shell: false,
});

if (result.error) {
    console.error(result.error);
    process.exit(1);
}

if (result.status !== 0) {
    process.exit(result.status || 1);
}

if (existsSync(path.join(root, 'dist'))) {
    const generatedDistDir = path.join(outDir, 'dist');
    cpSync(path.join(root, 'dist'), generatedDistDir, { recursive: true });

    for (const mapFile of [
        path.join(generatedDistDir, 'cjs', 'index.cjs.map'),
        path.join(generatedDistDir, 'esm', 'index.mjs.map'),
    ]) {
        if (!existsSync(mapFile)) {
            continue;
        }

        const sourceMap = JSON.parse(readFileSync(mapFile, 'utf8'));
        sourceMap.sources = sourceMap.sources.map((source) => source.replace(/^\.\.\/\.\.\/src\//, '../../../../src/'));
        writeFileSync(mapFile, `${JSON.stringify(sourceMap)}\n`);
    }
}

cpSync(path.join(root, 'package.json'), path.join(outDir, 'package.json'));

const compatibilityDir = path.join(root, 'test', 'compatibility');
if (existsSync(compatibilityDir)) {
    cpSync(compatibilityDir, path.join(outDir, 'test', 'compatibility'), {
        recursive: true,
        filter: (source) => source.endsWith('.json') || !path.extname(source),
    });
}

const performanceBaselinesDir = path.join(root, 'test', 'performance', 'baselines');
if (existsSync(performanceBaselinesDir)) {
    cpSync(performanceBaselinesDir, path.join(outDir, 'test', 'performance', 'baselines'), {
        recursive: true,
        filter: (source) => source.endsWith('.json') || !path.extname(source),
    });
}