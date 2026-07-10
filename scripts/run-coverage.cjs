#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const path = require('node:path');

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      ...env,
    },
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function npmRun(script, env = {}) {
  if (process.env.npm_execpath) {
    run(process.execPath, [process.env.npm_execpath, 'run', script], env);
    return;
  }

  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', script], env);
}

function prepareCoverageRuntime() {
  const generatedRoot = path.join(process.cwd(), '.generated', 'test-dist');
  writeFileSync(
    path.join(generatedRoot, 'dist', 'cjs', 'index.cjs'),
    "'use strict';\nmodule.exports = require('../../src/entry/index.js');\n",
    'utf8',
  );
  writeFileSync(
    path.join(generatedRoot, 'dist', 'cjs', 'cli', 'data-task.cjs'),
    "'use strict';\nrequire('../../../src/cli/data-task.js');\n",
    'utf8',
  );
}

const withSourceMaps = { MONSQLIZE_BUILD_SOURCEMAPS: '1' };
const withoutSourceMaps = { MONSQLIZE_BUILD_SOURCEMAPS: '0' };
const coverageEnv = { ...withoutSourceMaps, MONSQLIZE_TEST_SUMMARY_ONLY: '1' };

npmRun('build', withSourceMaps);
npmRun('build:tests', withSourceMaps);

// Keep the package root dist in its publish shape; c8 uses the mapped generated test dist.
npmRun('build', withoutSourceMaps);
prepareCoverageRuntime();

run(
  process.execPath,
  [
    require.resolve('c8/bin/c8.js'),
    '--reporter=text',
    '--reporter=lcov',
    '--reporter=json-summary',
    '--include',
    '.generated/test-dist/src/**/*.js',
    '--exclude',
    '.generated/test-dist/dist/**',
    '--check-coverage',
    '--lines',
    '90',
    '--statements',
    '90',
    '--functions',
    '90',
    '--branches',
    '90',
    process.execPath,
    'test/run-tests.cjs',
  ],
  coverageEnv,
);
