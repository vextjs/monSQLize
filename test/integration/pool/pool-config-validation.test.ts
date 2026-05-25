import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MonSQLize = require('../../../dist/cjs/index.cjs');

// Covers pool-runtime-helpers.ts uncovered functions:
//   - validatePoolConfig   (FNDA:0)
//   - validatePoolConfigSafe (FNDA:0)

describe('pool config validation — direct public API calls', () => {
    it('validatePoolConfig accepts valid config without throwing', () => {
        assert.doesNotThrow(() =>
            MonSQLize.validatePoolConfig({ name: 'main', uri: 'mongodb://localhost:27017' }),
        );
    });

    it('validatePoolConfig throws on missing name', () => {
        assert.throws(
            () => MonSQLize.validatePoolConfig({ uri: 'mongodb://localhost:27017' }),
            /name/,
        );
    });

    it('validatePoolConfig throws on missing uri', () => {
        assert.throws(
            () => MonSQLize.validatePoolConfig({ name: 'main' }),
            /uri/,
        );
    });

    it('validatePoolConfig throws on invalid uri scheme', () => {
        assert.throws(
            () => MonSQLize.validatePoolConfig({ name: 'main', uri: 'http://localhost' }),
            /mongodb/,
        );
    });

    it('validatePoolConfig throws on invalid role', () => {
        assert.throws(
            () => MonSQLize.validatePoolConfig({ name: 'main', uri: 'mongodb://localhost', role: 'invalid' }),
            /role/,
        );
    });

    it('validatePoolConfig accepts valid role', () => {
        assert.doesNotThrow(() =>
            MonSQLize.validatePoolConfig({ name: 'main', uri: 'mongodb://localhost', role: 'primary' }),
        );
    });

    it('validatePoolConfig throws on non-numeric weight', () => {
        assert.throws(
            () => MonSQLize.validatePoolConfig({ name: 'main', uri: 'mongodb://localhost', weight: 'heavy' }),
            /weight/,
        );
    });

    it('validatePoolConfig throws on negative weight', () => {
        assert.throws(
            () => MonSQLize.validatePoolConfig({ name: 'main', uri: 'mongodb://localhost', weight: -1 }),
            /weight/,
        );
    });

    it('validatePoolConfigSafe returns empty array for valid config', () => {
        const errors = MonSQLize.validatePoolConfigSafe({ name: 'main', uri: 'mongodb://localhost:27017' });
        assert.ok(Array.isArray(errors));
        assert.equal(errors.length, 0);
    });

    it('validatePoolConfigSafe returns errors for missing name', () => {
        const errors = MonSQLize.validatePoolConfigSafe({ uri: 'mongodb://localhost' });
        assert.ok(Array.isArray(errors));
        assert.ok(errors.length > 0);
    });

    it('validatePoolConfigSafe returns errors for invalid config', () => {
        const errors = MonSQLize.validatePoolConfigSafe({});
        assert.ok(Array.isArray(errors));
        assert.ok(errors.length > 0);
    });

    it('validatePoolConfigSafe accepts mongodb+srv:// uri scheme', () => {
        const errors = MonSQLize.validatePoolConfigSafe({ name: 'srv', uri: 'mongodb+srv://host/db' });
        assert.ok(Array.isArray(errors));
        assert.equal(errors.length, 0);
    });
});
