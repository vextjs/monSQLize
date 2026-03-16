/**
 * Model 层 - 基于 collection 的增强封装
 *
 * 核心功能：
 * 1. Schema 定义与验证（集成 schema-dsl）
 * 2. 自定义方法扩展（instance + static）
 * 3. 生命周期钩子（before/after）
 * 4. 索引管理（自动创建）
 * 5. 关系定义（hasOne/hasMany/belongsTo）
 *
 * @module lib/model
 * @version 1.0.3
 * @since 1.0.3
 */

// ========== 依赖导入 ==========
let schemaDsl;
try {
  schemaDsl = require("schema-dsl");
} catch (err) {
  // schema-dsl 未安装时的友好提示
  const installHint = `
╔════════════════════════════════════════════════════════════════╗
║  ⚠️  schema-dsl 未安装                                         ║
║                                                                 ║
║  Model 功能需要 schema-dsl 包支持                              ║
║                                                                 ║
║  安装方式：                                                     ║
║  1. npm link（开发）：                                         ║
║     cd path/to/schema-dsl && npm link                          ║
║     cd path/to/monSQLize && npm link schema-dsl                ║
║                                                                 ║
║  2. npm 安装（生产）：                                         ║
║     npm install schema-dsl                                      ║
╚════════════════════════════════════════════════════════════════╝
`;
  console.error(installHint);
  throw new Error(
    "schema-dsl is required for Model functionality. Please install it first.",
  );
}

const { dsl, validate } = schemaDsl;

// ========== relations + populate 支持 ==========
const RelationManager = require("./features/relations");
const { PopulateBuilder, PopulateProxy } = require("./features/populate");

/**
 * Model 基类
 * 提供全局注册和实例化能力
 */
class Model {
  /**
   * 全局 Model 注册表
   * @private
   * @type {Map<string, Object>}
   */
  static _registry = new Map();

  /**
   * 定义并注册 Model
   *
   * @param {string} collectionName - 集合名称
   * @param {Object} definition - Model 定义对象
   * @param {Object} [definition.enums] - 枚举配置（可选）
   * @param {Function|Object} definition.schema - Schema 定义（必需）
   * @param {Function} [definition.methods] - 自定义方法（可选）
   * @param {Function} [definition.hooks] - 生命周期钩子（可选）
   * @param {Array} [definition.indexes] - 索引定义（可选）
   * @param {Object} [definition.relations] - 关系定义（可选）
   *
   * @throws {Error} 集合名称无效
   * @throws {Error} schema 未定义
   * @throws {Error} Model 已存在
   *
   * @example
   * Model.define('users', {
   *   enums: {
   *     role: 'admin|user'
   *   },
   *   schema: function(dsl) {
   *     return dsl({
   *       username: 'string:3-32!',
   *       role: this.enums.role.default('user')
   *     });
   *   }
   * });
   */
  static define(collectionName, definition) {
    try {
      // ========== 参数验证 ==========
      if (
        !collectionName ||
        typeof collectionName !== "string" ||
        collectionName.trim() === ""
      ) {
        const err = new Error("Collection name must be a non-empty string.");
        err.code = "INVALID_COLLECTION_NAME";
        throw err;
      }

      // 检查特殊字符（MongoDB 集合名不允许包含 $, ., 空格, null 字符等）
      const invalidChars = /[$.\s\x00]/;
      if (invalidChars.test(collectionName)) {
        const err = new Error(
          "Invalid collection name: contains special characters ($, ., space, or null character).",
        );
        err.code = "INVALID_COLLECTION_NAME";
        throw err;
      }

      if (!definition || typeof definition !== "object") {
        const err = new Error("Model definition must be an object.");
        err.code = "INVALID_MODEL_DEFINITION";
        throw err;
      }

      if (!definition.schema) {
        const err = new Error(
          "Model definition must include a schema property.",
        );
        err.code = "MISSING_SCHEMA";
        throw err;
      }

      if (
        typeof definition.schema !== "function" &&
        typeof definition.schema !== "object"
      ) {
        const err = new Error("Schema must be a function or object.");
        err.code = "INVALID_SCHEMA_TYPE";
        throw err;
      }

      // ========== 检查重复注册 ==========
      if (this._registry.has(collectionName)) {
        const err = new Error(`Model '${collectionName}' is already defined.`);
        err.code = "MODEL_ALREADY_EXISTS";
        throw err;
      }

      // ========== 验证 relations 配置 ==========
      if (definition.relations && typeof definition.relations === "object") {
        for (const [name, config] of Object.entries(definition.relations)) {
          this._validateRelationConfig(name, config);
        }
      }

      // ========== 验证 options 配置 ==========
      if (definition.options) {
        this._validateOptions(definition.options);
      }

      // ========== 解析 timestamps 配置 ==========
      const timestampsConfig = this._parseTimestampsConfig(
        definition.options?.timestamps,
      );
      if (timestampsConfig) {
        // 保存到内部 hooks 配置
        if (!definition._internalHooks) {
          definition._internalHooks = {};
        }
        definition._internalHooks.timestamps = timestampsConfig;
      }

      // ========== 注册 Model ==========
      this._registry.set(collectionName, {
        collectionName,
        definition,
      });
    } catch (err) {
      // 统一错误处理
      if (!err.code) {
        err.code = "MODEL_DEFINE_ERROR";
      }
      throw err;
    }
  }

  /**
   * 验证关系配置
   * @private
   * @param {string} name - 关系名称
   * @param {Object} config - 关系配置
   * @throws {Error} 配置不合法时抛出错误
   */
  static _validateRelationConfig(name, config) {
    // 验证必需字段
    const required = ["from", "localField", "foreignField"];
    for (const field of required) {
      if (!config[field]) {
        throw new Error(`relations 配置缺少必需字段: ${field}`);
      }
    }

    // 验证 from 必须是字符串（集合名）
    if (typeof config.from !== "string") {
      throw new Error("relations.from 必须是字符串（集合名称）");
    }

    // 验证 localField 和 foreignField 必须是字符串
    if (typeof config.localField !== "string") {
      throw new Error("relations.localField 必须是字符串");
    }

    if (typeof config.foreignField !== "string") {
      throw new Error("relations.foreignField 必须是字符串");
    }

    // 验证 single 必须是布尔值（如果提供）
    if (config.single !== undefined && typeof config.single !== "boolean") {
      throw new Error("relations.single 必须是布尔值");
    }
  }

  /**
   * 验证 options 配置
   * @private
   * @param {Object} options - options 配置对象
   * @throws {Error} 配置不合法时抛出错误
   */
  static _validateOptions(options) {
    if (!options || typeof options !== "object") {
      return; // options 是可选的
    }

    // 验证 timestamps
    if (options.timestamps !== undefined) {
      if (
        typeof options.timestamps !== "boolean" &&
        typeof options.timestamps !== "object"
      ) {
        throw new Error("options.timestamps must be boolean or object");
      }

      if (
        typeof options.timestamps === "object" &&
        options.timestamps !== null
      ) {
        const validKeys = ["createdAt", "updatedAt"];
        const invalidKeys = Object.keys(options.timestamps).filter(
          (k) => !validKeys.includes(k),
        );
        if (invalidKeys.length > 0) {
          throw new Error(
            `Invalid timestamps keys: ${invalidKeys.join(", ")}. Valid keys are: ${validKeys.join(", ")}`,
          );
        }
      }
    }

    // 验证 softDelete
    if (options.softDelete !== undefined) {
      if (
        typeof options.softDelete !== "boolean" &&
        typeof options.softDelete !== "object"
      ) {
        throw new Error("options.softDelete must be boolean or object");
      }
    }

    // 验证 version
    if (options.version !== undefined) {
      if (
        typeof options.version !== "boolean" &&
        typeof options.version !== "object"
      ) {
        throw new Error("options.version must be boolean or object");
      }
    }

    // 验证 validate
    if (options.validate !== undefined) {
      if (typeof options.validate !== "boolean") {
        throw new Error("options.validate must be boolean");
      }
    }
  }

  /**
   * 解析 timestamps 配置
   *
   * @private
   * @param {boolean|Object} config - timestamps 配置
   * @returns {Object|null} 解析后的配置对象，包含 createdAt 和 updatedAt 字段名
   *
   * @example
   * _parseTimestampsConfig(true)
   * // => { createdAt: 'createdAt', updatedAt: 'updatedAt' }
   *
   * _parseTimestampsConfig({ createdAt: 'created_time', updatedAt: false })
   * // => { createdAt: 'created_time' }
   */
  static _parseTimestampsConfig(config) {
    if (!config) return null;

    // 简单模式：timestamps: true
    if (config === true) {
      return {
        createdAt: "createdAt",
        updatedAt: "updatedAt",
      };
    }

    // 对象模式
    if (typeof config === "object") {
      const result = {};

      // createdAt 配置
      if (config.createdAt === true) {
        result.createdAt = "createdAt";
      } else if (typeof config.createdAt === "string") {
        result.createdAt = config.createdAt;
      }

      // updatedAt 配置（默认启用）
      if (config.updatedAt !== false) {
        if (config.updatedAt === true || config.updatedAt === undefined) {
          result.updatedAt = "updatedAt";
        } else if (typeof config.updatedAt === "string") {
          result.updatedAt = config.updatedAt;
        }
      }

      return Object.keys(result).length > 0 ? result : null;
    }

    return null;
  }

  /**
   * 获取已注册的 Model 定义
   *
   * @param {string} collectionName - 集合名称
   * @returns {Object|undefined} Model 定义对象
   *
   * @example
   * const userModelDef = Model.get('users');
   */
  static get(collectionName) {
    return this._registry.get(collectionName);
  }

  /**
   * 检查 Model 是否已注册
   *
   * @param {string} collectionName - 集合名称
   * @returns {boolean}
   *
   * @example
   * if (Model.has('users')) {
   *   // Model 已注册
   * }
   */
  static has(collectionName) {
    return this._registry.has(collectionName);
  }

  /**
   * 获取所有已注册的 Model 名称
   *
   * @returns {string[]} Model 名称数组
   *
   * @example
   * const modelNames = Model.list();
   * // ['users', 'posts', 'comments']
   */
  static list() {
    return Array.from(this._registry.keys());
  }

  /**
   * 注销已注册的 Model 定义
   *
   * 从全局注册表中移除指定的 Model 定义。
   * 已实例化的 ModelInstance 不受影响，仅影响后续通过 msq.model() 获取的新实例。
   *
   * 主要用途：
   * - 开发模式下的 Model 热重载（配合 Model.define() 实现替换）
   * - 测试中清理单个 Model（比 _clear() 更精确）
   *
   * @param {string} collectionName - 要注销的集合名称
   * @returns {boolean} 如果成功移除返回 true，如果 Model 不存在返回 false
   *
   * @example
   * // 热重载场景
   * Model.undefine('users');           // 移除旧定义
   * Model.define('users', newDef);     // 注册新定义
   *
   * @example
   * // 检查返回值
   * const removed = Model.undefine('users');
   * console.log(removed); // true（已存在）或 false（不存在）
   *
   * @since 1.1.7
   */
  static undefine(collectionName) {
    return this._registry.delete(collectionName);
  }

  /**
   * 重新定义已注册的 Model
   *
   * 等效于 undefine() + define() 的组合操作。
   * 如果 Model 不存在，行为等同于 define()（首次注册）。
   *
   * 注意：如果新的 definition 校验失败（define() 抛错），旧定义将被移除。
   * 调用方如需回滚，应在 catch 中自行重新 define() 旧定义。
   *
   * 主要用途：
   * - 开发模式下的 Model 热重载（一步完成替换）
   * - _loadModels() reload 模式的内部支撑
   *
   * @param {string} collectionName - 集合名称
   * @param {Object} definition - 新的 Model 定义对象
   * @returns {void}
   * @throws {Error} 参数验证失败时抛出（与 define() 相同的校验逻辑）
   *
   * @example
   * // 替换已有 Model 定义
   * Model.redefine('users', {
   *   schema: (dsl) => dsl({ username: 'string!', email: 'string!' })
   * });
   *
   * @example
   * // 首次定义（等同于 define）
   * Model.redefine('posts', {
   *   schema: (dsl) => dsl({ title: 'string!' })
   * });
   *
   * @since 1.1.7
   */
  static redefine(collectionName, definition) {
    this.undefine(collectionName);
    this.define(collectionName, definition);
  }

  /**
   * 清空所有已注册的 Model（主要用于测试）
   *
   * @private
   */
  static _clear() {
    this._registry.clear();
  }
}

/**
 * ModelInstance - Model 实例类
 * 继承 collection 的所有方法，并扩展 Model 特性
 */
class ModelInstance {
  /**
   * 创建 ModelInstance 实例
   *
   * @param {Object} collection - monSQLize collection 对象
   * @param {Object} definition - Model 定义对象
   * @param {Object} msq - monSQLize 实例
   */
  constructor(collection, definition, msq) {
    this.collection = collection;
    this.definition = definition;
    this.msq = msq;

    // ========== Schema 缓存优化 ==========
    // 🚀 性能优化：编译 schema 并缓存，避免每次 validate 重新执行
    this._schemaCache = null;
    this._schemaError = null; // 🆕 记录schema错误，但不阻止实例化

    if (typeof definition.schema === "function") {
      try {
        // 绑定 this 到 definition，支持访问 this.enums
        this._schemaCache = definition.schema.call(definition, dsl);
      } catch (err) {
        // 🆕 schema 函数执行失败时，记录错误但不抛出
        // 这样可以兼容MongoDB的无schema模式
        this._schemaError = err;
        this._schemaCache = null;

        // 记录详细的警告日志
        if (this.msq && this.msq.logger) {
          this.msq.logger.warn(
            `[Model] Schema function execution failed for collection '${collection.collectionName}': ${err.message}`,
            { originalError: err },
          );
        }
      }
    } else {
      this._schemaCache = definition.schema;
    }

    // ========== 继承 collection 所有方法 ==========
    // 将 collection 的所有方法代理到 ModelInstance
    const collectionMethods = Object.getOwnPropertyNames(
      Object.getPrototypeOf(collection),
    )
      .concat(Object.keys(collection))
      .filter(
        (key) => key !== "constructor" && typeof collection[key] === "function",
      );

    // 去重
    const uniqueMethods = [...new Set(collectionMethods)];

    // 🆕 需要支持 populate 的查询方法列表
    const populateMethods = [
      "find",
      "findOne",
      "findByIds",
      "findOneById",
      "findAndCount",
      "findPage",
    ];

    uniqueMethods.forEach((method) => {
      if (!this[method]) {
        // 🆕 支持 populate 的查询方法特殊处理
        if (populateMethods.includes(method)) {
          this[method] = (...args) => {
            // 创建一个 Promise 来执行实际查询
            const executeQuery = async () => {
              // 🔧 Hook 拦截机制
              const result = await this._interceptWithHooks(method, args);

              // 🔧 实例方法注入
              if (result) {
                this._injectInstanceMethods(result);
              }

              return result;
            };

            // 执行查询并返回 PopulateProxy
            const queryPromise = executeQuery();

            // 判断返回类型
            const singleDoc = method === "findOne" || method === "findOneById";
            const isSpecialResult =
              method === "findAndCount" || method === "findPage";

            if (isSpecialResult) {
              // findAndCount 和 findPage 返回特殊结构，需要特殊包装
              return this._wrapWithSpecialPopulateProxy(queryPromise, method);
            } else {
              // 普通查询方法
              return this._wrapWithPopulateProxyFromPromise(
                queryPromise,
                singleDoc,
              );
            }
          };
        } else {
          // 其他方法保持原样
          this[method] = async (...args) => {
            // 🔧 incrementOne 特殊处理timestamps
            if (
              method === "incrementOne" &&
              this.definition._internalHooks?.timestamps?.updatedAt
            ) {
              // 调用 _applyTimestampsToIncrementOne 处理
              args = this._applyTimestampsToIncrementOne(args);
            }

            // 🔧 Hook 拦截机制
            const result = await this._interceptWithHooks(method, args);

            // 🔧 实例方法注入：只在查询操作时注入（find/findOne/aggregate等）
            const opType = this._getOperationType(method);
            if (opType === "find" && result) {
              this._injectInstanceMethods(result);
            }

            return result;
          };
        }
      }
    });

    // ========== 扩展自定义方法 ==========
    if (typeof definition.methods === "function") {
      const customMethods = definition.methods(this);

      // 1. instance 方法 - 保存引用，用于注入到查询结果
      this._instanceMethods = customMethods.instance || {};

      // 2. static 方法 - 挂载到 ModelInstance 本身
      if (customMethods.static && typeof customMethods.static === "object") {
        Object.keys(customMethods.static).forEach((methodName) => {
          if (typeof customMethods.static[methodName] === "function") {
            // 挂载到 this（ModelInstance 实例）
            this[methodName] = customMethods.static[methodName].bind(this);
          }
        });
      }

      // 3. 警告未识别的键（帮助用户发现错误）
      if (customMethods && typeof customMethods === "object") {
        const validKeys = ["instance", "static"];
        const unknownKeys = Object.keys(customMethods).filter(
          (k) => !validKeys.includes(k),
        );
        if (unknownKeys.length > 0 && this.msq && this.msq.logger) {
          this.msq.logger.warn(
            `[Model] methods 只支持 'instance' 和 'static' 两个分组。` +
              `发现未识别的键: ${unknownKeys.join(", ")}`,
          );
        }
      }
    } else {
      this._instanceMethods = {};
    }

    // ========== 初始化 indexes 数组 ==========
    // 注意：必须在 setupSoftDelete 之前初始化，因为 softDelete 可能添加 TTL 索引
    this.indexes = definition.indexes || [];

    // ========== 关系定义管理 ==========
    this._relations = new RelationManager(this);

    // 注册 relations
    if (definition.relations && typeof definition.relations === "object") {
      for (const [name, config] of Object.entries(definition.relations)) {
        this._relations.define(name, config);
      }
    }

    // ========== 虚拟字段功能 ==========
    const { setupVirtuals } = require("./features/virtuals");
    setupVirtuals(this, definition.virtuals);

    // ========== 默认值功能 ==========
    const { setupDefaults } = require("./features/defaults");
    setupDefaults(this, definition.defaults);

    // ========== 软删除功能 ==========
    const { setupSoftDelete } = require("./features/soft-delete");
    setupSoftDelete(this, definition.options?.softDelete);

    // ========== 乐观锁版本控制功能 ==========
    const { setupVersion } = require("./features/version");
    setupVersion(this, definition.options?.version);

    // ========== 自动验证配置 ==========
    // 🔴 默认启用验证（除非明确设置为 false）
    this._autoValidate = definition.options?.validate !== false;

    // ========== 自动创建索引 ==========
    if (Array.isArray(this.indexes) && this.indexes.length > 0) {
      // 延迟执行，避免阻塞初始化
      setImmediate(() => {
        this._createIndexes().catch((err) => {
          // 索引创建失败仅记录警告，不中断流程
          if (this.msq && this.msq.logger) {
            this.msq.logger.warn(
              `[Model] Failed to create indexes for ${this.collection.collectionName}:`,
              err.message,
            );
          }
        });
      });
    }
  }

  /**
   * 创建索引
   *
   * @private
   * @returns {Promise<void>}
   */
  async _createIndexes() {
    if (!Array.isArray(this.indexes) || this.indexes.length === 0) {
      return;
    }

    try {
      // 使用 createIndexes 批量创建索引
      await this.collection.createIndexes(this.indexes);

      if (this.msq && this.msq.logger) {
        this.msq.logger.info(
          `[Model] Created ${this.indexes.length} index(es) for ${this.collection.collectionName}`,
        );
      }
    } catch (err) {
      // 索引创建失败仅记录警告
      if (this.msq && this.msq.logger) {
        this.msq.logger.warn(
          `[Model] Failed to create indexes for ${this.collection.collectionName}:`,
          err.message,
        );
      }
      throw err;
    }
  }

  /**
   * 将实例方法注入到文档对象
   *
   * @private
   * @param {Object|Array} result - 查询返回的结果（文档对象或数组）
   */
  _injectInstanceMethods(result) {
    if (
      !this._instanceMethods ||
      Object.keys(this._instanceMethods).length === 0
    ) {
      return;
    }

    // 处理数组结果（find 返回的）
    if (Array.isArray(result)) {
      result.forEach((doc) => {
        if (doc && typeof doc === "object") {
          this._injectToDocument(doc);
        }
      });
    }
    // 处理单个文档（findOne 返回的）
    else if (result && typeof result === "object" && !Buffer.isBuffer(result)) {
      this._injectToDocument(result);
    }
  }

  /**
   * 将实例方法注入到单个文档对象
   *
   * @private
   * @param {Object} doc - 文档对象
   */
  _injectToDocument(doc) {
    Object.keys(this._instanceMethods).forEach((methodName) => {
      if (typeof this._instanceMethods[methodName] === "function") {
        // 绑定 this 到文档对象
        doc[methodName] = this._instanceMethods[methodName].bind(doc);
      }
    });
  }

  /**
   * 包装查询结果为 PopulateProxy
   *
   * @private
   * @param {Object|Array|null} result - 查询结果
   * @param {boolean} singleDoc - 是否是单文档查询（findOne）
   * @returns {PopulateProxy} PopulateProxy 实例
   */
  _wrapWithPopulateProxy(result, singleDoc = false) {
    // 如果结果为 null（findOne 未找到），仍然包装为 PopulateProxy
    const docs =
      result === null ? [] : Array.isArray(result) ? result : [result];

    // 创建 PopulateBuilder
    const builder = new PopulateBuilder(this, this.collection);

    // 返回 PopulateProxy
    return new PopulateProxy(docs, builder, singleDoc);
  }

  /**
   * 从 Promise 创建 PopulateProxy
   *
   * @private
   * @param {Promise} queryPromise - 查询 Promise
   * @param {boolean} singleDoc - 是否是单文档查询（findOne）
   * @returns {PopulateProxy} PopulateProxy 实例
   */
  _wrapWithPopulateProxyFromPromise(queryPromise, singleDoc = false) {
    // 创建 PopulateBuilder
    const builder = new PopulateBuilder(this, this.collection);

    // 返回 PopulateProxy，传入 Promise 而不是实际数据
    return new PopulateProxy(queryPromise, builder, singleDoc);
  }

  /**
   * 从 Promise 创建特殊的 PopulateProxy（用于 findAndCount 和 findPage）
   *
   * @private
   * @param {Promise} queryPromise - 查询 Promise
   * @param {string} method - 方法名（findAndCount 或 findPage）
   * @returns {PopulateProxy} PopulateProxy 实例
   */
  _wrapWithSpecialPopulateProxy(queryPromise, method) {
    // 创建 PopulateBuilder
    const builder = new PopulateBuilder(this, this.collection);

    // 返回特殊的 PopulateProxy
    const { SpecialPopulateProxy } = require("./features/populate");
    return new SpecialPopulateProxy(queryPromise, builder, method);
  }

  /**
   * Hook 拦截机制
   * 在方法执行前后触发 before/after 钩子
   *
   * @private
   * @param {string} method - 方法名
   * @param {Array} args - 方法参数
   * @returns {Promise<*>} 方法执行结果
   */
  async _interceptWithHooks(method, args) {
    const hooks =
      typeof this.definition.hooks === "function"
        ? this.definition.hooks(this)
        : {};

    // 提取操作类型（find/insert/update/delete）
    const opType = this._getOperationType(method);
    const opHooks = hooks[opType] || {};

    // 上下文对象（用于在 before/after 之间传递数据，如事务 session）
    const ctx = {};

    // ========== Before Hook ==========
    if (typeof opHooks.before === "function") {
      // 🔧 修复：before hook 错误必须中断操作
      const modifiedArgs = await opHooks.before(ctx, ...args);

      // 🔧 修复：正确应用 before hook 返回值
      // 对于 insert 操作，第一个参数是待插入的文档
      if (modifiedArgs !== undefined) {
        if (opType === "insert") {
          // insertOne/insertMany: args[0] 是文档/文档数组
          args[0] = modifiedArgs;
        } else if (Array.isArray(modifiedArgs)) {
          // 其他操作：如果返回数组，替换整个 args
          args = modifiedArgs;
        } else {
          // 单个返回值，替换第一个参数
          args[0] = modifiedArgs;
        }
      }
    }

    // ========== 自动应用默认值（仅 insert 操作）==========
    if (opType === "insert" && this._defaults) {
      args[0] = this._defaults.apply(args[0], ctx);
    }

    // ========== Schema 验证（仅 insert/update 操作）==========
    if ((opType === "insert" || opType === "update") && this._schemaCache) {
      // 检查是否跳过验证
      const skipValidation =
        args[args.length - 1] &&
        typeof args[args.length - 1] === "object" &&
        args[args.length - 1].skipValidation === true;

      // 🔴 默认启用验证，除非显式跳过或配置为 false
      const enableValidation =
        !skipValidation &&
        // 全局配置未明确禁用（默认为 true）
        (this.definition.options?.validate !== false ||
          // 单次操作启用
          (args[args.length - 1] &&
            typeof args[args.length - 1] === "object" &&
            args[args.length - 1].validate === true));

      if (enableValidation && typeof validate === "function") {
        try {
          if (opType === "insert") {
            const docs = args[0];
            const docsArray = Array.isArray(docs) ? docs : [docs];

            for (let i = 0; i < docsArray.length; i++) {
              const validationResult = validate(
                this._schemaCache,
                docsArray[i],
              );
              if (!validationResult.valid) {
                // 格式化错误消息
                const errors = validationResult.errors || [];
                const errorMessages = errors
                  .map((err) => {
                    const field = err.field || err.path || "unknown";
                    const value = docsArray[i][field];
                    if (err.type === "type") {
                      return `Field '${field}': expected type '${err.expected}', got '${typeof value}'`;
                    } else if (err.type === "required") {
                      return `Field '${field}': required field is missing`;
                    } else {
                      return `Field '${field}': ${err.message || "validation failed"}`;
                    }
                  })
                  .join("; ");

                const err = new Error(
                  `Schema validation failed${Array.isArray(docs) ? ` at index ${i}` : ""}: ${errorMessages}`,
                );
                err.code = "VALIDATION_ERROR";
                err.errors = errors;
                err.index = Array.isArray(docs) ? i : undefined;
                throw err;
              }
            }
          }
        } catch (err) {
          // 如果是我们抛出的验证错误，直接抛出
          if (err.code === "VALIDATION_ERROR") {
            throw err;
          }
          // 如果 validate 函数不可用或执行失败，记录警告但继续
          if (this.msq && this.msq.logger) {
            this.msq.logger.warn(
              "[Model] Schema validation skipped:",
              err.message,
            );
          }
        }
      }
    }

    // ========== 自动注入时间戳（在用户 hook 之后执行）==========
    if (this.definition._internalHooks?.timestamps) {
      args = this._applyTimestamps(opType, method, args);
    }

    // ========== 执行原始方法 ==========
    const result = await this.collection[method](...args);

    // ========== After Hook ==========
    if (typeof opHooks.after === "function") {
      try {
        const modifiedResult = await opHooks.after(ctx, result);
        // 如果 after 返回值，使用修改后的结果
        if (modifiedResult !== undefined) {
          return modifiedResult;
        }
      } catch (err) {
        // 🔧 修复：after hook 失败记录警告，但不影响操作结果
        if (this.msq && this.msq.logger) {
          this.msq.logger.warn(
            `[Model] After hook failed for ${method}:`,
            err.message,
          );
        }
        // 不抛出错误，返回原始结果
      }
    }

    return result;
  }

  /**
   * 应用时间戳到 incrementOne
   *
   * incrementOne 的参数: (filter, field, increment, options)
   * 我们需要在底层的 findOneAndUpdate 调用中注入 $set.updatedAt
   *
   * @private
   * @param {Array} args - incrementOne 参数数组
   * @returns {Array} 修改后的参数
   */
  _applyTimestampsToIncrementOne(args) {
    const config = this.definition._internalHooks.timestamps;
    const now = new Date();

    // 找到 options 参数（可能在 args[2] 或 args[3]）
    let optionsIndex = -1;
    if (args[3] && typeof args[3] === "object") {
      optionsIndex = 3;
    } else if (
      args[2] &&
      typeof args[2] === "object" &&
      typeof args[2] !== "number"
    ) {
      // args[2] 是对象且不是数字（increment）
      optionsIndex = 2;
    }

    // 创建或修改 options，添加 $set.updatedAt
    if (optionsIndex === -1) {
      // 没有 options，创建一个
      args[3] = { $set: { [config.updatedAt]: now } };
    } else {
      // 有 options，合并 $set
      const options = args[optionsIndex];
      if (!options.$set) {
        options.$set = {};
      }
      options.$set[config.updatedAt] = now;
    }

    return args;
  }

  /**
   * 应用时间戳
   *
   * @private
   * @param {string} opType - 操作类型
   * @param {string} method - 方法名
   * @param {Array} args - 参数
   * @returns {Array} 修改后的参数
   */
  _applyTimestamps(opType, method, args) {
    const config = this.definition._internalHooks.timestamps;
    const now = new Date();

    if (opType === "insert") {
      // insertOne/insertMany
      const docs = args[0];

      if (Array.isArray(docs)) {
        // insertMany
        args[0] = docs.map((doc) => {
          const newDoc = { ...doc };
          // 🔧 修复：只在用户未手动设置时添加时间戳
          if (config.createdAt && !doc[config.createdAt]) {
            newDoc[config.createdAt] = now;
          }
          if (config.updatedAt && !doc[config.updatedAt]) {
            newDoc[config.updatedAt] = now;
          }
          return newDoc;
        });
      } else {
        // insertOne
        const newDoc = { ...docs };
        // 🔧 修复：只在用户未手动设置时添加时间戳
        if (config.createdAt && !docs[config.createdAt]) {
          newDoc[config.createdAt] = now;
        }
        if (config.updatedAt && !docs[config.updatedAt]) {
          newDoc[config.updatedAt] = now;
        }
        args[0] = newDoc;
      }
    } else if (opType === "update") {
      // updateOne/updateMany/replaceOne/upsertOne/findOneAndUpdate/findOneAndReplace/incrementOne

      if (method.startsWith("upsert")) {
        // 🔧 upsert 特殊处理：插入时添加 createdAt，更新时只更新 updatedAt
        const update = args[1] || {};

        // $setOnInsert: 仅在插入新文档时执行
        if (config.createdAt) {
          if (!update.$setOnInsert) {
            update.$setOnInsert = {};
          }
          update.$setOnInsert[config.createdAt] = now;
        }

        // $set: 每次都执行（插入和更新都会设置 updatedAt）
        if (config.updatedAt) {
          if (!update.$set) {
            update.$set = {};
          }
          update.$set[config.updatedAt] = now;
        }

        args[1] = update;
      } else if (method === "replaceOne" || method === "findOneAndReplace") {
        // replaceOne/findOneAndReplace: 直接在文档中添加（不能使用操作符）
        if (config.updatedAt) {
          const replacement = args[1] || {};
          // 🔧 修复：只在用户未手动设置时添加 updatedAt
          if (!replacement[config.updatedAt]) {
            replacement[config.updatedAt] = now;
          }
          args[1] = replacement;
        }
      } else if (method.startsWith("increment")) {
        // 🔧 incrementOne 特殊处理
        // incrementOne(filter, field, increment, options)
        // Model 层无法直接修改内部的 $inc 对象，但可以通过 options 传递时间戳更新
        // 注意：incrementOne 内部会调用 findOneAndUpdate，所以我们不在这里处理
        // 而是让 incrementOne 自己处理（需要修改 increment-one.js）
        // 暂时跳过
      } else if (config.updatedAt) {
        // 其他 update 操作（updateOne/updateMany/findOneAndUpdate）：在 $set 中添加 updatedAt
        const update = args[1] || {};

        if (!update.$set) {
          update.$set = {};
        }

        update.$set[config.updatedAt] = now;
        args[1] = update;
      }
    }

    return args;
  }

  /**
   * 提取操作类型
   *
   * @private
   * @param {string} method - 方法名
   * @returns {string} 操作类型（find/insert/update/delete）
   */
  _getOperationType(method) {
    // findOneAnd* 方法需要特殊处理（优先判断）
    if (
      method === "findOneAndUpdate" ||
      method === "findOneAndReplace" ||
      method === "findOneAndDelete"
    ) {
      if (method === "findOneAndDelete") {
        return "delete";
      }
      return "update";
    }

    if (
      method.startsWith("find") ||
      method === "aggregate" ||
      method === "count"
    ) {
      return "find";
    }
    if (method.startsWith("insert")) {
      return "insert";
    }
    if (
      method.startsWith("update") ||
      method.startsWith("replace") ||
      method.startsWith("upsert") ||
      method.startsWith("increment")
    ) {
      return "update";
    }
    if (method.startsWith("delete")) {
      return "delete";
    }
    return "unknown";
  }

  /**
   * 数据验证方法
   *
   * @param {Object} data - 待验证的数据
   * @param {Object} [options] - 验证选项
   * @param {string} [options.locale] - 语言（zh-CN/en-US等）
   * @returns {Object} 验证结果 { valid: boolean, errors: Array, data: Object }
   *
   * @example
   * const result = model.validate({ username: 'test' });
   * if (!result.valid) {
   *   console.error(result.errors);
   * }
   */
  validate(data, options = {}) {
    try {
      // 获取 schema（优先使用缓存）
      let schema = this._schemaCache;

      // 如果缓存为空，重新编译
      if (!schema) {
        if (typeof this.definition.schema === "function") {
          schema = this.definition.schema.call(this.definition, dsl);
        } else {
          schema = this.definition.schema;
        }
      }

      // 执行验证
      const result = validate(schema, data);

      // 返回统一格式
      return {
        valid: result.valid,
        errors: result.errors || [],
        data: result.data || data,
      };
    } catch (err) {
      // 验证过程失败
      return {
        valid: false,
        errors: [
          {
            field: "_schema",
            message: `Schema validation failed: ${err.message}`,
            code: "SCHEMA_ERROR",
          },
        ],
        data,
      };
    }
  }

  /**
   * 自动创建索引
   *
   * @private
   * @returns {Promise<void>}
   */
  async _createIndexes() {
    if (!Array.isArray(this.indexes) || this.indexes.length === 0) {
      return;
    }

    try {
      // 使用 createIndexes 批量创建索引
      await this.collection.createIndexes(this.indexes);

      if (this.msq && this.msq.logger) {
        this.msq.logger.info(
          `[Model] Created ${this.indexes.length} index(es) for ${this.collection.collectionName}`,
        );
      }
    } catch (err) {
      // 索引创建失败仅记录警告
      if (this.msq && this.msq.logger) {
        this.msq.logger.warn(
          `[Model] Failed to create indexes for ${this.collection.collectionName}:`,
          err.message,
        );
      }
      throw err;
    }
  }

  /**
   * 获取关系定义
   *
   * @returns {Object} 关系定义对象
   *
   * @example
   * const relations = model.getRelations();
   * // { posts: { type: 'hasMany', target: 'Post', ... } }
   */
  getRelations() {
    return this.definition.relations || {};
  }

  /**
   * 获取 enums 配置
   *
   * @returns {Object} 枚举配置对象
   *
   * @example
   * const enums = model.getEnums();
   * // { role: 'admin|user', status: 'active|inactive' }
   */
  getEnums() {
    return this.definition.enums || {};
  }
}

// ========== 导出 ==========
module.exports = Model;
module.exports.ModelInstance = ModelInstance;
