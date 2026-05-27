import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// model-utils is not exported by default index, read it from the source
// Actually it IS exported - let's check:
const MonSQLize = require('../../../dist/cjs/index.cjs');

// toKey, unique, groupBy, getByPath, pickFields, applySort, serializeDocument
const { toKey, unique, groupBy, getByPath, pickFields, applySort, serializeDocument } = MonSQLize;

describe('toKey — branch coverage', () => {
    it('Date value → ISO string', () => {
        const d = new Date('2026-01-01T00:00:00.000Z');
        assert.equal(toKey(d), d.toISOString());
    });

    it('object with toHexString → returns hex string', () => {
        const fakeOid = { toHexString: () => 'abc123' };
        assert.equal(toKey(fakeOid), 'abc123');
    });

    it('object with toString (no toHexString) → calls toString', () => {
        const obj = { toString: () => 'custom-str' };
        assert.equal(toKey(obj), 'custom-str');
    });

    it('null → "null" string', () => {
        assert.equal(toKey(null), 'null');
    });

    it('number → string representation', () => {
        assert.equal(toKey(42), '42');
    });

    it('undefined → "undefined" string', () => {
        assert.equal(toKey(undefined), 'undefined');
    });
});

describe('unique — branch coverage', () => {
    it('deduplicates objects with same hex key', () => {
        const a = { toHexString: () => 'abc' };
        const b = { toHexString: () => 'abc' };
        const result = unique([a, b]);
        assert.equal(result.length, 1);
    });

    it('preserves first occurrence', () => {
        const result = unique([1, 2, 1, 3]);
        assert.deepEqual(result, [1, 2, 3]);
    });
});

describe('groupBy — branch coverage', () => {
    it('groups items that already have a key (existing group branch)', () => {
        const result = groupBy([1, 2, 1], (v: unknown) => v);
        const g1 = result.get('1');
        assert.ok(g1);
        assert.equal(g1.length, 2);
    });

    it('creates new group when key is new', () => {
        const result = groupBy([1, 2], (v: unknown) => v);
        assert.equal(result.get('1')?.length, 1);
        assert.equal(result.get('2')?.length, 1);
    });
});

describe('getByPath — branch coverage', () => {
    it('returns nested value at dot path', () => {
        assert.equal(getByPath({ a: { b: 42 } }, 'a.b'), 42);
    });

    it('returns undefined when intermediate is null', () => {
        assert.equal(getByPath({ a: null }, 'a.b'), undefined);
    });

    it('returns undefined when intermediate is non-object', () => {
        assert.equal(getByPath({ a: 5 }, 'a.b'), undefined);
    });

    it('returns undefined for missing path', () => {
        assert.equal(getByPath({}, 'x.y'), undefined);
    });
});

describe('pickFields — branch coverage', () => {
    it('picks specified fields as string list', () => {
        const result = pickFields({ a: 1, b: 2, c: 3 }, ['a', 'b']);
        assert.deepEqual(result, { a: 1, b: 2 });
    });

    it('picks specified fields as space-separated string', () => {
        const result = pickFields({ a: 1, b: 2, c: 3 }, 'a b');
        assert.deepEqual(result, { a: 1, b: 2 });
    });

    it('always includes _id if present in doc', () => {
        const result = pickFields({ _id: 'x', a: 1 }, ['a']);
        assert.equal(result._id, 'x');
    });

    it('includes alwaysInclude fields even if not in select', () => {
        const result = pickFields({ a: 1, b: 2, fk: 3 }, ['a'], ['fk']);
        assert.equal(result.fk, 3);
    });

    it('skips field not present in document', () => {
        const result = pickFields({ a: 1 }, ['a', 'z']);
        assert.ok(!('z' in result));
    });
});

describe('applySort — branch coverage', () => {
    it('sorts ascending', () => {
        const result = applySort([{ v: 3 }, { v: 1 }, { v: 2 }], { v: 1 });
        assert.deepEqual(result.map((x: any) => x.v), [1, 2, 3]);
    });

    it('sorts descending', () => {
        const result = applySort([{ v: 1 }, { v: 3 }, { v: 2 }], { v: -1 });
        assert.deepEqual(result.map((x: any) => x.v), [3, 2, 1]);
    });

    it('null value sorts to end (ascending)', () => {
        const result = applySort([{ v: null }, { v: 1 }], { v: 1 });
        // null should sort after non-null
        assert.equal((result[result.length - 1] as any).v, null);
    });

    it('leftValue null: left sorts after right (direction=1)', () => {
        const result = applySort([{ v: null }, { v: 5 }], { v: 1 });
        assert.equal((result[0] as any).v, 5);
    });

    it('rightValue null: right sorts after left (direction=1)', () => {
        const result = applySort([{ v: 5 }, { v: null }], { v: 1 });
        assert.equal((result[0] as any).v, 5);
    });

    it('equal values in multiple-field sort: falls through to next field', () => {
        const items = [{ a: 1, b: 2 }, { a: 1, b: 1 }];
        const result = applySort(items, { a: 1, b: 1 });
        assert.equal((result[0] as any).b, 1);
    });

    it('does not mutate original array', () => {
        const items = [{ v: 2 }, { v: 1 }];
        applySort(items, { v: 1 });
        assert.equal(items[0].v, 2);
    });
});

describe('serializeDocument — branch coverage', () => {
    it('strips function-valued fields', () => {
        const result = serializeDocument({ a: 1, fn: () => {} });
        assert.ok(!('fn' in result));
        assert.equal(result.a, 1);
    });

    it('keeps non-function fields', () => {
        const result = serializeDocument({ x: 42, y: 'hello', z: null });
        assert.deepEqual(result, { x: 42, y: 'hello', z: null });
    });
});
