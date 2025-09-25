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

function testSlowQueryLogMarkers() {
  const Mongo = require('../lib/mongodb');
  const logs = { warn: [], info: [], error: [] };
  const logger = {
    warn: (...args) => logs.warn.push(args),
    info: (...args) => logs.info.push(args),
    error: (...args) => logs.error.push(args),
  };
  const defaults = {
    slowQueryMs: 5,
    namespace: { scope: 'database', instanceId: undefined },
    log: { slowQueryTag: { event: 'slow_query', code: 'SLOW_QUERY' } },
  };
  const m = new Mongo('mongo', 'testdb', /*cache*/null, logger, defaults);
  const ns = { db: 'testdb', coll: 'users' };
  return m._withSlowQueryLog('find', ns, { query: { a: 1 }, projection: ['a'], sort: { a: 1 } }, async () => {
    await new Promise(r => setTimeout(r, 10));
    return 42;
  }).then((ret) => {
    assert.strictEqual(ret, 42);
    assert.ok(logs.warn.length >= 1, 'should emit warn log for slow query');
    const [msg, meta] = logs.warn[0];
    assert.strictEqual(typeof msg, 'string');
    assert.ok(msg.includes('Slow query'));
    // 核心标识字段
    assert.strictEqual(meta.event, 'slow_query');
    assert.strictEqual(meta.code, 'SLOW_QUERY');
    assert.strictEqual(meta.category, 'performance');
    assert.strictEqual(meta.type, 'mongo');
    assert.strictEqual(meta.db, 'testdb');
    assert.strictEqual(meta.coll, 'users');
    assert.strictEqual(meta.op, 'find');
    assert.ok(typeof meta.ms === 'number' && meta.ms >= 0);
    assert.strictEqual(meta.threshold, 5);
    assert.ok(typeof meta.ts === 'string' && meta.ts.includes('T'));
    // 形状字段（去敏）
    assert.ok(meta.queryShape && typeof meta.queryShape === 'object');
    assert.ok(Array.isArray(meta.projectionShape));
    assert.ok(meta.sortShape && typeof meta.sortShape === 'object');
  });
}

function testFindPageStub() {
  const Mongo = require('../lib/mongodb');
  const logs = { warn: [], info: [], error: [] };
  const logger = { warn: (...a)=>logs.warn.push(a), info: (...a)=>logs.info.push(a), error: (...a)=>logs.error.push(a) };
  const defaults = { slowQueryMs: 1000, namespace: { scope: 'database' } };
  const m = new Mongo('mongodb', 'testdb', /*cache*/null, logger, defaults);
  // stub client/collection/aggregate
  const fakeCollection = {
    findOne: async ()=>null,
    find: ()=>({ toArray: async ()=>[] }),
    countDocuments: async ()=>0,
    aggregate: ()=>({ toArray: async ()=>[{ _id: 1, createdAt: new Date().toISOString() }] }),
    collectionName: 'users'
  };
  m.client = { db: ()=>({ collection: ()=> fakeCollection }) };
  const acc = m.collection('testdb', 'users');
  if (typeof acc.findPage !== 'function') throw new Error('findPage not found');
  return acc.findPage({ query:{}, sort:{ _id:1 }, limit:1 }).then(res => {
    if (!res || !res.pageInfo) throw new Error('bad page result');
    if (typeof res.pageInfo.hasNext !== 'boolean') throw new Error('bad pageInfo.hasNext');
  }).then(async ()=>{
    // invalid params: after+before
    let err;
    try { await acc.findPage({ limit:1, after:'a', before:'b' }); } catch (e) { err = e; }
    if (!err || err.code !== 'VALIDATION_ERROR') throw new Error('expected VALIDATION_ERROR for after/before');
    err = null;
    try { await acc.findPage({ limit:0 }); } catch (e) { err = e; }
    if (!err || err.code !== 'VALIDATION_ERROR') throw new Error('expected VALIDATION_ERROR for limit');
  });
}

// New: assert slow-query event emission via runner
function testSlowQueryEvent() {
  const Mongo = require('../lib/mongodb');
  const logs = { warn: [], info: [], error: [] };
  const logger = { warn: (...a)=>logs.warn.push(a), info: (...a)=>logs.info.push(a), error: (...a)=>logs.error.push(a) };
  const defaults = { slowQueryMs: 5, namespace: { scope: 'database' }, log: { slowQueryTag: { event: 'slow_query', code: 'SLOW_QUERY' } } };
  const m = new Mongo('mongodb', 'testdb', /*cache*/null, logger, defaults);
  let got = null;
  m.on('slow-query', (meta)=> { got = meta; });
  // stub client so that find().toArray() waits >5ms
  const fakeCollection = {
    find: (q, opts)=>({ toArray: async ()=> { await new Promise(r=>setTimeout(r, 10)); return []; } }),
    countDocuments: async ()=>0,
    findOne: async ()=>null,
    aggregate: ()=>({ toArray: async ()=>[] }),
    collectionName: 'users'
  };
  m.client = { db: ()=>({ collection: ()=> fakeCollection }) };
  const acc = m.collection('testdb','users');
  return acc.find({ query:{}, cache:0 }).then(()=>{
    if (!got) throw new Error('slow-query event not emitted');
    if (got.op !== 'find') throw new Error('slow-query meta.op mismatch');
  });
}

// New: assert hint passthrough on find
function testHintPassthrough() {
  const Mongo = require('../lib/mongodb');
  const logger = { warn: ()=>{}, info: ()=>{}, error: ()=>{} };
  const defaults = { slowQueryMs: 1000, namespace: { scope: 'database' } };
  const m = new Mongo('mongodb', 'testdb', /*cache*/null, logger, defaults);
  let captured = null;
  const fakeCollection = {
    find: (q, opts)=>{ captured = opts; return { toArray: async ()=>[] }; },
    findOne: async ()=>null,
    countDocuments: async ()=>0,
    aggregate: ()=>({ toArray: async ()=>[] }),
    collectionName: 'users'
  };
  m.client = { db: ()=>({ collection: ()=> fakeCollection }) };
  const acc = m.collection('testdb','users');
  return acc.find({ query:{}, hint: { _id:1 } }).then(()=>{
    if (!captured || !captured.hint) throw new Error('hint not passed to driver options');
  });
}

function run() {
  const tests = [
    ['stableStringify primitives', testStableStringifyPrimitives],
    ['stableStringify BSON', testStableStringifyBSON],
    ['namespace patterns', testNamespacePatterns],
    ['slow query log markers', testSlowQueryLogMarkers],
    ['findPage stub behavior', testFindPageStub],
    ['slow-query event emission', testSlowQueryEvent],
    ['hint passthrough (find)', testHintPassthrough],
  ];
  let passed = 0;
  const runOne = (name, fn) => {
    try {
      const r = fn();
      if (r && typeof r.then === 'function') {
        return r.then(() => { console.log(`✓ ${name}`); passed++; })
                .catch((e) => { console.error(`✗ ${name}:`, e && e.stack || e); process.exitCode = 1; });
      } else {
        console.log(`✓ ${name}`);
        passed++;
        return Promise.resolve();
      }
    } catch (e) {
      console.error(`✗ ${name}:`, e && e.stack || e);
      process.exitCode = 1;
      return Promise.resolve();
    }
  };
  // 顺序执行，便于异步测试
  tests.reduce((p, [name, fn]) => p.then(() => runOne(name, fn)), Promise.resolve())
    .then(() => {
      console.log(`\n${passed}/${tests.length} tests passed`);
    });
}

run();
