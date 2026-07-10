import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('data-task CLI can plan a JSON task without a database connection', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'monsqlize-data-task-cli-'));
    const taskPath = path.join(dir, 'task.json');
    fs.writeFileSync(taskPath, JSON.stringify({
        name: 'cli-plan-smoke',
        source: { collection: 'sourceUsers' },
        target: { collection: 'targetUsers' },
        filter: { status: 'active' },
        matchBy: ['email'],
        steps: [{ type: 'syncData' }],
    }), 'utf8');

    try {
        const stdout = execFileSync(
            process.execPath,
            ['dist/cjs/cli/data-task.cjs', 'data-task', 'plan', '--task', taskPath, '--json'],
            { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' },
        );
        const parsed = JSON.parse(stdout);
        assert.equal(parsed.mode, 'plan');
        assert.equal(parsed.taskName, 'cli-plan-smoke');
        assert.equal(parsed.requiresSnapshot, true);
        assert.equal(parsed.errors.length, 0);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
