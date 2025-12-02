// find-page.js
// 统一的 findPage 实现：支持 after/before 游标、page 跳页（书签+少量 hops）、
// 可选 offset 兜底与 totals（none|async|sync|approx 占位）。

const crypto = require('crypto');
const { ErrorCodes, createError } = require('../../errors');
const { CACHE, PAGINATION } = require('../../constants');
const { ensureStableSort, reverseSort, pickAnchor } = require('../common/sort');
const { buildPagePipelineA } = require('../common/agg-pipeline');
const { decodeCursor } = require('../../common/cursor');
const { validateLimitAfterBefore, assertCursorSortCompatible } = require('../../common/validation');
const { makePageResult } = require('../../common/page-result');
const { normalizeSort } = require('../../common/normalize');

// —— Count 队列支持（高并发控制）——
let countQueue = null;

function getCountQueue(ctx) {
    if (!countQueue && ctx.countQueue?.enabled) {
        const CountQueue = require('../../count-queue');
        countQueue = new CountQueue(ctx.countQueue);
    }
    return countQueue;
}

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

// —— totals inflight 去重（窗口时间见 CACHE.TOTALS_INFLIGHT_WINDOW_MS） ——
const __totalsInflight = new Map(); // key -> { p: Promise, t0: number }
function withTotalsInflight(key, fn) {
    const now = Date.now();
    const hit = __totalsInflight.get(key);
    if (hit && now - hit.t0 < CACHE.TOTALS_INFLIGHT_WINDOW_MS) return hit.p;
    const p = (async () => {
        try { return await fn(); }
        finally { __totalsInflight.delete(key); }
    })();
    __totalsInflight.set(key, { p, t0: now });
    return p;
}

async function bmGet(cache, ns, keyDims, page) {
    const key = `${bookmarkKey(ns, keyDims)}:${page}`;
    const cursor = cache?.get ? (await cache.get(key)) : null;
    // 验证游标是否有效
    if (cursor && typeof cursor === 'string' && cursor.length > 0) {
        return cursor;
    }
    return null;
}
async function bmSet(cache, ns, keyDims, page, cursor, ttlMs) {
    const key = `${bookmarkKey(ns, keyDims)}:${page}`;
    if (cache?.set) await cache.set(key, cursor, ttlMs);
}

// totals 计算 + 缓存：失败也写入 total:null（语义统一），并附加 error 字段
async function computeAndCacheTotal({ collection, cache, ns, keyDims, query, limit, hint, collation, maxTimeMS, ttlMs, logger, countQueue }) {
    const key = totalsKey(ns, keyDims);
    try {
        let total;

        // 使用队列控制并发（避免高并发下压垮数据库）
        if (countQueue) {
            total = await countQueue.execute(() =>
                collection.countDocuments(query || {}, {
                    maxTimeMS,
                    ...(hint ? { hint } : {}),
                    ...(collation ? { collation } : {})
                })
            );
        } else {
            // 无队列，直接执行（不推荐用于生产环境）
            total = await collection.countDocuments(query || {}, {
                maxTimeMS,
                ...(hint ? { hint } : {}),
                ...(collation ? { collation } : {})
            });
        }

        const totalPages = Math.ceil(total / Math.max(1, limit || 1));
        const payload = { total, totalPages, ts: Date.now() };
        if (cache?.set) await cache.set(key, payload, ttlMs);
        return payload;
    } catch (e) {
        // 失败：保持 async 语义一致，写入 total:null，并记录一次 warn（去敏）
        try { logger && logger.warn && logger.warn('totals.count.failed', { ns, reason: String(e && (e.message || e)) }); } catch (_) { }
        const payload = { total: null, totalPages: null, ts: Date.now(), error: 'count_failed' };
        if (cache?.set) await cache.set(key, payload, ttlMs);
        return payload;
    }
}

function makeJumpTooFarError({ remaining, maxHops }) {
    return createError(
        ErrorCodes.JUMP_TOO_FAR,
        '跳页跨度过大，maxHops 限制触发',
        [{ path: ['page'], message: `remaining=${remaining}, maxHops=${maxHops}` }]
    );
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

        // 如果启用 explain，直接返回执行计划（不缓存，不进行分页处理）
        if (options.explain) {
            const verbosity = typeof options.explain === 'string' ? options.explain : 'queryPlanner';
            const aggCursor = collection.aggregate(pipeline, driverOpts);
            return await aggCursor.explain(verbosity);
        }

        // 如果启用流式返回
        if (options.stream) {
            if (options.batchSize !== undefined) driverOpts.batchSize = options.batchSize;
            // 流式查询：��应该用 limit+1，直接使用 limit
            const streamPipeline = buildPagePipelineA({
                query: options.query || {},
                sort: sortForQuery,
                limit: options.limit, // 注意：这里不加1
                cursor: parsedCursor,
                direction,
                lookupPipeline: options.pipeline || []
            });
            // 手动修改最后的 $limit 阶段，不使用 limit+1
            const limitStageIndex = streamPipeline.findIndex(stage => stage.$limit !== undefined);
            if (limitStageIndex >= 0) {
                streamPipeline[limitStageIndex] = { $limit: options.limit };
            }
            return collection.aggregate(streamPipeline, driverOpts).stream();
        }

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
        const startTime = Date.now(); // 记录开始时间
        const MAX_LIMIT = defaults?.findPageMaxLimit ?? 500;
        // 基础校验：limit + after/before 互斥
        validateLimitAfterBefore(options, { maxLimit: MAX_LIMIT });

        // 如果启用流式模式，只支持简单的游标分页（after/before）或首页查询
        // 不支持跳页和 totals 等复杂功能
        if (options.stream) {
            const { after, before, page } = options;

            // 流式模式不支持跳页
            if (Number.isInteger(page) && page > 1) {
                throw createError(
                    ErrorCodes.STREAM_NO_JUMP,
                    '流式模式不支持跳页功能，请使用 after/before 游标分页'
                );
            }

            // 流式模式不支持 totals
            if (options.totals?.mode && options.totals.mode !== 'none') {
                throw createError(
                    ErrorCodes.STREAM_NO_TOTALS,
                    '流式模式不支持 totals 统计'
                );
            }

            // 流式模式不支持 explain
            if (options.explain) {
                throw createError(
                    ErrorCodes.STREAM_NO_EXPLAIN,
                    '流式模式不支持 explain 分析，请使用普通分页模式'
                );
            }

            const { sort } = options;
            const stableSort = ensureStableSort(normalizeSort(sort) || { _id: 1 });

            if (after || before) {
                const parsedCursor = decodeCursor(after || before);
                assertCursorSortCompatible(stableSort, parsedCursor && parsedCursor.s);
                return doFindPageOne({
                    options,
                    stableSort,
                    direction: after ? 'after' : 'before',
                    parsedCursor
                });
            }

            // 首页流式查询
            return doFindPageOne({
                options,
                stableSort,
                direction: null,
                parsedCursor: null
            });
        }

        // 如果启用 explain，直接返回执行计划（简化流程）
        if (options.explain) {
            const { sort } = options;
            const stableSort = ensureStableSort(normalizeSort(sort) || { _id: 1 });
            const parsedCursor = options.after ? decodeCursor(options.after) : options.before ? decodeCursor(options.before) : null;
            const direction = options.after ? 'after' : options.before ? 'before' : null;
            return await doFindPageOne({ options, stableSort, direction, parsedCursor });
        }

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

        // 辅助函数：添加 meta 信息
        const attachMeta = (result) => {
            if (options.meta) {
                result.meta = {
                    op: 'findPage',
                    durationMs: Date.now() - startTime,
                    cacheHit: false
                };
            }
            return result;
        };

        // 1) after/before：现有路径
        if (after || before) {
            const parsedCursor = decodeCursor(after || before);
            assertCursorSortCompatible(stableSort, parsedCursor && parsedCursor.s);
            const result = await doFindPageOne({ options, stableSort, direction: after ? 'after' : 'before', parsedCursor });

            // 为游标分页添加 totals 支持
            if (options.totals && options.totals.mode && options.totals.mode !== 'none') {
                const keyDims = buildKeyDimsAuto({
                    db: ctx.databaseName,
                    coll: ctx.collectionName,
                    sort: stableSort,
                    limit,
                    query,
                    pipeline: lookupPipeline,
                });
                const out = await attachTotals({ collection, cache, ns, keyDims, limit, query, totals: options.totals, ctx });
                result.totals = out;
            }

            return attachMeta(result);
        }

        // 2) 无 page：首页
        if (!Number.isInteger(page) || page < 1) {
            const result = await doFindPageOne({ options, stableSort, direction: null, parsedCursor: null });

            // 为首页添加 totals 支持
            if (options.totals && options.totals.mode && options.totals.mode !== 'none') {
                const keyDims = buildKeyDimsAuto({
                    db: ctx.databaseName,
                    coll: ctx.collectionName,
                    sort: stableSort,
                    limit,
                    query,
                    pipeline: lookupPipeline,
                });
                const out = await attachTotals({ collection, cache, ns, keyDims, limit, query, totals: options.totals, ctx });
                result.totals = out;
            }

            return attachMeta(result);
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
                    const out = await attachTotals({ collection, cache, ns, keyDims, limit, query, totals: options.totals, ctx });
                    res.totals = out;
                }
                return attachMeta(res);
            }
        }

        // 2.2 书签跳转
        const pageIndex = page - 1;
        const anchorPage = Math.floor(pageIndex / step) * step; // 0, step, 2*step, ...
        const remaining = pageIndex - anchorPage; // 0..(step-1)

        let current = null;
        if (anchorPage > 0) {
            const anchorCursor = await bmGet(cache, ns, keyDims, anchorPage);
            if (anchorCursor) {
                // 修复：从缓存获取书签后，需要构造完整的结果对象
                // 直接使用游标进行查询以获取该页的数据
                try {
                    const parsedAnchor = decodeCursor(anchorCursor);
                    current = await doFindPageOne({
                        options: { ...options, after: anchorCursor },
                        stableSort,
                        direction: 'after',
                        parsedCursor: parsedAnchor
                    });
                    // 保存当前页的游标，用于后续跳转
                    if (current.pageInfo?.endCursor && (anchorPage + 1) <= maxBookmarkPages) {
                        await bmSet(cache, ns, keyDims, anchorPage + 1, current.pageInfo.endCursor, ttlMs);
                    }
                } catch (e) {
                    // 如果书签游标失效，重置 current，从头开始
                    current = null;
                }
            }
        }

        // 累计 hops 计数：限制"整次跳页"的连续 after 次数总和不超过 maxHops
        let hops = 0;

        if (!current) {
            current = await doFindPageOne({ options, stableSort, direction: null, parsedCursor: null });
            if (current.pageInfo?.endCursor && 1 <= maxBookmarkPages) await bmSet(cache, ns, keyDims, 1, current.pageInfo.endCursor, ttlMs);
            for (let i = 1; i < anchorPage; i++) {
                hops += 1; if (hops > maxHops) throw makeJumpTooFarError({ remaining: anchorPage - i, maxHops });
                if (!current.pageInfo?.endCursor) break; // 没有更多数据
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
            hops += 1; if (hops > maxHops) throw makeJumpTooFarError({ remaining: remaining - i, maxHops });
            if (!current?.pageInfo?.endCursor) break; // 没有更多数据
            current = await doFindPageOne({
                options: { ...options, after: current.pageInfo.endCursor },
                stableSort,
                direction: 'after',
                parsedCursor: decodeCursor(current.pageInfo.endCursor)
            });
            const pNo = anchorPage + 1 + i + 1;
            if (pNo % step === 0 && pNo <= maxBookmarkPages && current.pageInfo?.endCursor) await bmSet(cache, ns, keyDims, pNo, current.pageInfo.endCursor, ttlMs);
        }

        if (current?.pageInfo) current.pageInfo.currentPage = page;

        // totals（可选）
        if (options.totals && options.totals.mode && options.totals.mode !== 'none') {
            const out = await attachTotals({ collection, cache, ns, keyDims, limit, query, totals: options.totals, ctx });
            current.totals = out;
        }

        return attachMeta(current);
    };

    // totals 附加逻辑：支持 sync/async/approx；async 返回短 token（keyHash），避免暴露命名空间
    async function attachTotals({ collection, cache, ns, keyDims, limit, query, totals, ctx }) {
        const mode = totals.mode || 'none';
        const ttlMs = totals.ttlMs ?? 10 * 60_000;
        const key = totalsKey(ns, keyDims);
        const keyHash = key.split(':').pop(); // 仅最后一段哈希作为对外 token

        // 获取 count 队列
        const queue = getCountQueue(ctx);

        if (mode === 'sync') {
            const result = await computeAndCacheTotal({
                collection, cache, ns, keyDims, query, limit,
                hint: totals.hint,
                collation: totals.collation,
                maxTimeMS: totals.maxTimeMS ?? 2000,
                ttlMs,
                logger,
                countQueue: queue  // ← 传递队列
            });
            return { mode: 'sync', ...result };
        } else if (mode === 'async') {
            const cached = cache?.get ? await cache.get(key) : null;
            if (cached) return { mode: 'async', ...cached, token: keyHash };
            // 触发异步计算（去重 + 微任务队列）
            const doAsync = () => withTotalsInflight(key, () => computeAndCacheTotal({
                collection, cache, ns, keyDims, query, limit,
                hint: totals.hint,
                collation: totals.collation,
                maxTimeMS: totals.maxTimeMS ?? 2000,
                ttlMs,
                logger,
                countQueue: queue  // ← 传递队列
            })).catch(() => { });
            if (typeof queueMicrotask === 'function') queueMicrotask(doAsync); else setTimeout(doAsync, 0);
            return { mode: 'async', total: null, totalPages: null, token: keyHash };
        } else if (mode === 'approx') {
            // 近似：使用 estimatedDocumentCount（基于元数据，速度快但不考虑查询条件）
            const cached = cache?.get ? await cache.get(key) : null;
            if (cached) return { mode: 'approx', ...cached, approx: true };

            try {
                // 如果有查询条件，使用 countDocuments（精确但可能慢）
                // 如果是空查询，使用 estimatedDocumentCount（快速但近似）
                let total;
                if (query && Object.keys(query).length > 0) {
                    // 有查询条件，使用精确统计（需要队列控制）
                    if (queue) {
                        total = await queue.execute(() =>
                            collection.countDocuments(query, {
                                maxTimeMS: totals.maxTimeMS ?? 2000,
                                ...(totals.hint ? { hint: totals.hint } : {}),
                                ...(totals.collation ? { collation: totals.collation } : {})
                            })
                        );
                    } else {
                        total = await collection.countDocuments(query, {
                            maxTimeMS: totals.maxTimeMS ?? 2000,
                            ...(totals.hint ? { hint: totals.hint } : {}),
                            ...(totals.collation ? { collation } : {})
                        });
                    }
                } else {
                    // 空查询，使用快速近似统计（不需要队列，速度很快）
                    total = await collection.estimatedDocumentCount({
                        maxTimeMS: totals.maxTimeMS ?? 1000
                    });
                }

                const totalPages = Math.ceil(total / Math.max(1, limit || 1));
                const payload = { total, totalPages, ts: Date.now(), approx: true };
                if (cache?.set) await cache.set(key, payload, ttlMs);
                return { mode: 'approx', ...payload };
            } catch (e) {
                // 失败降级
                try { logger && logger.warn && logger.warn('totals.approx.failed', { ns, reason: String(e && (e.message || e)) }); } catch (_) { }
                const payload = { total: null, totalPages: null, ts: Date.now(), error: 'approx_failed', approx: true };
                if (cache?.set) await cache.set(key, payload, ttlMs);
                return { mode: 'approx', ...payload };
            }
        }
        return undefined;
    }
}

module.exports = { createFindPage, bookmarkKey, buildKeyDimsAuto, shapeOfQuery, shapeOfPipeline };
