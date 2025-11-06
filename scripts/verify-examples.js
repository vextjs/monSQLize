#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const examplesDir = path.join(root, 'examples');
const verbose = process.argv.includes('--verbose') || process.env.VERBOSE === '1';
const skipDbExamples = process.argv.includes('--skip-db') || process.env.SKIP_DB_EXAMPLES === '1';

function listExamples(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.examples.js'))
    .map(f => path.join(dir, f));
}

async function runExample(file) {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [file], { cwd: root, env: process.env });
    let out = '';
    let err = '';
    proc.stdout.on('data', d => { out += d.toString(); if (verbose) process.stdout.write(d); });
    proc.stderr.on('data', d => { err += d.toString(); if (verbose) process.stderr.write(d); });
    proc.on('close', (code) => resolve({ file, code, out, err }));
    proc.on('error', (e) => resolve({ file, code: 1, out, err: e.message }));
  });
}

(async function main(){
  const examples = listExamples(examplesDir);
  if (examples.length === 0) {
    console.log('ℹ️  未找到示例文件（examples/*.examples.js），跳过示例验证。');
    process.exit(0);
  }

  console.log(`ℹ️  找到 ${examples.length} 个示例：`);
  examples.forEach(e => console.log('  -', path.relative(root, e)));

  let failed = 0;
  for (const ex of examples) {
    process.stdout.write(`
➡️  运行示例: ${path.relative(root, ex)} ... `);
    const res = await runExample(ex);
    if (res.code === 0) {
      console.log('通过');
      if (verbose && res.out) console.log(res.out);
    } else {
      failed++;
      console.log('失败 (exit ' + res.code + ')');
      console.error('--- 示例 stderr/stdout start ---');
      if (res.out) console.error(res.out);
      if (res.err) console.error(res.err);
      console.error('--- 示例 stderr/stdout end ---');
    }
  }

  if (failed > 0) {
    console.error(`\n❌ ${failed} 个示例运行失败`);
    process.exit(2);
  }

  console.log('\n✅ 所有示例运行通过');
  process.exit(0);
})();
