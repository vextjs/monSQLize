/**
 * 函数缓存单元测试
 * 测试 withCache 和 FunctionCache 的所有功能
 */

const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const { withCache, FunctionCache } = require('../../lib/function-cache');
const CacheFactory = require('../../lib/cache');

describe('函数缓存 (Function Cache)', () => {
    describe('withCache 装饰器', () => {
        describe('基础功能', () => {
            it('应该缓存函数返回值', async () => {
                let callCount = 0;
                async function testFn(x) {
                    callCount++;
                    return x * 2;
                }

                const cached = withCache(testFn, { ttl: 60000 });

                const result1 = await cached(5);
                const result2 = await cached(5);

                expect(result1).to.equal(10);
                expect(result2).to.equal(10);
                expect(callCount).to.equal(1); // 只调用一次
            });

            it('应该区分不同的参数', async () => {
                let callCount = 0;
                async function testFn(x) {
                    callCount++;
                    return x * 2;
                }

                const cached = withCache(testFn, { ttl: 60000 });

                await cached(5);
                await cached(10);

                expect(callCount).to.equal(2); // 不同参数调用两次
            });

            it('应该支持多个参数', async () => {
                let callCount = 0;
                async function testFn(a, b, c) {
                    callCount++;
                    return a + b + c;
                }

                const cached = withCache(testFn, { ttl: 60000 });

                const result1 = await cached(1, 2, 3);
                const result2 = await cached(1, 2, 3);

                expect(result1).to.equal(6);
                expect(result2).to.equal(6);
                expect(callCount).to.equal(1);
            });

            it('应该正确处理复杂对象参数', async () => {
                let callCount = 0;
                async function testFn(obj) {
                    callCount++;
                    return obj.x + obj.y;
                }

                const cached = withCache(testFn, { ttl: 60000 });

                // 相同内容的对象应该命中缓存（键排序）
                await cached({ x: 1, y: 2 });
                await cached({ y: 2, x: 1 }); // 键顺序不同但内容相同

                expect(callCount).to.equal(1);
            });

            it('应该正确处理数组参数', async () => {
                let callCount = 0;
                async function testFn(arr) {
                    callCount++;
                    return arr.reduce((a, b) => a + b, 0);
                }

                const cached = withCache(testFn, { ttl: 60000 });

                await cached([1, 2, 3]);
                await cached([1, 2, 3]);
                await cached([3, 2, 1]); // 顺序不同

                expect(callCount).to.equal(2); // 数组顺序不同，调用两次
            });
        });

        describe('TTL 过期', () => {
            it('应该在 TTL 过期后重新执行函数', async () => {
                let callCount = 0;
                async function testFn(x) {
                    callCount++;
                    return x * 2;
                }

                const cached = withCache(testFn, { ttl: 50 }); // 50ms TTL

                await cached(5);
                expect(callCount).to.equal(1);

                // 等待 TTL 过期
                await new Promise(resolve => setTimeout(resolve, 100));

                await cached(5);
                expect(callCount).to.equal(2); // TTL 过期，重新调用
            });

            it('应该在 TTL 内命中缓存', async () => {
                let callCount = 0;
                async function testFn(x) {
                    callCount++;
                    return x * 2;
                }

                const cached = withCache(testFn, { ttl: 200 });

                await cached(5);
                await new Promise(resolve => setTimeout(resolve, 50));
                await cached(5);

                expect(callCount).to.equal(1); // TTL 内，只调用一次
            });
        });

        describe('自定义键生成器', () => {
            it('应该使用自定义键生成器', async () => {
                let callCount = 0;
                async function testFn(userId, type) {
                    callCount++;
                    return { userId, type };
                }

                const cached = withCache(testFn, {
                    ttl: 60000,
                    keyBuilder: (userId, type) => `${userId}:${type}`
                });

                await cached('user1', 'profile');
                await cached('user1', 'profile');

                expect(callCount).to.equal(1);
            });

            it('应该处理键生成器错误', async () => {
                let callCount = 0;
                async function testFn(x) {
                    callCount++;
                    return x;
                }

                const cached = withCache(testFn, {
                    ttl: 60000,
                    keyBuilder: () => {
                        throw new Error('Key generation failed');
                    }
                });

                const result = await cached(5);
                expect(result).to.equal(5);
                expect(callCount).to.equal(1);
            });
        });

        describe('命名空间', () => {
            it('应该使用自定义命名空间隔离缓存', async () => {
                let count1 = 0;
                let count2 = 0;

                async function fn1(x) {
                    count1++;
                    return x;
                }

                async function fn2(x) {
                    count2++;
                    return x;
                }

                const cached1 = withCache(fn1, { namespace: 'ns1', ttl: 60000 });
                const cached2 = withCache(fn2, { namespace: 'ns2', ttl: 60000 });

                await cached1(5);
                await cached2(5);

                expect(count1).to.equal(1);
                expect(count2).to.equal(1); // 不同命名空间，各自调用一次
            });
        });

        describe('条件缓存', () => {
            it('应该只缓存符合条件的结果', async () => {
                let callCount = 0;
                async function testFn(x) {
                    callCount++;
                    return x > 0 ? x : null;
                }

                const cached = withCache(testFn, {
                    ttl: 60000,
                    condition: (result) => result !== null
                });

                await cached(5);
                await cached(5);
                expect(callCount).to.equal(1); // 结果非 null，被缓存

                await cached(-1);
                await cached(-1);
                expect(callCount).to.equal(3); // 结果为 null，不缓存
            });

            it('应该缓存空数组', async () => {
                let callCount = 0;
                async function testFn() {
                    callCount++;
                    return [];
                }

                const cached = withCache(testFn, {
                    ttl: 60000,
                    condition: (result) => Array.isArray(result)
                });

                await cached();
                await cached();

                expect(callCount).to.equal(1); // 空数组也被缓存
            });

            it('应该处理条件函数错误', async () => {
                let callCount = 0;
                async function testFn(x) {
                    callCount++;
                    return x;
                }

                const cached = withCache(testFn, {
                    ttl: 60000,
                    condition: () => {
                        throw new Error('Condition failed');
                    }
                });

                await cached(5);
                await cached(5);

                expect(callCount).to.equal(1); // 条件失败，默认缓存
            });
        });

        describe('并发控制', () => {
            it('应该防止缓存击穿（多个并发请求共享结果）', async () => {
                let callCount = 0;
                async function slowFn(x) {
                    callCount++;
                    await new Promise(resolve => setTimeout(resolve, 100));
                    return x * 2;
                }

                const cached = withCache(slowFn, { ttl: 60000 });

                // 并发调用
                const [result1, result2, result3] = await Promise.all([
                    cached(5),
                    cached(5),
                    cached(5)
                ]);

                expect(result1).to.equal(10);
                expect(result2).to.equal(10);
                expect(result3).to.equal(10);
                expect(callCount).to.equal(1); // 只调用一次
            });
        });

        describe('统计功能', () => {
            it('应该收集缓存统计信息', async () => {
                async function testFn(x) {
                    return x * 2;
                }

                const cached = withCache(testFn, { ttl: 60000, enableStats: true });

                await cached(5);
                await cached(5);
                await cached(10);

                const stats = cached.getCacheStats();

                expect(stats.hits).to.equal(1);
                expect(stats.misses).to.equal(2);
                expect(stats.calls).to.equal(3);
                expect(stats.hitRate).to.be.closeTo(0.333, 0.01);
            });

            it('应该支持禁用统计', async () => {
                async function testFn(x) {
                    return x * 2;
                }

                const cached = withCache(testFn, { ttl: 60000, enableStats: false });

                await cached(5);
                await cached(5);

                const stats = cached.getCacheStats();
                expect(stats.calls).to.equal(0); // 统计被禁用
            });
        });

        describe('错误处理', () => {
            it('应该抛出错误当函数执行失败', async () => {
                async function errorFn() {
                    throw new Error('Function failed');
                }

                const cached = withCache(errorFn, { ttl: 60000 });

                let error;
                try {
                    await cached();
                } catch (err) {
                    error = err;
                }

                expect(error).to.be.instanceOf(Error);
                expect(error.message).to.equal('Function failed');
            });

            it('应该处理缓存读取失败', async () => {
                let callCount = 0;
                async function testFn(x) {
                    callCount++;
                    return x;
                }

                const brokenCache = {
                    get: async () => {
                        throw new Error('Cache read failed');
                    },
                    set: async () => {},
                    del: async () => {},
                    exists: async () => false,
                    getMany: async () => ({}),
                    setMany: async () => true,
                    delMany: async () => 0,
                    delPattern: async () => 0,
                    clear: () => {},
                    keys: () => []
                };

                const cached = withCache(testFn, { cache: brokenCache, ttl: 60000 });

                const result = await cached(5);
                expect(result).to.equal(5);
                expect(callCount).to.equal(1);
            });

            it('应该处理缓存写入失败', async () => {
                let callCount = 0;
                async function testFn(x) {
                    callCount++;
                    return x;
                }

                const brokenCache = {
                    get: async () => undefined,
                    set: async () => {
                        throw new Error('Cache write failed');
                    },
                    del: async () => {},
                    exists: async () => false,
                    getMany: async () => ({}),
                    setMany: async () => true,
                    delMany: async () => 0,
                    delPattern: async () => 0,
                    clear: () => {},
                    keys: () => []
                };

                const cached = withCache(testFn, { cache: brokenCache, ttl: 60000 });

                const result = await cached(5);
                expect(result).to.equal(5);
                expect(callCount).to.equal(1);
            });
        });

        describe('参数验证', () => {
            it('应该验证 fn 参数', () => {
                expect(() => withCache(null, {})).to.throw('fn must be a function');
                expect(() => withCache('not a function', {})).to.throw('fn must be a function');
            });

            it('应该验证 ttl 参数', () => {
                async function testFn() {}
                expect(() => withCache(testFn, { ttl: -1 })).to.throw('ttl must be a non-negative number');
                expect(() => withCache(testFn, { ttl: 'invalid' })).to.throw('ttl must be a non-negative number');
            });

            it('应该验证 keyBuilder 参数', () => {
                async function testFn() {}
                expect(() => withCache(testFn, { keyBuilder: 'not a function' })).to.throw('keyBuilder must be a function');
            });

            it('应该验证 condition 参数', () => {
                async function testFn() {}
                expect(() => withCache(testFn, { condition: 'not a function' })).to.throw('condition must be a function');
            });

            it('应该验证缓存实例', () => {
                async function testFn() {}
                expect(() => withCache(testFn, { cache: { invalid: true } })).to.throw('Invalid cache instance');
            });
        });

        describe('特殊类型参数', () => {
            it('应该正确序列化 Date', async () => {
                let callCount = 0;
                async function testFn(date) {
                    callCount++;
                    return date.toISOString();
                }

                const cached = withCache(testFn, { ttl: 60000 });

                const date1 = new Date('2026-02-09T10:00:00.000Z');
                const date2 = new Date('2026-02-09T10:00:00.000Z');

                await cached(date1);
                await cached(date2);

                expect(callCount).to.equal(1); // 相同 Date，缓存命中
            });

            it('应该正确序列化 RegExp', async () => {
                let callCount = 0;
                async function testFn(regex) {
                    callCount++;
                    return regex.test('test');
                }

                const cached = withCache(testFn, { ttl: 60000 });

                await cached(/test/i);
                await cached(/test/i);

                expect(callCount).to.equal(1);
            });

            it('应该处理 undefined 和 null', async () => {
                let callCount = 0;
                async function testFn(x) {
                    callCount++;
                    return x;
                }

                const cached = withCache(testFn, { ttl: 60000 });

                // undefined 第一次调用
                await cached(undefined);
                await cached(undefined);  // 命中缓存
                expect(callCount).to.equal(1);

                // null 第一次调用（与 undefined 不同）
                await cached(null);
                await cached(null);  // 命中缓存
                expect(callCount).to.equal(2); // 2次不同的首次调用
            });
        });
    });

    describe('FunctionCache 类', () => {
        let fnCache;

        beforeEach(() => {
            const cache = CacheFactory.createDefault();
            fnCache = new FunctionCache({ getCache: () => cache }, {
                namespace: 'test',
                defaultTTL: 60000
            });
        });

        describe('基础功能', () => {
            it('应该注册和执行函数', async () => {
                let callCount = 0;
                async function testFn(x) {
                    callCount++;
                    return x * 2;
                }

                fnCache.register('test', testFn);

                const result1 = await fnCache.execute('test', 5);
                const result2 = await fnCache.execute('test', 5);

                expect(result1).to.equal(10);
                expect(result2).to.equal(10);
                expect(callCount).to.equal(1);
            });

            it('应该列出所有已注册的函数', () => {
                async function fn1() {}
                async function fn2() {}

                fnCache.register('fn1', fn1);
                fnCache.register('fn2', fn2);

                const list = fnCache.list();
                expect(list).to.deep.equal(['fn1', 'fn2']);
            });

            it('应该清空所有函数', () => {
                async function fn1() {}
                fnCache.register('fn1', fn1);

                fnCache.clear();

                const list = fnCache.list();
                expect(list).to.deep.equal([]);
            });
        });

        describe('缓存失效', () => {
            it('应该失效特定参数的缓存', async () => {
                let callCount = 0;
                async function testFn(x) {
                    callCount++;
                    return x * 2;
                }

                fnCache.register('test', testFn);

                await fnCache.execute('test', 5);
                await fnCache.invalidate('test', 5);
                await fnCache.execute('test', 5);

                expect(callCount).to.equal(2); // 失效后重新调用
            });

            it('应该批量失效缓存', async () => {
                let count1 = 0;
                let count2 = 0;

                async function fn1(x) {
                    count1++;
                    return x;
                }
                async function fn2(x) {
                    count2++;
                    return x;
                }

                fnCache.register('fn1', fn1);
                fnCache.register('fn2', fn2);

                await fnCache.execute('fn1', 5);
                await fnCache.execute('fn2', 5);

                await fnCache.invalidatePattern('*');

                await fnCache.execute('fn1', 5);
                await fnCache.execute('fn2', 5);

                expect(count1).to.equal(2);
                expect(count2).to.equal(2);
            });
        });

        describe('统计功能', () => {
            it('应该收集统计信息', async () => {
                async function testFn(x) {
                    return x;
                }

                fnCache.register('test', testFn);

                await fnCache.execute('test', 5);
                await fnCache.execute('test', 5);
                await fnCache.execute('test', 10);

                const stats = fnCache.getStats('test');
                expect(stats).to.not.be.null;
                expect(stats.calls).to.equal(3);
            });

            it('应该返回所有函数的统计信息', async () => {
                async function fn1() {}
                async function fn2() {}

                fnCache.register('fn1', fn1);
                fnCache.register('fn2', fn2);

                await fnCache.execute('fn1');
                await fnCache.execute('fn2');

                const allStats = fnCache.getStats();
                expect(allStats).to.have.keys(['fn1', 'fn2']);
            });

            it('应该重置统计信息', async () => {
                async function testFn() {
                    return 1;
                }

                fnCache.register('test', testFn);
                await fnCache.execute('test');

                fnCache.resetStats('test');

                const stats = fnCache.getStats('test');
                expect(stats.calls).to.equal(0);
            });

            it('应该重置所有统计信息', async () => {
                async function fn1() {}
                async function fn2() {}

                fnCache.register('fn1', fn1);
                fnCache.register('fn2', fn2);

                await fnCache.execute('fn1');
                await fnCache.execute('fn2');

                fnCache.resetStats();

                const stats1 = fnCache.getStats('fn1');
                const stats2 = fnCache.getStats('fn2');

                expect(stats1.calls).to.equal(0);
                expect(stats2.calls).to.equal(0);
            });
        });

        describe('错误处理', () => {
            it('应该抛出错误当函数未注册', async () => {
                let error;
                try {
                    await fnCache.execute('notExists');
                } catch (err) {
                    error = err;
                }

                expect(error).to.be.instanceOf(Error);
                expect(error.message).to.include('not registered');
            });

            it('应该抛出错误当失效未注册的函数', async () => {
                let error;
                try {
                    await fnCache.invalidate('notExists');
                } catch (err) {
                    error = err;
                }

                expect(error).to.be.instanceOf(Error);
                expect(error.message).to.include('not registered');
            });
        });

        describe('参数验证', () => {
            it('应该验证构造函数参数', () => {
                expect(() => new FunctionCache(null, 'invalid')).to.throw('options must be an object');
            });

            it('应该验证 register 参数', () => {
                expect(() => fnCache.register('', async () => {})).to.throw('Function name must be a non-empty string');
                expect(() => fnCache.register('test', 'not a function')).to.throw('fn must be a function');
                expect(() => fnCache.register('test', async () => {}, 'invalid')).to.throw('options must be an object');
            });

            it('应该验证 invalidate 参数', async () => {
                let error;
                try {
                    await fnCache.invalidate('');
                } catch (err) {
                    error = err;
                }
                expect(error).to.be.instanceOf(Error);
                expect(error.message).to.include('Function name must be a non-empty string');
            });

            it('应该验证 invalidatePattern 参数', async () => {
                let error;
                try {
                    await fnCache.invalidatePattern('');
                } catch (err) {
                    error = err;
                }
                expect(error).to.be.instanceOf(Error);
                expect(error.message).to.include('Pattern must be a non-empty string');
            });

            it('应该验证 namespace', () => {
                const cache = CacheFactory.createDefault();
                expect(() => new FunctionCache({ getCache: () => cache }, {
                    namespace: 123
                })).to.throw('namespace must be a string');
            });

            it('应该验证 defaultTTL', () => {
                const cache = CacheFactory.createDefault();
                expect(() => new FunctionCache({ getCache: () => cache }, {
                    defaultTTL: -1
                })).to.throw('defaultTTL must be a non-negative number');
            });
        });

        describe('配置选项', () => {
            it('应该使用自定义命名空间', async () => {
                const cache = CacheFactory.createDefault();
                const fc1 = new FunctionCache({ getCache: () => cache }, {
                    namespace: 'app1'
                });
                const fc2 = new FunctionCache({ getCache: () => cache }, {
                    namespace: 'app2'
                });

                let count1 = 0;
                let count2 = 0;

                fc1.register('test', async () => { count1++; return 1; });
                fc2.register('test', async () => { count2++; return 2; });

                await fc1.execute('test');
                await fc2.execute('test');

                expect(count1).to.equal(1);
                expect(count2).to.equal(1);
            });

            it('应该使用自定义 defaultTTL', async () => {
                const cache = CacheFactory.createDefault();
                const fc = new FunctionCache({ getCache: () => cache }, {
                    defaultTTL: 100
                });

                let callCount = 0;
                fc.register('test', async () => {
                    callCount++;
                    return 1;
                });

                await fc.execute('test');
                await new Promise(resolve => setTimeout(resolve, 150));
                await fc.execute('test');

                expect(callCount).to.equal(2); // TTL 过期
            });

            it('应该支持禁用统计', async () => {
                const cache = CacheFactory.createDefault();
                const fc = new FunctionCache({ getCache: () => cache }, {
                    enableStats: false
                });

                fc.register('test', async () => 1);
                await fc.execute('test');

                const stats = fc.getStats('test');
                expect(stats).to.be.null;
            });
        });
    });
});

