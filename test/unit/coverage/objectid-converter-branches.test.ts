import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';

import { convertObjectIdStrings, convertUpdateDocument } from '../../../src/adapters/mongodb/utils/objectid-converter';

describe('convertObjectIdStrings — branch coverage', () => {
    it('returns obj as-is when depth > MAX_DEPTH (10)', () => {
        // Pass an object at depth 0 but nest it 11 levels deep via recursion
        const deep = { a: { a: { a: { a: { a: { a: { a: { a: { a: { a: { a: 'leaf' } } } } } } } } } } };
        const result = convertObjectIdStrings(deep);
        assert.ok(typeof result === 'object');
    });

    it('returns null unchanged', () => {
        assert.equal(convertObjectIdStrings(null), null);
    });

    it('returns undefined unchanged', () => {
        assert.equal(convertObjectIdStrings(undefined), undefined);
    });

    it('returns ObjectId instance unchanged', () => {
        const oid = new ObjectId();
        const result = convertObjectIdStrings(oid);
        assert.ok(result instanceof ObjectId);
        assert.equal(result.toHexString(), oid.toHexString());
    });

    it('cross-version ObjectId compat: object with constructor.name === ObjectId and valid hex', () => {
        const oid = new ObjectId();
        const fakeOid = { constructor: { name: 'ObjectId' }, toString: () => oid.toHexString() };
        const result = convertObjectIdStrings(fakeOid);
        assert.ok(result instanceof ObjectId);
    });

    it('cross-version ObjectId compat: object with constructor.name === ObjectId and invalid hex', () => {
        const fakeOid = { constructor: { name: 'ObjectId' }, toString: () => 'not-valid-hex' };
        const result = convertObjectIdStrings(fakeOid);
        assert.equal(result, fakeOid);
    });

    it('string starting with $ (field reference) returns unchanged', () => {
        const result = convertObjectIdStrings('$someField');
        assert.equal(result, '$someField');
    });

    it('valid 24-char hex string is converted to ObjectId', () => {
        const hex = new ObjectId().toHexString();
        const result = convertObjectIdStrings(hex);
        assert.ok(result instanceof ObjectId);
    });

    it('invalid hex string (not 24 chars) is returned unchanged', () => {
        const result = convertObjectIdStrings('abc123');
        assert.equal(result, 'abc123');
    });

    it('regular string (non-hex, non-$) is returned unchanged', () => {
        const result = convertObjectIdStrings('hello world');
        assert.equal(result, 'hello world');
    });

    it('array: unchanged items returns same array reference', () => {
        const arr = [42, 'hello'];
        const result = convertObjectIdStrings(arr);
        assert.equal(result, arr);
    });

    it('array: changed item returns new array', () => {
        const hex = new ObjectId().toHexString();
        const arr = [hex];
        const result = convertObjectIdStrings(arr);
        assert.ok(Array.isArray(result));
        assert.ok((result as unknown[])[0] instanceof ObjectId);
    });

    it('object with circular reference returns original', () => {
        const obj: Record<string, unknown> = { a: 1 };
        obj.self = obj;
        const result = convertObjectIdStrings(obj);
        assert.ok(typeof result === 'object');
    });

    it('shared object references are converted on every non-cyclic path', () => {
        const hex = new ObjectId().toHexString();
        const shared = { userId: hex };
        const result = convertObjectIdStrings({ a: shared, b: shared }) as {
            a: { userId: unknown };
            b: { userId: unknown };
        };

        assert.ok(result.a.userId instanceof ObjectId);
        assert.ok(result.b.userId instanceof ObjectId);
        assert.equal(result.a.userId.toString(), hex);
        assert.equal(result.b.userId.toString(), hex);
    });

    it('object with SPECIAL_OPERATOR key $expr is kept unchanged', () => {
        const val = { some: 'value' };
        const obj = { $expr: val };
        const result = convertObjectIdStrings(obj) as Record<string, unknown>;
        assert.equal(result.$expr, val);
    });

    it('object with _id field containing valid ObjectId string → converts', () => {
        const hex = new ObjectId().toHexString();
        const result = convertObjectIdStrings({ _id: hex }) as Record<string, unknown>;
        assert.ok(result._id instanceof ObjectId);
    });

    it('object with non-matching field name and valid ObjectId string → recurses but does not match', () => {
        const hex = new ObjectId().toHexString();
        const result = convertObjectIdStrings({ name: hex }) as Record<string, unknown>;
        // 'name' does not match the pattern so it gets recursed as a string
        assert.ok(result.name instanceof ObjectId); // string recursion converts it
    });

    it('respects field-level exclusion while keeping value-based conversion elsewhere', () => {
        const hex = new ObjectId().toHexString();
        const result = convertObjectIdStrings(
            { token: hex, nested: { userId: hex }, tags: [hex] },
            '',
            0,
            new WeakSet(),
            { enabled: true, excludeFields: ['token'] },
        ) as { token: unknown; nested: { userId: unknown }; tags: unknown[] };

        assert.equal(result.token, hex);
        assert.ok(result.nested.userId instanceof ObjectId);
        assert.ok(result.tags[0] instanceof ObjectId);
    });

    it('respects field-map false escape hatch on arbitrary value-based fields', () => {
        const hex = new ObjectId().toHexString();
        const result = convertObjectIdStrings(
            { token: hex, userId: hex },
            '',
            0,
            new WeakSet(),
            { token: false },
        ) as { token: unknown; userId: unknown };

        assert.equal(result.token, hex);
        assert.ok(result.userId instanceof ObjectId);
    });

    it('respects maxDepth for nested value-based conversion', () => {
        const hex = new ObjectId().toHexString();
        const result = convertObjectIdStrings(
            { first: { second: { token: hex } } },
            '',
            0,
            new WeakSet(),
            { enabled: true, maxDepth: 1 },
        ) as { first: { second: { token: unknown } } };

        assert.equal(result.first.second.token, hex);
    });

    it('object with field reference value ($ref) not converted even if field name matches', () => {
        const result = convertObjectIdStrings({ _id: '$someRef' }) as Record<string, unknown>;
        assert.equal(result._id, '$someRef');
    });

    it('object: no change returns same reference', () => {
        const obj = { count: 42 };
        const result = convertObjectIdStrings(obj);
        assert.equal(result, obj);
    });

    it('number input returns unchanged', () => {
        assert.equal(convertObjectIdStrings(42), 42);
    });

    it('boolean input returns unchanged', () => {
        assert.equal(convertObjectIdStrings(true), true);
    });

    it('userId field (matches /^.*Id$/) with valid ObjectId → converts', () => {
        const hex = new ObjectId().toHexString();
        const result = convertObjectIdStrings({ userId: hex }) as Record<string, unknown>;
        assert.ok(result.userId instanceof ObjectId);
    });

    it('user_id field (matches /^.*_id$/) with valid ObjectId → converts', () => {
        const hex = new ObjectId().toHexString();
        const result = convertObjectIdStrings({ user_id: hex }) as Record<string, unknown>;
        assert.ok(result.user_id instanceof ObjectId);
    });
});

describe('convertUpdateDocument — branch coverage', () => {
    it('returns null unchanged', () => {
        assert.equal(convertUpdateDocument(null), null);
    });

    it('returns non-object (string) unchanged', () => {
        assert.equal(convertUpdateDocument('hello'), 'hello');
    });

    it('returns array unchanged', () => {
        const arr = [{ $set: { x: 1 } }];
        assert.equal(convertUpdateDocument(arr), arr);
    });

    it('converts $set fields with ObjectId strings', () => {
        const hex = new ObjectId().toHexString();
        const result = convertUpdateDocument({ $set: { _id: hex } }) as Record<string, unknown>;
        const setVal = result.$set as Record<string, unknown>;
        assert.ok(setVal._id instanceof ObjectId);
    });

    it('does not convert $inc fields', () => {
        const result = convertUpdateDocument({ $inc: { count: 1 } }) as Record<string, unknown>;
        assert.deepEqual(result.$inc, { count: 1 });
    });

    it('returns unchanged object when no conversion happens', () => {
        const upd = { $set: { name: 'Alice' } };
        const result = convertUpdateDocument(upd);
        assert.equal(result, upd);
    });

    it('converts $push with ObjectId strings', () => {
        const hex = new ObjectId().toHexString();
        const result = convertUpdateDocument({ $push: { _id: hex } }) as Record<string, unknown>;
        const pushVal = result.$push as Record<string, unknown>;
        assert.ok(pushVal._id instanceof ObjectId);
    });

    it('handles $setOnInsert with ObjectId', () => {
        const hex = new ObjectId().toHexString();
        const result = convertUpdateDocument({ $setOnInsert: { userId: hex } }) as Record<string, unknown>;
        const val = result.$setOnInsert as Record<string, unknown>;
        assert.ok(val.userId instanceof ObjectId);
    });

    it('passes conversion options through update operators', () => {
        const hex = new ObjectId().toHexString();
        const result = convertUpdateDocument(
            { $set: { token: hex, userId: hex } },
            { enabled: true, excludeFields: ['token'] },
        ) as Record<string, unknown>;
        const val = result.$set as Record<string, unknown>;

        assert.equal(val.token, hex);
        assert.ok(val.userId instanceof ObjectId);
    });
});
