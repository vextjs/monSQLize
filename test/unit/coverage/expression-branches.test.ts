import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MonSQLize = require('../../../dist/cjs/index.cjs');

function compile(exprStr: string): unknown {
    const exprObj = MonSQLize.expr(exprStr);
    const pipeline = MonSQLize.compilePipelineExpressions([{ $project: { _r: exprObj } }]);
    return (pipeline as Array<{ $project: { _r: unknown } }>)[0].$project._r;
}

describe('expression-compiler — uncovered branches', () => {

    // ── FILTER ────────────────────────────────────────────────────────────────

    it('FILTER function produces $filter', () => {
        const result = compile("FILTER(items, 'item', item.price > 10)") as Record<string, unknown>;
        assert.deepEqual(result, {
            $filter: {
                input: '$items',
                as: 'item',
                cond: { $gt: ['$$item.price', 10] },
            },
        });
    });

    // ── MAP ───────────────────────────────────────────────────────────────────

    it('MAP function produces $map', () => {
        const result = compile("MAP(items, 'item', item.price)") as Record<string, unknown>;
        assert.deepEqual(result, {
            $map: {
                input: '$items',
                as: 'item',
                in: '$$item.price',
            },
        });
    });

    // ── REDUCE ────────────────────────────────────────────────────────────────

    it('REDUCE function produces $reduce with lambda', () => {
        const result = compile('REDUCE(nums, 0, (acc, item) => acc + item)') as Record<string, unknown>;
        assert.deepEqual(result, {
            $reduce: {
                input: '$nums',
                initialValue: 0,
                in: { $add: ['$$value', '$$this'] },
            },
        });
    });

    it('REDUCE throws when lambda is missing', () => {
        assert.throws(
            () => compile('REDUCE(nums, 0, notALambda)'),
            /REDUCE requires a lambda/,
        );
    });

    // ── DATE functions ────────────────────────────────────────────────────────

    it('DATE_ADD produces $dateAdd', () => {
        const result = compile("DATE_ADD(startDate, 1, 'day')") as Record<string, unknown>;
        assert.ok('$dateAdd' in result);
        const d = result.$dateAdd as Record<string, unknown>;
        assert.equal(d.unit, 'day');
        assert.equal(d.amount, 1);
    });

    it('DATE_SUBTRACT produces $dateSubtract', () => {
        const result = compile("DATE_SUBTRACT(startDate, 7, 'day')") as Record<string, unknown>;
        assert.ok('$dateSubtract' in result);
    });

    it('DATE_DIFF produces $dateDiff', () => {
        const result = compile("DATE_DIFF(startDate, endDate, 'day')") as Record<string, unknown>;
        assert.ok('$dateDiff' in result);
        const d = result.$dateDiff as Record<string, unknown>;
        assert.equal(d.unit, 'day');
    });

    it('DATE_TO_STRING with timezone arg produces $dateToString with timezone', () => {
        const result = compile("DATE_TO_STRING(date, '%Y-%m-%d', 'UTC')") as Record<string, unknown>;
        assert.ok('$dateToString' in result);
        const d = result.$dateToString as Record<string, unknown>;
        assert.equal(d.timezone, 'UTC');
        assert.equal(d.format, '%Y-%m-%d');
    });

    it('DATE_TO_STRING without timezone omits timezone field', () => {
        const result = compile("DATE_TO_STRING(date, '%Y-%m-%d')") as Record<string, unknown>;
        assert.ok('$dateToString' in result);
        const d = result.$dateToString as Record<string, unknown>;
        assert.ok(!('timezone' in d));
    });

    it('DATE_FROM_STRING produces $dateFromString', () => {
        const result = compile("DATE_FROM_STRING('2024-01-01')") as Record<string, unknown>;
        assert.ok('$dateFromString' in result);
    });

    it('DATE_TO_PARTS with timezone produces $dateToParts with timezone', () => {
        const result = compile("DATE_TO_PARTS(date, 'UTC')") as Record<string, unknown>;
        assert.ok('$dateToParts' in result);
        const d = result.$dateToParts as Record<string, unknown>;
        assert.equal(d.timezone, 'UTC');
    });

    it('DATE_TO_PARTS without timezone omits timezone field', () => {
        const result = compile('DATE_TO_PARTS(date)') as Record<string, unknown>;
        assert.ok('$dateToParts' in result);
        const d = result.$dateToParts as Record<string, unknown>;
        assert.ok(!('timezone' in d));
    });

    // ── CONVERT ───────────────────────────────────────────────────────────────

    it('CONVERT with onError arg adds onError', () => {
        const result = compile("CONVERT(value, 'int', 0)") as Record<string, unknown>;
        assert.ok('$convert' in result);
        const c = result.$convert as Record<string, unknown>;
        assert.equal(c.onError, 0);
        assert.ok(!('onNull' in c));
    });

    it('CONVERT with onError and onNull adds both', () => {
        const result = compile("CONVERT(value, 'int', 0, null)") as Record<string, unknown>;
        assert.ok('$convert' in result);
        const c = result.$convert as Record<string, unknown>;
        assert.equal(c.onError, 0);
        assert.equal(c.onNull, null);
    });

    it('CONVERT without optional args has no onError or onNull', () => {
        const result = compile("CONVERT(value, 'int')") as Record<string, unknown>;
        assert.ok('$convert' in result);
        const c = result.$convert as Record<string, unknown>;
        assert.ok(!('onError' in c));
        assert.ok(!('onNull' in c));
    });

    // ── ROUND (2-arg branch) ──────────────────────────────────────────────────

    it('ROUND with 2 args produces array form', () => {
        const result = compile('ROUND(value, 2)') as Record<string, unknown>;
        assert.ok('$round' in result);
        const arr = result.$round as unknown[];
        assert.equal(arr.length, 2);
        assert.equal(arr[1], 2);
    });

    it('ROUND with 1 arg produces single-element array', () => {
        const result = compile('ROUND(value)') as Record<string, unknown>;
        assert.ok('$round' in result);
        const arr = result.$round as unknown[];
        assert.equal(arr.length, 1);
    });

    // ── SLICE (3-arg branch) ──────────────────────────────────────────────────

    it('SLICE with 3 args produces $slice with position and count', () => {
        const result = compile('SLICE(arr, 0, 5)') as Record<string, unknown>;
        assert.ok('$slice' in result);
        const arr = result.$slice as unknown[];
        assert.equal(arr.length, 3);
    });

    it('SLICE with 2 args produces $slice without position', () => {
        const result = compile('SLICE(arr, 5)') as Record<string, unknown>;
        assert.ok('$slice' in result);
        const arr = result.$slice as unknown[];
        assert.equal(arr.length, 2);
    });

    // ── Comparison with function call on left side ────────────────────────────

    it('function call on left side of comparison is compiled', () => {
        const result = compile("UPPER(name) === 'TEST'") as Record<string, unknown>;
        assert.ok('$eq' in result);
        const arr = result.$eq as unknown[];
        assert.ok(typeof arr[0] === 'object' && arr[0] !== null && '$toUpper' in (arr[0] as object));
    });

    // ── parseThenElse with nested ternary ─────────────────────────────────────

    it('nested ternary in else branch compiles recursively', () => {
        // The ternary regex extracts: condition=`a === 1`, then=`x`, else=`b === 2 ? y : z`
        // parseThenElse on the else branch detects `?` and `:`, calls compileInnerExpression
        const result = compile('a === 1 ? x : b === 2 ? y : z') as Record<string, unknown>;
        assert.ok('$cond' in result);
        const cond = result.$cond as Record<string, unknown>;
        // else part should be a nested $cond object (not a field string)
        assert.ok(typeof cond.else === 'object');
        assert.ok('$cond' in (cond.else as Record<string, unknown>));
    });

    // ── parseValue with function call ─────────────────────────────────────────

    it('parseValue recognizes IS_FUNC_CALL_RE within IF_NULL', () => {
        const result = compile('IF_NULL(UPPER(name), x)') as Record<string, unknown>;
        assert.ok('$ifNull' in result);
        const arr = result.$ifNull as unknown[];
        assert.ok(typeof arr[0] === 'object' && arr[0] !== null && '$toUpper' in (arr[0] as object));
    });

    // ── parseOperand with arithmetic inside ───────────────────────────────────

    it('parseOperand recurses when operand contains arithmetic', () => {
        const result = compile('a + b * c') as Record<string, unknown>;
        assert.deepEqual(result, { $add: ['$a', { $multiply: ['$b', '$c'] }] });
    });

    it('comparison wraps arithmetic expressions at lower precedence', () => {
        assert.deepEqual(compile('a + b === c'), { $eq: [{ $add: ['$a', '$b'] }, '$c'] });
        assert.deepEqual(compile('price * qty > 100'), { $gt: [{ $multiply: ['$price', '$qty'] }, 100] });
    });

    // ── IF_NULL ────────────────────────────────────────────────────────────────

    it('IF_NULL function produces $ifNull', () => {
        const result = compile("IF_NULL(value, 'default')") as Record<string, unknown>;
        assert.ok('$ifNull' in result);
        const arr = result.$ifNull as unknown[];
        assert.equal(arr[1], 'default');
    });

    it('IF_NULL throws with wrong arg count', () => {
        assert.throws(
            () => compile('IF_NULL(value)'),
            /IF_NULL requires 2 arguments/,
        );
    });

    // ── SET_FIELD / UNSET_FIELD / GET_FIELD ───────────────────────────────────

    it('SET_FIELD produces $setField', () => {
        const result = compile("SET_FIELD('myField', newValue, doc)") as Record<string, unknown>;
        assert.ok('$setField' in result);
        const sf = result.$setField as Record<string, unknown>;
        assert.equal(sf.field, 'myField');
    });

    it('SET_FIELD throws with wrong arg count', () => {
        assert.throws(
            () => compile("SET_FIELD('myField', newValue)"),
            /SET_FIELD requires 3 arguments/,
        );
    });

    it('UNSET_FIELD produces $unsetField', () => {
        const result = compile("UNSET_FIELD('myField', doc)") as Record<string, unknown>;
        assert.ok('$unsetField' in result);
    });

    it('GET_FIELD with 2 args produces object form', () => {
        const result = compile("GET_FIELD('myField', doc)") as Record<string, unknown>;
        assert.ok('$getField' in result);
        const gf = result.$getField as Record<string, unknown>;
        assert.ok(typeof gf === 'object' && 'field' in gf);
    });

    it('GET_FIELD with 1 arg produces simple form', () => {
        const result = compile("GET_FIELD('myField')") as Record<string, unknown>;
        assert.ok('$getField' in result);
        assert.equal(typeof result.$getField, 'string');
    });

    // ── LET ────────────────────────────────────────────────────────────────────

    it('LET function produces $let', () => {
        const result = compile('LET({x: value}, x + 1)') as Record<string, unknown>;
        assert.ok('$let' in result);
        const l = result.$let as Record<string, unknown>;
        assert.ok('vars' in l);
        assert.ok('in' in l);
    });

    it('LET throws when no object literal provided', () => {
        assert.throws(
            () => compile('LET(notAnObject, x)'),
            /LET requires an object literal/,
        );
    });

    // ── SET_UNION ─────────────────────────────────────────────────────────────

    it('SET_UNION with field references produces $setUnion', () => {
        const result = compile('SET_UNION(arr1, arr2)') as Record<string, unknown>;
        assert.ok('$setUnion' in result);
    });

    it('SET_UNION with single-element array literals parses them as JSON', () => {
        // [1] and [2] are single-element arrays — no nested commas, so splitArgsStr keeps them intact
        // The SET_UNION branch checks arg.startsWith('[') and calls JSON.parse
        const result = compile('SET_UNION([1], [2])') as Record<string, unknown>;
        assert.ok('$setUnion' in result);
        const arr = result.$setUnion as unknown[];
        assert.deepEqual(arr[0], [1]);
        assert.deepEqual(arr[1], [2]);
    });

    // ── SWITCH ────────────────────────────────────────────────────────────────

    it('SWITCH with even args (no default) produces $switch without default', () => {
        const result = compile('SWITCH(a === 1, x, a === 2, y)') as Record<string, unknown>;
        assert.ok('$switch' in result);
        const sw = result.$switch as Record<string, unknown>;
        assert.ok(Array.isArray(sw.branches));
        assert.ok(!('default' in sw));
    });

    it('SWITCH with odd args adds default value', () => {
        const result = compile('SWITCH(a === 1, x, z)') as Record<string, unknown>;
        assert.ok('$switch' in result);
        const sw = result.$switch as Record<string, unknown>;
        assert.ok('default' in sw);
    });

    it('SWITCH throws with fewer than 2 args', () => {
        assert.throws(
            () => compile('SWITCH(a === 1)'),
            /SWITCH requires at least 2 arguments/,
        );
    });

    // ── INDEX_OF_STR with 3 args ──────────────────────────────────────────────

    it('INDEX_OF_STR with 3 args adds start position', () => {
        const result = compile("INDEX_OF_STR(str, 'x', 0)") as Record<string, unknown>;
        assert.ok('$indexOfCP' in result);
        const arr = result.$indexOfCP as unknown[];
        assert.equal(arr.length, 3);
    });

    it('INDEX_OF_STR with 2 args omits start position', () => {
        const result = compile("INDEX_OF_STR(str, 'x')") as Record<string, unknown>;
        assert.ok('$indexOfCP' in result);
        const arr = result.$indexOfCP as unknown[];
        assert.equal(arr.length, 2);
    });

    // ── RANGE with 3 args ─────────────────────────────────────────────────────

    it('RANGE with 3 args produces $range with step', () => {
        const result = compile('RANGE(0, 10, 2)') as Record<string, unknown>;
        assert.ok('$range' in result);
        const arr = result.$range as unknown[];
        assert.equal(arr.length, 3);
    });

    it('RANGE with 2 args produces $range without step', () => {
        const result = compile('RANGE(0, 10)') as Record<string, unknown>;
        assert.ok('$range' in result);
        const arr = result.$range as unknown[];
        assert.equal(arr.length, 2);
    });

    // ── COND throws on wrong args ─────────────────────────────────────────────

    it('COND throws with wrong arg count', () => {
        assert.throws(
            () => compile('COND(a, b)'),
            /COND requires 3 arguments/,
        );
    });

    // ── Unsupported function throws ───────────────────────────────────────────

    it('unsupported function name in dispatch throws Unsupported function', () => {
        // Bypass: the FUNC_REGEX won't match; use a direct call via expression DSL
        // We can call compileInnerExpression with a function not in FUNC_REGEX but
        // matching IS_FUNC_CALL_RE via a nested/generic path. The generic guard line:
        //   if (genericFuncCallRe.test(expr)) throw ...
        // matches function-like calls not in FUNC_REGEX.
        assert.throws(
            () => compile('UNKNOWN_FUNC(value)'),
            /Unsupported expression function/,
        );
    });

    // ── Null coalescing (??): covers IF_NULL production path ──────────────────

    it('null coalescing ?? produces $ifNull', () => {
        const result = compile('value ?? fallback') as Record<string, unknown>;
        assert.ok('$ifNull' in result);
    });

    // ── MERGE_OBJECTS with JSON literal ──────────────────────────────────────

    it('MERGE_OBJECTS with JSON object literal parses it', () => {
        const result = compile('MERGE_OBJECTS(doc, {"key": "val"})') as Record<string, unknown>;
        assert.ok('$mergeObjects' in result);
        const arr = result.$mergeObjects as unknown[];
        assert.equal(arr.length, 2);
        assert.deepEqual(arr[1], { key: 'val' });
    });

    // ── MERGE_OBJECTS with invalid JSON falls back to parseValue ─────────────

    it('MERGE_OBJECTS with non-parseable JSON falls back', () => {
        const result = compile('MERGE_OBJECTS(doc, extra)') as Record<string, unknown>;
        assert.ok('$mergeObjects' in result);
        const arr = result.$mergeObjects as unknown[];
        assert.equal(arr[1], '$extra');
    });
});
