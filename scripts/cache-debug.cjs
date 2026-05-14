'use strict';
const MonSQLize = require('../lib/index');
const Ctor = MonSQLize.default || MonSQLize;
async function test() {
  const m = new Ctor({
    type: 'mongodb',
    databaseName: 'test_cache_debug',
    config: { useMemoryServer: true },
    cache: { maxSize: 10000, autoInvalidate: true }
  });
  const conn = await m.connect();
  const coll = conn.collection;
  await coll('users').insertOne({ userId: 'u1', name: 'Alice' });
  await coll('users').find({ userId: 'u1' }, { cache: 5000 });
  const s1 = m.cache.getStats();
  console.log('size after find:', s1.size);
  const op = { $set: { name: 'Bob' } };
  await coll('users').updateOne({ userId: 'u1' }, op);
  const s2 = m.cache.getStats();
  console.log('size after update:', s2.size);
  await m.close();
}
test().catch(console.error);
