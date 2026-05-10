var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/core/errors/index.ts
var ErrorCodes = {
  INVALID_ARGUMENT: "INVALID_ARGUMENT",
  INVALID_COLLECTION_NAME: "INVALID_COLLECTION_NAME",
  INVALID_DATABASE_NAME: "INVALID_DATABASE_NAME",
  INVALID_EXPRESSION: "INVALID_EXPRESSION",
  INVALID_PAGINATION: "INVALID_PAGINATION",
  CACHE_UNAVAILABLE: "CACHE_UNAVAILABLE",
  MANAGEMENT_OPERATION_FAILED: "MANAGEMENT_OPERATION_FAILED",
  NOT_CONNECTED: "NOT_CONNECTED",
  CONNECTION_FAILED: "CONNECTION_FAILED",
  CONNECTION_CLOSED: "CONNECTION_CLOSED",
  INVALID_CONFIG: "INVALID_CONFIG",
  UNSUPPORTED_DATABASE: "UNSUPPORTED_DATABASE"
};
function createError(code, message, details, cause) {
  const error = new Error(message);
  error.code = code;
  if (details !== void 0) {
    error.details = details;
  }
  if (cause !== void 0) {
    error.cause = cause;
  }
  return error;
}
function createConnectionError(message, cause) {
  return createError(ErrorCodes.CONNECTION_FAILED, message, void 0, cause);
}

// src/adapters/mongodb/management/index.ts
var MongoAdminAccessor = class {
  constructor(dbRef, logger) {
    this.dbRef = dbRef;
    this.logger = logger;
  }
  /**
   * 检测数据库连接是否可用。
   * @since v1.3.0
   */
  async ping() {
    try {
      await this.dbRef.admin().ping();
      return true;
    } catch (cause) {
      this.logger?.error("MongoDB ping failed", cause);
      return false;
    }
  }
  /**
   * 获取 MongoDB 版本信息。
   * @since v1.3.0
   */
  async buildInfo() {
    try {
      const info = await this.dbRef.admin().buildInfo();
      return {
        version: info.version,
        versionArray: info.versionArray,
        gitVersion: info.gitVersion,
        bits: info.bits,
        debug: info.debug,
        maxBsonObjectSize: info.maxBsonObjectSize
      };
    } catch (cause) {
      throw createError(
        ErrorCodes.MANAGEMENT_OPERATION_FAILED,
        `Failed to get MongoDB build info: ${extractErrorMessage(cause)}`,
        void 0,
        cause instanceof Error ? cause : void 0
      );
    }
  }
  /**
   * 获取服务器状态快照。
   * @since v1.3.0
   */
  async serverStatus(options = {}) {
    try {
      const status = await this.dbRef.admin().command({
        serverStatus: 1,
        scale: options.scale ?? 1
      });
      return {
        connections: {
          current: status.connections?.current,
          available: status.connections?.available,
          totalCreated: status.connections?.totalCreated
        },
        mem: {
          resident: status.mem?.resident,
          virtual: status.mem?.virtual,
          mapped: status.mem?.mapped
        },
        opcounters: {
          insert: status.opcounters?.insert,
          query: status.opcounters?.query,
          update: status.opcounters?.update,
          delete: status.opcounters?.delete,
          getmore: status.opcounters?.getmore,
          command: status.opcounters?.command
        },
        network: {
          bytesIn: status.network?.bytesIn,
          bytesOut: status.network?.bytesOut,
          numRequests: status.network?.numRequests
        },
        uptime: status.uptime,
        localTime: status.localTime,
        version: status.version,
        process: status.process
      };
    } catch (cause) {
      throw createError(
        ErrorCodes.MANAGEMENT_OPERATION_FAILED,
        `Failed to get MongoDB server status: ${extractErrorMessage(cause)}`,
        void 0,
        cause instanceof Error ? cause : void 0
      );
    }
  }
  /**
   * 获取当前数据库统计信息。
   * @since v1.3.0
   */
  async stats(options = {}) {
    try {
      const stats = await this.dbRef.stats({ scale: options.scale ?? 1 });
      return {
        db: stats.db,
        collections: stats.collections,
        views: stats.views,
        objects: stats.objects,
        avgObjSize: stats.avgObjSize,
        dataSize: stats.dataSize,
        storageSize: stats.storageSize,
        indexes: stats.indexes,
        indexSize: stats.indexSize,
        totalSize: stats.totalSize,
        scaleFactor: stats.scaleFactor
      };
    } catch (cause) {
      throw createError(
        ErrorCodes.MANAGEMENT_OPERATION_FAILED,
        `Failed to get MongoDB database stats: ${extractErrorMessage(cause)}`,
        void 0,
        cause instanceof Error ? cause : void 0
      );
    }
  }
};
async function createIndexDefinition(collectionRef, keys, options) {
  validateIndexKeys(keys, "createIndex");
  const name = await collectionRef.createIndex(keys, options);
  return { name };
}
async function createIndexDefinitions(collectionRef, specs) {
  if (!Array.isArray(specs) || specs.length === 0) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "createIndexes: specs must be a non-empty array.");
  }
  for (const spec of specs) {
    validateIndexKeys(spec?.key, "createIndexes");
  }
  return collectionRef.createIndexes(specs);
}
async function listIndexDefinitions(collectionRef) {
  return collectionRef.listIndexes().toArray();
}
async function dropIndexDefinition(collectionRef, name) {
  if (!name?.trim()) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "dropIndex: name must be a non-empty string.");
  }
  if (name === "_id_") {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "dropIndex: dropping the _id_ index is not allowed.");
  }
  return collectionRef.dropIndex(name);
}
async function dropIndexDefinitions(collectionRef) {
  return collectionRef.dropIndexes();
}
async function prewarmBookmarks(params) {
  const cache = ensureBookmarkCache(params.cache);
  const pages = params.pages ?? [];
  if (!Array.isArray(pages) || pages.length === 0) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "prewarmBookmarks: pages must be a non-empty array.");
  }
  const keyDims = normalizeBookmarkKeyDims(params.keyDims);
  const result = {
    warmed: 0,
    failed: 0,
    keys: []
  };
  for (const page of pages) {
    if (!Number.isInteger(page) || page < 1) {
      result.failed += 1;
      params.logger?.warn(`Skip invalid bookmark page: ${page}`);
      continue;
    }
    try {
      const payload = await params.findPage({ ...keyDims, page });
      const key = buildBookmarkKey(params.namespace, keyDims, page);
      await Promise.resolve(cache.set(key, {
        page,
        pageInfo: payload.page,
        totals: payload.totals,
        size: payload.data.length,
        warmedAt: (/* @__PURE__ */ new Date()).toISOString()
      }));
      if (payload.data.length > 0) {
        result.warmed += 1;
      } else {
        result.failed += 1;
      }
    } catch (cause) {
      result.failed += 1;
      params.logger?.warn("Bookmark prewarm failed", cause);
    }
  }
  result.keys = await resolveKeys(cache, buildBookmarkPattern(params.namespace, keyDims));
  return result;
}
async function listBookmarks(params) {
  const cache = ensureBookmarkCache(params.cache);
  const keys = await resolveKeys(cache, buildBookmarkPattern(params.namespace, normalizeBookmarkKeyDims(params.keyDims)));
  const pages = keys.map(extractBookmarkPage).filter((page) => page !== null).sort((a, b) => a - b);
  return {
    count: pages.length,
    pages,
    keys
  };
}
async function clearBookmarks(params) {
  const cache = ensureBookmarkCache(params.cache);
  const pattern = buildBookmarkPattern(params.namespace, normalizeBookmarkKeyDims(params.keyDims));
  const keysBefore = await resolveKeys(cache, pattern);
  const cleared = await resolveDeletePattern(cache, pattern);
  return {
    cleared,
    pattern,
    keysBefore: keysBefore.length
  };
}
function validateIndexKeys(keys, operation) {
  if (!keys || typeof keys !== "object" || Array.isArray(keys) || Object.keys(keys).length === 0) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, `${operation}: keys must be a non-empty object.`);
  }
}
function ensureBookmarkCache(cache) {
  if (!cache || typeof cache.set !== "function" || typeof cache.get !== "function" || typeof cache.keys !== "function" || typeof cache.delPattern !== "function") {
    throw createError(ErrorCodes.CACHE_UNAVAILABLE, "Bookmark operations require a cache implementation with set/get/keys/delPattern.");
  }
  return cache;
}
function normalizeBookmarkKeyDims(keyDims) {
  return {
    ...keyDims ?? {}
  };
}
function buildBookmarkKey(namespace, keyDims, page) {
  return `${buildBookmarkBaseKey(namespace, keyDims)}:page:${page}`;
}
function buildBookmarkPattern(namespace, keyDims) {
  return `${buildBookmarkBaseKey(namespace, keyDims)}:page:*`;
}
function buildBookmarkBaseKey(namespace, keyDims) {
  return `bookmark:${namespace}:${stableStringify(keyDims)}`;
}
function stableStringify(value) {
  if (value === null || value === void 0) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}
async function resolveKeys(cache, pattern) {
  const keys = await Promise.resolve(cache.keys?.(pattern) ?? []);
  return Array.isArray(keys) ? keys : [];
}
async function resolveDeletePattern(cache, pattern) {
  const deleted = await Promise.resolve(cache.delPattern?.(pattern) ?? 0);
  return typeof deleted === "number" ? deleted : 0;
}
function extractBookmarkPage(key) {
  const match = key.match(/:page:(\d+)$/);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1], 10);
}
function extractErrorMessage(cause) {
  if (cause instanceof Error) {
    return cause.message;
  }
  return String(cause);
}

// src/core/expression/index.ts
var SIMPLE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
var FUNCTION_CALL = /^([A-Z_][A-Z0-9_]*)\((.*)\)$/;
function createExpression(expression) {
  if (typeof expression !== "string") {
    throw createError(ErrorCodes.INVALID_EXPRESSION, "Expression must be a string.");
  }
  const normalized = expression.trim();
  if (!normalized) {
    throw createError(ErrorCodes.INVALID_EXPRESSION, "Expression cannot be empty.");
  }
  return {
    __expr__: normalized,
    __compiled__: false
  };
}
var expr = createExpression;
function isExpressionObject(value) {
  return Boolean(
    value && typeof value === "object" && "__expr__" in value && typeof value.__expr__ === "string" && "__compiled__" in value && typeof value.__compiled__ === "boolean"
  );
}
function hasExpressionInObject(value) {
  if (isExpressionObject(value)) {
    return true;
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasExpressionInObject(item));
  }
  return Object.values(value).some((item) => hasExpressionInObject(item));
}
function hasExpressionInPipeline(pipeline) {
  return Array.isArray(pipeline) && pipeline.some((stage) => hasExpressionInObject(stage));
}
function compilePipelineExpressions(pipeline) {
  return transformExpressions(pipeline);
}
function transformExpressions(value) {
  if (isExpressionObject(value)) {
    return compileExpressionString(value.__expr__);
  }
  if (Array.isArray(value)) {
    return value.map((item) => transformExpressions(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [key, transformExpressions(entryValue)])
  );
}
function compileExpressionString(expression) {
  const normalized = stripOuterParentheses(expression.trim());
  if (!normalized) {
    throw createError(ErrorCodes.INVALID_EXPRESSION, "Expression cannot be empty after normalization.");
  }
  const arithmeticOperator = findTopLevelOperator(normalized, ["+", "-", "*", "/"]);
  if (arithmeticOperator) {
    const left = normalized.slice(0, arithmeticOperator.index).trim();
    const right = normalized.slice(arithmeticOperator.index + 1).trim();
    if (!left || !right) {
      throw createError(ErrorCodes.INVALID_EXPRESSION, `Invalid arithmetic expression: ${expression}`);
    }
    const operatorMap = {
      "+": "$add",
      "-": "$subtract",
      "*": "$multiply",
      "/": "$divide"
    };
    return {
      [operatorMap[arithmeticOperator.operator]]: [
        compileExpressionString(left),
        compileExpressionString(right)
      ]
    };
  }
  const callMatch = normalized.match(FUNCTION_CALL);
  if (callMatch) {
    return compileFunctionCall(callMatch[1], splitArguments(callMatch[2]).map((item) => compileExpressionString(item)));
  }
  if (normalized.startsWith("'") && normalized.endsWith("'") || normalized.startsWith('"') && normalized.endsWith('"')) {
    return normalized.slice(1, -1);
  }
  if (/^-?\d+(\.\d+)?$/.test(normalized)) {
    return Number(normalized);
  }
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  if (normalized === "null") {
    return null;
  }
  if (normalized === "CURRENT_DATE" || normalized === "NOW()") {
    return "$$NOW";
  }
  if (SIMPLE_IDENTIFIER.test(normalized)) {
    return `$${normalized}`;
  }
  throw createError(ErrorCodes.INVALID_EXPRESSION, `Unsupported expression syntax: ${expression}`);
}
function compileFunctionCall(name, args) {
  const upperName = name.toUpperCase();
  switch (upperName) {
    case "COUNT":
      if (args.length !== 0) {
        throw createError(ErrorCodes.INVALID_EXPRESSION, "COUNT() does not accept arguments in the minimal P2-B compiler.");
      }
      return { $sum: 1 };
    case "SUM":
      return singleArgumentOperator("$sum", upperName, args);
    case "AVG":
      return singleArgumentOperator("$avg", upperName, args);
    case "MAX":
      return singleArgumentOperator("$max", upperName, args);
    case "MIN":
      return singleArgumentOperator("$min", upperName, args);
    case "YEAR":
      return singleArgumentOperator("$year", upperName, args);
    case "MONTH":
      return singleArgumentOperator("$month", upperName, args);
    case "DAY":
    case "DAY_OF_MONTH":
      return singleArgumentOperator("$dayOfMonth", upperName, args);
    case "LOWER":
      return singleArgumentOperator("$toLower", upperName, args);
    case "UPPER":
      return singleArgumentOperator("$toUpper", upperName, args);
    case "TRIM":
      return singleArgumentOperator("$trim", upperName, args);
    case "SIZE":
      return singleArgumentOperator("$size", upperName, args);
    case "CONCAT":
      if (args.length === 0) {
        throw createError(ErrorCodes.INVALID_EXPRESSION, "CONCAT() requires at least one argument.");
      }
      return { $concat: args };
    default:
      throw createError(ErrorCodes.INVALID_EXPRESSION, `Unsupported expression function: ${name}`);
  }
}
function singleArgumentOperator(operator, name, args) {
  if (args.length !== 1) {
    throw createError(ErrorCodes.INVALID_EXPRESSION, `${name}() requires exactly one argument.`);
  }
  if (operator === "$trim") {
    return { $trim: { input: args[0] } };
  }
  return { [operator]: args[0] };
}
function splitArguments(argsSource) {
  const normalized = argsSource.trim();
  if (!normalized) {
    return [];
  }
  const result = [];
  let current = "";
  let depth = 0;
  let quote = null;
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const previous = normalized[index - 1];
    if ((char === '"' || char === "'") && previous !== "\\") {
      if (quote === char) {
        quote = null;
      } else if (!quote) {
        quote = char;
      }
      current += char;
      continue;
    }
    if (!quote) {
      if (char === "(") {
        depth += 1;
        current += char;
        continue;
      }
      if (char === ")") {
        depth -= 1;
        current += char;
        continue;
      }
      if (char === "," && depth === 0) {
        result.push(current.trim());
        current = "";
        continue;
      }
    }
    current += char;
  }
  if (current.trim()) {
    result.push(current.trim());
  }
  return result;
}
function findTopLevelOperator(source, operators) {
  let depth = 0;
  let quote = null;
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const char = source[index];
    const previous = source[index - 1];
    if ((char === '"' || char === "'") && previous !== "\\") {
      if (quote === char) {
        quote = null;
      } else if (!quote) {
        quote = char;
      }
      continue;
    }
    if (quote) {
      continue;
    }
    if (char === ")") {
      depth += 1;
      continue;
    }
    if (char === "(") {
      depth -= 1;
      continue;
    }
    if (depth !== 0) {
      continue;
    }
    if (operators.includes(char) && index > 0 && index < source.length - 1) {
      return { operator: char, index };
    }
  }
  return null;
}
function stripOuterParentheses(source) {
  let normalized = source.trim();
  while (normalized.startsWith("(") && normalized.endsWith(")") && isWrappedByOuterParentheses(normalized)) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}
function isWrappedByOuterParentheses(source) {
  let depth = 0;
  let quote = null;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const previous = source[index - 1];
    if ((char === '"' || char === "'") && previous !== "\\") {
      if (quote === char) {
        quote = null;
      } else if (!quote) {
        quote = char;
      }
      continue;
    }
    if (quote) {
      continue;
    }
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0 && index < source.length - 1) {
        return false;
      }
    }
  }
  return true;
}

// src/adapters/mongodb/queries/index.ts
async function findDocuments(collection, ...args) {
  return collection.find(...args).toArray();
}
async function findOneDocument(collection, ...args) {
  return collection.findOne(...args);
}
async function countDocuments(collection, ...args) {
  return collection.countDocuments(...args);
}
async function aggregateDocuments(collection, pipeline = [], options) {
  const processedPipeline = hasExpressionInPipeline(pipeline) ? compilePipelineExpressions(pipeline) : pipeline;
  return collection.aggregate(processedPipeline, options).toArray();
}
async function distinctValues(collection, key, filter, options) {
  const normalizedFilter = filter ?? {};
  if (options === void 0) {
    return collection.distinct(key, normalizedFilter);
  }
  return collection.distinct(key, normalizedFilter, options);
}
function watchDocuments(collection, pipeline = [], options) {
  const processedPipeline = hasExpressionInPipeline(pipeline) ? compilePipelineExpressions(pipeline) : pipeline;
  return collection.watch(processedPipeline, options);
}
async function findPageDocuments(collection, options = {}) {
  const page = normalizePositiveInteger(options.page, 1, "page");
  const limit = normalizePositiveInteger(options.limit, 20, "limit");
  const query = options.query ?? {};
  const skip = (page - 1) * limit;
  const driverOptions = {
    ...options.options ?? {},
    ...options.sort ? { sort: options.sort } : {},
    ...options.projection ? { projection: options.projection } : {},
    skip,
    limit
  };
  const queryFilter = query;
  const [data, total] = await Promise.all([
    collection.find(queryFilter, driverOptions).toArray(),
    collection.countDocuments(queryFilter)
  ]);
  return {
    data,
    page: { page, limit },
    totals: {
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit)
    }
  };
}
function normalizePositiveInteger(value, fallback, field) {
  if (value === void 0 || value === null) {
    return fallback;
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw createError(ErrorCodes.INVALID_PAGINATION, `${field} must be a positive integer.`);
  }
  return value;
}

// src/adapters/mongodb/writes/index.ts
function splitIntoBatches(items, batchSize) {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "batchSize must be a positive integer.");
  }
  const batches = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }
  return batches;
}
function createIncrementUpdate(field, increment = 1, setPatch) {
  let incPayload;
  if (typeof field === "string") {
    if (!field.trim()) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "incrementOne: field must be a non-empty string.");
    }
    if (typeof increment !== "number" || Number.isNaN(increment)) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "incrementOne: increment must be a valid number.");
    }
    incPayload = { [field]: increment };
  } else if (field && typeof field === "object" && !Array.isArray(field)) {
    incPayload = {};
    for (const [key, value] of Object.entries(field)) {
      if (typeof value !== "number" || Number.isNaN(value)) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, `incrementOne: field "${key}" must use a numeric increment.`);
      }
      incPayload[key] = value;
    }
    if (Object.keys(incPayload).length === 0) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "incrementOne: field map must not be empty.");
    }
  } else {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "incrementOne: field must be a string or object.");
  }
  return {
    $inc: incPayload,
    ...setPatch && Object.keys(setPatch).length > 0 ? { $set: setPatch } : {}
  };
}
async function insertOneDocument(collection, ...args) {
  return collection.insertOne(...args);
}
async function insertManyDocuments(collection, ...args) {
  return collection.insertMany(...args);
}
async function updateOneDocument(collection, ...args) {
  return collection.updateOne(...args);
}
async function updateManyDocuments(collection, ...args) {
  return collection.updateMany(...args);
}
async function replaceOneDocument(collection, ...args) {
  return collection.replaceOne(...args);
}
async function findOneAndUpdateDocument(collection, ...args) {
  return collection.findOneAndUpdate(...args);
}
async function findOneAndDeleteDocument(collection, ...args) {
  return collection.findOneAndDelete(...args);
}
async function upsertOneDocument(collection, filter, update, options = {}) {
  return collection.updateOne(filter, update, {
    ...options,
    upsert: true
  });
}
async function deleteOneDocument(collection, ...args) {
  return collection.deleteOne(...args);
}
async function deleteManyDocuments(collection, ...args) {
  return collection.deleteMany(...args);
}
async function insertBatchDocuments(collection, documents, options = {}) {
  if (!Array.isArray(documents) || documents.length === 0) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "insertBatch: documents must be a non-empty array.");
  }
  const { batchSize = 1e3, ordered = false, ...driverOptions } = options;
  const batches = splitIntoBatches(documents, batchSize);
  const result = {
    acknowledged: true,
    totalCount: documents.length,
    insertedCount: 0,
    batchCount: batches.length,
    errors: [],
    insertedIds: {}
  };
  let offset = 0;
  for (const [batchIndex, batch] of batches.entries()) {
    try {
      const batchResult = await collection.insertMany(batch, {
        ...driverOptions,
        ordered
      });
      result.insertedCount += batchResult.insertedCount;
      for (const [key, value] of Object.entries(batchResult.insertedIds)) {
        result.insertedIds[offset + Number.parseInt(key, 10)] = value;
      }
      offset += batch.length;
    } catch (cause) {
      result.errors.push({
        batchIndex,
        message: cause instanceof Error ? cause.message : String(cause)
      });
      throw cause;
    }
  }
  return result;
}
async function updateBatchDocuments(collection, filter, update, options = {}) {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "updateBatch: filter must be a non-empty object.");
  }
  if ((!update || typeof update !== "object") && !Array.isArray(update)) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "updateBatch: update must be an object or aggregation pipeline.");
  }
  const { batchSize = 1e3, sort = { _id: 1 }, ...driverOptions } = options;
  const ids = await collection.find(filter, {
    projection: { _id: 1 },
    sort
  }).map((document) => document._id).toArray();
  const batches = splitIntoBatches(ids, batchSize);
  const result = {
    acknowledged: true,
    totalCount: ids.length,
    matchedCount: 0,
    modifiedCount: 0,
    batchCount: batches.length,
    errors: []
  };
  for (const [batchIndex, batch] of batches.entries()) {
    try {
      const batchResult = await collection.updateMany(
        { _id: { $in: batch } },
        update,
        driverOptions
      );
      result.matchedCount += batchResult.matchedCount;
      result.modifiedCount += batchResult.modifiedCount;
    } catch (cause) {
      result.errors.push({
        batchIndex,
        message: cause instanceof Error ? cause.message : String(cause)
      });
      throw cause;
    }
  }
  return result;
}
async function deleteBatchDocuments(collection, filter, options = {}) {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "deleteBatch: filter must be a non-empty object.");
  }
  const { batchSize = 1e3, sort = { _id: 1 }, ...driverOptions } = options;
  const ids = await collection.find(filter, {
    projection: { _id: 1 },
    sort
  }).map((document) => document._id).toArray();
  const batches = splitIntoBatches(ids, batchSize);
  const result = {
    acknowledged: true,
    totalCount: ids.length,
    deletedCount: 0,
    batchCount: batches.length,
    errors: []
  };
  for (const [batchIndex, batch] of batches.entries()) {
    try {
      const batchResult = await collection.deleteMany(
        { _id: { $in: batch } },
        driverOptions
      );
      result.deletedCount += batchResult.deletedCount;
    } catch (cause) {
      result.errors.push({
        batchIndex,
        message: cause instanceof Error ? cause.message : String(cause)
      });
      throw cause;
    }
  }
  return result;
}
async function incrementOneDocument(collection, filter, field, incrementOrOptions, maybeOptions) {
  const options = typeof incrementOrOptions === "number" || incrementOrOptions === void 0 ? maybeOptions ?? {} : incrementOrOptions;
  const increment = typeof incrementOrOptions === "number" ? incrementOrOptions : 1;
  const updateDocument = createIncrementUpdate(field, increment, options.$set);
  const { $set, ...driverOptions } = options;
  void $set;
  return collection.findOneAndUpdate(filter, updateDocument, {
    ...driverOptions,
    returnDocument: options.returnDocument ?? "after"
  });
}

// src/adapters/mongodb/common/accessors.ts
var MongoCollectionAccessor = class {
  constructor(dbName, collectionName, collectionRef, management = {}) {
    this.dbName = dbName;
    this.collectionName = collectionName;
    this.collectionRef = collectionRef;
    this.management = management;
  }
  /**
   * 获取命名空间。
   * @since v1.3.0
   */
  getNamespace() {
    return {
      iid: `${this.dbName}:${this.collectionName}`,
      type: "mongodb",
      db: this.dbName,
      collection: this.collectionName
    };
  }
  /**
   * 透传原生 MongoDB Collection。
   * @since v1.3.0
   */
  raw() {
    return this.collectionRef;
  }
  /**
   * 查询单个文档（P2-A 先恢复原生透传）。
   * @since v1.3.0
   */
  async findOne(...args) {
    return findOneDocument(this.collectionRef, ...args);
  }
  /**
   * 查询多个文档（当前阶段先恢复最小数组结果）。
   * @since v1.3.0
   */
  async find(...args) {
    return findDocuments(this.collectionRef, ...args);
  }
  /**
   * 统计符合条件的文档数量。
   * @since v1.3.0
   */
  async count(...args) {
    return countDocuments(this.collectionRef, ...args);
  }
  /**
   * 聚合查询。
   * @since v1.3.0
   */
  async aggregate(pipeline = [], options) {
    return aggregateDocuments(this.collectionRef, pipeline, options);
  }
  /**
   * 查询去重字段值。
   * @since v1.3.0
   */
  async distinct(key, query, options) {
    return distinctValues(this.collectionRef, key, query, options);
  }
  /**
   * 简化分页查询。
   * @since v1.3.0
   */
  async findPage(options = {}) {
    return findPageDocuments(this.collectionRef, options);
  }
  /**
   * 监听集合变更。
   * @since v1.3.0
   */
  watch(pipeline = [], options) {
    return watchDocuments(this.collectionRef, pipeline, options);
  }
  /**
   * 原生插入透传。
   * @since v1.3.0
   */
  async insertOne(...args) {
    return insertOneDocument(this.collectionRef, ...args);
  }
  /**
   * 原生批量插入透传。
   * @since v1.3.0
   */
  async insertMany(...args) {
    return insertManyDocuments(this.collectionRef, ...args);
  }
  /**
   * 原生更新透传。
   * @since v1.3.0
   */
  async updateOne(...args) {
    return updateOneDocument(this.collectionRef, ...args);
  }
  /**
   * 原生批量更新透传。
   * @since v1.3.0
   */
  async updateMany(...args) {
    return updateManyDocuments(this.collectionRef, ...args);
  }
  /**
   * 原生替换单个文档透传。
   * @since v1.3.0
   */
  async replaceOne(...args) {
    return replaceOneDocument(this.collectionRef, ...args);
  }
  /**
   * 原子查找并更新单个文档。
   * @since v1.3.0
   */
  async findOneAndUpdate(...args) {
    return findOneAndUpdateDocument(this.collectionRef, ...args);
  }
  /**
   * 原子查找并删除单个文档。
   * @since v1.3.0
   */
  async findOneAndDelete(...args) {
    return findOneAndDeleteDocument(this.collectionRef, ...args);
  }
  /**
   * 便利 upsert 包装。
   * @since v1.3.0
   */
  async upsertOne(filter, update, options) {
    return upsertOneDocument(this.collectionRef, filter, update, options);
  }
  /**
   * 原生删除透传。
   * @since v1.3.0
   */
  async deleteOne(...args) {
    return deleteOneDocument(this.collectionRef, ...args);
  }
  /**
   * 原生批量删除透传。
   * @since v1.3.0
   */
  async deleteMany(...args) {
    return deleteManyDocuments(this.collectionRef, ...args);
  }
  /**
   * 分批批量插入文档。
   * @since v1.3.0
   */
  async insertBatch(documents, options) {
    return insertBatchDocuments(this.collectionRef, documents, options);
  }
  /**
   * 分批更新匹配文档。
   * @since v1.3.0
   */
  async updateBatch(filter, update, options) {
    return updateBatchDocuments(this.collectionRef, filter, update, options);
  }
  /**
   * 分批删除匹配文档。
   * @since v1.3.0
   */
  async deleteBatch(filter, options) {
    return deleteBatchDocuments(this.collectionRef, filter, options);
  }
  /**
   * 便利字段递增/递减。
   * @since v1.3.0
   */
  async incrementOne(filter, field, incrementOrOptions, maybeOptions) {
    return incrementOneDocument(this.collectionRef, filter, field, incrementOrOptions, maybeOptions);
  }
  /**
   * 创建单个索引。
   * @since v1.3.0
   */
  async createIndex(keys, options) {
    return createIndexDefinition(this.collectionRef, keys, options);
  }
  /**
   * 批量创建索引。
   * @since v1.3.0
   */
  async createIndexes(specs) {
    return createIndexDefinitions(this.collectionRef, specs);
  }
  /**
   * 列出集合索引。
   * @since v1.3.0
   */
  async listIndexes() {
    return listIndexDefinitions(this.collectionRef);
  }
  /**
   * 删除指定索引。
   * @since v1.3.0
   */
  async dropIndex(name) {
    return dropIndexDefinition(this.collectionRef, name);
  }
  /**
   * 删除所有非 `_id_` 索引。
   * @since v1.3.0
   */
  async dropIndexes() {
    return dropIndexDefinitions(this.collectionRef);
  }
  /**
   * 预热 findPage 书签缓存。
   * @since v1.3.0
   */
  async prewarmBookmarks(keyDims = {}, pages = []) {
    return prewarmBookmarks({
      namespace: `${this.dbName}:${this.collectionName}`,
      cache: this.management.cache,
      logger: this.management.logger,
      keyDims,
      pages,
      findPage: (options) => this.findPage(options)
    });
  }
  /**
   * 列出 findPage 书签缓存。
   * @since v1.3.0
   */
  async listBookmarks(keyDims) {
    return listBookmarks({
      namespace: `${this.dbName}:${this.collectionName}`,
      cache: this.management.cache,
      keyDims
    });
  }
  /**
   * 清理 findPage 书签缓存。
   * @since v1.3.0
   */
  async clearBookmarks(keyDims) {
    return clearBookmarks({
      namespace: `${this.dbName}:${this.collectionName}`,
      cache: this.management.cache,
      keyDims
    });
  }
};
var MongoDbAccessor = class {
  constructor(dbName, dbRef, management = {}) {
    this.dbName = dbName;
    this.dbRef = dbRef;
    this.management = management;
  }
  /**
   * 获取集合访问器。
   * @since v1.3.0
   */
  collection(name) {
    return new MongoCollectionAccessor(
      this.dbName,
      name,
      this.dbRef.collection(name),
      this.management
    );
  }
  /**
   * 透传原生 MongoDB Db。
   * @since v1.3.0
   */
  raw() {
    return this.dbRef;
  }
  /**
   * 获取数据库级 admin façade。
   * @since v1.3.0
   */
  admin() {
    const admin = new MongoAdminAccessor(this.dbRef, this.management.logger);
    return {
      ping: () => admin.ping(),
      buildInfo: () => admin.buildInfo(),
      serverStatus: (options) => admin.serverStatus(options),
      stats: (options) => admin.stats(options)
    };
  }
};

// src/capabilities/cache/index.ts
var MemoryCache = class _MemoryCache {
  constructor(options = {}) {
    this.options = options;
    this.store = /* @__PURE__ */ new Map();
    this.lockManager = null;
    this.stats = {
      hits: 0,
      misses: 0,
      calls: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      memoryUsage: 0
    };
  }
  /**
   * 设置缓存锁管理器。
   * @since v1.3.0
   */
  setLockManager(lockManager) {
    this.lockManager = lockManager;
  }
  /**
   * 获取缓存锁管理器。
   * @since v1.3.0
   */
  getLockManager() {
    return this.lockManager;
  }
  /**
   * 获取缓存值。
   * @since v1.3.0
   */
  get(key) {
    this.stats.calls += 1;
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.misses += 1;
      return void 0;
    }
    if (entry.expireAt !== null && entry.expireAt <= Date.now()) {
      this.delete(key);
      this.stats.misses += 1;
      return void 0;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    this.stats.hits += 1;
    return entry.value;
  }
  /**
   * 写入缓存值。
   * @since v1.3.0
   */
  set(key, value, ttl = 0) {
    if (this.lockManager?.isLocked(key)) {
      return false;
    }
    const existing = this.store.get(key);
    if (existing) {
      this.stats.memoryUsage -= existing.size;
      this.store.delete(key);
    }
    const entry = {
      value,
      size: estimateEntrySize(key, value),
      expireAt: ttl > 0 ? Date.now() + ttl : null
    };
    this.store.set(key, entry);
    this.stats.sets += 1;
    this.stats.memoryUsage += entry.size;
    this.enforceLimits();
    return true;
  }
  /**
   * 删除缓存值。
   * @since v1.3.0
   */
  delete(key) {
    const entry = this.store.get(key);
    if (!entry) {
      return false;
    }
    this.store.delete(key);
    this.stats.deletes += 1;
    this.stats.memoryUsage -= entry.size;
    return true;
  }
  /**
   * `del()` 兼容别名。
   * @since v1.3.0
   */
  del(key) {
    return this.delete(key);
  }
  /**
   * 检查缓存键是否存在。
   * @since v1.3.0
   */
  exists(key) {
    return this.get(key) !== void 0;
  }
  /**
   * 批量读取缓存。
   * @since v1.3.0
   */
  getMany(keys) {
    const output = {};
    for (const key of keys) {
      const value = this.get(key);
      if (value !== void 0) {
        output[key] = value;
      }
    }
    return output;
  }
  /**
   * 批量写入缓存。
   * @since v1.3.0
   */
  setMany(values, ttl = 0) {
    for (const [key, value] of Object.entries(values)) {
      this.set(key, value, ttl);
    }
    return true;
  }
  /**
   * 批量删除缓存。
   * @since v1.3.0
   */
  delMany(keys) {
    let deleted = 0;
    for (const key of keys) {
      if (this.delete(key)) {
        deleted += 1;
      }
    }
    return deleted;
  }
  /**
   * 清空缓存。
   * @since v1.3.0
   */
  clear() {
    this.store.clear();
    this.stats.memoryUsage = 0;
  }
  /**
   * 按通配符列出缓存键。
   * @since v1.3.0
   */
  keys(pattern = "*") {
    const matcher = createWildcardMatcher(pattern);
    return [...this.store.keys()].filter((key) => matcher.test(key));
  }
  /**
   * 按通配符删除缓存键。
   * @since v1.3.0
   */
  delPattern(pattern = "*") {
    return this.delMany(this.keys(pattern));
  }
  /**
   * 获取缓存统计信息。
   * @since v1.3.0
   */
  getStats() {
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      calls: this.stats.calls,
      hitRate: this.stats.calls > 0 ? this.stats.hits / this.stats.calls : 0,
      sets: this.stats.sets,
      deletes: this.stats.deletes,
      evictions: this.stats.evictions,
      size: this.store.size,
      memoryUsage: this.stats.memoryUsage,
      memoryUsageMB: this.stats.memoryUsage / (1024 * 1024)
    };
  }
  /**
   * 重置缓存统计信息。
   * @since v1.3.0
   */
  resetStats() {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.calls = 0;
    this.stats.sets = 0;
    this.stats.deletes = 0;
    this.stats.evictions = 0;
  }
  /**
   * 获取或创建缓存实例。
   * @since v1.3.0
   */
  static getOrCreateCache(cache) {
    return cache instanceof _MemoryCache ? cache : new _MemoryCache(cache);
  }
  enforceLimits() {
    const maxSize = this.options.maxSize ?? 1e5;
    while (this.store.size > maxSize) {
      const oldestKey = this.store.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.delete(oldestKey);
      this.stats.evictions += 1;
    }
    const maxMemory = this.options.maxMemory ?? 0;
    if (maxMemory > 0) {
      while (this.stats.memoryUsage > maxMemory) {
        const oldestKey = this.store.keys().next().value;
        if (!oldestKey) {
          break;
        }
        this.delete(oldestKey);
        this.stats.evictions += 1;
      }
    }
  }
};
function createRedisCacheAdapter(redisUrlOrInstance, adapterOptions = {}) {
  const { client, prefix, ownsConnection } = resolveRedisClient(redisUrlOrInstance, adapterOptions);
  const withPrefix = (key) => `${prefix}${key}`;
  const stripPrefix = (key) => key.startsWith(prefix) ? key.slice(prefix.length) : key;
  const getValue = async (key) => {
    const value = await Promise.resolve(client.get(withPrefix(key)));
    if (value === null || value === void 0) {
      return void 0;
    }
    try {
      return JSON.parse(String(value));
    } catch {
      return void 0;
    }
  };
  const keysFn = async (pattern = "*") => {
    const prefixedPattern = withPrefix(pattern);
    const keys = [];
    if (client.scan) {
      let cursor = "0";
      do {
        const [nextCursor, foundKeys] = await Promise.resolve(client.scan(cursor, "MATCH", prefixedPattern, "COUNT", 100));
        cursor = nextCursor;
        keys.push(...foundKeys.map(stripPrefix));
      } while (cursor !== "0");
      return keys;
    }
    throw createError(ErrorCodes.INVALID_CONFIG, "Redis cache adapter requires scan() support for keys().");
  };
  const delManyFn = async (keys) => {
    if (keys.length === 0) {
      return 0;
    }
    return Number(await Promise.resolve(client.del(...keys.map(withPrefix))));
  };
  return {
    get: getValue,
    async set(key, value, ttl = 0) {
      const payload = JSON.stringify(value);
      if (ttl > 0 && client.psetex) {
        await Promise.resolve(client.psetex(withPrefix(key), ttl, payload));
      } else {
        await Promise.resolve(client.set(withPrefix(key), payload));
      }
      return true;
    },
    async del(key) {
      const deleted = await Promise.resolve(client.del(withPrefix(key)));
      return Number(deleted) > 0;
    },
    async delete(key) {
      const deleted = await Promise.resolve(client.del(withPrefix(key)));
      return Number(deleted) > 0;
    },
    async exists(key) {
      const exists = await Promise.resolve(client.exists(withPrefix(key)));
      return typeof exists === "boolean" ? exists : Number(exists) > 0;
    },
    async getMany(keys) {
      const values = {};
      if (keys.length === 0) {
        return values;
      }
      if (client.mget) {
        const response = await Promise.resolve(client.mget(keys.map(withPrefix)));
        keys.forEach((key, index) => {
          const raw = response[index];
          if (raw === null || raw === void 0) {
            return;
          }
          try {
            values[key] = JSON.parse(String(raw));
          } catch {
          }
        });
        return values;
      }
      for (const key of keys) {
        const value = await getValue(key);
        if (value !== void 0) {
          values[key] = value;
        }
      }
      return values;
    },
    async setMany(values, ttl = 0) {
      for (const [key, value] of Object.entries(values)) {
        await this.set(key, value, ttl);
      }
      return true;
    },
    delMany: delManyFn,
    async delPattern(pattern) {
      const keys = await keysFn(pattern);
      return delManyFn(keys);
    },
    async clear() {
      if (client.flushdb) {
        await Promise.resolve(client.flushdb());
      } else {
        const keys = await keysFn("*");
        await delManyFn(keys);
      }
    },
    keys: keysFn,
    async close() {
      if (ownsConnection && client.quit) {
        await Promise.resolve(client.quit());
      }
    },
    getRedisInstance() {
      return client;
    }
  };
}
var DistributedCacheInvalidator = class {
  constructor(options = {}) {
    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      invalidationsTriggered: 0,
      errors: 0
    };
    if (!options.cache) {
      throw createError(ErrorCodes.INVALID_CONFIG, "DistributedCacheInvalidator requires a cache instance.");
    }
    this.channel = options.channel ?? "monsqlize:cache:invalidate";
    this.instanceId = options.instanceId ?? `instance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.logger = options.logger;
    if ("local" in options.cache || "remote" in options.cache) {
      const scopedCache = options.cache;
      this.local = scopedCache.local;
      this.remote = scopedCache.remote;
    } else {
      this.local = options.cache;
    }
    this.pub = options.pub;
    this.sub = options.sub;
  }
  /**
   * 执行缓存失效并按需广播。
   * @since v1.3.0
   */
  async invalidate(pattern) {
    if (!pattern) {
      return;
    }
    await this.invalidateCache(pattern);
    if (this.pub?.publish) {
      await Promise.resolve(this.pub.publish(this.channel, JSON.stringify({
        type: "invalidate",
        pattern,
        instanceId: this.instanceId,
        timestamp: Date.now()
      })));
      this.stats.messagesSent += 1;
    }
  }
  /**
   * 处理外部广播消息。
   * @since v1.3.0
   */
  async handleMessage(channel, message) {
    if (channel !== this.channel) {
      return;
    }
    this.stats.messagesReceived += 1;
    try {
      const data = JSON.parse(message);
      if (data.instanceId === this.instanceId || data.type !== "invalidate" || !data.pattern) {
        return;
      }
      await this.invalidateCache(data.pattern);
    } catch (cause) {
      this.stats.errors += 1;
      this.logger?.error?.("[DistributedCacheInvalidator] Failed to parse message", cause);
    }
  }
  /**
   * 获取统计信息。
   * @since v1.3.0
   */
  getStats() {
    return {
      ...this.stats,
      channel: this.channel,
      instanceId: this.instanceId
    };
  }
  /**
   * 关闭分布式失效器。
   * @since v1.3.0
   */
  async close() {
    if (this.sub?.unsubscribe) {
      await Promise.resolve(this.sub.unsubscribe(this.channel));
    }
    if (this.pub?.quit) {
      await Promise.resolve(this.pub.quit());
    }
    if (this.sub && this.sub !== this.pub && this.sub.quit) {
      await Promise.resolve(this.sub.quit());
    }
  }
  async invalidateCache(pattern) {
    let deleted = 0;
    if (this.local?.delPattern) {
      deleted += Number(await Promise.resolve(this.local.delPattern(pattern)));
    }
    if (this.remote?.delPattern) {
      deleted += Number(await Promise.resolve(this.remote.delPattern(pattern)));
    }
    this.stats.invalidationsTriggered += 1;
    this.logger?.debug?.("[DistributedCacheInvalidator] invalidate", { pattern, deleted });
  }
};
function resolveRedisClient(redisUrlOrInstance, adapterOptions) {
  if (typeof redisUrlOrInstance === "string") {
    try {
      const IORedis = __require("ioredis");
      return {
        client: new IORedis(redisUrlOrInstance),
        prefix: String(adapterOptions.prefix ?? ""),
        ownsConnection: true
      };
    } catch {
      throw createError(ErrorCodes.INVALID_CONFIG, "ioredis is required to create a Redis cache adapter from URL.");
    }
  }
  if (redisUrlOrInstance && typeof redisUrlOrInstance === "object" && "client" in redisUrlOrInstance && redisUrlOrInstance.client) {
    const options = redisUrlOrInstance;
    return {
      client: options.client,
      prefix: String(options.prefix ?? ""),
      ownsConnection: false
    };
  }
  if (redisUrlOrInstance && typeof redisUrlOrInstance === "object") {
    return {
      client: redisUrlOrInstance,
      prefix: String(adapterOptions.prefix ?? ""),
      ownsConnection: false
    };
  }
  throw createError(ErrorCodes.INVALID_ARGUMENT, "redisUrlOrInstance must be a Redis URL string or Redis client instance.");
}
function estimateEntrySize(key, value) {
  const keySize = key.length * 2;
  let valueSize = 8;
  if (typeof value === "string") {
    valueSize = value.length * 2;
  } else if (typeof value === "object" && value !== null) {
    try {
      valueSize = JSON.stringify(value).length * 2;
    } catch {
      valueSize = 100;
    }
  }
  return keySize + valueSize;
}
function createWildcardMatcher(pattern) {
  const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

// src/capabilities/function-cache/index.ts
var inflightFunctions = /* @__PURE__ */ new Map();
function withCache(fn, options = {}) {
  if (typeof fn !== "function") {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "withCache: fn must be a function.");
  }
  const {
    ttl = 6e4,
    namespace = "fn",
    cache = new MemoryCache(),
    keyBuilder,
    condition,
    enableStats = true
  } = options;
  if (ttl < 0) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "withCache: ttl must be a non-negative number.");
  }
  if (keyBuilder && typeof keyBuilder !== "function") {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "withCache: keyBuilder must be a function.");
  }
  if (condition && typeof condition !== "function") {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "withCache: condition must be a function.");
  }
  const stats = {
    hits: 0,
    misses: 0,
    errors: 0,
    calls: 0,
    totalTime: 0
  };
  const buildKey = (...args) => {
    const suffix = keyBuilder ? keyBuilder(...args) : `${fn.name || "anonymous"}:${stableStringify2(args)}`;
    return `${namespace}:${suffix}`;
  };
  const wrapped = (async (...args) => {
    const startedAt = Date.now();
    const cacheKey = buildKey(...args);
    try {
      const cached = await cache.get(cacheKey);
      const exists = cached !== void 0 || await Promise.resolve(cache.exists?.(cacheKey) ?? false);
      if (exists) {
        if (enableStats) {
          stats.hits += 1;
          stats.calls += 1;
          stats.totalTime += Date.now() - startedAt;
        }
        return cached;
      }
    } catch {
      if (enableStats) {
        stats.errors += 1;
      }
    }
    if (inflightFunctions.has(cacheKey)) {
      const pending = inflightFunctions.get(cacheKey);
      const result = await pending;
      if (enableStats) {
        stats.hits += 1;
        stats.calls += 1;
        stats.totalTime += Date.now() - startedAt;
      }
      return result;
    }
    const runner = (async () => {
      try {
        const result = await fn(...args);
        const shouldCache = condition ? condition(result) : true;
        if (shouldCache) {
          await Promise.resolve(cache.set(cacheKey, result, ttl));
        }
        return result;
      } finally {
        inflightFunctions.delete(cacheKey);
      }
    })();
    inflightFunctions.set(cacheKey, runner);
    try {
      const result = await runner;
      if (enableStats) {
        stats.misses += 1;
        stats.calls += 1;
        stats.totalTime += Date.now() - startedAt;
      }
      return result;
    } catch (cause) {
      if (enableStats) {
        stats.errors += 1;
        stats.calls += 1;
      }
      throw cause;
    }
  });
  wrapped.invalidate = async (...args) => {
    const cacheKey = buildKey(...args);
    const result = await Promise.resolve(cache.del?.(cacheKey) ?? cache.delete?.(cacheKey) ?? false);
    return typeof result === "boolean" ? result : Number(result) > 0;
  };
  wrapped.getCacheStats = () => ({
    hits: stats.hits,
    misses: stats.misses,
    calls: stats.calls,
    hitRate: stats.calls > 0 ? stats.hits / stats.calls : 0,
    errors: stats.errors,
    avgTime: stats.calls > 0 ? stats.totalTime / stats.calls : 0
  });
  return wrapped;
}
var FunctionCache = class {
  constructor(cacheOrDb, options = {}) {
    this.options = options;
    this.functions = /* @__PURE__ */ new Map();
    this.cache = resolveCache(cacheOrDb);
    if ((this.options.defaultTTL ?? 6e4) < 0) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "FunctionCache: defaultTTL must be a non-negative number.");
    }
  }
  /**
   * 注册函数。
   * @since v1.3.0
   */
  register(name, fn, options = {}) {
    if (!name?.trim()) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "FunctionCache.register: name must be a non-empty string.");
    }
    const cachedFn = withCache(fn, {
      ...options,
      cache: options.cache ?? this.cache,
      namespace: `${this.options.namespace ?? "action"}:${name}`,
      ttl: options.ttl ?? this.options.defaultTTL ?? 6e4,
      enableStats: options.enableStats ?? this.options.enableStats ?? true
    });
    this.functions.set(name, cachedFn);
  }
  /**
   * 执行已注册函数。
   * @since v1.3.0
   */
  async execute(name, ...args) {
    const fn = this.functions.get(name);
    if (!fn) {
      throw createError("FUNCTION_NOT_REGISTERED", `Function not registered: ${name}`);
    }
    return fn(...args);
  }
  /**
   * 失效指定函数缓存。
   * @since v1.3.0
   */
  async invalidate(name, ...args) {
    const fn = this.functions.get(name);
    if (!fn) {
      throw createError("FUNCTION_NOT_REGISTERED", `Function not registered: ${name}`);
    }
    return fn.invalidate(...args);
  }
  /**
   * 按模式失效缓存。
   * @since v1.3.0
   */
  async invalidatePattern(pattern) {
    if (!pattern?.trim()) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "FunctionCache.invalidatePattern: pattern must be a non-empty string.");
    }
    return Number(await Promise.resolve(this.cache.delPattern?.(`${this.options.namespace ?? "action"}:${pattern}`) ?? 0));
  }
  /**
   * 获取统计信息。
   * @since v1.3.0
   */
  getStats(name) {
    if (name) {
      const stats = this.functions.get(name)?.getCacheStats();
      return stats ? { ...stats } : {};
    }
    return Object.fromEntries(
      [...this.functions.entries()].map(([functionName, fn]) => [functionName, fn.getCacheStats()])
    );
  }
  /**
   * 列出所有已注册函数。
   * @since v1.3.0
   */
  list() {
    return [...this.functions.keys()];
  }
  /**
   * 重置统计信息。
   * @since v1.3.0
   */
  resetStats(name) {
    const names = name ? [name] : [...this.functions.keys()];
    for (const functionName of names) {
      const fn = this.functions.get(functionName);
      if (!fn) {
        continue;
      }
      const replacement = withCache(async (...args) => fn(...args), {
        cache: this.cache,
        namespace: `${this.options.namespace ?? "action"}:${functionName}:reset`,
        ttl: 0
      });
      replacement.invalidate = fn.invalidate;
      this.functions.set(functionName, replacement);
    }
  }
  /**
   * 清空已注册函数。
   * @since v1.3.0
   */
  clear() {
    this.functions.clear();
  }
};
function resolveCache(cacheOrDb) {
  if (cacheOrDb && typeof cacheOrDb === "object" && typeof cacheOrDb.getCache === "function") {
    return cacheOrDb.getCache();
  }
  if (cacheOrDb && typeof cacheOrDb === "object" && typeof cacheOrDb.get === "function" && typeof cacheOrDb.set === "function") {
    return cacheOrDb;
  }
  return new MemoryCache();
}
function stableStringify2(value) {
  if (value === null || value === void 0) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify2(item)).join(",")}]`;
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify2(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

// src/capabilities/model/index.ts
var PopulatePromise = class _PopulatePromise {
  constructor(executor, paths = []) {
    this.executor = executor;
    this.paths = paths;
  }
  populate(path) {
    return new _PopulatePromise(this.executor, [...this.paths, path]);
  }
  exec() {
    return this.executor(this.paths);
  }
  then(onfulfilled, onrejected) {
    return this.exec().then(onfulfilled ?? void 0, onrejected ?? void 0);
  }
};
var Model = class {
  static {
    this.registry = /* @__PURE__ */ new Map();
  }
  static {
    this.revisions = /* @__PURE__ */ new Map();
  }
  static define(collectionName, definition) {
    const normalizedName = validateCollectionName(collectionName);
    if (this.registry.has(normalizedName)) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, `Model '${normalizedName}' is already defined.`);
    }
    validateDefinition(definition);
    this.registry.set(normalizedName, {
      collectionName: normalizedName,
      definition
    });
    this.bumpRevision(normalizedName);
  }
  static get(collectionName) {
    return this.registry.get(collectionName);
  }
  static has(collectionName) {
    return this.registry.has(collectionName);
  }
  static list() {
    return [...this.registry.keys()];
  }
  static undefine(collectionName) {
    const existed = this.registry.delete(collectionName);
    this.bumpRevision(collectionName);
    return existed;
  }
  static redefine(collectionName, definition) {
    validateCollectionName(collectionName);
    validateDefinition(definition);
    this.registry.set(collectionName, {
      collectionName,
      definition
    });
    this.bumpRevision(collectionName);
  }
  static _clear() {
    const names = [...this.registry.keys()];
    this.registry.clear();
    for (const name of names) {
      this.bumpRevision(name);
    }
  }
  static getRevision(collectionName) {
    return this.revisions.get(collectionName) ?? 0;
  }
  static bumpRevision(collectionName) {
    this.revisions.set(collectionName, (this.revisions.get(collectionName) ?? 0) + 1);
  }
};
var ModelInstance = class {
  constructor(collection, runtime, options) {
    this.collection = collection;
    this.runtime = runtime;
    this.collectionName = options.collectionName;
    this.dbName = options.dbName;
    this.poolName = options.poolName;
    this.definition = options.definition;
    this.relations = new Map(Object.entries(options.definition.relations ?? {}));
    for (const [name, config] of this.relations) {
      validateRelationConfig(name, config);
    }
    for (const [name, handler] of Object.entries(options.definition.statics ?? {})) {
      if (typeof handler === "function" && !(name in this)) {
        Object.defineProperty(this, name, {
          configurable: true,
          enumerable: false,
          writable: false,
          value: (...args) => handler.apply(this, args)
        });
      }
    }
  }
  getNamespace() {
    return this.collection.getNamespace();
  }
  raw() {
    return this.collection.raw();
  }
  find(query, options) {
    return new PopulatePromise(async (paths) => {
      const docs = await this.collection.find(query, options);
      return this.populateDocuments(this.hydrateDocuments(docs), paths);
    });
  }
  findOne(query, options) {
    return new PopulatePromise(async (paths) => {
      const doc = await this.collection.findOne(query, options);
      return this.populateSingle(this.hydrateDocument(doc), paths);
    });
  }
  findById(id, options) {
    return this.findOne({ _id: id }, options);
  }
  findByIds(ids, options) {
    return this.find({ _id: { $in: ids } }, options);
  }
  findPage(options) {
    return new PopulatePromise(async (paths) => {
      const result = await this.collection.findPage(options);
      return {
        ...result,
        data: await this.populateDocuments(this.hydrateDocuments(result.data), paths)
      };
    });
  }
  findAndCount(query, options) {
    return new PopulatePromise(async (paths) => {
      const [rows, count] = await Promise.all([
        this.collection.find(query, options),
        this.collection.count(query, options)
      ]);
      return {
        rows: await this.populateDocuments(this.hydrateDocuments(rows), paths),
        count
      };
    });
  }
  count(query, options) {
    return this.collection.count(query, options);
  }
  async insertOne(document, options) {
    const payload = this.applyDefaults(document);
    await this.runHook("beforeCreate", { operation: "insertOne", collection: this.collectionName, data: payload });
    const result = await this.collection.insertOne(payload, options);
    await this.runHook("afterCreate", { operation: "insertOne", collection: this.collectionName, data: payload, result });
    return result;
  }
  insertMany(documents, options) {
    return this.collection.insertMany((documents ?? []).map((item) => this.applyDefaults(item)), options);
  }
  async updateOne(filter, update, options) {
    await this.runHook("beforeUpdate", { operation: "updateOne", collection: this.collectionName, filter, update });
    const result = await this.collection.updateOne(filter, update, options);
    await this.runHook("afterUpdate", { operation: "updateOne", collection: this.collectionName, filter, update, result });
    return result;
  }
  updateMany(filter, update, options) {
    return this.collection.updateMany(filter, update, options);
  }
  replaceOne(filter, replacement, options) {
    return this.collection.replaceOne(filter, replacement, options);
  }
  findOneAndUpdate(filter, update, options) {
    return this.collection.findOneAndUpdate(filter, update, options);
  }
  findOneAndDelete(filter, options) {
    return this.collection.findOneAndDelete(filter, options);
  }
  upsertOne(filter, update, options) {
    return this.collection.upsertOne(filter, update, options);
  }
  async deleteOne(filter, options) {
    await this.runHook("beforeDelete", { operation: "deleteOne", collection: this.collectionName, filter });
    const result = await this.collection.deleteOne(filter, options);
    await this.runHook("afterDelete", { operation: "deleteOne", collection: this.collectionName, filter, result });
    return result;
  }
  deleteMany(filter, options) {
    return this.collection.deleteMany(filter, options);
  }
  createIndex(keys, options) {
    return this.collection.createIndex(keys, options);
  }
  createIndexes(specs) {
    return this.collection.createIndexes(specs);
  }
  listIndexes() {
    return this.collection.listIndexes();
  }
  dropIndex(name) {
    return this.collection.dropIndex(name);
  }
  dropIndexes() {
    return this.collection.dropIndexes();
  }
  distinct(key, query, options) {
    return this.collection.distinct(key, query, options);
  }
  aggregate(pipeline, options) {
    return this.collection.aggregate(pipeline, options);
  }
  watch(pipeline, options) {
    return this.collection.watch(pipeline, options);
  }
  async validate(_document) {
    return { valid: true };
  }
  async populateSingle(doc, paths) {
    if (!doc) {
      return null;
    }
    const [result] = await this.populateDocuments([doc], paths);
    return result ?? null;
  }
  async populateDocuments(docs, paths) {
    let current = docs;
    for (const path of paths) {
      current = await this.populatePath(current, path);
    }
    return current;
  }
  async populatePath(docs, path) {
    const config = normalizePopulateConfig(path);
    const relation = this.relations.get(config.path);
    if (!relation || docs.length === 0) {
      return docs;
    }
    const keys = unique(
      docs.map((doc) => getByPath(doc, relation.localField)).filter((value) => value !== void 0 && value !== null)
    );
    if (keys.length === 0) {
      for (const doc of docs) {
        doc[config.path] = relation.single ? null : [];
      }
      return docs;
    }
    const registered = Model.get(relation.from);
    const scope = {
      database: registered?.definition.connection?.database ?? this.dbName,
      pool: registered?.definition.connection?.pool ?? this.poolName
    };
    const relatedCollection = this.runtime.scopedCollection(relation.from, scope);
    const relatedModel = Model.has(relation.from) ? this.runtime.scopedModel(relation.from, scope) : null;
    const relatedDocs = await relatedCollection.find({
      [relation.foreignField]: { $in: keys },
      ...config.match ?? {}
    });
    let hydrated = relatedModel ? relatedModel.hydrateDocuments(relatedDocs) : relatedDocs.map((item) => ({ ...item }));
    if (config.sort) {
      hydrated = applySort(hydrated, config.sort);
    }
    if (config.skip) {
      hydrated = hydrated.slice(config.skip);
    }
    if (config.limit !== void 0) {
      hydrated = hydrated.slice(0, config.limit);
    }
    if (config.select) {
      const select = config.select;
      hydrated = hydrated.map((item) => pickFields(item, select, [relation.foreignField]));
    }
    if (config.populate && relatedModel) {
      const nestedPaths = Array.isArray(config.populate) ? config.populate : [config.populate];
      hydrated = await relatedModel.populateDocuments(hydrated, nestedPaths);
    }
    const grouped = groupBy(hydrated, (item) => getByPath(item, relation.foreignField));
    for (const doc of docs) {
      const localValue = getByPath(doc, relation.localField);
      const matches = grouped.get(toKey(localValue)) ?? [];
      doc[config.path] = relation.single ? matches[0] ?? null : [...matches];
    }
    return docs;
  }
  hydrateDocuments(docs) {
    return docs.filter(Boolean).map((doc) => this.hydrateDocument(doc));
  }
  hydrateDocument(doc) {
    if (!doc || typeof doc !== "object") {
      return null;
    }
    const hydrated = { ...doc };
    for (const [name, virtual] of Object.entries(this.definition.virtuals ?? {})) {
      Object.defineProperty(hydrated, name, {
        configurable: true,
        enumerable: true,
        get: () => virtual.get.call(hydrated),
        set: virtual.set ? (value) => virtual.set?.call(hydrated, value) : void 0
      });
    }
    for (const [name, method] of Object.entries(this.definition.methods ?? {})) {
      Object.defineProperty(hydrated, name, {
        configurable: true,
        enumerable: false,
        writable: false,
        value: (...args) => method.apply(hydrated, args)
      });
    }
    Object.defineProperties(hydrated, {
      save: {
        configurable: true,
        enumerable: false,
        value: async () => this.saveDocument(hydrated)
      },
      remove: {
        configurable: true,
        enumerable: false,
        value: async () => this.removeDocument(hydrated)
      },
      validate: {
        configurable: true,
        enumerable: false,
        value: async () => this.validate(hydrated)
      },
      toObject: {
        configurable: true,
        enumerable: false,
        value: () => serializeDocument(hydrated)
      },
      toJSON: {
        configurable: true,
        enumerable: false,
        value: () => serializeDocument(hydrated)
      }
    });
    return hydrated;
  }
  async saveDocument(document) {
    const payload = serializeDocument(document);
    if (payload._id !== void 0) {
      await this.collection.replaceOne({ _id: payload._id }, payload, { upsert: true });
      return document;
    }
    const result = await this.collection.insertOne(payload);
    document._id = result.insertedId;
    return document;
  }
  async removeDocument(document) {
    if (document._id === void 0) {
      return false;
    }
    const result = await this.collection.deleteOne({ _id: document._id });
    return Boolean(result.deletedCount ?? result.acknowledged);
  }
  applyDefaults(document) {
    const payload = { ...document ?? {} };
    for (const [key, value] of Object.entries(this.definition.defaults ?? {})) {
      if (payload[key] === void 0) {
        payload[key] = typeof value === "function" ? value(void 0, payload) : value;
      }
    }
    return payload;
  }
  async runHook(hookName, context) {
    const hook = this.definition.hooks?.[hookName];
    if (typeof hook === "function") {
      await hook(context);
    }
  }
};
function validateCollectionName(collectionName) {
  if (!collectionName || typeof collectionName !== "string" || collectionName.trim() === "") {
    throw createError(ErrorCodes.INVALID_COLLECTION_NAME, "Collection name must be a non-empty string.");
  }
  if (/[$.\s\x00]/.test(collectionName)) {
    throw createError(ErrorCodes.INVALID_COLLECTION_NAME, "Invalid collection name: contains special characters ($, ., space, or null character).");
  }
  return collectionName;
}
function validateDefinition(definition) {
  if (!definition || typeof definition !== "object") {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "Model definition must be an object.");
  }
  if (definition.connection) {
    if (definition.connection.pool !== void 0 && (typeof definition.connection.pool !== "string" || definition.connection.pool.trim() === "")) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "connection.pool must be a non-empty string.");
    }
    if (definition.connection.database !== void 0 && (typeof definition.connection.database !== "string" || definition.connection.database.trim() === "")) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "connection.database must be a non-empty string.");
    }
  }
  for (const [name, config] of Object.entries(definition.relations ?? {})) {
    validateRelationConfig(name, config);
  }
}
function validateRelationConfig(name, config) {
  if (!name || typeof name !== "string") {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "Relation name must be a non-empty string.");
  }
  if (!config || typeof config !== "object") {
    throw createError(ErrorCodes.INVALID_ARGUMENT, `Relation '${name}' must be an object.`);
  }
  for (const field of ["from", "localField", "foreignField"]) {
    if (typeof config[field] !== "string" || config[field].trim() === "") {
      throw createError(ErrorCodes.INVALID_ARGUMENT, `Relation '${name}' field '${field}' must be a non-empty string.`);
    }
  }
  if (config.single !== void 0 && typeof config.single !== "boolean") {
    throw createError(ErrorCodes.INVALID_ARGUMENT, `Relation '${name}' field 'single' must be a boolean.`);
  }
}
function normalizePopulateConfig(path) {
  return typeof path === "string" ? { path } : path;
}
function unique(values) {
  const map = /* @__PURE__ */ new Map();
  for (const value of values) {
    const key = toKey(value);
    if (!map.has(key)) {
      map.set(key, value);
    }
  }
  return [...map.values()];
}
function groupBy(values, keySelector) {
  const map = /* @__PURE__ */ new Map();
  for (const value of values) {
    const key = toKey(keySelector(value));
    const group = map.get(key);
    if (group) {
      group.push(value);
    } else {
      map.set(key, [value]);
    }
  }
  return map;
}
function toKey(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object" && value !== null) {
    const candidate = value;
    if (typeof candidate.toHexString === "function") {
      return candidate.toHexString();
    }
    if (typeof candidate.toString === "function") {
      return candidate.toString();
    }
  }
  return String(value);
}
function getByPath(source, path) {
  return path.split(".").reduce((current, key) => {
    if (!current || typeof current !== "object") {
      return void 0;
    }
    return current[key];
  }, source);
}
function pickFields(document, select, alwaysInclude = []) {
  const keys = Array.isArray(select) ? select : select.split(/\s+/).filter(Boolean);
  const result = {};
  for (const key of [.../* @__PURE__ */ new Set([...keys, ...alwaysInclude])]) {
    if (key in document) {
      result[key] = document[key];
    }
  }
  if ("_id" in document && !("_id" in result)) {
    result._id = document._id;
  }
  return result;
}
function applySort(values, sort) {
  const entries = Object.entries(sort);
  return [...values].sort((left, right) => {
    for (const [field, direction] of entries) {
      const leftValue = getByPath(left, field);
      const rightValue = getByPath(right, field);
      if (leftValue === rightValue) {
        continue;
      }
      const result = leftValue > rightValue ? 1 : -1;
      return result * direction;
    }
    return 0;
  });
}
function serializeDocument(document) {
  const plain = {};
  for (const [key, value] of Object.entries(document)) {
    if (typeof value !== "function") {
      plain[key] = value;
    }
  }
  return plain;
}

// src/adapters/mongodb/common/connect.ts
import { MongoClient } from "mongodb";
async function connectMongo(params) {
  const databaseName = params.databaseName?.trim();
  if (!databaseName) {
    throw createError(ErrorCodes.INVALID_DATABASE_NAME, "Database name must be a non-empty string.");
  }
  const uri = params.config?.uri?.trim();
  if (!uri) {
    throw createError(ErrorCodes.INVALID_CONFIG, "MongoDB connect requires config.uri.");
  }
  const client = new MongoClient(uri, params.config?.options);
  try {
    await client.connect();
    const db = client.db(databaseName);
    params.logger?.info?.("MongoDB connected", { databaseName });
    return { client, db };
  } catch (cause) {
    try {
      await client.close();
    } catch {
    }
    throw createConnectionError(
      `Failed to connect to MongoDB database: ${databaseName}`,
      cause instanceof Error ? cause : void 0
    );
  }
}
async function closeMongo(client, logger) {
  if (!client) {
    return;
  }
  try {
    await client.close();
    logger?.info?.("MongoDB connection closed");
  } catch (cause) {
    const error = createError(
      ErrorCodes.CONNECTION_CLOSED,
      "Failed to close MongoDB connection cleanly.",
      void 0,
      cause instanceof Error ? cause : void 0
    );
    logger?.warn?.(error.message, error.cause);
  }
}

// src/core/logger/index.ts
var Logger = class _Logger {
  constructor(logger = null) {
    this.logger = logger;
  }
  /**
   * 输出 debug 日志。
   * @since v1.3.0
   */
  debug(...args) {
    this.logger?.debug?.(...args);
  }
  /**
   * 输出 info 日志。
   * @since v1.3.0
   */
  info(...args) {
    this.logger?.info?.(...args);
  }
  /**
   * 输出 warn 日志。
   * @since v1.3.0
   */
  warn(...args) {
    this.logger?.warn?.(...args);
  }
  /**
   * 输出 error 日志。
   * @since v1.3.0
   */
  error(...args) {
    this.logger?.error?.(...args);
  }
  /**
   * 创建日志实例。
   * @since v1.3.0
   */
  static create(logger = null) {
    return new _Logger(logger);
  }
};

// src/entry/runtime-core.ts
var TransactionManager = class {
  /**
   * 创建事务管理器。
   * @since v1.3.0
   */
  constructor(options = {}) {
    this.options = options;
  }
};
var CacheLockManager = class {
  /**
   * 创建缓存锁管理器。
   * @since v1.3.0
   */
  constructor(options = {}) {
    this.options = options;
  }
};
var ConnectionPoolManager = class {
  /**
   * 创建连接池管理器。
   * @since v1.3.0
   */
  constructor(options = {}) {
    this.options = options;
  }
};
var MonSQLizeRuntime = class {
  constructor(options = {}) {
    this.options = options;
    this._connected = false;
    this._client = null;
    this._defaultDb = null;
    this._modelInstances = /* @__PURE__ */ new Map();
    this._connectionPromise = null;
    const type = options.type ?? "mongodb";
    if (type !== "mongodb") {
      throw createError(ErrorCodes.UNSUPPORTED_DATABASE, "Invalid database type. Supported types are: mongodb");
    }
    this.options = {
      ...options,
      type
    };
    this._cache = MemoryCache.getOrCreateCache(options.cache);
    this._logger = Logger.create(options.logger ?? null);
  }
  /**
   * 连接数据库并建立访问器。
   * @since v1.3.0
   */
  async connect() {
    if (this._connected) {
      return this.createRuntimeAccessors();
    }
    if (this._connectionPromise) {
      return this._connectionPromise;
    }
    this._connectionPromise = (async () => {
      const databaseName = this.resolveDatabaseName();
      const { client, db } = await connectMongo({
        databaseName,
        config: this.options.config,
        logger: this._logger
      });
      this._client = client;
      this._defaultDb = new MongoDbAccessor(databaseName, db, {
        cache: this._cache,
        logger: this._logger
      });
      this._connected = true;
      return this.createRuntimeAccessors();
    })();
    try {
      return await this._connectionPromise;
    } finally {
      this._connectionPromise = null;
    }
  }
  /**
   * 获取缓存实例。
   * @since v1.3.0
   */
  getCache() {
    return this._cache;
  }
  /**
   * 获取默认配置。
   * @since v1.3.0
   */
  getDefaults() {
    return {
      type: this.options.type,
      databaseName: this.options.databaseName
    };
  }
  /**
   * 关闭连接。
   * @since v1.3.0
   */
  async close() {
    await closeMongo(this._client, this._logger);
    this._client = null;
    this._defaultDb = null;
    this._connected = false;
    this._modelInstances.clear();
  }
  /**
   * 健康检查。
   * @since v1.3.0
   */
  async health() {
    return {
      status: this._connected ? "up" : "down",
      connected: this._connected,
      defaults: this.getDefaults(),
      cache: { enabled: true }
    };
  }
  /**
   * 获取 Collection 访问器。
   * @since v1.3.0
   */
  collection(name) {
    this.ensureConnected();
    return this.db().collection(name);
  }
  /**
   * 获取 Db 访问器。
   * @since v1.3.0
   */
  db(name) {
    this.ensureConnected();
    if (!this._client) {
      throw createError(ErrorCodes.NOT_CONNECTED, "MonSQLize is not connected yet.");
    }
    const databaseName = name ?? this.resolveDatabaseName();
    if (databaseName === this.resolveDatabaseName() && this._defaultDb) {
      return this._defaultDb;
    }
    return new MongoDbAccessor(databaseName, this._client.db(databaseName), {
      cache: this._cache,
      logger: this._logger
    });
  }
  /**
   * 获取指定数据库访问器。
   * @since v1.3.0
   */
  use(name) {
    this.ensureConnected();
    const db = this.db(name);
    return {
      collection: (collectionName) => db.collection(collectionName),
      model: (modelName) => this.scopedModel(modelName, { database: name })
    };
  }
  /**
   * 获取连接池访问器（P1 占位实现）。
   * @since v1.3.0
   */
  pool(poolName) {
    this.ensureConnected();
    const databaseName = this.resolveDatabaseName();
    return {
      collection: (name) => this.db(databaseName).collection(name),
      model: (name) => this.scopedModel(name, { database: databaseName, pool: poolName }),
      use: (dbName) => ({
        collection: (name) => this.db(dbName).collection(name),
        model: (name) => this.scopedModel(name, { database: dbName, pool: poolName })
      })
    };
  }
  /**
   * 获取限定数据库的 Collection 访问器。
   * @since v1.3.0
   */
  scopedCollection(name, options = {}) {
    this.ensureConnected();
    return this.db(options.database ?? this.resolveDatabaseName()).collection(name);
  }
  /**
   * 获取限定数据库的 Model 访问器（P1 占位实现）。
   * @since v1.3.0
   */
  scopedModel(name, options = {}) {
    this.ensureConnected();
    return this.createModelInstance(name, {
      database: options.database ?? this.resolveDatabaseName(),
      pool: options.pool
    });
  }
  /**
   * 获取 Model 访问器（P1 占位实现）。
   * @since v1.3.0
   */
  model(name) {
    this.ensureConnected();
    return this.createModelInstance(name, {
      database: this.resolveDatabaseName()
    });
  }
  /**
   * 手动事务入口（P1 占位实现）。
   * @since v1.3.0
   */
  async startSession() {
    this.ensureConnected();
    return { session: null };
  }
  /**
   * 自动事务入口（P1 占位实现）。
   * @since v1.3.0
   */
  async withTransaction(callback) {
    this.ensureConnected();
    return callback({ session: null });
  }
  /**
   * 事件订阅占位实现。
   * @since v1.3.0
   */
  on(_event, _handler) {
    this._logger.debug("[P1 skeleton] on() registered");
  }
  /**
   * 一次性事件订阅占位实现。
   * @since v1.3.0
   */
  once(_event, _handler) {
    this._logger.debug("[P1 skeleton] once() registered");
  }
  /**
   * 取消事件订阅占位实现。
   * @since v1.3.0
   */
  off(_event, _handler) {
    this._logger.debug("[P1 skeleton] off() called");
  }
  /**
   * 触发事件占位实现。
   * @since v1.3.0
   */
  emit(_event, _payload) {
    this._logger.debug("[P1 skeleton] emit() called");
  }
  ensureConnected() {
    if (!this._connected) {
      throw createError(ErrorCodes.NOT_CONNECTED, "MonSQLize is not connected yet.");
    }
  }
  createRuntimeAccessors() {
    return {
      collection: (name) => this.collection(name),
      db: (name) => this.db(name),
      use: (name) => this.use(name),
      instance: this
    };
  }
  resolveDatabaseName() {
    return this.options.databaseName ?? "default";
  }
  createModelInstance(name, scope) {
    const registered = Model.get(name);
    if (!registered) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, `Model '${name}' is not defined.`);
    }
    const databaseName = registered.definition.connection?.database ?? scope.database ?? this.resolveDatabaseName();
    const poolName = registered.definition.connection?.pool ?? scope.pool;
    const cacheKey = `${poolName ?? "default"}:${databaseName}:${registered.collectionName}`;
    const revision = Model.getRevision(registered.collectionName);
    const cached = this._modelInstances.get(cacheKey);
    if (cached && cached.revision === revision) {
      return cached.instance;
    }
    const instance = new ModelInstance(
      this.scopedCollection(registered.collectionName, { database: databaseName }),
      this,
      {
        collectionName: registered.collectionName,
        dbName: databaseName,
        poolName,
        definition: registered.definition
      }
    );
    this._modelInstances.set(cacheKey, {
      revision,
      instance
    });
    return instance;
  }
};

// src/entry/index.mts
var MonSQLize = MonSQLizeRuntime;
var index_default = MonSQLize;
export {
  CacheLockManager,
  ConnectionPoolManager,
  DistributedCacheInvalidator,
  FunctionCache,
  Logger,
  MemoryCache,
  Model,
  MonSQLize,
  TransactionManager,
  createExpression,
  createRedisCacheAdapter,
  index_default as default,
  expr,
  withCache
};
