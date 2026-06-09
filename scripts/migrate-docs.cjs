/**
 * migrate-docs.cjs
 *
 * Migrates monSQLize-v1 docs into the TS docs/ tree while:
 * 1. Skipping internal or test-only docs.
 * 2. Converting require() examples to ESM imports.
 * 3. Upgrading javascript code fences with imports/exports to typescript fences.
 * 4. Preserving existing TS placeholder docs.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SRC_DIR  = path.resolve(__dirname, '../../monSQLize-v1/docs');
const DEST_DIR = path.resolve(__dirname, '../docs');

// Internal/test docs to skip.
const SKIP_FILES = new Set([
    'COMPATIBILITY.md',
    'COMPATIBILITY-TESTING-GUIDE.md',
    'MONGODB-MEMORY-SERVER.md',
    'PROJECT-VISION.md',
    'cache-implementation.md',
    'chain-api-implementation.md',
    'node-version-testing-guide.md',
]);

// Existing TS placeholder docs to preserve.
const EXISTING_TS_DOCS = new Set([
    'getting-started.md',
    'cache-and-function-cache.md',
    'capability-index.md',
    'README.md',
]);

/**
 * Converts require('monsqlize') code snippets to import statements and upgrades
 * javascript fences containing import/export statements to typescript fences.
 */
function transformContent(content) {
    // 1. const MonSQLize = require('monsqlize') -> import MonSQLize from 'monsqlize';
    content = content.replace(
        /const\s+MonSQLize\s*=\s*require\(['"]monsqlize['"]\)/g,
        "import MonSQLize from 'monsqlize'"
    );

    // 2. const { X, Y } = require('monsqlize') -> import { X, Y } from 'monsqlize';
    content = content.replace(
        /const\s+(\{[^}]+\})\s*=\s*require\(['"]monsqlize['"]\)/g,
        (_, named) => `import ${named.trim()} from 'monsqlize'`
    );

    // 3. const Foo = require('monsqlize').Foo -> import { Foo } from 'monsqlize';
    content = content.replace(
        /const\s+(\w+)\s*=\s*require\(['"]monsqlize['"]\)\.(\w+)/g,
        (_, local, exported) => {
            if (local === exported) {
                return `import { ${local} } from 'monsqlize'`;
            }
            return `import { ${exported} as ${local} } from 'monsqlize'`;
        }
    );

    // 4. Fence language: ```javascript blocks with imports/exports -> ```typescript.
    content = content.replace(
        /```javascript\n([\s\S]*?)```/g,
        (match, body) => {
            if (/\bimport\b|\bexport\b/.test(body)) {
                return '```typescript\n' + body + '```';
            }
            return match;
        }
    );

    return content;
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function migrateDir(srcDir, destDir, subPath = '') {
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    let copied = 0;
    let skipped = 0;

    for (const entry of entries) {
        const relPath = subPath ? path.join(subPath, entry.name) : entry.name;
        const srcPath  = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);

        if (entry.isDirectory()) {
            ensureDir(destPath);
            const result = migrateDir(srcPath, destPath, relPath);
            copied  += result.copied;
            skipped += result.skipped;
            continue;
        }

        if (!entry.name.endsWith('.md')) continue;

        // Skip internal docs.
        if (SKIP_FILES.has(entry.name)) {
            console.log(`  ⏭  skip (internal): ${relPath}`);
            skipped++;
            continue;
        }

        // Skip top-level TS placeholder docs.
        if (!subPath && EXISTING_TS_DOCS.has(entry.name)) {
            console.log(`  ⏭  skip (ts-exist):  ${relPath}`);
            skipped++;
            continue;
        }

        const raw = fs.readFileSync(srcPath, 'utf8');
        const transformed = transformContent(raw);
        fs.writeFileSync(destPath, transformed, 'utf8');
        console.log(`  ✅ migrated: ${relPath}`);
        copied++;
    }

    return { copied, skipped };
}

// ── main ──────────────────────────────────────────────────────────────────────

console.log('Starting monSQLize docs migration...\n');

if (!fs.existsSync(SRC_DIR)) {
    console.error(`Source directory does not exist: ${SRC_DIR}`);
    process.exit(1);
}

ensureDir(DEST_DIR);
const { copied, skipped } = migrateDir(SRC_DIR, DEST_DIR);

console.log(`\nMigration complete: ${copied} files migrated, ${skipped} files skipped.`);
