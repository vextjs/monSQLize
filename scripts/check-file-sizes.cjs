#!/usr/bin/env node
/**
 * File size governance check script (scripts/check-file-sizes.cjs).
 *
 * Behavior:
 * - Scans source, public type declarations, and tests with category thresholds.
 * - Keeps explicit no-growth baselines for known historical large files.
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

const projectRoot = path.resolve(__dirname, '..');
const policy = require('../config/file-size-policy.json');

// ─── Argument parsing ─────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const strict  = args.includes('--strict');

// ─── File scanning ────────────────────────────────────────────────────────────

/**
 * Recursively collects matching files under dir.
 * @param {string} dir
 * @param {{ suffix: string, excludeDeclarationFiles: boolean }} category
 * @returns {string[]}
 */
function collectFiles(dir, category) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...collectFiles(fullPath, category));
        } else if (
            entry.isFile()
            && entry.name.endsWith(category.suffix)
            && !(category.excludeDeclarationFiles && entry.name.endsWith('.d.ts'))
        ) {
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
    const warns  = [];
    const errors = [];
    const baselines = [];
    const seenBaselines = new Set();

    for (const category of policy.categories) {
        const categoryRoot = path.join(projectRoot, category.root);
        const files = collectFiles(categoryRoot, category).sort();
        for (const filePath of files) {
            const lines = countLines(filePath);
            const relPath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
            const baseline = policy.baselines[relPath];

            if (baseline) {
                seenBaselines.add(relPath);
                if (lines > baseline.maxLines) {
                    errors.push({ relPath, lines, limit: baseline.maxLines, category: `${category.name}-baseline` });
                } else {
                    baselines.push({ relPath, lines, limit: baseline.maxLines, category: category.name });
                }
            } else if (lines > category.error) {
                errors.push({ relPath, lines, limit: category.error, category: category.name });
            } else if (lines > category.warn) {
                warns.push({ relPath, lines, limit: category.warn, category: category.name });
            }
        }
    }

    for (const relPath of Object.keys(policy.baselines)) {
        if (!seenBaselines.has(relPath)) {
            errors.push({ relPath, lines: 0, limit: policy.baselines[relPath].maxLines, category: 'missing-baseline' });
        }
    }

    // ── Output report ─────────────────────────────────────────────────────────
    let hasOutput = false;

    if (baselines.length > 0) {
        console.log('\nBASELINE: known large files are allowed only at or below their frozen line count:');
        for (const { relPath, lines, limit, category } of baselines) {
            console.log(`   BASELINE ${relPath} (${lines}/${limit} lines, ${category})`);
        }
        hasOutput = true;
    }

    if (warns.length > 0) {
        console.log('\nWARNING: file line count exceeds its category warning threshold:');
        for (const { relPath, lines, limit, category } of warns) {
            console.log(`   WARN  ${relPath} (${lines}/${limit} lines, ${category})`);
        }
        hasOutput = true;
    }

    if (errors.length > 0) {
        console.log('\nERROR: file line count exceeds its category or frozen baseline threshold:');
        for (const { relPath, lines, limit, category } of errors) {
            console.log(`   ERROR ${relPath} (${lines}/${limit} lines, ${category})`);
        }
        hasOutput = true;
    }

    if (!hasOutput) {
        console.log('All source, type, and test file line counts are within category thresholds.');
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
