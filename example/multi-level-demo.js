const MonSQLize = require('..');

(async () => {
  // 注意：本示例未实际连接 MongoDB，仅演示 cache 接口与多层行为
  // 若需实际运行，请提供有效的 MongoDB URI，并启用集合查询。
  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'example',
    config: { uri: 'mongodb://localhost:27017' },
    cache: {
      multiLevel: true,
      local: { maxSize: 1000, enableStats: true },
      // 未注入真实远端时，将退化为内存实现（演示用）
      remote: { maxSize: 1000 },
      policy: { writePolicy: 'local-first-async-remote' }
    },
    maxTimeMS: 1000,
  });

  // 本示例无需连接数据库即可使用缓存实例
  const cache = msq.getCache();

  const k = 'demo:key';

  // 初始清理
  await cache.del(k);

  // 1) set -> 本地与“远端”写入
  await cache.set(k, { v: 1 }, 500);

  // 2) 本地命中
  const v1 = await cache.get(k);
  console.log('local hit:', v1);

  // 3) 删除本地，保留“远端”，模拟本地 miss 远端 hit -> 回填
  await cache.local?.del?.(k); // 仅用于演示：直接访问 MultiLevelCache.local
  const v2 = await cache.get(k);
  console.log('remote hit -> backfill local:', v2);

  console.log('keys:', cache.keys());
  console.log('stats:', cache.getStats && cache.getStats());
})();
