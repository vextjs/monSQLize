/**
 * 批量队列管理器
 * 用于批量写入慢查询日志，优化性能
 *
 * @version 1.3.0
 * @since 2025-12-22
 */

class BatchQueue {
  /**
   * 创建批量队列
   * @param {Object} storage - 存储适配器实例
   * @param {Object} options - 队列配置
   * @param {number} [options.batchSize=10] - 批量大小
   * @param {number} [options.flushInterval=5000] - 刷新间隔（毫秒）
   * @param {number} [options.maxBufferSize=100] - 最大缓冲区大小
   * @param {Object} [logger] - 日志记录器
   */
  constructor(storage, options = {}, logger) {
    this.storage = storage;
    this.buffer = [];
    this.batchSize = options.batchSize || 10;
    this.flushInterval = options.flushInterval || 5000;
    this.maxBufferSize = options.maxBufferSize || 100;
    this.timer = null;
    this.flushing = false;
    this.logger = logger || console;
  }

  /**
   * 添加日志到队列
   * @param {Object} log - 慢查询日志对象
   * @returns {Promise<void>}
   */
  async add(log) {
    this.buffer.push(log);

    // 防止内存溢出：达到最大缓冲区，立即刷新
    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
      return;
    }

    // 达到批量大小，立即刷新
    if (this.buffer.length >= this.batchSize) {
      await this.flush();
    } else if (!this.timer) {
      // 启动定时器（防止数据积压）
      this.timer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  /**
   * 刷新队列（批量写入）
   * @returns {Promise<void>}
   */
  async flush() {
    // 防止并发刷新
    if (this.flushing || this.buffer.length === 0) {
      return;
    }

    this.flushing = true;
    const logs = this.buffer.splice(0);  // 清空缓冲区
    clearTimeout(this.timer);
    this.timer = null;

    try {
      // 批量写入
      await this.storage.saveBatch(logs);
      if (this.logger.debug) {
        this.logger.debug(`[SlowQueryLog] Batch flushed: ${logs.length} logs`);
      }
    } catch (err) {
      // ⚠️ 失败不阻塞主流程，仅记录错误
      if (this.logger.error) {
        this.logger.error('[SlowQueryLog] Failed to save slow query logs batch:', err);
      }
    } finally {
      this.flushing = false;
    }
  }

  /**
   * 关闭队列（确保数据不丢失）
   * @returns {Promise<void>}
   */
  async close() {
    clearTimeout(this.timer);
    this.timer = null;
    await this.flush();  // 最后刷新一次
  }
}

module.exports = { BatchQueue };


