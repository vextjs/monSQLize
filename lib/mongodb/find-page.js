// find-page.js
// 统一的 findPage 实现：支持 after/before 游标、page 跳页（书签+少量 hops）、
// 可选 offset 兜底与 totals（none|async|sync|approx 占位）。

const crypto = require('crypto');
const { ensureStableSort, reverseSort, pickAnchor } = require('./common/sort');
const { buildPagePipelineA } = require('./common/agg-pipeline');
const { decodeCursor } = require('../common/cursor');
const { validateLimitAfterBefore, assertCursorSortCompatible } = require('../common/validation');
const { makePageResult } = require('../common/page-result');
const { normalizeSort } = require('../common/normalize');

// —— 工具：稳定序列化与哈希 ——
function deepStableStringify(x) {
    if (x === null || x === undefined) return 'null';
    if (Array.isArray(x)) {
        return `[${x.map(deepStableStringify).join(',')}]`;
    }
    if (typeof x === 'object') {
        const keys = Object.keys(x).sort();
        const entries = keys.map(k => `${JSON.stringify(k)}:${deepStableStringify(x[k])}`);
        return `{${entries.join(',')}}`;
    }
    // primitives
    return JSON.stringify(x);
}
const stableStringify = (o) => deepStableStringify(o);
const hash = (x) => crypto.createHash('sha256').update(String(x)).digest('hex');

// —— 去敏形状 ——
function shapeOfQuery(q) {
    // 操作符/层级感知的去敏形状（不含具体值）
    function walk(o, path = [], acc = []) {
        if (!o || typeof o !== 'object') return acc;
        const keys = Object.keys(o).sort();
        for (const k of keys) {
            const isOp = k.startsWith('$');
            const key = isOp ? `$${k.slice(1)}` : k;
            acc.push([...path, key].join('.'));
            const v = o[k];
            if (v && typeof v === 'object') walk(v, [...path, key], acc);
        }
        return acc;
    }
    return hash(JSON.stringify(walk(q)));
}
function shapeOfPipeline(p) {
    // 记录阶段算子序列 + 顶层字段名集合（仍去敏）
    const seq = (p || []).map(stage => {
        const op = Object.keys(stage)[0];
        const body = stage[op];
        const keys = body && typeof body === 'object' ? Object.keys(body).sort() : [];
        return { op, keys };
    });
    return hash(JSON.stringify(seq));
}
function buildKeyDimsAuto({ db, coll, sort, limit, query, pipeline }) {
    return { db, coll, sort, limit, queryShape: shapeOfQuery(query), pipelineShape: shapeOfPipeline(pipeline) };
}

// —— 键构造 ——
function bookmarkKey(ns, keyDims) {
    const payload = { db: keyDims.db, coll: keyDims.coll, sort: keyDims.sort, limit: keyDims.limit, q: keyDims.queryShape, p: keyDims.pipelineShape };
    return `${ns}:bm:${hash(stableStringify(payload))}`;
}
function totalsKey(ns, keyDims) {
    const payload = { db: keyDims.db, coll: keyDims.coll, sort: keyDims.sort, limit: keyDims.limit, q: keyDims.queryShape, p: keyDims.pipelineShape };
    return `${ns}:tot:${hash(stableStringify(payload))}`;
}

// —— totals inflight 去重（5s 窗口） ——
const __totalsInflight = new Map(); // key -> { p: Promise, t0: number }
function withTotalsInflight(key, fn) {
    const now = Date.now();
    const hit = __totalsInflight.get(key);
    if (hit && now - hit.t0 < 5000) return hit.p;
    const p = (async () => {
        try { return await fn(); }
        finally { __totalsInflight.delete(key); }
    })();
    __totalsInflight.set(key, { p, t0: now });
    return p;
}

async function bmGet(cache, ns, keyDims, page) {
    const key = `${bookmarkKey(ns, keyDims)}:${page}`;
    return cache?.get ? (await cache.get(key)) || null : null;
}
async function bmSet(cache, ns, keyDims, page, cursor, ttlMs) {
    const key = `${bookmarkKey(ns, keyDims)}:${page}`;
    if (cache?.set) await cache.set(key, cursor, ttlMs);
}

// totals 计算 + 缓存：失败也写入 total:null（语义统一），并附加 error 字段
async function computeAndCacheTotal({ collection, cache, ns, keyDims, query, limit, hint, collation, maxTimeMS, ttlMs, logger }) {
    const key = totalsKey(ns, keyDims);
    try {
        const total = await collection.countDocuments(query || {}, { maxTimeMS, ...(hint ? { hint } : {}), ...(collation ? { collation } : {}) });
        const totalPages = Math.ceil(total / Math.max(1, limit || 1));
        const payload = { total, totalPages, ts: Date.now() };
        if (cache?.set) await cache.set(key, payload, ttlMs);
        return payload;
    } catch (e) {
        // 失败：保持 async 语义一致，写入 total:null，并记录一次 warn（去敏）
        try { logger && logger.warn && logger.warn('totals.count.failed', { ns, reason: String(e && (e.message || e)) }); } catch(_) {}
        const payload = { total: null, totalPages: null, ts: Date.now(), error: 'count_failed' };
        if (cache?.set) await cache.set(key, payload, ttlMs);
        return payload;
    }
}

function makeJumpTooFarError({ remaining, maxHops }) {
    const err = new Error('跳页跨度过大，maxHops 限制触发');
    err.code = 'JUMP_TOO_FAR';
    err.details = [{ path: ['page'], message: `remaining=${remaining}, maxHops=${maxHops}` }];
    return err;
}

function createFindPage(ctx) {
    const { collection, getCache, getNamespace, defaults, logger, run } = ctx;

    async function doFindPageOne({ options, stableSort, direction, parsedCursor }) {
        const sortForQuery = direction === 'before' ? reverseSort(stableSort) : stableSort;
        const pipeline = buildPagePipelineA({
            query: options.query || {},
            sort: sortForQuery,
            limit: options.limit,
            cursor: parsedCursor,
            direction,
            lookupPipeline: options.pipeline || []
        });
        const driverOpts = {
            maxTimeMS: options.maxTimeMS ?? defaults.maxTimeMS,
            allowDiskUse: options.allowDiskUse,
            ...(options.hint ? { hint: options.hint } : {}),
            ...(options.collation ? { collation: options.collation } : {}),
        };
        const rows = await (run ? run('findPage', options, () => collection.aggregate(pipeline, driverOpts).toArray()) : collection.aggregate(pipeline, driverOpts).toArray());
        return makePageResult(rows, {
            limit: options.limit,
            stableSort,
            direction,
            hasCursor: !!parsedCursor,
            pickAnchor,
        });
    }

    return async function findPage(options = {}) {
        const MAX_LIMIT = defaults?.findPageMaxLimit ?? 500;
        // 基础校验：limit + after/before 互斥
        validateLimitAfterBefore(options, { maxLimit: MAX_LIMIT });

        // 解析上下文
        const cache = getCache && getCache();
        const nsObj = getNamespace && getNamespace();
        const ns = nsObj?.ns || `${defaults?.iid || ''}:${defaults?.type || ''}:${ctx.databaseName || ''}:${ctx.collectionName || ''}`;

        const {
            query = {},
            pipeline: lookupPipeline = [],
            sort,
            limit,
            after,
            before,
            page,
        } = options;

        // 互斥校验：page 与 after/before 不能同时出现
        if ((after || before) && Number.isInteger(page)) {
            const err = new Error('参数校验失败');
            err.code = 'VALIDATION_ERROR';
            err.details = [{ path: ['page'], type: 'any.conflict', message: 'page 与 after/before 互斥' }];
            throw err;
        }

        const stableSort = ensureStableSort(normalizeSort(sort) || { _id: 1 });

        // 1) after/before：现有路径
        if (after || before) {
            const parsedCursor = decodeCursor(after || before);
            assertCursorSortCompatible(stableSort, parsedCursor && parsedCursor.s);
            return doFindPageOne({ options, stableSort, direction: after ? 'after' : 'before', parsedCursor });
        }

        // 2) 无 page：首页
        if (!Number.isInteger(page) || page < 1) {
            return doFindPageOne({ options, stableSort, direction: null, parsedCursor: null });
        }

        // —— 跳页模式 ——
        const step = Number.isInteger(options.jump?.step) ? options.jump.step : (defaults?.bookmarks?.step ?? 10);
        const maxHops = Number.isInteger(options.jump?.maxHops) ? options.jump.maxHops : (defaults?.bookmarks?.maxHops ?? 20);
        const ttlMs = defaults?.bookmarks?.ttlMs ?? 6 * 3600_000;
        const maxBookmarkPages = defaults?.bookmarks?.maxPages ?? 10000;

        // 自动 keyDims
        const keyDims = options.jump?.keyDims || buildKeyDimsAuto({
            db: ctx.databaseName,
            coll: ctx.collectionName,
            sort: stableSort,
            limit,
            query,
            pipeline: lookupPipeline,
        });

        // 2.1 可选：offset 兜底
        if (options.offsetJump?.enable) {
            const skip = (page - 1) * limit;
            const maxSkip = options.offsetJump.maxSkip ?? 50_000;
            if (skip <= maxSkip) {
                const p = [];
                if (query && Object.keys(query).length) p.push({ $match: query });
                p.push({ $sort: stableSort }, { $skip: skip }, { $limit: limit + 1 });
                if (lookupPipeline?.length) p.push(...lookupPipeline);
                const driverOpts = {
                    maxTimeMS: options.maxTimeMS ?? defaults.maxTimeMS,
                    allowDiskUse: options.allowDiskUse,
                    ...(options.hint ? { hint: options.hint } : {}),
                    ...(options.collation ? { collation: options.collation } : {}),
                };
                const rows = await (run ? run('findPage', options, () => collection.aggregate(p, driverOpts).toArray()) : collection.aggregate(p, driverOpts).toArray());
                const res = makePageResult(rows, { limit, stableSort, direction: null, hasCursor: false, pickAnchor });
                if (res.pageInfo?.endCursor && page <= maxBookmarkPages) await bmSet(cache, ns, keyDims, page, res.pageInfo.endCursor, ttlMs);
                if (res.pageInfo) res.pageInfo.currentPage = page;
                // totals（可选）
                if (options.totals && options.totals.mode && options.totals.mode !== 'none') {
                    const out = await attachTotals({ collection, cache, ns, keyDims, limit, query, totals: options.totals });
                    res.totals = out;
                }
                return res;
            }
        }

        // 2.2 书签跳转
        const pageIndex = page - 1;
        const anchorPage = Math.floor(pageIndex / step) * step; // 0, step, 2*step, ...
        const remaining = pageIndex - anchorPage; // 0..(step-1)

        let current = null;
        if (anchorPage > 0) {
            const anchorCursor = await bmGet(cache, ns, keyDims, anchorPage);
            if (anchorCursor) current = { pageInfo: { endCursor: anchorCursor } };
        }

        // 累计 hops 计数：限制“整次跳页”的连续 after 次数总和不超过 maxHops
        let hops = 0;

        if (!current) {
            current = await doFindPageOne({ options, stableSort, direction: null, parsedCursor: null });
            if (current.pageInfo?.endCursor && 1 <= maxBookmarkPages) await bmSet(cache, ns, keyDims, 1, current.pageInfo.endCursor, ttlMs);
            for (let i = 1; i < anchorPage; i++) {
                hops += 1; if (hops > maxHops) throw makeJumpTooFarError({ remaining: anchorPage - 1, maxHops });
                current = await doFindPageOne({
                    options: { ...options, after: current.pageInfo.endCursor },
                    stableSort,
                    direction: 'after',
                    parsedCursor: decodeCursor(current.pageInfo.endCursor)
                });
                const pNo = i + 1;
                if (pNo % step === 0 && pNo <= maxBookmarkPages && current.pageInfo?.endCursor) await bmSet(cache, ns, keyDims, pNo, current.pageInfo.endCursor, ttlMs);
            }
        }

        for (let i = 0; i < remaining; i++) {
            hops += 1; if (hops > maxHops) throw makeJumpTooFarError({ remaining, maxHops });
            current = await doFindPageOne({
                options: { ...options, after: current.pageInfo.endCursor },
                stableSort,
                direction: 'after',
                parsedCursor: decodeCursor(current.pageInfo.endCursor)
            });
            const pNo = anchorPage + 1 + i;
            if (pNo % step === 0 && pNo <= maxBookmarkPages && current.pageInfo?.endCursor) await bmSet(cache, ns, keyDims, pNo, current.pageInfo.endCursor, ttlMs);
        }

        if (current?.pageInfo) current.pageInfo.currentPage = page;

        // totals（可选）
        if (options.totals && options.totals.mode && options.totals.mode !== 'none') {
            const out = await attachTotals({ collection, cache, ns, keyDims, limit, query, totals: options.totals });
            current.totals = out;
        }

        return current;
    };

    // totals 附加逻辑：支持 sync/async/approx；async 返回短 token（keyHash），避免暴露命名空间
    async function attachTotals({ collection, cache, ns, keyDims, limit, query, totals }) {
        const mode = totals.mode || 'none';
        const ttlMs = totals.ttlMs ?? 10 * 60_000;
        const key = totalsKey(ns, keyDims);
        const keyHash = key.split(':').pop(); // 仅最后一段哈希作为对外 token

        if (mode === 'sync') {
            return computeAndCacheTotal({ collection, cache, ns, keyDims, query, limit, hint: totals.hint, collation: totals.collation, maxTimeMS: totals.maxTimeMS ?? 2000, ttlMs, logger });
        } else if (mode === 'async') {
            const cached = cache?.get ? await cache.get(key) : null;
            if (cached) return { mode: 'async', ...cached, token: keyHash };
            // 触发异步计算（去重 + 微任务队列）
            const doAsync = () => withTotalsInflight(key, () => computeAndCacheTotal({ collection, cache, ns, keyDims, query, limit, hint: totals.hint, collation: totals.collation, maxTimeMS: totals.maxTimeMS ?? 2000, ttlMs, logger })).catch(() => {});
            if (typeof queueMicrotask === 'function') queueMicrotask(doAsync); else setTimeout(doAsync, 0);
            return { mode: 'async', total: null, totalPages: null, token: keyHash };
        } else if (mode === 'approx') {
            // 近似：占位实现，优先返回缓存
            const cached = cache?.get ? await cache.get(key) : null;
            if (cached) return { mode: 'approx', ...cached };
            return { mode: 'approx', total: undefined, totalPages: undefined };
        }
        return undefined;
    }
}

module.exports = { createFindPage };
