'use strict';

const { existsSync, readdirSync, statSync } = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DIST_ROOT = path.join(ROOT, '.generated', 'test-dist', 'test-ts', 'v1-compat');

function collectTestFiles(dirPath) {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectTestFiles(fullPath));
            continue;
        }
        if (entry.isFile() && entry.name.endsWith('.test.js')) {
            files.push(fullPath);
        }
    }

    return files.sort();
}

function filterFiles(files, selector) {
    if (!selector) {
        return files;
    }

    const normalizedSelector = selector.replace(/\\/g, '/');
    return files.filter((filePath) => filePath.replace(/\\/g, '/').includes(normalizedSelector));
}

function main() {
    if (!existsSync(DIST_ROOT) || !statSync(DIST_ROOT).isDirectory()) {
        console.error(`未找到 TS 承接测试编译产物目录: ${DIST_ROOT}`);
        process.exit(1);
    }

    const selector = process.argv[2];
    const files = filterFiles(collectTestFiles(DIST_ROOT), selector);

    if (files.length === 0) {
        console.error(`未找到匹配的 TS 承接测试${selector ? `: ${selector}` : ''}`);
        process.exit(1);
    }

    console.log('─'.repeat(60));
    console.log('  TS Migration Tests');
    console.log('─'.repeat(60));
    if (selector) {
        console.log(`选择器: ${selector}`);
    }
    console.log(`文件数: ${files.length}`);

    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...files], {
        cwd: ROOT,
        stdio: 'inherit',
    });

    child.on('close', (code) => {
        process.exit(code ?? 1);
    });
    child.on('error', (error) => {
        console.error(error);
        process.exit(1);
    });
}

main();