import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const MonSQLize = require('../../../dist/cjs/index.cjs');

// Additional capability-wiring.ts branch coverage.
// Targets branches not covered by the existing capability-wiring.test.js:
//   - loadModelFiles: file-load error catch branch
//   - loadModelFiles: directory entry skipped when non-recursive
//   - loadModelFiles: models config that is neither string nor object (number)
//   - buildRuntimeDefaults: non-mongodb type path via internal call

describe('capability-wiring-extra — loadModelFiles edge cases', () => {
    let tmpDir = '';

    afterEach(() => {
        if (tmpDir) {
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
            tmpDir = '';
        }
        try { MonSQLize.Model._clear?.(); } catch {}
    });

    it('file that throws on require is skipped (catch branch)', async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msq-wiring-err-'));
        const badFile = path.join(tmpDir, 'broken.model.js');
        fs.writeFileSync(badFile, 'throw new Error("intentional load failure");');

        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'x',
            config: { uri: 'mongodb://localhost' },
            models: tmpDir,
        });

        // _loadModels should not throw — the error is swallowed and logged as warning
        await assert.doesNotReject(() => runtime._loadModels());
    });

    it('directory entry is skipped when recursive=false (non-recursive default)', async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msq-wiring-dir-'));
        // Create a subdirectory — should be skipped when recursive=false
        const subDir = path.join(tmpDir, 'subdir');
        fs.mkdirSync(subDir);
        // Create a valid model file directly in tmpDir
        fs.writeFileSync(path.join(tmpDir, 'top.model.js'), `
            module.exports = { name: 'top_level_model', schema: {} };
        `);
        // Create a valid model file in subdir — should NOT be loaded (non-recursive)
        fs.writeFileSync(path.join(subDir, 'nested.model.js'), `
            module.exports = { name: 'nested_model_should_not_load', schema: {} };
        `);

        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'x',
            config: { uri: 'mongodb://localhost' },
            models: tmpDir,
        });

        await runtime._loadModels();

        assert.ok(MonSQLize.Model.has('top_level_model'));
        assert.ok(!MonSQLize.Model.has('nested_model_should_not_load'));
    });

    it('models config as invalid type (number) is skipped', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'x',
            config: { uri: 'mongodb://localhost' },
            models: 42 as any,
        });

        // _loadModels should return early without error
        await assert.doesNotReject(() => runtime._loadModels());
    });

    it('_loadModels() on absolute path works', async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msq-wiring-abs-'));
        const modelFile = path.join(tmpDir, 'abs.model.js');
        fs.writeFileSync(modelFile, `module.exports = { name: 'abs_path_model', schema: {} };`);

        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'x',
            config: { uri: 'mongodb://localhost' },
            models: tmpDir, // already absolute on Windows
        });

        await runtime._loadModels();
        assert.ok(MonSQLize.Model.has('abs_path_model'));
    });

    it('_loadModels() with non-existent directory logs warning and returns', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'x',
            config: { uri: 'mongodb://localhost' },
            models: '/nonexistent/path/xyz/abc',
        });

        // Should not throw even when dir doesn't exist
        await assert.doesNotReject(() => runtime._loadModels());
    });

    it('_loadModels() with model exported as module.default', async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msq-wiring-default-'));
        const modelFile = path.join(tmpDir, 'esm.model.js');
        fs.writeFileSync(modelFile, `
            module.exports = { default: { name: 'esm_default_model', schema: {} } };
        `);

        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'x',
            config: { uri: 'mongodb://localhost' },
            models: tmpDir,
        });

        await runtime._loadModels();
        assert.ok(MonSQLize.Model.has('esm_default_model'));
    });
});
