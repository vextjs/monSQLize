/* Minimal tests for monSQLize without requiring a DB connection.
   Focus: stableStringify (incl. BSON), namespace patterns, and API presence. */

const assert = require('assert');
const CacheFactory = require('../lib/cache');

function testStableStringifyPrimitives() {
  const a = { b: 1, a: 2 };
  const b = { a: 2, b: 1 };
  const sa = CacheFactory.stableStringify(a);
  const sb = CacheFactory.stableStringify(b);
  assert.strictEqual(sa, sb, 'stableStringify should sort object keys');
  assert.ok(/"2020-01-01T00:00:00.000Z"/.test(CacheFactory.stableStringify(new Date('2020-01-01'))));
  assert.ok(/"\/[a-z]+\/i"/.test(CacheFactory.stableStringify(/test/i)), 'RegExp should stringify to /pattern/flags');
}

function testStableStringifyBSON() {
  let BSON;
  try { BSON = require('bson'); } catch (_) { BSON = null; }
  if (!BSON) {
    console.log('bson module not available, skipping BSON tests');
    return;
  }
  const { ObjectId, Decimal128, Long, Binary } = BSON;
  const id = new ObjectId('64b7b1f7b3a3b8e6e3b1a1f7');
  const d = Decimal128.fromString('123.45');
  const l = Long.fromString('9007199254740993');
  const bin = new Binary(Buffer.from('deadbeef', 'hex'), 0);
  const si = CacheFactory.stableStringify({ id });
  const sd = CacheFactory.stableStringify({ d });
  const sl = CacheFactory.stableStringify({ l });
  const sb = CacheFactory.stableStringify({ bin });
  assert.ok(si.includes('ObjectId(64b7b1f7b3a3b8e6e3b1a1f7)'));
  assert.ok(sd.includes('Decimal128(123.45)'));
  assert.ok(sl.includes('Long(9007199254740993)'));
  assert.ok(sb.includes('Binary(0,deadbeef)'));
}

function testNamespacePatterns() {
  const ctx = { iid: 'mdb:abc', type: 'mongodb', db: 'example', collection: 'users' };
  const keyObj = CacheFactory.buildCacheKey({ ...ctx, op: 'find', base: { query: { a: 1 } } });
  const keyStr = CacheFactory.stableStringify(keyObj);
  const nsPattern = CacheFactory.buildNamespacePattern(ctx);
  const nsOpPattern = CacheFactory.buildNamespaceOpPattern(ctx, 'find');
  const nsRegex = new RegExp('^' + nsPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$');
  const nsOpRegex = new RegExp('^' + nsOpPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$');
  assert.ok(nsRegex.test(keyStr), 'namespace pattern should match key');
  assert.ok(nsOpRegex.test(keyStr), 'namespace+op pattern should match key');
}

function run() {
  const tests = [
    ['stableStringify primitives', testStableStringifyPrimitives],
    ['stableStringify BSON', testStableStringifyBSON],
    ['namespace patterns', testNamespacePatterns],
  ];
  let passed = 0;
  for (const [name, fn] of tests) {
    try {
      fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (e) {
      console.error(`✗ ${name}:`, e && e.stack || e);
      process.exitCode = 1;
    }
  }
  console.log(`\n${passed}/${tests.length} tests passed`);
}

run();
