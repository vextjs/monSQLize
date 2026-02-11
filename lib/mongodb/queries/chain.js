/**
 * 链式调用构建器
 * @description 提供 MongoDB 风格的链式调用 API，最终执行时会合并所有选项并利用缓存
 */

const { createErrorMessage } = require('../../common/docs-urls');
const { convertObjectIdStrings, convertAggregationPipeline } = require('../../utils/objectid-converter');

/**
 * FindChain 类 - find 查询的链式调用构建器
 */
class FindChain {
    /**
     * 创建 FindChain 实例
     * @param {Object} context - 上下文对象
     * @param {Object} context.collection - MongoDB 集合实例
     * @param {Object} context.defaults - 默认配置
     * @param {Function} context.run - 缓存执行器
     * @param {string} context.instanceId - 实例ID
     * @param {string} context.effectiveDbName - 数据库名
     * @param {Object} context.logger - 日志器
     * @param {Function} context.emit - 事件发射器
     * @param {Object} context.mongoSlowLogShaper - 慢查询日志格式化器
     * @param {Object} query - 查询条件
     * @param {Object} initialOptions - 初始查询选项
     */
    constructor(context, query = {}, initialOptions = {}) {
        this._context = context;
        // ✅ v1.3.0: 自动转换 ObjectId 字符串
        this._query = convertObjectIdStrings(query, 'filter', 0, new WeakSet(), {
            logger: context.logger,
            excludeFields: context.autoConvertConfig?.excludeFields,
            customFieldPatterns: context.autoConvertConfig?.customFieldPatterns,
            maxDepth: context.autoConvertConfig?.maxDepth
        });
        this._options = { ...initialOptions };
        this._executed = false;
    }

    /**
     * 设置返回文档数量限制
     * @param {number} value - 限制数量
     * @returns {FindChain} 返回自身以支持链式调用
     */
    limit(value) {
        if (this._executed) {
            throw new Error(createErrorMessage(
                'Cannot call .limit() after query execution.\n' +
                'Tip: Create a new chain for another query:\n' +
                "  const results = await collection('products').find({}).limit(10);",
                'chaining.limit'
            ));
        }
        if (typeof value !== 'number' || value < 0) {
            throw new Error(createErrorMessage(
                `limit() requires a non-negative number, got: ${typeof value} (${value})\n` +
                'Usage: .limit(10)',
                'chaining.limit'
            ));
        }
        this._options.limit = value;
        return this;
    }

    /**
     * 设置跳过的文档数量
     * @param {number} value - 跳过数量
     * @returns {FindChain} 返回自身以支持链式调用
     */
    skip(value) {
        if (this._executed) {
            throw new Error(createErrorMessage(
                'Cannot call .skip() after query execution.\n' +
                'Tip: Create a new chain for another query.',
                'chaining.skip'
            ));
        }
        if (typeof value !== 'number' || value < 0) {
            throw new Error(createErrorMessage(
                `skip() requires a non-negative number, got: ${typeof value} (${value})\n` +
                'Usage: .skip(10)',
                'chaining.skip'
            ));
        }
        this._options.skip = value;
        return this;
    }

    /**
     * 设置排序规则
     * @param {Object|Array} value - 排序配置，如 { field: 1 } 或 [['field', 1]]
     * @returns {FindChain} 返回自身以支持链式调用
     */
    sort(value) {
        if (this._executed) {
            throw new Error(createErrorMessage(
                'Cannot call .sort() after query execution.',
                'chaining.sort'
            ));
        }
        if (!value || (typeof value !== 'object')) {
            throw new Error(createErrorMessage(
                `sort() requires an object or array, got: ${typeof value}\n` +
                'Usage: .sort({ price: -1, name: 1 })\n' +
                'Note: Use 1 for ascending, -1 for descending',
                'chaining.sort'
            ));
        }
        this._options.sort = value;
        return this;
    }

    /**
     * 设置字段投影
     * @param {Object|Array} value - 投影配置
     * @returns {FindChain} 返回自身以支持链式调用
     */
    project(value) {
        if (this._executed) {
            throw new Error(createErrorMessage(
                'Cannot call .project() after query execution.',
                'chaining.project'
            ));
        }
        if (!value || typeof value !== 'object') {
            throw new Error(createErrorMessage(
                `project() requires an object or array, got: ${typeof value}\n` +
                'Usage: .project({ name: 1, price: 1 })',
                'chaining.project'
            ));
        }
        this._options.projection = value;
        return this;
    }

    /**
     * 设置索引提示
     * @param {Object|string} value - 索引名称或索引规格
     * @returns {FindChain} 返回自身以支持链式调用
     */
    hint(value) {
        if (this._executed) {
            throw new Error(createErrorMessage(
                'Cannot call .hint() after query execution.',
                'chaining.hint'
            ));
        }
        if (!value) {
            throw new Error(createErrorMessage(
                'hint() requires an index name or specification\n' +
                'Usage: .hint({ category: 1, price: -1 }) or .hint(\'category_1_price_-1\')',
                'chaining.hint'
            ));
        }
        this._options.hint = value;
        return this;
    }

    /**
     * 设置排序规则
     * @param {Object} value - 排序规则配置
     * @returns {FindChain} 返回自身以支持链式调用
     */
    collation(value) {
        if (this._executed) {
            throw new Error(createErrorMessage(
                'Cannot call .collation() after query execution.',
                'chaining.collation'
            ));
        }
        if (!value || typeof value !== 'object') {
            throw new Error(createErrorMessage(
                `collation() requires an object, got: ${typeof value}\n` +
                'Usage: .collation({ locale: \'zh\', strength: 2 })',
                'chaining.collation'
            ));
        }
        this._options.collation = value;
        return this;
    }

    /**
     * 设置查询注释
     * @param {string} value - 注释内容
     * @returns {FindChain} 返回自身以支持链式调用
     */
    comment(value) {
        if (this._executed) {
            throw new Error(createErrorMessage(
                'Cannot call .comment() after query execution.',
                'chaining.comment'
            ));
        }
        if (typeof value !== 'string') {
            throw new Error(createErrorMessage(
                `comment() requires a string, got: ${typeof value}\n` +
                'Usage: .comment(\'UserAPI:getProducts:user_123\')',
                'chaining.comment'
            ));
        }
        this._options.comment = value;
        return this;
    }

    /**
     * 设置查询超时时间
     * @param {number} value - 超时时间（毫秒）
     * @returns {FindChain} 返回自身以支持链式调用
     */
    maxTimeMS(value) {
        if (this._executed) {
            throw new Error(createErrorMessage(
                'Cannot call .maxTimeMS() after query execution.',
                'chaining.maxTimeMS'
            ));
        }
        if (typeof value !== 'number' || value < 0) {
            throw new Error(createErrorMessage(
                `maxTimeMS() requires a non-negative number, got: ${typeof value} (${value})\n` +
                'Usage: .maxTimeMS(5000) // 5 seconds',
                'chaining.maxTimeMS'
            ));
        }
        this._options.maxTimeMS = value;
        return this;
    }

    /**
     * 设置批处理大小
     * @param {number} value - 批处理大小
     * @returns {FindChain} 返回自身以支持链式调用
     */
    batchSize(value) {
        if (this._executed) {
            throw new Error(createErrorMessage(
                'Cannot call .batchSize() after query execution.',
                'chaining.batchSize'
            ));
        }
        if (typeof value !== 'number' || value < 0) {
            throw new Error(createErrorMessage(
                `batchSize() requires a non-negative number, got: ${typeof value} (${value})\n` +
                'Usage: .batchSize(1000)',
                'chaining.batchSize'
            ));
        }
        this._options.batchSize = value;
        return this;
    }

    /**
     * 返回查询执行计划
     * @param {string} [verbosity='queryPlanner'] - 详细级别
     * @returns {Promise<Object>} 执行计划
     */
    async explain(verbosity = 'queryPlanner') {
        const { normalizeProjection, normalizeSort } = require('../../common/normalize');
        const { collection, defaults } = this._context;

        // 标准化选项
        const projection = normalizeProjection(this._options.projection);
        const sort = normalizeSort(this._options.sort);
        const limit = this._options.limit !== undefined ? this._options.limit : defaults.findLimit;
        const skip = this._options.skip;
        const maxTimeMS = this._options.maxTimeMS !== undefined ? this._options.maxTimeMS : defaults.maxTimeMS;

        const driverOpts = { projection, sort, skip, maxTimeMS };
        if (this._options.hint) driverOpts.hint = this._options.hint;
        if (this._options.collation) driverOpts.collation = this._options.collation;
        if (limit !== undefined) driverOpts.limit = limit;
        if (this._options.batchSize !== undefined) driverOpts.batchSize = this._options.batchSize;
        if (this._options.comment) driverOpts.comment = this._options.comment;

        const cursor = collection.find(this._query, driverOpts);
        return cursor.explain(verbosity);
    }

    /**
     * 返回流式结果
     * @returns {ReadableStream} MongoDB 游标流
     */
    stream() {
        const { normalizeProjection, normalizeSort } = require('../../common/normalize');
        const { collection, defaults } = this._context;

        // 标准化选项
        const projection = normalizeProjection(this._options.projection);
        const sort = normalizeSort(this._options.sort);
        const limit = this._options.limit !== undefined ? this._options.limit : defaults.findLimit;
        const skip = this._options.skip;
        const maxTimeMS = this._options.maxTimeMS !== undefined ? this._options.maxTimeMS : defaults.maxTimeMS;

        const driverOpts = { projection, sort, skip, maxTimeMS };
        if (this._options.hint) driverOpts.hint = this._options.hint;
        if (this._options.collation) driverOpts.collation = this._options.collation;
        if (limit !== undefined) driverOpts.limit = limit;
        if (this._options.batchSize !== undefined) driverOpts.batchSize = this._options.batchSize;
        if (this._options.comment) driverOpts.comment = this._options.comment;

        const cursor = collection.find(this._query, driverOpts);
        return cursor.stream();
    }

    /**
     * 执行查询并返回结果数组
     * @returns {Promise<Array>} 查询结果数组
     */
    async toArray() {
        if (this._executed) {
            throw new Error(createErrorMessage(
                'Query already executed. Create a new chain for another query.\n' +
                'Tip: Each chain can only be executed once:\n' +
                "  const results1 = await collection('products').find({}).limit(10);\n" +
                "  const results2 = await collection('products').find({}).limit(20); // Create new chain",
                'chaining.toArray'
            ));
        }

        const { normalizeProjection, normalizeSort } = require('../../common/normalize');
        const { collection, defaults, run } = this._context;

        // 标准化选项
        this._options.projection = normalizeProjection(this._options.projection);
        const sort = normalizeSort(this._options.sort);
        const limit = this._options.limit !== undefined ? this._options.limit : defaults.findLimit;
        const skip = this._options.skip;
        const maxTimeMS = this._options.maxTimeMS !== undefined ? this._options.maxTimeMS : defaults.maxTimeMS;

        const driverOpts = {
            projection: this._options.projection,
            sort,
            skip,
            maxTimeMS
        };
        if (this._options.hint) driverOpts.hint = this._options.hint;
        if (this._options.collation) driverOpts.collation = this._options.collation;
        if (limit !== undefined) driverOpts.limit = limit;
        if (this._options.batchSize !== undefined) driverOpts.batchSize = this._options.batchSize;
        if (this._options.comment) driverOpts.comment = this._options.comment;

        this._executed = true;

        // 使用 run 执行器（支持缓存）
        return run(
            'find',
            { query: this._query, ...this._options },
            async () => collection.find(this._query, driverOpts).toArray()
        );
    }

    /**
     * 使 FindChain 可以作为 Promise 使用
     * @returns {Promise<Array>} 查询结果数组
     */
    then(resolve, reject) {
        return this.toArray().then(resolve, reject);
    }

    /**
     * 支持 catch 方法
     */
    catch(reject) {
        return this.toArray().catch(reject);
    }

    /**
     * 支持 finally 方法
     */
    finally(fn) {
        return this.toArray().finally(fn);
    }
}

/**
 * AggregateChain 类 - aggregate 查询的链式调用构建器
 */
class AggregateChain {
    /**
     * 创建 AggregateChain 实例
     * @param {Object} context - 上下文对象
     * @param {Array} pipeline - 聚合管道
     * @param {Object} initialOptions - 初始选项
     */
    constructor(context, pipeline = [], initialOptions = {}) {
        this._context = context;
        this._pipeline = pipeline;
        this._options = { ...initialOptions };
        this._executed = false;
    }

    /**
     * 设置索引提示
     * @param {Object|string} value - 索引名称或索引规格
     * @returns {AggregateChain} 返回自身以支持链式调用
     */
    hint(value) {
        if (this._executed) {
            throw new Error(createErrorMessage(
                'Cannot call .hint() after query execution.',
                'chaining.hint'
            ));
        }
        if (!value) {
            throw new Error(createErrorMessage(
                'hint() requires an index name or specification\n' +
                'Usage: .hint({ status: 1, createdAt: -1 })',
                'chaining.hint'
            ));
        }
        this._options.hint = value;
        return this;
    }

    /**
     * 设置排序规则
     * @param {Object} value - 排序规则配置
     * @returns {AggregateChain} 返回自身以支持链式调用
     */
    collation(value) {
        if (this._executed) {
            throw new Error(createErrorMessage(
                'Cannot call .collation() after query execution.',
                'chaining.collation'
            ));
        }
        if (!value || typeof value !== 'object') {
            throw new Error(createErrorMessage(
                `collation() requires an object, got: ${typeof value}\n` +
                'Usage: .collation({ locale: \'zh\', strength: 2 })',
                'chaining.collation'
            ));
        }
        this._options.collation = value;
        return this;
    }

    /**
     * 设置查询注释
     * @param {string} value - 注释内容
     * @returns {AggregateChain} 返回自身以支持链式调用
     */
    comment(value) {
        if (this._executed) {
            throw new Error(createErrorMessage(
                'Cannot call .comment() after query execution.',
                'chaining.comment'
            ));
        }
        if (typeof value !== 'string') {
            throw new Error(createErrorMessage(
                `comment() requires a string, got: ${typeof value}\n` +
                'Usage: .comment(\'OrderAPI:aggregateSales\')',
                'chaining.comment'
            ));
        }
        this._options.comment = value;
        return this;
    }

    /**
     * 设置查询超时时间
     * @param {number} value - 超时时间（毫秒）
     * @returns {AggregateChain} 返回自身以支持链式调用
     */
    maxTimeMS(value) {
        if (this._executed) {
            throw new Error(createErrorMessage(
                'Cannot call .maxTimeMS() after query execution.',
                'chaining.maxTimeMS'
            ));
        }
        if (typeof value !== 'number' || value < 0) {
            throw new Error(createErrorMessage(
                `maxTimeMS() requires a non-negative number, got: ${typeof value} (${value})\n` +
                'Usage: .maxTimeMS(10000) // 10 seconds',
                'chaining.maxTimeMS'
            ));
        }
        this._options.maxTimeMS = value;
        return this;
    }

    /**
     * 设置是否允许使用磁盘
     * @param {boolean} value - 是否允许
     * @returns {AggregateChain} 返回自身以支持链式调用
     */
    allowDiskUse(value) {
        if (this._executed) {
            throw new Error(createErrorMessage(
                'Cannot call .allowDiskUse() after query execution.',
                'chaining.allowDiskUse'
            ));
        }
        if (typeof value !== 'boolean') {
            throw new Error(createErrorMessage(
                `allowDiskUse() requires a boolean, got: ${typeof value}\n` +
                'Usage: .allowDiskUse(true)',
                'chaining.allowDiskUse'
            ));
        }
        this._options.allowDiskUse = value;
        return this;
    }

    /**
     * 设置批处理大小
     * @param {number} value - 批处理大小
     * @returns {AggregateChain} 返回自身以支持链式调用
     */
    batchSize(value) {
        if (this._executed) {
            throw new Error(createErrorMessage(
                'Cannot call .batchSize() after query execution.',
                'chaining.batchSize'
            ));
        }
        if (typeof value !== 'number' || value < 0) {
            throw new Error(createErrorMessage(
                `batchSize() requires a non-negative number, got: ${typeof value} (${value})\n` +
                'Usage: .batchSize(1000)',
                'chaining.batchSize'
            ));
        }
        this._options.batchSize = value;
        return this;
    }

    /**
     * 返回查询执行计划
     * @param {string} [verbosity='queryPlanner'] - 详细级别
     * @returns {Promise<Object>} 执行计划
     */
    async explain(verbosity = 'queryPlanner') {
        const { collection, defaults } = this._context;

        const maxTimeMS = this._options.maxTimeMS !== undefined ? this._options.maxTimeMS : defaults.maxTimeMS;
        const allowDiskUse = this._options.allowDiskUse !== undefined ? this._options.allowDiskUse : false;

        const aggOptions = { maxTimeMS, allowDiskUse };
        if (this._options.collation) aggOptions.collation = this._options.collation;
        if (this._options.hint) aggOptions.hint = this._options.hint;
        if (this._options.comment) aggOptions.comment = this._options.comment;
        if (this._options.batchSize !== undefined) aggOptions.batchSize = this._options.batchSize;

        const cursor = collection.aggregate(this._pipeline, aggOptions);
        return cursor.explain(verbosity);
    }

    /**
     * 返回流式结果
     * @returns {ReadableStream} MongoDB 游标流
     */
    stream() {
        const { collection, defaults } = this._context;

        const maxTimeMS = this._options.maxTimeMS !== undefined ? this._options.maxTimeMS : defaults.maxTimeMS;
        const allowDiskUse = this._options.allowDiskUse !== undefined ? this._options.allowDiskUse : false;

        const aggOptions = { maxTimeMS, allowDiskUse };
        if (this._options.collation) aggOptions.collation = this._options.collation;
        if (this._options.hint) aggOptions.hint = this._options.hint;
        if (this._options.comment) aggOptions.comment = this._options.comment;
        if (this._options.batchSize !== undefined) aggOptions.batchSize = this._options.batchSize;

        const cursor = collection.aggregate(this._pipeline, aggOptions);
        return cursor.stream();
    }

    /**
     * 执行聚合并返回结果数组
     * @returns {Promise<Array>} 聚合结果数组
     */
    async toArray() {
        if (this._executed) {
            throw new Error(createErrorMessage(
                'Query already executed. Create a new chain for another query.\n' +
                'Tip: Each chain can only be executed once:\n' +
                "  const results1 = await collection('orders').aggregate([...]).allowDiskUse(true);\n" +
                "  const results2 = await collection('orders').aggregate([...]).maxTimeMS(5000); // Create new chain",
                'chaining.toArray'
            ));
        }

        const { collection, defaults, run } = this._context;

        const maxTimeMS = this._options.maxTimeMS !== undefined ? this._options.maxTimeMS : defaults.maxTimeMS;
        const allowDiskUse = this._options.allowDiskUse !== undefined ? this._options.allowDiskUse : false;

        const aggOptions = { maxTimeMS, allowDiskUse };
        if (this._options.collation) aggOptions.collation = this._options.collation;
        if (this._options.hint) aggOptions.hint = this._options.hint;
        if (this._options.comment) aggOptions.comment = this._options.comment;
        if (this._options.batchSize !== undefined) aggOptions.batchSize = this._options.batchSize;

        this._executed = true;

        // 使用 run 执行器（支持缓存）
        return run(
            'aggregate',
            this._options,
            async () => collection.aggregate(this._pipeline, aggOptions).toArray()
        );
    }

    /**
     * 使 AggregateChain 可以作为 Promise 使用
     * @returns {Promise<Array>} 聚合结果数组
     */
    then(resolve, reject) {
        return this.toArray().then(resolve, reject);
    }

    /**
     * 支持 catch 方法
     */
    catch(reject) {
        return this.toArray().catch(reject);
    }

    /**
     * 支持 finally 方法
     */
    finally(fn) {
        return this.toArray().finally(fn);
    }
}

module.exports = { FindChain, AggregateChain };


