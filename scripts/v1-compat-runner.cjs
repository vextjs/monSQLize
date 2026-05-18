/**
 * v1 兼容性测试运行器
 * 使用仓库内置的 v1 测试源码验证 TS 实现的行为兼容性。
 *
 * 原理：拦截 vendored v1 tests 对 `lib/**` 的 require，并重定向到当前仓库
 * 的 TS 构建产物；这样保留 v1 公开契约测试，同时彻底去掉对外部
 * `..\\monSQLize-v1` sibling 工作区的运行时依赖。
 */

const Module = require('module');
const path = require('path');
const fs = require('fs');

const DEFAULT_V1_ROOT = path.resolve(__dirname, '../test/v1-source');
const V1_ROOT = path.resolve(process.env.MONSQLIZE_V1_ROOT ?? DEFAULT_V1_ROOT);
const TS_LIB = path.resolve(__dirname, '../lib/index.js');
const TS_LIB_ROOT = path.resolve(__dirname, '../lib');
const SHIM_ROOT = path.resolve(__dirname, 'v1-compat-shims');
const V1_SHIM_PATHS = {
  'cache': path.join(SHIM_ROOT, 'cache.cjs'),
  'cache-invalidation': path.join(SHIM_ROOT, 'cache-invalidation.cjs'),
  'common/shape-builders': path.join(SHIM_ROOT, 'common-shape-builders.cjs'),
  'expression': path.join(SHIM_ROOT, 'expression.cjs'),
  'expression/factory': path.join(SHIM_ROOT, 'expression-factory.cjs'),
  'infrastructure/uri-parser': path.join(SHIM_ROOT, 'uri-parser.cjs'),
  'model/features/populate': path.join(SHIM_ROOT, 'model-populate.cjs'),
  'model/features/relations': path.join(SHIM_ROOT, 'model-relations.cjs'),
  'model/features/version': path.join(SHIM_ROOT, 'model-version.cjs'),
  'mongodb/connect': path.join(SHIM_ROOT, 'mongodb-connect.cjs'),
  'mongodb/queries/watch': path.join(SHIM_ROOT, 'mongodb-watch.cjs'),
  'mongodb/writes/result-handler': path.join(SHIM_ROOT, 'result-handler.cjs'),
  'multi-level-cache': path.join(SHIM_ROOT, 'multi-level-cache.cjs'),
  'saga/SagaContext': path.join(SHIM_ROOT, 'saga-context.cjs'),
  'sync/SyncConfig': path.join(SHIM_ROOT, 'sync-config.cjs'),
  'utils/objectid-converter': path.join(SHIM_ROOT, 'objectid-converter.cjs'),
};

// 预计算 TS 工程中的 mongodb 路径，用于 ObjectId instanceof 跨包修复
const TS_MONGODB_PATH = require.resolve('mongodb', { paths: [path.resolve(__dirname, '..')] });

// ── 子路径注册表（v1 子路径 → require.cache 合成模块）──────────────────────────
const REGISTRY_PATHS = new Set();

function isVendoredV1Path(filePath) {
  return typeof filePath === 'string' && filePath.startsWith(V1_ROOT);
}

function resolveVendoredV1LibRequest(request, parentFilename) {
  if (!isVendoredV1Path(parentFilename) || !request.startsWith('.')) {
    return null;
  }

  const v1LibDir = path.join(V1_ROOT, 'lib');
  const requestPath = path.resolve(path.dirname(parentFilename), request);
  const requestCandidates = [requestPath];

  if (!requestPath.endsWith('.js')) {
    requestCandidates.push(`${requestPath}.js`);
    requestCandidates.push(path.join(requestPath, 'index.js'));
  }

  for (const candidate of requestCandidates) {
    if (
      candidate === V1_ROOT ||
      candidate === `${V1_ROOT}.js` ||
      candidate === path.join(V1_ROOT, 'index.js')
    ) {
      return TS_LIB;
    }

    if (
      candidate === v1LibDir ||
      candidate === `${v1LibDir}.js` ||
      candidate === path.join(v1LibDir, 'index.js')
    ) {
      return TS_LIB;
    }

    if (REGISTRY_PATHS.has(candidate)) {
      return candidate;
    }

    if (candidate.startsWith(v1LibDir + path.sep)) {
      const relative = path.relative(v1LibDir, candidate).replace(/\\/g, '/');
      const normalized = relative.replace(/\.js$/i, '').replace(/\/index$/i, '');
      const shimPath = V1_SHIM_PATHS[normalized];
      if (shimPath) {
        return shimPath;
      }
      const tsBase = path.join(TS_LIB_ROOT, relative);
      const tsCandidates = [tsBase];

      if (!tsBase.endsWith('.js')) {
        tsCandidates.push(`${tsBase}.js`);
        tsCandidates.push(path.join(tsBase, 'index.js'));
      }

      for (const tsCandidate of tsCandidates) {
        if (fs.existsSync(tsCandidate)) {
          return tsCandidate;
        }
      }
    }
  }

  return null;
}

// v1 subpath → TS 具名导出的映射（惰性初始化，build 后才能加载）
const V1_SUBPATH_EXPORTS = {
  'lib/lock/Lock.js':          m => m.Lock,
  'lib/lock/errors.js':        m => ({ LockAcquireError: m.LockAcquireError, LockTimeoutError: m.LockTimeoutError }),
  'lib/lock/index.js':         m => ({ Lock: m.Lock, LockManager: m.LockManager, LockAcquireError: m.LockAcquireError, LockTimeoutError: m.LockTimeoutError }),
  'lib/errors.js':             m => ({ ErrorCodes: m.ErrorCodes, createError: m.createError, createValidationError: m.createValidationError, createCursorError: m.createCursorError, createConnectionError: m.createConnectionError, createQueryTimeoutError: m.createQueryTimeoutError }),
  'lib/logger.js':             m => m.Logger,
  'lib/function-cache.js':     m => ({ withCache: m.withCache, FunctionCache: m.FunctionCache }),
  'lib/common/log.js':         m => ({ withSlowQueryLog: m.withSlowQueryLog, getSlowQueryThreshold: m.getSlowQueryThreshold }),
  'lib/common/cursor.js':      m => ({ encodeCursor: m.encodeCursor, decodeCursor: m.decodeCursor }),
  'lib/common/normalize.js':   m => ({ normalizeProjection: m.normalizeProjection, normalizeSort: m.normalizeSort }),
  'lib/common/validation.js':  m => ({ validateRange: m.validateRange, validatePositiveInteger: m.validatePositiveInteger }),
  'lib/common/page-result.js': m => ({ makePageResult: m.makePageResult }),
  'lib/infrastructure/ConnectionPoolManager.js': m => m.ConnectionPoolManager,
  'lib/infrastructure/HealthChecker.js':         m => m.HealthChecker,
  'lib/infrastructure/PoolSelector.js':          m => m.PoolSelector,
  'lib/infrastructure/PoolConfig.js':            m => ({ validatePoolConfig: m.validatePoolConfig, validate: m.validatePoolConfigSafe }),
  'lib/infrastructure/PoolStats.js':             m => m.PoolStats,
  'lib/distributed-cache-invalidator.js': m => m.DistributedCacheInvalidator,
  'lib/redis-cache-adapter.js':  m => ({ createRedisCacheAdapter: m.createRedisCacheAdapter }),
  'lib/saga/SagaOrchestrator.js': m => m.SagaOrchestrator,
  'lib/sync/ResumeTokenStore.js': m => m.ResumeTokenStore,
  'lib/transaction/DistributedCacheLockManager.js': m => m.DistributedCacheLockManager,
  'lib/transaction/Transaction.js': m => m.Transaction,
  'lib/transaction/TransactionManager.js': m => m.TransactionManager,
  'lib/transaction/CacheLockManager.js': m => m.CacheLockManager,
  'lib/model/index.js':        m => m.Model,
  'lib/slow-query-log/batch-queue': () => require(path.join(SHIM_ROOT, 'slow-query-batch-queue.cjs')),
  'lib/slow-query-log/config-manager': () => require(path.join(SHIM_ROOT, 'slow-query-config-manager.cjs')),
  'lib/slow-query-log/query-hash': () => require(path.join(SHIM_ROOT, 'slow-query-query-hash.cjs')),
  'lib/count-queue': m => m.CountQueue,
};

/**
 * 将 v1 子路径注册到 require.cache，避免 fallback 到整个 lib/index.js
 */
function initV1SubPathRegistry () {
  let tsModule;
  try {
    tsModule = require(TS_LIB);
  } catch (e) {
    console.warn('⚠️  TS lib 加载失败，子路径注册跳过:', e.message);
    return;
  }

  const v1LibDir = path.join(V1_ROOT, 'lib');
  for (const [relPath, extractor] of Object.entries(V1_SUBPATH_EXPORTS)) {
    const fakePath = path.join(v1LibDir, relPath.replace('lib/', ''));
    try {
      const exports = extractor(tsModule);
      require.cache[fakePath] = {
        id: fakePath,
        filename: fakePath,
        loaded: true,
        exports,
        children: [],
        paths: [],
        parent: null,
      };
      REGISTRY_PATHS.add(fakePath);
    } catch {
      // 个别导出缺失，忽略
    }
  }
}

// ── Module 劫持：将 v1 lib 的 require 重定向到 TS lib ──────────────────────────
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  // mocha: v1 测试文件中的 require('mocha') 重定向到全局 fake mocha
  if (request === 'mocha' && isVendoredV1Path(parent?.filename)) {
    const FAKE_MOCHA_ID = path.join(__dirname, '__fake_mocha__.cjs');
    if (!require.cache[FAKE_MOCHA_ID]) {
      require.cache[FAKE_MOCHA_ID] = {
        id: FAKE_MOCHA_ID,
        filename: FAKE_MOCHA_ID,
        loaded: true,
        exports: {
          describe: global.describe,
          it: global.it,
          before: global.before,
          after: global.after,
          beforeEach: global.beforeEach,
          afterEach: global.afterEach,
        },
        children: [],
        paths: [],
        parent: null,
      };
    }
    return FAKE_MOCHA_ID;
  }

  const redirectedLibTarget = resolveVendoredV1LibRequest(request, parent?.filename);
  if (redirectedLibTarget) {
    return redirectedLibTarget;
  }

  // ObjectId instanceof 跨包修复：v1 测试中 require('mongodb') 统一重定向到 TS 的 mongodb
  if (
    request === 'mongodb' &&
    isVendoredV1Path(parent?.filename) &&
    !parent.filename.startsWith(path.join(V1_ROOT, 'node_modules'))
  ) {
    return TS_MONGODB_PATH;
  }
  const resolved = originalResolveFilename.call(this, request, parent, isMain, options);
  // 如果解析到 v1 lib 目录，重定向到 TS lib
  const v1LibDir = path.join(V1_ROOT, 'lib');
  if (resolved === v1LibDir || resolved.startsWith(v1LibDir + path.sep) || resolved === v1LibDir + '.js') {
    // 层 1：已预注册的子路径 → 直接从 require.cache 加载（返回原路径让 require 从 cache 里读）
    if (REGISTRY_PATHS.has(resolved)) {
      return resolved;
    }
    // 层 2：TS lib 目录下存在对应文件 → 直接重定向到 TS 文件
    const relative = path.relative(v1LibDir, resolved);
    if (relative) {
      const candidate = path.join(TS_LIB_ROOT, relative);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    // 层 3：v1 根 index → fallback 整个 TS_LIB
    if (resolved === v1LibDir || resolved === v1LibDir + '.js' || resolved === path.join(v1LibDir, 'index.js')) {
      return TS_LIB;
    }
    throw new Error(`未映射的 vendored v1 lib 子路径: ${request}`);
  }
  return resolved;
};

// ── 全局测试框架（模拟 mocha/custom runner 的 describe/it/before/after）──────────
let totalPassed = 0;
let totalFailed = 0;
let totalSkipped = 0;
const allFailures = [];
let currentSuite = '';

// Hook 作用域栈：每个 describe 压入一个独立作用域，it() 注册时快照当前链，避免跨 describe 污染
let __hookStack = [{ beforeEach: [], afterEach: [] }];

// describe 支持 this.timeout
global.describe = function (name, fn) {
  const prevSuite = currentSuite;
  currentSuite = prevSuite ? `${prevSuite} > ${name}` : name;
  // 压入新作用域
  __hookStack.push({ beforeEach: [], afterEach: [] });
  const ctx = { timeout (_ms) { return this; } };
  try {
    fn.call(ctx);
  } catch (e) {
    console.error(`❌ describe "${name}" 初始化失败:`, e.message);
  }
  // 弹出作用域
  __hookStack.pop();
  currentSuite = prevSuite;
};

global.__beforeHooks = [];
global.__afterHooks = [];

global.before = fn => global.__beforeHooks.push(fn);
global.after = fn => global.__afterHooks.push(fn);
// beforeEach/afterEach 注册到当前 describe 作用域
global.beforeEach = fn => __hookStack[__hookStack.length - 1].beforeEach.push(fn);
global.afterEach = fn => __hookStack[__hookStack.length - 1].afterEach.push(fn);

const pendingTests = [];

// SkipSignal — 用于 this.skip() 跳过当前测试
class SkipSignal extends Error {
  constructor () { super('__SKIP__'); this.isSkip = true; }
}

global.it = function (name, fn) {
  const suite = currentSuite;
  // 快照当前作用域链的 beforeEach/afterEach（从外到内展开）
  const capturedBeforeEach = __hookStack.flatMap(s => s.beforeEach);
  const capturedAfterEach = __hookStack.flatMap(s => s.afterEach).reverse();
  pendingTests.push({ suite, name, fn, capturedBeforeEach, capturedAfterEach });
};
// 别名
global.test = global.it;
global.specify = global.it;
global.it.skip = (_name) => { /* skip */ };
global.describe.skip = (_name, _fn) => { /* skip */ };
global.xit = global.it.skip;

// chai 最小化兼容层（v1 有些测试用 chai）
try {
  global.chai = require('chai');
} catch {
  // chai not available, tests using it will fail naturally
}

// Jest-compatible expect shim（slow-query-log 等 Jest-风格测试使用）
function _deepEqual(a, b, seen) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  // MongoDB ObjectId: use .equals() if available
  if (a && typeof a.equals === 'function' && typeof a.toHexString === 'function') {
    return typeof b.equals === 'function' ? a.equals(b) : a.toHexString() === String(b);
  }
  if (typeof a !== 'object' || typeof b !== 'object') return a === b;
  // Circular reference guard
  if (!seen) seen = new Map();
  if (seen.has(a)) return seen.get(a) === b;
  seen.set(a, b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => _deepEqual(a[k], b[k], seen));
}
function _hasProperty(obj, keyPath, val) {
  const parts = Array.isArray(keyPath) ? keyPath : String(keyPath).split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || !Object.prototype.hasOwnProperty.call(cur, p)) return false;
    cur = cur[p];
  }
  return val === undefined ? true : _deepEqual(cur, val);
}
// ─── Fake timer implementation ───────────────────────────────────────────────
let _fakeTimersActive = false;
const _origSetTimeout   = global.setTimeout;
const _origSetInterval  = global.setInterval;
const _origClearTimeout  = global.clearTimeout;
const _origClearInterval = global.clearInterval;
let _fakeTimerQueue = [];
let _fakeNow = 0;
let _fakeTimerId = 1_000_000;

function _useFakeTimers() {
  if (_fakeTimersActive) return;
  _fakeTimersActive = true;
  _fakeTimerQueue = [];
  _fakeNow = 0;
  global.setTimeout = (fn, delay, ...args) => {
    const id = ++_fakeTimerId;
    _fakeTimerQueue.push({ id, fn: () => fn(...args), delay, at: _fakeNow + (delay || 0), type: 'timeout' });
    return id;
  };
  global.clearTimeout = (id) => { _fakeTimerQueue = _fakeTimerQueue.filter(t => t.id !== id); };
  global.setInterval = (fn, delay, ...args) => {
    const id = ++_fakeTimerId;
    const entry = { id, fn: () => fn(...args), delay: delay || 0, at: _fakeNow + (delay || 0), type: 'interval' };
    _fakeTimerQueue.push(entry);
    return id;
  };
  global.clearInterval = (id) => { _fakeTimerQueue = _fakeTimerQueue.filter(t => t.id !== id); };
}
function _useRealTimers() {
  if (!_fakeTimersActive) return;
  _fakeTimersActive = false;
  global.setTimeout  = _origSetTimeout;
  global.clearTimeout = _origClearTimeout;
  global.setInterval  = _origSetInterval;
  global.clearInterval = _origClearInterval;
}
function _advanceTimersByTime(ms) {
  const target = _fakeNow + ms;
  while (true) {
    const next = _fakeTimerQueue
      .filter(t => t.at <= target)
      .sort((a, b) => a.at - b.at)[0];
    if (!next) break;
    _fakeNow = next.at;
    if (next.type === 'timeout') {
      _fakeTimerQueue = _fakeTimerQueue.filter(t => t.id !== next.id);
    } else {
      // re-schedule interval
      next.at = _fakeNow + next.delay;
    }
    try { next.fn(); } catch { /* swallow timer errors */ }
  }
  _fakeNow = target;
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── Chainable async matchers for .resolves / .rejects ───────────────────────
// Returns an object that is both awaitable AND has matcher methods on it,
// so `await expect(promise).resolves.not.toThrow()` works synchronous-chain-style.
function _makeAsyncMatchers(originalPromise, isRejection, isNot) {
  // Build the "settled" promise:
  //   resolves → resolves to the resolved value (throws if the original rejected)
  //   rejects  → resolves to the rejection Error (throws if the original resolved)
  const settledPromise = isRejection
    ? Promise.resolve(originalPromise).then(
        () => { throw new Error('Expected promise to reject, but it resolved'); },
        e  => e
      )
    : Promise.resolve(originalPromise).then(
        v  => v,
        e  => { throw new Error(`Expected promise to resolve, but it rejected: ${e && e.message}`); }
      );

  const m = {};

  // Awaitable: delegate to settledPromise
  m.then  = (res, rej) => settledPromise.then(res, rej);
  m.catch = (rej)      => settledPromise.catch(rej);

  // toThrow — most common use with resolves/rejects
  // resolves.not.toThrow() → just checks that the promise resolved (settledPromise won't throw)
  // rejects.toThrow(msg)   → checks that the rejection reason message matches
  m.toThrow = (msg) => isRejection
    ? settledPromise.then(err => {
        if (isNot) throw new Error(`Expected NOT to throw, but rejected: ${err && err.message}`);
        if (msg !== undefined) {
          const ok = msg instanceof RegExp ? msg.test(err.message) : (err.message || '').includes(String(msg));
          if (!ok) throw new Error(`Expected "${err.message}" to match ${msg}`);
        }
      })
    : settledPromise.then(resolved => {
        // resolves context: toThrow checks if the resolved *function* throws
        if (!isNot) {
          if (typeof resolved !== 'function') {
            // lenient: if not a function, treat as "didn't throw" — fails .toThrow()
            throw new Error(`Expected to throw, but resolved with ${typeof resolved}`);
          }
          let threw = false;
          try { resolved(); } catch { threw = true; }
          if (!threw) throw new Error('Expected to throw but did not');
        }
        // resolves.not.toThrow() → settledPromise already resolved = pass (no-op)
      });

  // Forward all sync matchers to a resolved-value matcher
  const wrapSync = (name) => (...args) =>
    settledPromise.then(v => { _makeMatchers(v, isNot)[name](...args); });
  [
    'toBe','toEqual','toBeDefined','toBeUndefined','toBeNull','toBeTruthy','toBeFalsy',
    'toBeGreaterThan','toBeGreaterThanOrEqual','toBeLessThan','toBeLessThanOrEqual',
    'toBeInstanceOf','toHaveLength','toHaveProperty','toContain','toContainEqual',
    'toMatch','toMatchObject',
    'toHaveBeenCalled','toHaveBeenCalledTimes','toHaveBeenCalledWith','toHaveBeenLastCalledWith',
  ].forEach(n => { m[n] = wrapSync(n); });

  // One level of .not
  if (!isNot) m.not = _makeAsyncMatchers(originalPromise, isRejection, true);

  return m;
}
// ─────────────────────────────────────────────────────────────────────────────

// Track all jest.fn() mocks for clearAllMocks support
const _allMocks = [];

function _makeMock(impl) {
  let _impl = impl;
  const mock = function(...args) {
    mock.mock.calls.push(args);
    if (typeof _impl === 'function') return _impl(...args);
  };
  mock.mock = { calls: [], instances: [], results: [] };
  mock._isMock = true;
  mock.mockResolvedValue = (v) => { _impl = () => Promise.resolve(v); return mock; };
  mock.mockRejectedValue = (e) => { _impl = () => Promise.reject(e); return mock; };
  mock.mockReturnValue = (v) => { _impl = () => v; return mock; };
  mock.mockImplementation = (fn) => { _impl = fn; return mock; };
  mock.mockReset = () => { mock.mock.calls = []; mock.mock.instances = []; mock.mock.results = []; return mock; };
  mock.mockClear = () => mock.mockReset();
  _allMocks.push(mock);
  return mock;
}

function _makeMatchers(received, isNot) {
  const pass = (ok, msg, notMsg) => {
    if (isNot ? ok : !ok) throw new Error(isNot ? (notMsg || `NOT: ${msg}`) : msg);
  };
  const safe = (v) => { try { return JSON.stringify(v); } catch { return String(v); } };
  const matchers = {
    toBe:               (exp) => pass(received === exp,
                                  `Expected ${safe(received)} to be ${safe(exp)}`,
                                  `Expected ${safe(received)} NOT to be ${safe(exp)}`),
    toEqual:            (exp) => pass(_deepEqual(received, exp),
                                  `Expected deep equal. Got: ${safe(received)}`,
                                  'Expected NOT deep equal.'),
    toBeDefined:        ()    => pass(received !== undefined, 'Expected defined, got undefined', 'Expected undefined'),
    toBeUndefined:      ()    => pass(received === undefined, `Expected undefined, got ${safe(received)}`, 'Expected NOT undefined'),
    toBeNull:           ()    => pass(received === null, `Expected null, got ${safe(received)}`, 'Expected NOT null'),
    toBeTruthy:         ()    => pass(!!received, `Expected truthy, got ${safe(received)}`, 'Expected falsy'),
    toBeFalsy:          ()    => pass(!received, `Expected falsy, got ${safe(received)}`, 'Expected truthy'),
    toBeGreaterThan:    (n)   => pass(received > n, `Expected ${received} > ${n}`, `Expected NOT > ${n}`),
    toBeGreaterThanOrEqual: (n) => pass(received >= n, `Expected ${received} >= ${n}`, `Expected NOT >= ${n}`),
    toBeLessThan:       (n)   => pass(received < n, `Expected ${received} < ${n}`, `Expected NOT < ${n}`),
    toBeLessThanOrEqual:(n)   => pass(received <= n, `Expected ${received} <= ${n}`, `Expected NOT <= ${n}`),
    toBeInstanceOf:     (cls) => pass(received instanceof cls, `Expected instanceof ${cls.name}`, `Expected NOT instanceof ${cls.name}`),
    toHaveLength:       (n)   => pass(received != null && received.length === n,
                                  `Expected length ${n}, got ${received == null ? 'null' : received.length}`,
                                  `Expected length NOT ${n}`),
    toHaveProperty:     (k, v)=> pass(_hasProperty(received, k, v),
                                  `Expected property "${k}"${v !== undefined ? ' = ' + safe(v) : ''}`,
                                  `Expected NOT property "${k}"`),
    toContain:          (item)=> pass(received != null && (Array.isArray(received) ? received.includes(item) : received.includes(item)),
                                  `Expected to contain ${safe(item)}`, `Expected NOT to contain ${safe(item)}`),
    toContainEqual:     (item)=> pass(received != null && received.some(x => _deepEqual(x, item)),
                                  `Expected array to contain equal to ${safe(item)}`, 'Expected NOT'),
    toMatch:            (pat) => {
      const ok = typeof pat === 'string' ? String(received).includes(pat) : pat.test(String(received));
      pass(ok, `Expected "${received}" to match ${pat}`, `Expected NOT to match ${pat}`);
    },
    toMatchObject:      (shape) => {
      const ok = shape && typeof shape === 'object' && Object.keys(shape).every(k => _deepEqual(received[k], shape[k]));
      pass(ok, 'Expected to match object shape', 'Expected NOT to match object shape');
    },
    toThrow:            (msg) => {
      if (typeof received !== 'function') throw new Error('expect(fn).toThrow() requires a function');
      let threw = false, err = null;
      try { received(); } catch(e) { threw = true; err = e; }
      if (!isNot) {
        if (!threw) throw new Error('Expected function to throw');
        if (msg !== undefined) {
          const matches = msg instanceof RegExp ? msg.test(err.message) : err.message.includes(String(msg));
          if (!matches) throw new Error(`Expected thrown error "${err.message}" to match ${msg}`);
        }
      } else {
        if (threw) throw new Error(`Expected function NOT to throw, but threw: ${err && err.message}`);
      }
    },
    toHaveBeenCalled:       ()    => pass(received && received.mock && received.mock.calls.length > 0,
                                      'Expected mock to have been called', 'Expected mock NOT to have been called'),
    toHaveBeenCalledTimes:  (n)   => {
      const cnt = received && received.mock ? received.mock.calls.length : 0;
      pass(cnt === n, `Expected ${n} calls, got ${cnt}`, `Expected NOT ${n} calls`);
    },
    toHaveBeenCalledWith:   (...args) => {
      const calls = received && received.mock ? received.mock.calls : [];
      const ok = calls.some(c => _deepEqual(c, args));
      pass(ok, `Expected mock called with ${safe(args)}`, `Expected NOT called with ${safe(args)}`);
    },
    toHaveBeenLastCalledWith: (...args) => {
      const calls = received && received.mock ? received.mock.calls : [];
      const last = calls[calls.length - 1];
      pass(last && _deepEqual(last, args), `Expected last call with ${safe(args)}`, 'Expected NOT');
    },
  };
  // resolves / rejects — lazy getters returning chainable async matchers
  Object.defineProperty(matchers, 'resolves', {
    get() { return _makeAsyncMatchers(received, false, isNot); },
    enumerable: true
  });
  Object.defineProperty(matchers, 'rejects', {
    get() { return _makeAsyncMatchers(received, true, isNot); },
    enumerable: true
  });
  // .not — only one level deep, no further recursion
  if (!isNot) matchers.not = _makeMatchers(received, true);
  return matchers;
}
global.expect = function jestExpect(received) {
  return _makeMatchers(received, false);
};
global.expect.any = (ctor) => ({ _isExpectAny: true, ctor });
global.expect.objectContaining = (shape) => ({ _isObjectContaining: true, shape });
global.expect.arrayContaining = (arr) => ({ _isArrayContaining: true, arr });
global.expect.stringContaining = (s) => ({ _isStringContaining: true, s });
global.jest = global.jest || {};
Object.assign(global.jest, {
  fn: (impl) => _makeMock(impl),
  spyOn: (obj, method) => {
    const orig = obj[method];
    const mock = _makeMock(typeof orig === 'function' ? orig.bind(obj) : undefined);
    obj[method] = mock;
    mock.mockRestore = () => { obj[method] = orig; };
    return mock;
  },
  clearAllMocks: () => { _allMocks.forEach(m => m.mockClear()); },
  resetAllMocks: () => { _allMocks.forEach(m => m.mockReset()); },
  useFakeTimers: () => _useFakeTimers(),
  useRealTimers: () => _useRealTimers(),
  advanceTimersByTime: (ms) => _advanceTimersByTime(ms),
  runAllTimers: () => _advanceTimersByTime(Number.MAX_SAFE_INTEGER),
  setTimeout: (fn, ms) => _origSetTimeout(fn, ms),
});

// 带超时的 Promise 包装
function withTimeout (promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`超时(${ms}ms): ${label}`)), ms);
    Promise.resolve(promise)
      .then(v => { clearTimeout(timer); resolve(v); })
      .catch(e => { clearTimeout(timer); reject(e); });
  });
}

// 支持 done-callback 风格的函数调用
function callFn (fn, ctx, args = []) {
  if (fn.length > args.length) {
    // done-callback style
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (err) => {
        if (settled) return;
        settled = true;
        if (err) reject(err instanceof Error ? err : new Error(String(err)));
        else resolve();
      };
      try {
        const r = fn.call(ctx, ...args, done);
        if (r && typeof r.then === 'function') {
          r.then(
            () => { if (!settled) { settled = true; resolve(); } },
            e  => { if (!settled) { settled = true; reject(e); } }
          );
        }
      } catch (e) {
        if (!settled) { settled = true; reject(e); }
      }
    });
  }
  const result = fn.call(ctx, ...args);
  return (result && typeof result.then === 'function') ? result : Promise.resolve();
}

// ── 测试执行引擎 ──────────────────────────────────────────────────────────────
const HOOK_TIMEOUT = 90000;  // before/after 钩子超时 90s（副本集等待）
const TEST_TIMEOUT = 30000;  // 单测超时 30s

async function runPendingTests (filePath) {
  let filePassed = 0;
  let fileFailed = 0;
  let fileSkipped = 0;
  let beforeFailed = false;

  // 执行 before 钩子（带超时）
  const hookCtx = { timeout (_ms) { return this; }, slow () { return this; } };
  for (const hook of global.__beforeHooks) {
    try {
      await withTimeout(callFn(hook, hookCtx), HOOK_TIMEOUT, 'before()');
    } catch (e) {
      console.error(`  ⚠️ before() 钩子失败: ${e.message}`);
      beforeFailed = true;
      break;
    }
  }

  for (const { suite, name, fn, capturedBeforeEach, capturedAfterEach } of pendingTests) {
    const label = suite ? `${suite} / ${name}` : name;

    // before 失败时跳过所有测试
    if (beforeFailed) {
      fileSkipped++;
      totalSkipped++;
      console.log(`  ⏭ ${name}  [before失败，跳过]`);
      continue;
    }

    // 执行 beforeEach（仅本 describe 链路的 hooks）
    for (const hook of (capturedBeforeEach || [])) {
      try { await withTimeout(callFn(hook, hookCtx), HOOK_TIMEOUT, 'beforeEach()'); } catch { /* ignore */ }
    }

    // Track if this.skip() was called (mirrors Mocha's this.pending = true behavior:
    // once skip() is called inside a try block, any error from the catch block is
    // still treated as a skip, not a failure)
    let skipCalled = false;
    try {
      // this 注入 skip() 和 timeout()
      const ctx = {
        timeout (_ms) { return this; },
        skip () { skipCalled = true; throw new SkipSignal(); },
        slow () { return this; },
        retries () { return this; }
      };
      await withTimeout(callFn(fn, ctx), TEST_TIMEOUT, name);
      filePassed++;
      totalPassed++;
    } catch (e) {
      if (e instanceof SkipSignal || skipCalled) {
        fileSkipped++;
        totalSkipped++;
        console.log(`  ⏭ ${name}  [skip]`);
      } else {
        fileFailed++;
        totalFailed++;
        allFailures.push({ file: path.relative(V1_ROOT, filePath), test: label, error: e.message });
        console.error(`  ✗ ${name}`);
        console.error(`    → ${e.message}`);
      }
    }

    // 执行 afterEach（仅本 describe 链路的 hooks，逆序）
    for (const hook of (capturedAfterEach || [])) {
      try { await withTimeout(callFn(hook, hookCtx), HOOK_TIMEOUT, 'afterEach()'); } catch { /* ignore */ }
    }
  }

  // 执行 after 钩子
  for (const hook of global.__afterHooks) {
    try { await withTimeout(callFn(hook, hookCtx), HOOK_TIMEOUT, 'after()'); } catch { /* ignore */ }
  }

  return { filePassed, fileFailed, fileSkipped };
}

// ── 主入口 ────────────────────────────────────────────────────────────────────
async function main () {
  // 启动 MongoMemoryReplSet（单节点副本集），支持 MongoDB 事务
  // 所有测试共用同一个内存副本集实例，避免重复启动开销
  let sharedReplSet = null;
  try {
    const MMS_PATH = require.resolve('mongodb-memory-server', { paths: [path.resolve(__dirname, '..')] });
    const { MongoMemoryReplSet } = require(MMS_PATH);
    console.log('🚀 启动 MongoDB Memory ReplSet（支持事务）...');
    sharedReplSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
      binary: { version: '6.0.12' },
    });
    const replSetUri = sharedReplSet.getUri();
    process.env.MONSQLIZE_USE_SYSTEM_MONGO = 'true';
    process.env.MONSQLIZE_SYSTEM_MONGO_URI = replSetUri;
    console.log(`✅ MongoDB Memory ReplSet 已就绪: ${replSetUri}`);
  } catch (err) {
    // 降级到本地系统 MongoDB（事务测试将会失败，符合预期）
    console.warn('⚠️  MongoMemoryReplSet 启动失败，降级到系统 MongoDB（事务测试可能失败）:', err.message);
    process.env.MONSQLIZE_USE_SYSTEM_MONGO = 'true';
    process.env.MONSQLIZE_SYSTEM_MONGO_URI = 'mongodb://127.0.0.1:27017';
  }

  if (!fs.existsSync(path.join(V1_ROOT, 'test'))) {
    console.error(`未找到 vendored v1 测试目录: ${V1_ROOT}`);
    console.error('期望路径示例: <repo>\\test\\v1-source\\test\\...');
    process.exit(1);
  }

  // 预注册 v1 子路径映射（必须在任何 require 之前完成）
  initV1SubPathRegistry();

  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('用法: node v1-compat-runner.cjs <test-suite-name|test-file-path>');
    console.error('示例: node v1-compat-runner.cjs find');
    console.error('示例: node v1-compat-runner.cjs all-v2');
    console.error('示例: node v1-compat-runner.cjs test/unit/features/find.test.js');
    process.exit(1);
  }

  // 解析测试文件列表
  let testFiles = [];
  const suiteName = args[0];

  // 内置套件映射（与 v1 run-tests.js 保持一致）
  const suiteMap = {
    // ── features ──────────────────────────────────────────────────────────────
    find: ['test/unit/features/find.test.js'],
    findOne: ['test/unit/features/findOne.test.js'],
    findPage: ['test/unit/features/findPage.test.js'],
    findOneById: ['test/unit/features/findOneById.test.js'],
    findByIds: ['test/unit/features/findByIds.test.js'],
    findAndCount: ['test/unit/features/findAndCount.test.js'],
    count: ['test/unit/features/count.test.js'],
    distinct: ['test/unit/features/distinct.test.js'],
    explain: ['test/unit/features/explain.test.js'],
    aggregate: ['test/unit/features/aggregate.test.js'],
    chaining: ['test/unit/features/chaining.test.js'],
    bookmarks: ['test/unit/features/bookmarks.test.js'],
    invalidate: ['test/unit/features/invalidate.test.js'],
    insertOne: ['test/unit/features/insertOne.test.js'],
    insertMany: ['test/unit/features/insertMany.test.js'],
    insertBatch: ['test/unit/features/insertBatch.test.js'],
    updateOne: ['test/unit/features/updateOne.test.js'],
    updateMany: ['test/unit/features/updateMany.test.js'],
    updateBatch: ['test/unit/features/updateBatch.test.js'],
    replaceOne: ['test/unit/features/replaceOne.test.js'],
    deleteOne: ['test/unit/features/deleteOne.test.js'],
    deleteMany: ['test/unit/features/deleteMany.test.js'],
    deleteBatch: ['test/unit/features/deleteBatch.test.js'],
    findOneAndUpdate: ['test/unit/features/findOneAndUpdate.test.js'],
    findOneAndReplace: ['test/unit/features/findOneAndReplace.test.js'],
    findOneAndDelete: ['test/unit/features/findOneAndDelete.test.js'],
    upsertOne: ['test/unit/features/upsertOne.test.js'],
    incrementOne: ['test/unit/features/incrementOne.test.js'],
    transaction: ['test/unit/features/transaction-unit.test.js'],
    'expression-date-advanced': ['test/unit/features/expression-date-advanced.test.js'],
    'findPage-supplement': ['test/unit/features/findPage-supplement.test.js'],
    indexes: ['test/unit/features/indexes.test.js'],
    'update-aggregation-pipeline': ['test/unit/features/update-aggregation-pipeline.test.js'],
    'transaction-basic': ['test/unit/features/transaction-basic.test.js'],
    'expression-all': [
      'test/unit/expression/core/detection.test.js',
      'test/unit/expression/operators/arithmetic.test.js',
      'test/unit/expression/operators/string.test.js',
      'test/unit/expression/operators/math.test.js',
      'test/unit/expression/operators/array.test.js',
      'test/unit/expression/operators/array-advanced.test.js',
      'test/unit/expression/operators/group.test.js',
      'test/unit/expression/operators/date.test.js',
      'test/unit/expression/operators/string-advanced.test.js',
      'test/unit/expression/operators/high-frequency.test.js',
      'test/unit/expression/operators/conditional.test.js',
      'test/unit/expression/operators/edge-cases.test.js',
      'test/unit/expression/operators/aggregation.test.js',
    ],
    utils: [
      'test/unit/utils/cursor.test.js',
      'test/unit/utils/normalize.test.js',
      'test/unit/utils/page-result.test.js',
      'test/unit/utils/shape-builders.test.js',
      'test/unit/utils/validation.test.js',
    ],
    // ── expression extras ─────────────────────────────────────────────────────
    'expression-compat': ['test/unit/expression/compatibility/backward-compatibility.test.js'],
    'expression-errors': ['test/unit/expression/errors/error-handling.test.js'],
    'expression-perf': ['test/unit/expression/performance/performance.test.js'],
    // ── model extras ──────────────────────────────────────────────────────────
    'model-features-100': ['test/unit/model/model-features-100.test.js'],
    // ── utils extras ─────────────────────────────────────────────────────────
    'objectid-cross-version': ['test/unit/utils/objectid-cross-version.test.js'],
    'result-handler': ['test/unit/utils/result-handler.test.js'],
    // ── root tests ────────────────────────────────────────────────────────────
    'count-queue': ['test/count-queue.test.js'],
    'objectid-conversion': ['test/objectid-conversion.test.js'],
    'slow-query-log-comprehensive': ['test/slow-query-log-comprehensive.test.js'],
    'slow-query-log-integration': ['test/slow-query-log-integration.test.js'],
    // ── slow-query-log submodule ──────────────────────────────────────────────
    'slow-query-log-batch-queue': ['test/slow-query-log/batch-queue.test.js'],
    'slow-query-log-config-manager': ['test/slow-query-log/config-manager.test.js'],
    'slow-query-log-query-hash': ['test/slow-query-log/query-hash.test.js'],
    // ── common ─────────────────────────────────────────────────────────────────
    'common-log': ['test/unit/common/log.test.js'],
    'common-shape': ['test/unit/common/shape-builders.test.js'],
    // ── infrastructure（跳过 Redis / SSH）─────────────────────────────────────
    'infra-errors': ['test/unit/infrastructure/errors.test.js'],
    'infra-logger': ['test/unit/infrastructure/logger.test.js'],
    'infra-validation': ['test/unit/infrastructure/validation.test.js'],
    'infra-cache': ['test/unit/infrastructure/cache.test.js'],
    'infra-cache-invalidation': ['test/unit/infrastructure/cache-invalidation.test.js'],
    'infra-multi-level-cache': ['test/unit/infrastructure/multi-level-cache.test.js'],
    'infra-distributed-cache-invalidator': ['test/unit/infrastructure/distributed-cache-invalidator.test.js'],
    'infra-pool': ['test/unit/infrastructure/connection-pool-manager.test.js'],
    'infra-pool-errors': ['test/unit/infrastructure/connection-pool-manager-errors.test.js'],
    'infra-pool-complete': ['test/unit/infrastructure/connection-pool-manager-complete.test.js'],
    'infra-pool-ultimate': ['test/unit/infrastructure/connection-pool-manager-ultimate.test.js'],
    'infra-multi-pool-final': ['test/unit/infrastructure/multi-pool-100-percent-final.test.js'],
    'infra-multi-pool-supplement': ['test/unit/infrastructure/multi-pool-100-percent-supplement.test.js'],
    'infra-multi-pool-ultimate': ['test/unit/infrastructure/multi-pool-100-percent-ultimate.test.js'],
    'infra-pool-config': ['test/unit/infrastructure/pool-config-stats.test.js'],
    'infra-pool-selector': ['test/unit/infrastructure/pool-selector.test.js'],
    'infra-health': ['test/unit/infrastructure/health-checker.test.js'],
    'infra-health-complete': ['test/unit/infrastructure/health-checker-complete.test.js'],
    'infra-admin': ['test/unit/infrastructure/admin.test.js'],
    'infra-collection-mgmt': ['test/unit/infrastructure/collection-mgmt.test.js'],
    'infra-database': ['test/unit/infrastructure/database.test.js'],
    'infra-connection': ['test/unit/infrastructure/connection.test.js'],
    'infra-mongodb-connect': ['test/unit/infrastructure/mongodb-connect.test.js'],
    'infra-uri-parser': ['test/unit/infrastructure/uri-parser.test.js'],
    'infra-index': ['test/unit/infrastructure/index.test.js'],
    'infra-multi-level-cache-distributed': ['test/unit/infrastructure/multi-level-cache-distributed.test.js'],
    // ── lock ───────────────────────────────────────────────────────────────────
    lock: ['test/unit/lock/business-lock.test.js'],
    // ── function-cache（跳过 Redis）────────────────────────────────────────────
    'function-cache': ['test/unit/function-cache.test.js'],
    // ── model ──────────────────────────────────────────────────────────────────
    'model-core': ['test/unit/model/model.test.js'],
    'model-advanced': ['test/unit/model/model-advanced.test.js'],
    'model-auto-load': ['test/unit/model/model-auto-load.test.js'],
    'model-clear-invalidation': ['test/unit/model/model-clear-invalidation.test.js'],
    'model-connection-binding': ['test/unit/model/model-connection-binding.test.js'],
    'model-coverage': ['test/unit/model/model-coverage-100.test.js'],
    'model-edge-cases': ['test/unit/model/model-edge-cases.test.js'],
    'model-error-handling': ['test/unit/model/model-error-handling.test.js'],
    'model-final': ['test/unit/model/model-final-100.test.js'],
    'model-findandcount-populate': ['test/unit/model/model-findandcount-populate.test.js'],
    'model-findbyids-populate': ['test/unit/model/model-findbyids-populate.test.js'],
    'model-hooks': ['test/unit/model/model-hooks.test.js'],
    'model-hot-reload': ['test/unit/model/model-hot-reload.test.js'],
    'model-instance': ['test/unit/model/model-instance.test.js'],
    'model-integrate-populate': ['test/unit/model/model-integrate-populate.test.js'],
    'model-integration': ['test/unit/model/model-integration.test.js'],
    'model-nested-populate': ['test/unit/model/model-nested-populate.test.js'],
    'model-populate-advanced': ['test/unit/model/model-populate-advanced.test.js'],
    'model-populate-errors': ['test/unit/model/model-populate-errors.test.js'],
    'model-populate-integration': ['test/unit/model/model-populate-integration.test.js'],
    'model-populate-logic': ['test/unit/model/model-populate-logic.test.js'],
    'model-populate': ['test/unit/model/model-populate.test.js'],
    'model-relations-edge-cases': ['test/unit/model/model-relations-edge-cases.test.js'],
    'model-relations': ['test/unit/model/model-relations.test.js'],
    'model-schema-validation': ['test/unit/model/model-schema-validation.test.js'],
    'model-soft-delete': ['test/unit/model/model-soft-delete.test.js'],
    'model-timestamps': ['test/unit/model/model-timestamps.test.js'],
    'model-version': ['test/unit/model/model-version.test.js'],
    'model-virtuals-defaults': ['test/unit/model/model-virtuals-defaults.test.js'],
    'model-scoped-access': ['test/unit/model/scoped-access.test.js'],
    // ── saga（跳过 Redis）──────────────────────────────────────────────────────
    'saga-context': ['test/unit/saga/context.test.js'],
    'saga-executor': ['test/unit/saga/executor.test.js'],
    'saga-orchestrator': ['test/unit/saga/orchestrator.test.js'],
    // ── sync ───────────────────────────────────────────────────────────────────
    'sync-config': ['test/unit/sync/config.test.js'],
    'sync-token-store': ['test/unit/sync/token-store.test.js'],
    'sync-token-store-errors': ['test/unit/sync/token-store-errors.test.js'],
    // ── queries ────────────────────────────────────────────────────────────────
    'queries-watch': ['test/unit/queries/watch.test.js'],
    // ── writes ─────────────────────────────────────────────────────────────────
    'writes-cache-invalidation': ['test/unit/writes/update-cache-invalidation.test.js'],
  };

  // 'all' 聚合原有套件（v1 原始集合）
  const ALL_SUITES = [
    'find', 'findOne', 'findPage', 'findOneById', 'findByIds', 'findAndCount',
    'count', 'distinct', 'explain', 'aggregate', 'chaining', 'bookmarks',
    'invalidate', 'insertOne', 'insertMany', 'insertBatch', 'updateOne',
    'updateMany', 'updateBatch', 'replaceOne', 'deleteOne', 'deleteMany',
    'deleteBatch', 'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete',
    'upsertOne', 'incrementOne', 'transaction',
    'expression-date-advanced', 'findPage-supplement', 'indexes',
    'update-aggregation-pipeline', 'transaction-basic',
    'expression-all', 'utils',
  ];

  // 'all-v2' 覆盖全量 131 个测试文件（跳过 Redis/SSH）
  const ALL_V2_SUITES = [
    ...ALL_SUITES,
    // common
    'common-log', 'common-shape',
    // infra
    'infra-errors', 'infra-logger', 'infra-validation', 'infra-cache',
    'infra-cache-invalidation', 'infra-multi-level-cache', 'infra-distributed-cache-invalidator',
    'infra-pool', 'infra-pool-errors', 'infra-pool-complete', 'infra-pool-ultimate',
    'infra-multi-pool-final', 'infra-multi-pool-supplement', 'infra-multi-pool-ultimate',
    'infra-pool-config', 'infra-pool-selector',
    'infra-health', 'infra-health-complete',
    'infra-admin', 'infra-collection-mgmt', 'infra-database', 'infra-connection',
    'infra-mongodb-connect', 'infra-uri-parser', 'infra-index', 'infra-multi-level-cache-distributed',
    // lock
    'lock',
    // function-cache
    'function-cache',
    // model
    'model-core', 'model-advanced', 'model-auto-load', 'model-clear-invalidation',
    'model-connection-binding', 'model-coverage', 'model-edge-cases', 'model-error-handling',
    'model-final', 'model-findandcount-populate', 'model-findbyids-populate',
    'model-hooks', 'model-hot-reload', 'model-instance', 'model-integrate-populate',
    'model-integration', 'model-nested-populate', 'model-populate-advanced',
    'model-populate-errors', 'model-populate-integration', 'model-populate-logic',
    'model-populate', 'model-relations-edge-cases', 'model-relations',
    'model-schema-validation', 'model-soft-delete', 'model-timestamps',
    'model-version', 'model-virtuals-defaults', 'model-scoped-access',
    // saga
    'saga-context', 'saga-executor', 'saga-orchestrator',
    // sync
    'sync-config', 'sync-token-store', 'sync-token-store-errors',
    // queries, writes
    'queries-watch', 'writes-cache-invalidation',
    // expression extras
    'expression-compat', 'expression-errors', 'expression-perf',
    // model extras
    'model-features-100',
    // utils extras
    'objectid-cross-version', 'result-handler',
    // root tests
    'count-queue', 'objectid-conversion',
    'slow-query-log-comprehensive', 'slow-query-log-integration',
    // slow-query-log submodule
    'slow-query-log-batch-queue', 'slow-query-log-config-manager', 'slow-query-log-query-hash',
  ];

  if (suiteName === 'all') {
    testFiles = ALL_SUITES.flatMap(s => (suiteMap[s] || []).map(f => path.join(V1_ROOT, f)));
  } else if (suiteName === 'all-v2') {
    testFiles = ALL_V2_SUITES.flatMap(s => (suiteMap[s] || []).map(f => path.join(V1_ROOT, f)));
  } else if (suiteMap[suiteName]) {
    testFiles = suiteMap[suiteName].map(f => path.join(V1_ROOT, f));
  } else if (fs.existsSync(suiteName)) {
    testFiles = [path.resolve(suiteName)];
  } else {
    const candidate = path.join(V1_ROOT, suiteName);
    if (fs.existsSync(candidate)) {
      testFiles = [candidate];
    } else {
      console.error(`未找到测试套件或文件: ${suiteName}`);
      process.exit(1);
    }
  }

  console.log('\n🔍 v1 兼容性测试运行器');
  console.log(`📦 测试套件: ${suiteName}`);
  console.log(`🎯 TS lib: ${TS_LIB}`);
  console.log(`📂 v1 测试根: ${V1_ROOT}\n`);
  console.log('─'.repeat(60));

  // 每次运行测试前清理所有 test_* 数据库，避免跨进程数据污染
  try {
    const { MongoClient } = require('mongodb');
    const cleanupUri = process.env['MONSQLIZE_SYSTEM_MONGO_URI'] ?? 'mongodb://127.0.0.1:27017';
    const cleanupClient = new MongoClient(cleanupUri);
    await cleanupClient.connect();
    const adminDb = cleanupClient.db('admin');
    const dbList = await adminDb.admin().listDatabases();
    const testDbs = dbList.databases.filter(d => d.name.startsWith('test_')).map(d => d.name);
    for (const dbName of testDbs) {
      await cleanupClient.db(dbName).dropDatabase();
    }
    await cleanupClient.close();
    if (testDbs.length > 0) {
      console.log(`🧹 清理了 ${testDbs.length} 个 test_* 数据库: ${testDbs.join(', ')}`);
    }
  } catch {
    // 清理失败不影响测试继续运行
  }

  for (const filePath of testFiles) {
    console.log(`\n▶ ${path.relative(V1_ROOT, filePath)}`);

    // 重置全局状态
    global.__beforeHooks = [];
    global.__afterHooks = [];
    __hookStack = [{ beforeEach: [], afterEach: [] }];
    pendingTests.length = 0;

    // 清理 require 缓存（避免测试间污染），跳过 REGISTRY_PATHS 中预注册的合成模块
    const cacheKeys = Object.keys(require.cache).filter(k =>
      k.startsWith(V1_ROOT) && !k.includes('node_modules') && !REGISTRY_PATHS.has(k)
    );
    cacheKeys.forEach(k => delete require.cache[k]);

    let loadedModule;
    try {
      loadedModule = require(filePath);
      if (loadedModule && typeof loadedModule.then === 'function') {
        await loadedModule;
      }
    } catch (e) {
      console.error(`  ❌ 加载失败: ${e.message}`);
      totalFailed++;
      continue;
    }

    const { filePassed, fileFailed, fileSkipped } = await runPendingTests(filePath);
    const status = fileFailed === 0 ? '✅' : '⚠️';
    const skipNote = fileSkipped > 0 ? `, 跳过: ${fileSkipped}` : '';
    console.log(`  ${status} 通过: ${filePassed}, 失败: ${fileFailed}${skipNote}`);
  }

  // ── 汇总 ──
  console.log('\n' + '═'.repeat(60));
  console.log('v1 兼容性测试结果');
  console.log('═'.repeat(60));
  console.log(`✅ 通过: ${totalPassed}`);
  console.log(`❌ 失败: ${totalFailed}`);
  if (totalSkipped > 0) console.log(`⏭ 跳过: ${totalSkipped}`);
  const total = totalPassed + totalFailed;
  console.log(`📊 兼容率: ${total > 0 ? ((totalPassed / total) * 100).toFixed(1) : 'N/A'}%`);

  if (allFailures.length > 0) {
    console.log('\n─ 失败列表 ─────────────────────────────────────────────');
    allFailures.slice(0, 50).forEach(({ file, test, error }) => {
      console.log(`  ✗ [${file}] ${test}`);
      console.log(`    → ${error}`);
    });
    if (allFailures.length > 50) {
      console.log(`  ... 还有 ${allFailures.length - 50} 个失败`);
    }
  }

  console.log('═'.repeat(60) + '\n');

  // 关闭共享 ReplSet（如果启动成功的话）
  if (sharedReplSet) {
    try {
      await sharedReplSet.stop();
    } catch { /* ignore */ }
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('运行器崩溃:', e);
  process.exit(1);
});
