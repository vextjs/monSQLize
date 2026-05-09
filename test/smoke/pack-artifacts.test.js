const test = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const path = require('node:path');

test('npm pack --dry-run 产物应包含 P1 关键文件', () => {
    const stdout = execSync('npm pack --dry-run --json', {
        cwd: path.resolve(__dirname, '../..'),
        encoding: 'utf8',
        shell: true,
    });

    assert.ok(stdout.trim().length > 0, 'npm pack --dry-run --json 应返回 JSON 输出');

    const parsed = JSON.parse(stdout);
    const files = parsed[0].files.map((item) => item.path);

    assert.ok(files.includes('lib/index.js'));
    assert.ok(files.includes('index.mjs'));
    assert.ok(files.includes('index.d.ts'));
    assert.ok(files.includes('types/base.d.ts'));
    assert.ok(files.includes('types/collection.d.ts'));
    assert.ok(files.includes('types/monsqlize.d.ts'));
    assert.ok(files.includes('types/runtime.d.ts'));
});

