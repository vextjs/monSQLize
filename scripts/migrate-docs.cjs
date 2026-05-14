/**
 * migrate-docs.cjs
 *
 * 将 monSQLize-v1 文档迁移到 TS 版 docs/，同时：
 * 1. 跳过内部 / 测试专用文档
 * 2. 将代码示例中的 require() 转换为 ESM import
 * 3. 用 TypeScript 语言标记替换 javascript 代码块（含 require/import 的块）
 * 4. 更新已存在的 TS 版占位文件（不覆盖，追加迁移内容）
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SRC_DIR  = path.resolve(__dirname, '../../monSQLize-v1/docs');
const DEST_DIR = path.resolve(__dirname, '../docs');

// 跳过这些文件（内部/测试文档）
const SKIP_FILES = new Set([
    'COMPATIBILITY.md',
    'COMPATIBILITY-TESTING-GUIDE.md',
    'MONGODB-MEMORY-SERVER.md',
    'PROJECT-VISION.md',
    'cache-implementation.md',
    'chain-api-implementation.md',
    'node-version-testing-guide.md',
]);

// 已存在的 TS 占位文件（不覆盖，跳过）
const EXISTING_TS_DOCS = new Set([
    'getting-started.md',
    'cache-and-function-cache.md',
    'capability-index.md',
    'README.md',
]);

/**
 * 将代码块中的 require('monsqlize') 改为 import 语句，
 * 并将包含 require/import 的 javascript 块标记升级为 typescript
 */
function transformContent(content) {
    // 1. const MonSQLize = require('monsqlize') → import MonSQLize from 'monsqlize';
    content = content.replace(
        /const\s+MonSQLize\s*=\s*require\(['"]monsqlize['"]\)/g,
        "import MonSQLize from 'monsqlize'"
    );

    // 2. const { X, Y } = require('monsqlize') → import { X, Y } from 'monsqlize';
    content = content.replace(
        /const\s+(\{[^}]+\})\s*=\s*require\(['"]monsqlize['"]\)/g,
        (_, named) => `import ${named.trim()} from 'monsqlize'`
    );

    // 3. const Foo = require('monsqlize').Foo → import { Foo } from 'monsqlize';
    content = content.replace(
        /const\s+(\w+)\s*=\s*require\(['"]monsqlize['"]\)\.(\w+)/g,
        (_, local, exported) => {
            if (local === exported) {
                return `import { ${local} } from 'monsqlize'`;
            }
            return `import { ${exported} as ${local} } from 'monsqlize'`;
        }
    );

    // 4. 代码块语言标记：含 import/require 语句的 ```javascript 块 → ```typescript
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

        // 跳过内部文档
        if (SKIP_FILES.has(entry.name)) {
            console.log(`  ⏭  skip (internal): ${relPath}`);
            skipped++;
            continue;
        }

        // 跳过已有 TS 版占位文件（仅顶层）
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

console.log('🚀 monSQLize 文档迁移开始...\n');

if (!fs.existsSync(SRC_DIR)) {
    console.error(`❌ 源目录不存在: ${SRC_DIR}`);
    process.exit(1);
}

ensureDir(DEST_DIR);
const { copied, skipped } = migrateDir(SRC_DIR, DEST_DIR);

console.log(`\n✅ 迁移完成：${copied} 个文件已迁移，${skipped} 个已跳过`);
