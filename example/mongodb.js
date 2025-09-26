/**
 * monSQLize MongoDB 汇总示例（超详细注释版）
 *
 * 覆盖能力：
 * 1) 连接与默认配置（maxTimeMS/findLimit/namespace/slowQueryMs/cache/logger）
 * 2) 慢日志演示（调低 slowQueryMs；日志仅输出“查询形状”，不含敏感值）
 * 3) 基础查询：findOne / find / count（投影/排序/缓存 TTL/单次超时覆盖）
 * 4) 缓存直接操作：get/set/del/keys/stats（演示手动读写与统计）
 * 5) 命名空间与失效：getNamespace() / invalidate(op?)（精确失效）
 * 6) 跨库访问（Cross-DB）：db('<db>').collection('<coll>') + find/findOne
 * 7) 深度分页（聚合版，方案A：先分页后联表）：findPage（after/before + limit + sort + pipeline[$lookup]）
 * 8) 集合/视图管理：createCollection / createView / dropCollection
 *
 * 运行前准备：
 * - 已安装并可访问本地 MongoDB（默认：mongodb://localhost:27017）
 * - 建议在 `example` 数据库中预置数据：
 *     use example;
 *     db.user.insertOne({ _id: ObjectId('66f2a9aa7f0b5d5c2c0b1df0'), name: 'Alice' });
 *     db.orders.insertMany([
 *       { status:'paid', amount:199, userId:'66f2a9aa7f0b5d5c2c0b1df0', createdAt:new Date() },
 *       { status:'paid', amount:299, userId:'66f2a9aa7f0b5d5c2c0b1df0', createdAt:new Date(Date.now()-1000) },
 *       { status:'unpaid', amount: 99, userId:'66f2a9aa7f0b5d5c2c0b1df0', createdAt:new Date(Date.now()-2000) },
 *     ]);
 *   （跨库示例可选）
 *     use analytics;
 *     db.events.insertMany([
 *       { type:'click', ts:new Date(), userId:'66f2a9aa7f0b5d5c2c0b1df0' },
 *       { type:'view',  ts:new Date(Date.now()-1000), userId:'66f2a9aa7f0b5d5c2c0b1df0' },
 *     ]);
 *
 * 性能与索引建议：
 * - findPage 的排序字段请建立复合索引，如：{ createdAt: -1, _id: 1 }；
 * - $lookup 右表（user）的连接键（如 _id）应有索引；在 pipeline 中尽量 $project 仅必要字段。
 *
 * 重要术语：
 * - cache（毫秒）：>0 才启用缓存；0/未传则直连 DB。不缓存 undefined，允许缓存 null。
 * - findLimit：find 未传 limit 时使用（安全默认=10）；传 0 表示不限制（谨慎）。
 * - slowQueryMs：慢日志阈值（毫秒）；本示例为演示将其调低（生产环境请使用更合理阈值，例如 300~1000ms）。
 * - namespace.scope：'database' 按库隔离缓存；'connection' 按连接隔离（同连接不同库共享 iid 前缀）。
 */

const MonSQLize = require('../lib/index.js');

(async () => {
    // 1) 创建实例（将 slowQueryMs 调低以更易触发慢日志；生产请调回更高阈值）
    const msq = new MonSQLize({
        type: 'mongodb',                     // 当前适配器类型：mongodb（已实现）
        databaseName: 'example',             // 默认库名：example
        config: { uri: 'mongodb://localhost:27017' },

        // —— 全局默认（可被单次调用覆盖）——
        maxTimeMS: 3000,                     // 默认查询超时（ms）：驱动级超时保护
        findLimit: 10,                       // find 安全默认：未传 limit 时的页大小
        namespace: { scope: 'database' },    // 缓存命名空间策略：database|connection
        slowQueryMs: 100,                      // 慢日志阈值：演示用（生产请提高）

        // —— 缓存配置（可传实例或配置对象）——
        cache: { maxSize: 100000, enableStats: true },
        // 多层缓存示例（本地+远端，占位）：
        // cache: {
        //   multiLevel: true,
        //   local:  { maxSize: 100000, enableStats: true },
        //   remote: { /* 传 CacheLike 实例更佳，配置对象会退化为内存占位 */ maxSize: 5000 },
        //   policy: { writePolicy: 'local-first-async-remote', backfillLocalOnRemoteHit: true },
        //   publish: (msg) => { /* 可选：用于跨进程广播失效 */ },
        // },

        // —— 可选：自定义 logger，便于观察 warn 的结构化元信息（去敏形状）——
        logger: {
            info:  (...a) => console.log('[info ]', ...a),
            warn:  (...a) => console.warn('[warn ]', ...a),
            error: (...a) => console.error('[error]', ...a),
        },
    });

    // 连接：得到两个访问器
    const { db, collection } = await msq.connect();
    const coll = collection('orders'); // 绑定当前默认库 example 下的 orders 集合

    try {
        // 0) 慢日志演示（为何会触发？因 slowQueryMs=3ms，几乎所有查询都会超过）
        //    输出字段仅含查询形状（字段名、运算符名、limit 等），不会泄露敏感值。
        // await collection('orders').findOne({
        //     query: { status: 'paid' },        // 查询条件（Mongo 语法）
        //     projection: ['_id', 'status'],    // 投影（数组会被规范化为对象 { _id:1, status:1 }）
        //     cache: 0,                         // 不使用缓存（本次直连 DB）
        //     maxTimeMS: 1500,                  // 单次超时覆盖（高于 slowQueryMs 仅表示不会超时，但依旧会打印慢日志）
        // });
        //
        // // 1) 基础查询：findOne
        const { data, meta } = await coll.findOne({
            query: { status: 'paid' },
            projection: ['_id', 'status', 'createdAt'],
            sort: { createdAt: -1 },          // -1 降序，1 升序
            cache: 2000,                      // 启用 2s 缓存（TTL 毫秒）
            maxTimeMS: 1500,                  // 超时
            meta: true                        // 返回详细耗时信息
        });
        console.log('[findOne] =>', data, meta);

        // // 2) 基础查询：find（列表）
        // const list = await coll.find({
        //     query: { status: 'paid' },
        //     projection: { _id: 1, amount: 1, createdAt: 1 },
        //     sort: { createdAt: -1 },
        //     // limit 未传 → 使用全局 findLimit（=10）；传 0 → 不限制（可能很大，谨慎使用）
        //     cache: 2000,
        // });
        // console.log(`[find] => ${list.length} items`);
        //
        // 3) 计数：count（与 Mongo countDocuments 语义接近）
        // const total = await coll.count({ query: { status: 'paid' }, cache: 1000 });
        // console.log('[count] =>', total);
        //
        // 4) 缓存直接操作（手动 get/set/del/keys/stats）
        // const cache = msq.getCache();
        // await cache.set('demo:key', { hello: 'world' }, 3000); // 设置 3s TTL
        // console.log('cache.get(demo:key) =>', await cache.get('demo:key'));
        // console.log('cache.keys(*) =>', cache.keys('*').slice(0, 5), '...');
        // if (cache.getStats) console.log('cache.stats =>', cache.getStats()); // 命中率/内存/淘汰数等
        // await cache.del('demo:key');
        //
        // 5) 命名空间与失效（invalidate）
        //    - getNamespace() 可查看当前集合缓存键的命名空间前缀（iid/type/db/collection）
        //    - invalidate(op?) 可按操作粒度失效（不传 op 则该集合的读键全清理）
        // console.log('namespace =>', coll.getNamespace());
        // const deletedFind = await coll.invalidate('find'); // 仅清理 find 的缓存键
        // console.log('invalidate(find) => deleted =', deletedFind);
        //
        // // 6) 跨库访问（Cross-DB）：访问 example 以外的库
        // const click = await db('analytics').collection('events').findOne({
        //     query: { type: 'click' },
        //     cache: 2000,
        // });
        // console.log('[cross-db findOne] =>', click);
        //
        // // 6.1) 跨库列表（演示 findLimit 与排序）
        // const recentEvents = await db('analytics').collection('events').find({
        //     query: { type: { $in: ['click', 'view'] } },
        //     projection: { _id: 1, type: 1, ts: 1 },
        //     sort: { ts: -1 },
        //     limit: 10,
        //     cache: 3000,
        // });
        // console.log('[cross-db events] =>', recentEvents.length);
        //
        // 7) 深度分页（聚合，方案A：先分页后联表）
        //    说明：
        //    - after 表示“下一页”；before 表示“上一页”（查询阶段反转排序，返回前再恢复顺序）。
        //    - sort 必须是“稳定排序”（默认自动补 _id:1）。建议对排序键建立复合索引。
        //    - pipeline 在“页内”执行（仅对本页几十条做 $lookup 等），性能与可预测性更好。
        // const lookup = [{
        //     $lookup: {
        //         from: 'user',
        //         let: { userId: { $toObjectId: '$userId' } },
        //         pipeline: [ { $match: { $expr: { $eq: ['$_id','$$userId'] } } } ],
        //         as: 'userInfo',
        //     }
        // }];
        //
        // // 7.1) 首页：不携带游标
        // let page = await coll.findPage({
        //     query: { status: 'paid' },
        //     sort: { createdAt: -1, _id: 1 }, // 若未传 _id，内部会自动补 _id:1 兜底稳定性
        //     limit: 5,                        // 要求：1..MAX_LIMIT（默认 500）
        //     pipeline: lookup,                // 页内联表（建议 $project 裁剪字段）
        //     cache: 2000,                     // 可选缓存（注意：不同 after/before 会形成不同缓存键）
        //     // allowDiskUse: true,           // 管道较重时可打开；默认按驱动策略
        //     // maxTimeMS: 1500,
        // });
        // console.log('[findPage page1] =>', page.pageInfo);
        //
        // // 7.2) 下一页（after：拿上一页的 endCursor）
        // page = await coll.findPage({
        //     query: { status: 'paid' },
        //     sort: { createdAt: -1, _id: 1 },
        //     limit: 5,
        //     pipeline: lookup,
        //     after: page.pageInfo.endCursor,
        // });
        // console.log('[findPage page2] =>', page.pageInfo);
        //
        // // 7.3) 上一页（before：拿当前页的 startCursor）
        // page = await coll.findPage({
        //     query: { status: 'paid' },
        //     sort: { createdAt: -1, _id: 1 },
        //     limit: 5,
        //     pipeline: lookup,
        //     before: page.pageInfo.startCursor,
        // });
        // console.log('[findPage prev] =>', page.pageInfo);
        //
        // // 7.4) 按操作粒度失效 findPage 缓存（可选）
        // const delFindPage = await coll.invalidate('findPage');
        // console.log('invalidate(findPage) =>', delFindPage);
        //
        // // 8) 集合与视图管理（若集合/视图已存在会抛错，此处 try-catch 忽略）
        // try {
        //     await coll.createCollection();         // 不传 name 即使用当前集合名
        //     console.log('createCollection => ok');
        // } catch (e) { console.log('createCollection => skipped:', e.message); }
        //
        // try {
        //     const ok = await coll.createView('orders_view', 'orders', [
        //         { $match: { status: 'paid' } },
        //         { $project: { _id: 1, amount: 1, createdAt: 1 } },
        //     ]);
        //     console.log('createView(orders_view) =>', ok);
        // } catch (e) { console.log('createView => skipped:', e.message); }

        // 警告：dropCollection 会删除数据，请谨慎使用
        // const dropped = await coll.dropCollection();
        // console.log('dropCollection =>', dropped);

        // 9.1) 演示跳页功能 - 模拟跳转到特定页面
        // console.log('\n--- 跳页演示 ---');
        //
        // // 获取总数（用于计算总页数）
        // const totalCount = await coll.count({
        //     query: { status: 'paid' },
        //     cache: 2000
        // });
        // const pageSize = 2;
        // const totalPages = Math.ceil(totalCount / pageSize);
        //
        // console.log(`总记录数: ${totalCount}, 每页: ${pageSize}, 总页数: ${totalPages}`);
        //
        // // 跳转到最后一页的逻辑（实际应用中可能需要更复杂的游标计算）
        // if (totalPages > 2) {
        //     console.log('\n--- 尝试获取最后一页 ---');
        //     // 注意：真实的跳页可能需要维护页码与游标的映射关系
        //     // 这里只是演示概念，实际应用中建议：
        //     // 1. 缓存关键页面的游标
        //     // 2. 或使用传统的 skip/limit 方式作为跳页的补充
        //
        //     const lastPageQuery = await coll.find({
        //         query: { status: 'paid' },
        //         sort: { createdAt: -1, _id: 1 },
        //         limit: pageSize,
        //         skip: (totalPages - 1) * pageSize, // 使用 skip 跳到最后一页
        //         cache: 1000,
        //     });
        //
        //     console.log(`最后一页找到 ${lastPageQuery.length} 条记录`);
        //     lastPageQuery.forEach((item, index) => {
        //         console.log(`  ${index + 1}. 订单金额: ${item.amount}, 创建时间: ${item.createdAt}`);
        //     });
        // }
    }
    catch (e) {
        // 统一错误处理：
        // - 参数非法：code='VALIDATION_ERROR'，details 含 path/type/message
        // - 游标无效：code='INVALID_CURSOR'
        console.error('[example/mongodb] error:', e && e.stack || e);
    }
    finally {
        await msq.close(); // 释放连接
    }
})();
