#!/usr/bin/env node
/**
 * 文件大小治理检查脚本（scripts/check-file-sizes.cjs）
 *
 * 功能说明：
 * - 扫描 src/ 目录下所有 .ts 文件（排除 .d.ts）
 * - 超过 WARN_THRESHOLD（800 行）时输出 ⚠️  警告
 * - 超过 ERROR_THRESHOLD（1200 行）时输出 ❌  错误并以非零码退出
 * - 支持 --strict 参数：将警告级别升为错误
 *
 * 使用方式：
 *   node scripts/check-file-sizes.cjs          # 常规检查（警告不影响 exit code）
 *   node scripts/check-file-sizes.cjs --strict  # 严格模式（警告也报错）
 *
 * 添加到 CI/pre-commit 钩子可防止大文件持续膨胀。
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');

// ─── 阈值配置 ────────────────────────────────────────────────────────────────

const WARN_THRESHOLD  = 800;   // 超此行数输出警告
const ERROR_THRESHOLD = 1200;  // 超此行数输出错误并导致脚本退出为非零

// ─── 参数解析 ────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const strict  = args.includes('--strict');
const srcRoot = path.resolve(__dirname, '..', 'src');

// ─── 文件扫描 ────────────────────────────────────────────────────────────────

/**
 * 递归收集 dir 下所有非 .d.ts 的 TypeScript 文件路径。
 * @param {string} dir
 * @returns {string[]}
 */
function collectTsFiles(dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...collectTsFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
            results.push(fullPath);
        }
    }
    return results;
}

/**
 * 计算文件行数（通过换行符个数 + 1）。
 * @param {string} filePath
 * @returns {number}
 */
function countLines(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    // 末尾空行不计
    const trimmed = content.trimEnd();
    if (!trimmed) return 0;
    return trimmed.split('\n').length;
}

// ─── 主逻辑 ──────────────────────────────────────────────────────────────────

function main() {
    const files = collectTsFiles(srcRoot).sort();

    const warns  = [];
    const errors = [];

    for (const filePath of files) {
        const lines   = countLines(filePath);
        const relPath = path.relative(path.resolve(__dirname, '..'), filePath).replace(/\\/g, '/');

        if (lines > ERROR_THRESHOLD) {
            errors.push({ relPath, lines });
        } else if (lines > WARN_THRESHOLD) {
            warns.push({ relPath, lines });
        }
    }

    // ── 输出报告 ──────────────────────────────────────────────────────────────
    let hasOutput = false;

    if (warns.length > 0) {
        console.log('\n⚠️   文件行数超过警告阈值（WARN > ' + WARN_THRESHOLD + '）：');
        for (const { relPath, lines } of warns) {
            console.log(`   ⚠️   ${relPath}  (${lines} 行)`);
        }
        hasOutput = true;
    }

    if (errors.length > 0) {
        console.log('\n❌  文件行数超过错误阈值（ERROR > ' + ERROR_THRESHOLD + '）：');
        for (const { relPath, lines } of errors) {
            console.log(`   ❌  ${relPath}  (${lines} 行)`);
        }
        hasOutput = true;
    }

    if (!hasOutput) {
        console.log('✅  所有文件行数均在阈值以内（WARN=' + WARN_THRESHOLD + ', ERROR=' + ERROR_THRESHOLD + '）。');
    }

    const exitCode = errors.length > 0 || (strict && warns.length > 0) ? 1 : 0;

    if (exitCode !== 0) {
        const msg = strict && warns.length > 0 && errors.length === 0
            ? '⛔  --strict 模式：警告文件需拆分后再提交。'
            : '⛔  存在超过 ERROR 阈值的文件，请拆分后再提交。';
        console.error('\n' + msg);
    }

    process.exit(exitCode);
}

main();
