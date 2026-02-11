/**
 * PopulateBuilder - populate 构建器
 *
 * 职责：
 * - 管理 populate 路径配置
 * - 执行关联数据填充
 * - 处理批量查询优化
 *
 * @class PopulateBuilder
 */
class PopulateBuilder {
  /**
   * 构造函数
   * @param {Model} model - 所属的 Model 实例
   * @param {Collection} collection - monSQLize collection 实例
   */
  constructor(model, collection) {
    this.model = model;
    this.collection = collection;
    this.populatePaths = []; // 待填充的路径
  }

  /**
   * 添加 populate 路径
   * @param {string|Array|Object} path - 路径或配置对象
   * @param {Object} [options={}] - populate 选项
   * @returns {PopulateBuilder} 返回自身，支持链式调用
   */
  populate(path, options = {}) {
    if (Array.isArray(path)) {
      // 数组形式：populate(['profile', 'posts'])
      path.forEach(p => this.populate(p, options));
      return this;
    }

    if (typeof path === 'object' && path.path) {
      // 对象形式：populate({ path: 'posts', select: '...' })
      this.populatePaths.push(path);
    } else if (typeof path === 'string') {
      // 字符串形式：populate('profile')
      this.populatePaths.push({ path, ...options });
    } else {
      throw new Error('populate 参数必须是字符串、数组或对象');
    }

    return this;
  }

  /**
   * 执行 populate（填充关联数据）
   * @param {Array} docs - 查询结果文档
   * @returns {Promise<Array>} 填充后的文档
   */
  async execute(docs) {
    // 如果没有文档或没有 populate 路径，直接返回
    if (!docs || docs.length === 0) return docs;
    if (this.populatePaths.length === 0) return docs;

    // 按顺序执行每个 populate 路径
    for (const populateConfig of this.populatePaths) {
      docs = await this._populatePath(docs, populateConfig);
    }

    return docs;
  }

  /**
   * 填充单个路径（核心逻辑）
   * @private
   * @param {Array} docs - 文档数组
   * @param {Object} config - populate 配置
   * @returns {Promise<Array>}
   */
  async _populatePath(docs, config) {
    const { path, select, sort, limit, skip, match, populate: nestedPopulate } = config;

    // 1. 获取关系定义
    const relation = this.model._relations.get(path);
    if (!relation) {
      throw new Error(`未定义的关系: ${path}`);
    }

    // 2. 收集外键值
    const foreignIds = this._collectForeignIds(docs, relation);
    if (foreignIds.length === 0) {
      // 没有外键值，填充 null 或空数组
      this._fillEmptyRelation(docs, path, relation);
      return docs;
    }

    // 3. 获取关联的集合
    const relatedCollection = this.model.msq.collection(relation.from);

    // 4. 构建查询条件
    const query = { [relation.foreignField]: { $in: foreignIds } };
    if (match) {
      Object.assign(query, match);
    }

    // 5. 查询关联文档
    let relatedDocs = await relatedCollection.find(query).toArray();

    // 6. 🔴 处理 limit=0 的特殊情况：返回空结果
    if (limit === 0) {
      this._fillEmptyRelation(docs, path, relation);
      return docs;
    }

    // 7. 🆕 处理嵌套 populate（深度填充）
    if (nestedPopulate && relatedDocs.length > 0) {
      relatedDocs = await this._executeNestedPopulate(
        relatedDocs,
        nestedPopulate,
        relation.from
      );
    }

    // 8. 应用选项（修复：select时保留外键字段）
    if (select) {
      relatedDocs = relatedDocs.map(doc => this._selectFields(doc, select, relation.foreignField));
    }
    if (sort) {
      relatedDocs = this._sortDocs(relatedDocs, sort);
    }
    if (skip || limit) {
      const startIndex = skip || 0;
      const endIndex = limit ? startIndex + limit : relatedDocs.length;
      relatedDocs = relatedDocs.slice(startIndex, endIndex);
    }

    // 9. 构建映射表
    const relatedMap = this._buildRelationMap(relatedDocs, relation);

    // 10. 填充文档
    this._fillDocuments(docs, path, relation, relatedMap);

    return docs;
  }

  /**
   * 收集外键值
   * @private
   * @param {Array} docs - 文档数组
   * @param {Object} relation - 关系定义
   * @returns {Array} 外键值数组（去重）
   */
  _collectForeignIds(docs, relation) {
    const ids = new Set();

    for (const doc of docs) {
      const localValue = doc[relation.localField];

      if (localValue === null || localValue === undefined) {
        continue;
      }

      if (Array.isArray(localValue)) {
        // 外键数组
        localValue.forEach(id => {
          if (id !== null && id !== undefined) {
            ids.add(String(id));
          }
        });
      } else {
        // 单个外键
        ids.add(String(localValue));
      }
    }

    return Array.from(ids);
  }

  /**
   * 构建关系映射表
   * @private
   * @param {Array} relatedDocs - 关联文档数组
   * @param {Object} relation - 关系定义
   * @returns {Map} 映射表
   */
  _buildRelationMap(relatedDocs, relation) {
    const map = new Map();

    for (const doc of relatedDocs) {
      const key = String(doc[relation.foreignField]);

      if (relation.single) {
        // single: true - 单文档，直接存储
        map.set(key, doc);
      } else {
        // single: false - 数组，追加存储
        if (!map.has(key)) {
          map.set(key, []);
        }
        map.get(key).push(doc);
      }
    }

    return map;
  }

  /**
   * 填充文档
   * @private
   * @param {Array} docs - 文档数组
   * @param {string} path - 填充路径
   * @param {Object} relation - 关系定义
   * @param {Map} relatedMap - 关系映射表
   */
  _fillDocuments(docs, path, relation, relatedMap) {
    for (const doc of docs) {
      const localValue = doc[relation.localField];

      if (localValue === null || localValue === undefined) {
        // 外键为空，填充 null 或空数组
        doc[path] = relation.single ? null : [];
        continue;
      }

      if (relation.single) {
        // single: true - 返回单文档
        const key = String(localValue);
        doc[path] = relatedMap.get(key) || null;
      } else {
        // single: false - 返回数组
        const keys = Array.isArray(localValue)
          ? localValue.map(String)
          : [String(localValue)];

        doc[path] = [];
        for (const key of keys) {
          const related = relatedMap.get(key);
          if (related) {
            if (Array.isArray(related)) {
              doc[path].push(...related);
            } else {
              doc[path].push(related);
            }
          }
        }
      }
    }
  }

  /**
   * 填充空关系
   * @private
   * @param {Array} docs - 文档数组
   * @param {string} path - 填充路径
   * @param {Object} relation - 关系定义
   */
  _fillEmptyRelation(docs, path, relation) {
    for (const doc of docs) {
      doc[path] = relation.single ? null : [];
    }
  }

  /**
   * 选择字段
   * @private
   * @param {Object} doc - 文档对象
   * @param {string} select - 字段选择器（空格分隔）
   * @param {string} [keepField] - 必须保留的字段（如外键字段）
   * @returns {Object} 选择后的文档
   */
  _selectFields(doc, select, keepField) {
    const fields = select.split(/\s+/).filter(f => f);
    const result = {};

    // 始终包含 _id
    if (doc._id !== undefined) {
      result._id = doc._id;
    }

    for (const field of fields) {
      if (doc[field] !== undefined) {
        result[field] = doc[field];
      }
    }

    // 🔴 保留外键字段（用于构建关系映射）
    if (keepField && doc[keepField] !== undefined && !fields.includes(keepField)) {
      result[keepField] = doc[keepField];
    }

    return result;
  }

  /**
   * 排序文档
   * @private
   * @param {Array} docs - 文档数组
   * @param {Object} sort - 排序规则
   * @returns {Array} 排序后的文档数组
   */
  _sortDocs(docs, sort) {
    return docs.slice().sort((a, b) => {
      for (const [field, order] of Object.entries(sort)) {
        const aVal = a[field];
        const bVal = b[field];

        if (aVal < bVal) return order === 1 ? -1 : 1;
        if (aVal > bVal) return order === 1 ? 1 : -1;
      }
      return 0;
    });
  }

  /**
   * 执行嵌套 populate（深度填充）
   * @private
   * @param {Array} docs - 关联文档数组
   * @param {string|Array|Object} nestedPopulate - 嵌套 populate 配置
   * @param {string} collectionName - 当前集合名称
   * @returns {Promise<Array>} 填充后的文档
   */
  async _executeNestedPopulate(docs, nestedPopulate, collectionName) {
    // 1. 获取当前集合对应的 Model 定义
    const Model = require('../../model');
    if (!Model.has(collectionName)) {
      // 集合没有定义 Model，跳过嵌套 populate（不报错，也不添加字段）
      return docs;
    }

    // 2. 创建临时 ModelInstance 用于嵌套 populate
    const modelDef = Model.get(collectionName);
    const collection = this.model.msq.collection(collectionName);
    const { ModelInstance } = require('../index');
    const tempModel = new ModelInstance(collection, modelDef.definition, this.model.msq);

    // 3. 验证嵌套 populate 配置类型
    if (
      typeof nestedPopulate !== 'string' &&
      !Array.isArray(nestedPopulate) &&
      !(typeof nestedPopulate === 'object' && nestedPopulate.path)
    ) {
      throw new Error('嵌套 populate 参数必须是字符串、数组或对象');
    }

    // 4. 创建新的 PopulateBuilder
    const nestedBuilder = new PopulateBuilder(tempModel, collection);

    // 5. 添加嵌套 populate 路径（此时会验证关系是否存在）
    if (Array.isArray(nestedPopulate)) {
      // 数组形式：populate: ['comments', 'likes']
      nestedPopulate.forEach(p => nestedBuilder.populate(p));
    } else if (typeof nestedPopulate === 'object' && nestedPopulate.path) {
      // 对象形式：populate: { path: 'comments', select: '...' }
      nestedBuilder.populate(nestedPopulate);
    } else if (typeof nestedPopulate === 'string') {
      // 字符串形式：populate: 'comments'
      nestedBuilder.populate(nestedPopulate);
    }

    // 6. 执行嵌套 populate
    const populatedDocs = await nestedBuilder.execute(docs);

    return populatedDocs;
  }
}

/**
 * PopulateProxy - populate 代理类
 *
 * 职责：
 * - 提供链式 populate 调用接口
 * - 实现 Promise 接口（then/catch）
 * - 处理单文档和数组文档的返回
 *
 * @class PopulateProxy
 */
class PopulateProxy {
  /**
   * 构造函数
   * @param {Array|Promise<Array>} docs - 文档数组或返回文档数组的 Promise
   * @param {PopulateBuilder} builder - PopulateBuilder 实例
   * @param {boolean} [singleDoc=false] - 是否返回单文档
   */
  constructor(docs, builder, singleDoc = false) {
    this._docsOrPromise = docs;
    this._builder = builder;
    this._singleDoc = singleDoc;
  }

  /**
   * 获取文档数组（如果是 Promise 则先 await）
   * @private
   * @returns {Promise<Array>}
   */
  async _getDocs() {
    // 如果是 Promise，先 await
    if (this._docsOrPromise && typeof this._docsOrPromise.then === 'function') {
      const result = await this._docsOrPromise;
      // 标准化为数组
      return result === null ? [] : (Array.isArray(result) ? result : [result]);
    }
    // 否则直接返回
    return this._docsOrPromise;
  }

  /**
   * 添加 populate 路径（链式调用）
   * @param {string|Array|Object} path - 路径或配置对象
   * @param {Object} [options={}] - populate 选项
   * @returns {PopulateProxy} 返回自身，支持链式调用
   */
  populate(path, options = {}) {
    this._builder.populate(path, options);
    return this; // 返回自己，支持链式调用
  }

  /**
   * Promise then 接口
   * @param {Function} resolve - 成功回调
   * @param {Function} reject - 失败回调
   * @returns {Promise}
   */
  async then(resolve, reject) {
    try {
      // 获取文档（如果是 Promise 则先 await）
      const docs = await this._getDocs();

      // 执行 populate
      const populatedDocs = await this._builder.execute(docs);

      // 如果是单文档查询（findOne），返回第一个元素或 null
      // 如果是批量查询（find），返回数组
      const result = this._singleDoc ? (populatedDocs[0] || null) : populatedDocs;

      return resolve(result);
    } catch (error) {
      return reject ? reject(error) : Promise.reject(error);
    }
  }

  /**
   * Promise catch 接口
   * @param {Function} reject - 失败回调
   * @returns {Promise}
   */
  catch(reject) {
    return this.then(result => result, reject);
  }

  /**
   * Promise finally 接口
   * @param {Function} onFinally - finally 回调
   * @returns {Promise}
   */
  finally(onFinally) {
    return this.then(
      result => {
        onFinally();
        return result;
      },
      error => {
        onFinally();
        throw error;
      }
    );
  }
}

/**
 * SpecialPopulateProxy - 用于 findAndCount 和 findPage 的特殊 PopulateProxy
 *
 * 这些方法返回特殊结构：
 * - findAndCount: { data: [...], total: 100 }
 * - findPage: { data: [...], page: 1, pageSize: 10, total: 100, hasNext: true }
 *
 * 需要只对 data 部分进行 populate，保持其他字段不变
 *
 * @class SpecialPopulateProxy
 */
class SpecialPopulateProxy {
  /**
   * 构造函数
   * @param {Promise} queryPromise - 返回特殊结构的查询 Promise
   * @param {PopulateBuilder} builder - PopulateBuilder 实例
   * @param {string} method - 方法名（findAndCount 或 findPage）
   */
  constructor(queryPromise, builder, method) {
    this._queryPromise = queryPromise;
    this._builder = builder;
    this._method = method;
  }

  /**
   * 添加 populate 路径（链式调用）
   * @param {string|Array|Object} path - 路径或配置对象
   * @param {Object} [options={}] - populate 选项
   * @returns {SpecialPopulateProxy} 返回自身，支持链式调用
   */
  populate(path, options = {}) {
    this._builder.populate(path, options);
    return this; // 返回自己，支持链式调用
  }

  /**
   * Promise then 接口
   * @param {Function} resolve - 成功回调
   * @param {Function} reject - 失败回调
   * @returns {Promise}
   */
  async then(resolve, reject) {
    try {
      // 1. 获取查询结果（特殊结构）
      const result = await this._queryPromise;

      // 2. 提取数据部分（智能检测字段名）
      // 优先检查实际存在的字段，以支持mock数据和真实数据
      let dataField, data;
      if (result.items !== undefined) {
        // 真实的findPage返回 { items: [...], pageInfo: {...}, totals: {...} }
        dataField = 'items';
        data = result.items || [];
      } else {
        // findAndCount或mock数据返回 { data: [...], total: 100 }
        // 兜底：如果没有items，使用data字段（即使不存在也没关系）
        dataField = 'data';
        data = result.data || [];
      }

      // 3. 对数据部分执行 populate
      const populatedData = await this._builder.execute(data);

      // 4. 重新组装结果（保持原结构，只替换数据字段）
      const finalResult = {
        ...result,
        [dataField]: populatedData
      };

      return resolve(finalResult);
    } catch (error) {
      return reject ? reject(error) : Promise.reject(error);
    }
  }

  /**
   * Promise catch 接口
   * @param {Function} reject - 失败回调
   * @returns {Promise}
   */
  catch(reject) {
    return this.then(result => result, reject);
  }

  /**
   * Promise finally 接口
   * @param {Function} onFinally - finally 回调
   * @returns {Promise}
   */
  finally(onFinally) {
    return this.then(
      result => {
        onFinally();
        return result;
      },
      error => {
        onFinally();
        throw error;
      }
    );
  }
}

module.exports = { PopulateBuilder, PopulateProxy, SpecialPopulateProxy };


