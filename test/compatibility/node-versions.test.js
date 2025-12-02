/**
 * Node.js 版本兼容性测试
 * 测试 monSQLize 在不同 Node.js 版本上的功能
 *
 * 运行方式: node test/compatibility/run-node-test.js
 */

const versionAdapter = require('../utils/version-adapter');
const assert = require('assert');

describe('Node.js 版本兼容性测试', function() {
  this.timeout(10000);

  before(async function() {
    const report = versionAdapter.generateReport();
    console.log('\n📊 当前测试环境:');
    console.log(`  Node.js: ${report.node.version} (主版本: ${report.node.major})`);
    console.log(`  MongoDB Driver: ${report.mongodbDriver.version}`);
    console.log('\n✨ 支持的特性:');
    console.log(`  Worker Threads: ${report.node.features.workerThreads ? '✅' : '❌'}`);
    console.log(`  Performance.now(): ${report.node.features.performanceNow ? '✅' : '❌'}`);
    console.log(`  Promise.allSettled: ${report.node.features.promiseAllSettled ? '✅' : '❌'}`);
    console.log('');
  });

  describe('基础 JavaScript 特性', function() {
    it('应该支持 async/await', async function() {
      const result = await new Promise(resolve => {
        setTimeout(() => resolve('success'), 10);
      });
      assert.strictEqual(result, 'success');
    });

    it('应该支持 Promise.all', async function() {
      const promises = [
        Promise.resolve(1),
        Promise.resolve(2),
        Promise.resolve(3),
      ];
      const results = await Promise.all(promises);
      assert.deepStrictEqual(results, [1, 2, 3]);
    });

    it('应该支持 Promise.allSettled（Node.js 12.9+）', async function() {
      if (!versionAdapter.supportsPromiseAllSettled()) {
        this.skip();
        return;
      }

      const promises = [
        Promise.resolve(1),
        Promise.reject(new Error('test')),
        Promise.resolve(3),
      ];

      const results = await Promise.allSettled(promises);
      assert.strictEqual(results.length, 3);
      assert.strictEqual(results[0].status, 'fulfilled');
      assert.strictEqual(results[1].status, 'rejected');
      assert.strictEqual(results[2].status, 'fulfilled');
    });

    it('应该支持解构赋值', function() {
      const obj = { a: 1, b: 2, c: 3 };
      const { a, b, ...rest } = obj;
      assert.strictEqual(a, 1);
      assert.strictEqual(b, 2);
      assert.deepStrictEqual(rest, { c: 3 });
    });

    it('应该支持可选链操作符（Node.js 14+）', function() {
      const obj = { a: { b: { c: 42 } } };
      assert.strictEqual(obj?.a?.b?.c, 42);
      assert.strictEqual(obj?.x?.y?.z, undefined);
    });

    it('应该支持空值合并操作符（Node.js 14+）', function() {
      const value1 = null ?? 'default';
      const value2 = undefined ?? 'default';
      const value3 = 0 ?? 'default';
      const value4 = '' ?? 'default';

      assert.strictEqual(value1, 'default');
      assert.strictEqual(value2, 'default');
      assert.strictEqual(value3, 0);
      assert.strictEqual(value4, '');
    });
  });

  describe('Buffer API 兼容性', function() {
    it('应该支持 Buffer.from', function() {
      const buf = Buffer.from('hello', 'utf8');
      assert.ok(Buffer.isBuffer(buf));
      assert.strictEqual(buf.toString('utf8'), 'hello');
    });

    it('应该支持 Buffer.alloc', function() {
      const buf = Buffer.alloc(10);
      assert.ok(Buffer.isBuffer(buf));
      assert.strictEqual(buf.length, 10);
      // 应该被初始化为 0
      assert.strictEqual(buf[0], 0);
    });

    it('应该支持 Buffer.concat', function() {
      const buf1 = Buffer.from('hello');
      const buf2 = Buffer.from(' world');
      const result = Buffer.concat([buf1, buf2]);
      assert.strictEqual(result.toString(), 'hello world');
    });
  });

  describe('Stream API 兼容性', function() {
    it('应该支持 Readable Stream', function(done) {
      const { Readable } = require('stream');
      const chunks = [];

      const readable = new Readable({
        read() {
          this.push('chunk1');
          this.push('chunk2');
          this.push(null);
        }
      });

      readable.on('data', chunk => {
        chunks.push(chunk.toString());
      });

      readable.on('end', () => {
        assert.deepStrictEqual(chunks, ['chunk1', 'chunk2']);
        done();
      });
    });

    it('应该支持 pipeline（Node.js 10+）', function(done) {
      const { pipeline, Readable, Writable } = require('stream');
      const chunks = [];

      const readable = new Readable({
        read() {
          this.push('data');
          this.push(null);
        }
      });

      const writable = new Writable({
        write(chunk, encoding, callback) {
          chunks.push(chunk.toString());
          callback();
        }
      });

      pipeline(readable, writable, (err) => {
        if (err) {
          done(err);
        } else {
          assert.deepStrictEqual(chunks, ['data']);
          done();
        }
      });
    });
  });

  describe('性能计时 API', function() {
    it('应该支持 process.hrtime', function() {
      const start = process.hrtime();
      // 模拟一些操作
      let sum = 0;
      for (let i = 0; i < 1000; i++) {
        sum += i;
      }
      const diff = process.hrtime(start);
      assert.ok(Array.isArray(diff));
      assert.strictEqual(diff.length, 2);
      assert.ok(diff[0] >= 0); // 秒
      assert.ok(diff[1] >= 0); // 纳秒
    });

    it('应该支持 performance.now（Node.js 8.5+）', function() {
      if (!versionAdapter.supportsPerformanceNow()) {
        this.skip();
        return;
      }

      const { performance } = require('perf_hooks');
      const start = performance.now();
      // 模拟一些操作
      let sum = 0;
      for (let i = 0; i < 1000; i++) {
        sum += i;
      }
      const end = performance.now();
      const duration = end - start;

      assert.ok(typeof duration === 'number');
      assert.ok(duration >= 0);
    });
  });

  describe('Worker Threads（Node.js 16+）', function() {
    it('应该支持 Worker Threads API', function() {
      if (!versionAdapter.supportsWorkerThreads()) {
        console.log('  ⏭️  跳过: Worker Threads 需要 Node.js 16+');
        this.skip();
        return;
      }

      const { Worker } = require('worker_threads');
      assert.ok(typeof Worker === 'function');
    });
  });

  describe('其他 Node.js 特性', function() {
    it('应该支持 util.promisify', async function() {
      const util = require('util');
      const fs = require('fs');
      const readdir = util.promisify(fs.readdir);

      const files = await readdir('.');
      assert.ok(Array.isArray(files));
    });

    it('应该支持 fs.promises', async function() {
      const fs = require('fs').promises;
      const files = await fs.readdir('.');
      assert.ok(Array.isArray(files));
    });
  });
});


