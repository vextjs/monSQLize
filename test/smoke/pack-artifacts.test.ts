import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import path from 'node:path';

type PackFile = {
    path: string;
};

type PackResult = {
    files: PackFile[];
};

test('npm pack --dry-run includes dist publish artifacts', () => {
    const stdout = execSync('npm pack --dry-run --json', {
        cwd: path.resolve(__dirname, '../..'),
        encoding: 'utf8',
    });

    assert.ok(stdout.trim().length > 0, 'npm pack --dry-run --json should return JSON output');

    const parsed = JSON.parse(stdout) as PackResult[];
    const files = parsed[0].files.map((item) => item.path);

    assert.ok(files.includes('dist/cjs/index.cjs'));
    assert.ok(files.includes('dist/esm/index.mjs'));
    assert.ok(files.includes('dist/types/index.d.ts'));
    assert.ok(files.includes('dist/types/index.d.mts'));
    assert.ok(files.includes('dist/types/base.d.ts'));
    assert.ok(files.includes('dist/types/collection.d.ts'));
    assert.ok(files.includes('dist/types/monsqlize.d.ts'));
    assert.ok(files.includes('dist/types/runtime.d.ts'));
});
