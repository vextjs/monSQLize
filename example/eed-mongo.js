// example/seed-mongo.js
// 用途：为 monSQLize 示例灌入测试数据（example 库的 user/orders，analytics 库的 events）
// 运行：
//   $env:MONGO_URI="mongodb://localhost:27017"; node example\seed-mongo.js --orders 120 --events 60 --reset
// 参数：
//   --orders N  生成 N 条 orders（默认 50）
//   --events N  生成 N 条 analytics.events（默认 30）
//   --reset     写入前清空相关集合（默认不清空）
// 环境变量：
//   MONGO_URI        连接串（默认 mongodb://localhost:27017）
//   EXAMPLE_DB       example 数据库名（默认 example）
//   ANALYTICS_DB     analytics 数据库名（默认 analytics）

const { MongoClient, ObjectId } = require('mongodb');

// ---- 配置与参数解析 ----
const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
const EXAMPLE_DB = process.env.EXAMPLE_DB || 'example';
const ANALYTICS_DB = process.env.ANALYTICS_DB || 'analytics';

const argv = process.argv.slice(2);
function getFlag(name) { return argv.includes(name); }
function getArg(name, def) {
    const i = argv.findIndex(a => a === name);
    if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
    return def;
}
const COUNT_ORDERS = parseInt(getArg('--orders', '50'), 10) || 50;
const COUNT_EVENTS = parseInt(getArg('--events', '30'), 10) || 30;
const DO_RESET = getFlag('--reset');

// 示例中使用到的固定用户 id（与 example\mongodb.js 保持一致）
const USER_ID_STR = '66f2a9aa7f0b5d5c2c0b1df0';
const USER_ID = new ObjectId(USER_ID_STR);

// ---- 工具 ----
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }

async function main() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const ex = client.db(EXAMPLE_DB);
        const an = client.db(ANALYTICS_DB);

        const users = ex.collection('user');
        const orders = ex.collection('orders');
        const events = an.collection('events');

        // 1) 可选清库
        if (DO_RESET) {
            console.log(`[reset] dropping ${EXAMPLE_DB}.orders / ${EXAMPLE_DB}.user / ${ANALYTICS_DB}.events ...`);
            try { await orders.drop(); } catch (_) {}
            try { await users.drop(); } catch (_) {}
            try { await events.drop(); } catch (_) {}
        }

        // 2) 基础索引（分页 & 时间排序建议）
        await Promise.all([
            orders.createIndex({ createdAt: -1, _id: 1 }),
            events.createIndex({ ts: -1, _id: 1 }),
        ]);

        // 3) 写入 user（upsert）
        await users.updateOne(
            { _id: USER_ID },
            { $set: { _id: USER_ID, name: 'Alice' } },
            { upsert: true }
        );

        // 4) 生成 orders
        //   字段：status(paid/unpaid), amount(99~999), userId(字符串), createdAt(近 90 天随机)
        const now = Date.now();
        const ordersDocs = Array.from({ length: COUNT_ORDERS }, (_, i) => {
            const daysAgo = randInt(0, 90);
            const msAgo = randInt(0, 24 * 3600 * 1000);
            return {
                status: pick(['paid', 'unpaid', 'paid', 'paid']), // 偏多 paid，便于示例筛选
                amount: randInt(49, 999),
                userId: USER_ID_STR,  // 示例中 $lookup 用字符串再 $toObjectId 转换
                createdAt: new Date(now - daysAgo * 24 * 3600 * 1000 - msAgo),
            };
        });

        if (ordersDocs.length) {
            const res = await orders.insertMany(ordersDocs, { ordered: false });
            console.log(`[seed] inserted orders: ${res.insertedCount}`);
        }

        // 5) 生成 analytics.events
        const eventsDocs = Array.from({ length: COUNT_EVENTS }, (_, i) => {
            const minsAgo = randInt(0, 60 * 24 * 30); // 30 天内随机分钟
            return {
                type: pick(['click', 'view', 'click', 'click']),
                ts: new Date(Date.now() - minsAgo * 60 * 1000),
                userId: USER_ID_STR,
            };
        });

        if (eventsDocs.length) {
            const res = await events.insertMany(eventsDocs, { ordered: false });
            console.log(`[seed] inserted events: ${res.insertedCount}`);
        }

        // 6) 打印样例与统计
        const oneOrder = await orders.find({}).sort({ createdAt: -1 }).limit(1).toArray();
        const oneEvent = await events.find({}).sort({ ts: -1 }).limit(1).toArray();
        const countPaid = await orders.countDocuments({ status: 'paid' });

        console.log(`[done] example.user _id=${USER_ID_STR}`);
        console.log(`[done] orders total=${await orders.estimatedDocumentCount()} paid=${countPaid}`);
        console.log(`[done] events total=${await events.estimatedDocumentCount()}`);
        console.log(`[peek] latest order:`, oneOrder[0]);
        console.log(`[peek] latest event:`, oneEvent[0]);
    } finally {
        await client.close();
    }
}

main().catch(err => {
    console.error('[seed] failed:', err && err.stack || err);
    process.exit(1);
});
