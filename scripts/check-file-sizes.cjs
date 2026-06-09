#!/usr/bin/env node
/**
 * File size governance check script (scripts/check-file-sizes.cjs).
 *
 * Behavior:
 * - Scans all .ts files under src/ except .d.ts files.
 * - Prints a warning when a file exceeds WARN_THRESHOLD (800 lines).
 * - Fails when a file exceeds ERROR_THRESHOLD (1200 lines).
 * - Supports --strict to treat warnings as failures.
 *
 * Usage:
 *   node scripts/check-file-sizes.cjs
 *   node scripts/check-file-sizes.cjs --strict
 *
 * Add this to CI/pre-commit hooks to prevent unchecked file growth.
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');

// ─── Threshold config ─────────────────────────────────────────────────────────

const WARN_THRESHOLD  = 800;   // Warn above this line count.
const ERROR_THRESHOLD = 1200;  // Fail above this line count.

// ─── Argument parsing ─────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const strict  = args.includes('--strict');
const srcRoot = path.resolve(__dirname, '..', 'src');

// ─── File scanning ────────────────────────────────────────────────────────────

/**
 * Recursively collects all non-.d.ts TypeScript files under dir.
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
 * Counts file lines.
 * @param {string} filePath
 * @returns {number}
 */
function countLines(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    // Ignore trailing blank lines.
    const trimmed = content.trimEnd();
    if (!trimmed) return 0;
    return trimmed.split('\n').length;
}

// ─── Main logic ───────────────────────────────────────────────────────────────

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

    // ── Output report ─────────────────────────────────────────────────────────
    let hasOutput = false;

    if (warns.length > 0) {
        console.log('\nWARNING: file line count exceeds WARN threshold (' + WARN_THRESHOLD + '):');
        for (const { relPath, lines } of warns) {
            console.log(`   WARN  ${relPath}  (${lines} lines)`);
        }
        hasOutput = true;
    }

    if (errors.length > 0) {
        console.log('\nERROR: file line count exceeds ERROR threshold (' + ERROR_THRESHOLD + '):');
        for (const { relPath, lines } of errors) {
            console.log(`   ERROR ${relPath}  (${lines} lines)`);
        }
        hasOutput = true;
    }

    if (!hasOutput) {
        console.log('All file line counts are within thresholds (WARN=' + WARN_THRESHOLD + ', ERROR=' + ERROR_THRESHOLD + ').');
    }

    const exitCode = errors.length > 0 || (strict && warns.length > 0) ? 1 : 0;

    if (exitCode !== 0) {
        const msg = strict && warns.length > 0 && errors.length === 0
            ? '--strict mode: warning files must be split before commit.'
            : 'Files above the ERROR threshold must be split before commit.';
        console.error('\n' + msg);
    }

    process.exit(exitCode);
}

main();
