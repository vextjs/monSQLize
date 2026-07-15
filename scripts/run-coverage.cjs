#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const { mkdirSync, rmSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const policy = require('../config/coverage-policy.json');
const coverageTemp = path.join(root, '.generated', 'coverage-tmp', `run-${process.pid}-${Date.now()}`);

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
    throw result.error;
  }

  if (result.status !== 0) {
    const error = new Error(`${command} exited with status ${result.status || 1}`);
    error.exitCode = result.status || 1;
    throw error;
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
    "'use strict';\nconst { runCli } = require('../../../src/cli/data-task.js');\nconst MonSQLize = require('../index.cjs');\nrunCli(process.argv.slice(2), MonSQLize.dataTasks).catch((error) => {\n  console.error(error instanceof Error ? error.message : String(error));\n  process.exitCode = 1;\n});\n",
    'utf8',
  );
}

const withSourceMaps = { MONSQLIZE_BUILD_SOURCEMAPS: '1' };
const withoutSourceMaps = { MONSQLIZE_BUILD_SOURCEMAPS: '0' };
const coverageEnv = { ...withoutSourceMaps, MONSQLIZE_TEST_SUMMARY_ONLY: '1' };

try {
  mkdirSync(coverageTemp, { recursive: true });
  npmRun('build', withSourceMaps);
  npmRun('build:tests', withSourceMaps);

  // Keep the package root dist in its publish shape; c8 uses the mapped generated test dist.
  npmRun('build', withoutSourceMaps);
  prepareCoverageRuntime();

  const coverageArgs = [
      require.resolve('c8/bin/c8.js'),
      '--reporter=text',
      '--reporter=lcov',
      '--reporter=json-summary',
      '--all',
      '--temp-directory',
      coverageTemp,
      '--include',
      '.generated/test-dist/src/**/*.js',
      '--exclude',
      '.generated/test-dist/dist/**',
  ];
  for (const exclusion of policy.excludedGeneratedSources) {
      coverageArgs.push('--exclude', exclusion);
  }
  coverageArgs.push(
      '--check-coverage',
      '--lines',
      String(policy.global.lines),
      '--statements',
      String(policy.global.statements),
      '--functions',
      String(policy.global.functions),
      '--branches',
      String(policy.global.branches),
      process.execPath,
      'test/run-tests.cjs',
  );
  run(process.execPath, coverageArgs, coverageEnv);
  run(process.execPath, ['scripts/validation/check-coverage-policy.cjs']);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = error && typeof error === 'object' && 'exitCode' in error ? error.exitCode : 1;
} finally {
  rmSync(coverageTemp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
