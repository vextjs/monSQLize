/**
 * 批量队列管理器 - 单元测试
 * @version 1.3.0
 * @since 2025-12-22
 */

const { BatchQueue } = require('../../lib/slow-query-log/batch-queue');

// Mock存储适配器
class MockStorage {
  constructor() {
    this.savedLogs = [];
    this.saveBatchCalls = 0;
  }

  async saveBatch(logs) {
    this.saveBatchCalls++;
    this.savedLogs.push(...logs);
    return { success: true, count: logs.length };
  }
}

// Mock Logger
const mockLogger = {
  debug: jest.fn(),
  error: jest.fn()
};

describe('BatchQueue', () => {
  let storage;
  let queue;

  beforeEach(() => {
    storage = new MockStorage();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (queue) {
      await queue.close();
      queue = null;
    }
  });

  describe('基本功能', () => {
    test('创建队列实例', () => {
      queue = new BatchQueue(storage, {}, mockLogger);

      expect(queue.storage).toBe(storage);
      expect(queue.buffer).toEqual([]);
      expect(queue.batchSize).toBe(10);
      expect(queue.flushInterval).toBe(5000);
    });

    test('自定义配置', () => {
      queue = new BatchQueue(storage, {
        batchSize: 20,
        flushInterval: 3000,
        maxBufferSize: 200
      }, mockLogger);

      expect(queue.batchSize).toBe(20);
      expect(queue.flushInterval).toBe(3000);
      expect(queue.maxBufferSize).toBe(200);
    });
  });

  describe('批量大小触发', () => {
    test('达到批量大小立即刷新', async () => {
      queue = new BatchQueue(storage, { batchSize: 5 }, mockLogger);

      // 添加5条日志（达到批量大小）
      for (let i = 0; i < 5; i++) {
        await queue.add({ id: i, message: `log ${i}` });
      }

      // 验证已刷新
      expect(storage.saveBatchCalls).toBe(1);
      expect(storage.savedLogs.length).toBe(5);
      expect(queue.buffer.length).toBe(0);
    });

    test('未达到批量大小不刷新', async () => {
      queue = new BatchQueue(storage, { batchSize: 10 }, mockLogger);

      // 添加3条日志（未达到批量大小）
      for (let i = 0; i < 3; i++) {
        await queue.add({ id: i, message: `log ${i}` });
      }

      // 验证未刷新
      expect(storage.saveBatchCalls).toBe(0);
      expect(queue.buffer.length).toBe(3);
    });

    test('多次达到批量大小', async () => {
      queue = new BatchQueue(storage, { batchSize: 5 }, mockLogger);

      // 添加12条日志（触发2次刷新）
      for (let i = 0; i < 12; i++) {
        await queue.add({ id: i, message: `log ${i}` });
      }

      // 验证刷新2次，剩余2条
      expect(storage.saveBatchCalls).toBe(2);
      expect(storage.savedLogs.length).toBe(10);
      expect(queue.buffer.length).toBe(2);
    });
  });

  describe('定时刷新', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('定时刷新触发', async () => {
      queue = new BatchQueue(storage, { batchSize: 10, flushInterval: 5000 }, mockLogger);

      // 添加3条日志（未达到批量大小）
      await queue.add({ id: 1 });
      await queue.add({ id: 2 });
      await queue.add({ id: 3 });

      expect(storage.saveBatchCalls).toBe(0);

      // 快进5秒
      jest.advanceTimersByTime(5000);

      // 等待异步操作完成
      await new Promise(resolve => setImmediate(resolve));

      // 验证已刷新
      expect(storage.saveBatchCalls).toBe(1);
      expect(storage.savedLogs.length).toBe(3);
    });

    test('刷新后定时器清除', async () => {
      queue = new BatchQueue(storage, { batchSize: 5, flushInterval: 5000 }, mockLogger);

      // 添加3条日志（启动定时器）
      await queue.add({ id: 1 });
      await queue.add({ id: 2 });
      await queue.add({ id: 3 });

      // 添加2条日志（达到批量大小，触发刷新）
      await queue.add({ id: 4 });
      await queue.add({ id: 5 });

      expect(storage.saveBatchCalls).toBe(1);
      expect(queue.timer).toBe(null);
    });
  });

  describe('最大缓冲区限制', () => {
    test('达到最大缓冲区立即刷新', async () => {
      queue = new BatchQueue(storage, {
        batchSize: 20,
        maxBufferSize: 10
      }, mockLogger);

      // 添加10条日志（达到最大缓冲区）
      for (let i = 0; i < 10; i++) {
        await queue.add({ id: i });
      }

      // 验证已刷新
      expect(storage.saveBatchCalls).toBe(1);
      expect(storage.savedLogs.length).toBe(10);
      expect(queue.buffer.length).toBe(0);
    });

    test('超过最大缓冲区分批刷新', async () => {
      queue = new BatchQueue(storage, {
        batchSize: 20,
        maxBufferSize: 10
      }, mockLogger);

      // 添加25条日志
      for (let i = 0; i < 25; i++) {
        await queue.add({ id: i });
      }

      // 验证刷新3次：10+10+5
      expect(storage.saveBatchCalls).toBeGreaterThanOrEqual(2);
      expect(queue.buffer.length).toBeLessThanOrEqual(10);
    });
  });

  describe('flush方法', () => {
    test('空队列刷新不报错', async () => {
      queue = new BatchQueue(storage, {}, mockLogger);

      await queue.flush();

      expect(storage.saveBatchCalls).toBe(0);
    });

    test('手动刷新清空缓冲区', async () => {
      queue = new BatchQueue(storage, { batchSize: 10 }, mockLogger);

      await queue.add({ id: 1 });
      await queue.add({ id: 2 });
      await queue.add({ id: 3 });

      expect(queue.buffer.length).toBe(3);

      await queue.flush();

      expect(storage.saveBatchCalls).toBe(1);
      expect(queue.buffer.length).toBe(0);
    });

    test('防止并发刷新', async () => {
      queue = new BatchQueue(storage, {}, mockLogger);

      await queue.add({ id: 1 });
      await queue.add({ id: 2 });

      // 同时调用flush两次
      const promise1 = queue.flush();
      const promise2 = queue.flush();

      await Promise.all([promise1, promise2]);

      // 只刷新一次
      expect(storage.saveBatchCalls).toBe(1);
    });
  });

  describe('close方法', () => {
    test('close确保缓冲区刷新', async () => {
      queue = new BatchQueue(storage, { batchSize: 10 }, mockLogger);

      await queue.add({ id: 1 });
      await queue.add({ id: 2 });
      await queue.add({ id: 3 });

      await queue.close();

      expect(storage.saveBatchCalls).toBe(1);
      expect(storage.savedLogs.length).toBe(3);
    });

    test('close清除定时器', async () => {
      jest.useFakeTimers();

      queue = new BatchQueue(storage, { batchSize: 10, flushInterval: 5000 }, mockLogger);

      await queue.add({ id: 1 });

      expect(queue.timer).not.toBe(null);

      await queue.close();

      expect(queue.timer).toBe(null);

      jest.useRealTimers();
    });

    test('close后不再刷新', async () => {
      jest.useFakeTimers();

      queue = new BatchQueue(storage, { batchSize: 10, flushInterval: 5000 }, mockLogger);

      await queue.add({ id: 1 });
      await queue.close();

      // 快进5秒
      jest.advanceTimersByTime(5000);

      // 只刷新一次（close时）
      expect(storage.saveBatchCalls).toBe(1);

      jest.useRealTimers();
    });
  });

  describe('错误处理', () => {
    test('存储失败不抛异常', async () => {
      const errorStorage = {
        async saveBatch() {
          throw new Error('Storage error');
        }
      };

      queue = new BatchQueue(errorStorage, { batchSize: 2 }, mockLogger);

      await expect(queue.add({ id: 1 })).resolves.not.toThrow();
      await expect(queue.add({ id: 2 })).resolves.not.toThrow();

      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('存储失败后继续工作', async () => {
      let failCount = 0;
      const flakyStorage = {
        async saveBatch(logs) {
          failCount++;
          if (failCount === 1) {
            throw new Error('First call fails');
          }
          return { success: true, count: logs.length };
        }
      };

      queue = new BatchQueue(flakyStorage, { batchSize: 2 }, mockLogger);

      // 第一批失败
      await queue.add({ id: 1 });
      await queue.add({ id: 2 });

      expect(mockLogger.error).toHaveBeenCalled();

      // 第二批成功
      await queue.add({ id: 3 });
      await queue.add({ id: 4 });

      expect(failCount).toBe(2);
    });
  });

  describe('性能测试', () => {
    test('添加1000条日志性能', async () => {
      queue = new BatchQueue(storage, { batchSize: 100 }, mockLogger);

      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        await queue.add({ id: i, data: `log ${i}` });
      }

      const duration = Date.now() - startTime;

      // 1000条日志应该在1秒内完成
      expect(duration).toBeLessThan(1000);
      expect(storage.saveBatchCalls).toBe(10);
      expect(storage.savedLogs.length).toBe(1000);
    });
  });
});

