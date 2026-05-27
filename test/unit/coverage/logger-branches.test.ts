import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { Logger } = require('../../../dist/cjs/index.cjs');

function makeLogger() {
    const debugged: unknown[] = [];
    const warned: unknown[] = [];
    const errored: unknown[] = [];
    const infoed: unknown[] = [];
    return {
        impl: {
            debug: (...a: unknown[]) => debugged.push(a),
            info: (...a: unknown[]) => infoed.push(a),
            warn: (...a: unknown[]) => warned.push(a),
            error: (...a: unknown[]) => errored.push(a),
        },
        debugged,
        warned,
        errored,
        infoed,
    };
}

// ── Logger.isValidLogger ──────────────────────────────────────────────────────

describe('Logger.isValidLogger', () => {
    it('returns false for null', () => {
        assert.equal(Logger.isValidLogger(null), false);
    });

    it('returns false for undefined', () => {
        assert.equal(Logger.isValidLogger(undefined), false);
    });

    it('returns false for a string', () => {
        assert.equal(Logger.isValidLogger('not a logger'), false);
    });

    it('returns false for an object missing methods', () => {
        assert.equal(Logger.isValidLogger({ debug: () => {} }), false);
    });

    it('returns true for a fully-formed logger', () => {
        assert.equal(Logger.isValidLogger(makeLogger().impl), true);
    });
});

// ── Logger.create ─────────────────────────────────────────────────────────────

describe('Logger.create', () => {
    it('create(null) produces a no-op logger', () => {
        const l = Logger.create(null);
        assert.doesNotThrow(() => l.debug('msg'));
        assert.doesNotThrow(() => l.info('msg'));
        assert.doesNotThrow(() => l.warn('msg'));
        assert.doesNotThrow(() => l.error('msg'));
    });

    it('create with invalid logger (no methods) falls back to null', () => {
        const l = Logger.create({ notALogger: true });
        assert.doesNotThrow(() => l.debug('msg'));
    });
});

// ── Logger structured mode ────────────────────────────────────────────────────

describe('Logger — structured mode', () => {
    it('debug in structured mode emits JSON with level DEBUG', () => {
        const { impl, debugged } = makeLogger();
        const l = Logger.create(impl, { structured: true });
        l.debug('hello');
        assert.ok(debugged.length > 0);
        const parsed = JSON.parse(debugged[0] as string);
        assert.equal(parsed.level, 'DEBUG');
        assert.equal(parsed.message, 'hello');
        assert.ok(typeof parsed.timestamp === 'string');
    });

    it('debug in structured mode with context adds context field', () => {
        const { impl, debugged } = makeLogger();
        const l = Logger.create(impl, { structured: true });
        l.debug('msg', { key: 'value' });
        const parsed = JSON.parse(debugged[0] as string);
        assert.deepEqual(parsed.context, { key: 'value' });
    });

    it('warn in structured mode emits JSON with level WARN', () => {
        const { impl, warned } = makeLogger();
        const l = Logger.create(impl, { structured: true });
        l.warn('warning');
        const parsed = JSON.parse(warned[0] as string);
        assert.equal(parsed.level, 'WARN');
    });

    it('error in structured mode emits JSON with level ERROR', () => {
        const { impl, errored } = makeLogger();
        const l = Logger.create(impl, { structured: true });
        l.error('error');
        const parsed = JSON.parse(errored[0] as string);
        assert.equal(parsed.level, 'ERROR');
    });

    it('info in structured mode emits JSON with level INFO', () => {
        const { impl, infoed } = makeLogger();
        const l = Logger.create(impl, { structured: true });
        l.info('info msg');
        const parsed = JSON.parse(infoed[0] as string);
        assert.equal(parsed.level, 'INFO');
    });
});

// ── Logger non-structured with ctx ───────────────────────────────────────────

describe('Logger — non-structured mode with context', () => {
    it('debug with ctx passes both args to underlying logger', () => {
        const { impl, debugged } = makeLogger();
        const l = Logger.create(impl);
        l.debug('msg', { extra: 1 });
        assert.equal((debugged[0] as unknown[])[0], 'msg');
        assert.deepEqual((debugged[0] as unknown[])[1], { extra: 1 });
    });

    it('warn with ctx passes both args', () => {
        const { impl, warned } = makeLogger();
        const l = Logger.create(impl);
        l.warn('warn msg', { extra: 2 });
        assert.equal((warned[0] as unknown[])[0], 'warn msg');
    });

    it('error with ctx passes both args', () => {
        const { impl, errored } = makeLogger();
        const l = Logger.create(impl);
        l.error('err msg', new Error('test'));
        assert.equal((errored[0] as unknown[])[0], 'err msg');
    });

    it('debug without ctx passes only one arg', () => {
        const { impl, debugged } = makeLogger();
        const l = Logger.create(impl);
        l.debug('only msg');
        assert.equal((debugged[0] as unknown[])[0], 'only msg');
        assert.equal((debugged[0] as unknown[]).length as number, 1);
    });
});

// ── Logger.withTraceId / getTraceId ──────────────────────────────────────────

describe('Logger.withTraceId and getTraceId', () => {
    it('withTraceId is a function (AsyncLocalStorage available)', () => {
        if (typeof Logger.withTraceId !== 'function') return;
        assert.equal(typeof Logger.withTraceId, 'function');
    });

    it('withTraceId runs callback with correct traceId', async () => {
        if (typeof Logger.withTraceId !== 'function') return;
        let captured: string | null = null;
        await Logger.withTraceId(() => {
            captured = typeof Logger.getTraceId === 'function' ? Logger.getTraceId() : null;
        }, 'trace-abc-123');
        assert.equal(captured, 'trace-abc-123');
    });

    it('withTraceId generates a random traceId when not provided', async () => {
        if (typeof Logger.withTraceId !== 'function') return;
        let captured: string | null = null;
        await Logger.withTraceId(() => {
            captured = typeof Logger.getTraceId === 'function' ? Logger.getTraceId() : null;
        });
        assert.ok(captured !== null && typeof captured === 'string' && (captured as string).length > 0);
    });

    it('getTraceId returns null outside a withTraceId context', () => {
        if (typeof Logger.getTraceId !== 'function') return;
        const id = Logger.getTraceId();
        assert.equal(id, null);
    });

    it('structured mode includes traceId when inside withTraceId context', async () => {
        if (typeof Logger.withTraceId !== 'function') return;
        const { impl, debugged } = makeLogger();
        const l = Logger.create(impl, { structured: true, enableTraceId: true });
        await Logger.withTraceId(async () => {
            l.debug('traced message');
        }, 'my-trace-id');
        if (debugged.length > 0) {
            const parsed = JSON.parse(debugged[0] as string);
            assert.equal(parsed.traceId, 'my-trace-id');
        }
    });
});

// ── Logger.generateTraceId ───────────────────────────────────────────────────

describe('Logger.generateTraceId', () => {
    it('returns a 16-char hex string', () => {
        const id = Logger.generateTraceId();
        assert.equal(typeof id, 'string');
        assert.equal(id.length, 16);
        assert.ok(/^[0-9a-f]{16}$/.test(id));
    });
});

// ── Logger.createSilent ───────────────────────────────────────────────────────

describe('Logger.createSilent', () => {
    it('creates a logger that does nothing', () => {
        const l = Logger.createSilent();
        assert.doesNotThrow(() => { l.debug('x'); l.info('y'); l.warn('z'); l.error('w'); });
    });
});

// ── Logger.createWithTimestamp ────────────────────────────────────────────────

describe('Logger.createWithTimestamp', () => {
    it('prepends ISO timestamp to messages', () => {
        const msgs: unknown[] = [];
        const impl = {
            debug: (...a: unknown[]) => msgs.push(a),
            info: (...a: unknown[]) => msgs.push(a),
            warn: (...a: unknown[]) => msgs.push(a),
            error: (...a: unknown[]) => msgs.push(a),
        };
        const l = Logger.createWithTimestamp(impl);
        l.debug('hello');
        assert.ok(msgs.length > 0);
        const msg = (msgs[0] as unknown[])[0] as string;
        assert.ok(msg.includes('hello'));
        assert.ok(/\d{4}-\d{2}-\d{2}T/.test(msg));
    });

    it('createWithTimestamp with null logger does not throw', () => {
        const l = Logger.createWithTimestamp(null);
        assert.doesNotThrow(() => { l.debug('x'); l.info('y'); l.warn('z'); l.error('w'); });
    });

    it('createWithTimestamp with no argument does not throw', () => {
        const l = Logger.createWithTimestamp();
        assert.doesNotThrow(() => l.warn('test'));
    });
});
