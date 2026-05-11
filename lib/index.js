"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

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

// src/entry/runtime-core.ts
var import_node_events = require("node:events");

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
   * 按模式触发缓存失效，并在配置了 `pub.publish()` 时向其他实例广播消息。
   *
   * @param {string} pattern - 通配符模式；为空时直接忽略。
   * @returns {Promise<void>}
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
   * 处理来自订阅通道的广播消息。
   *
   * 仅当消息：
   * - 来自当前通道
   * - 类型为 `invalidate`
   * - 且不是本实例自己发送
   * 时才会触发本地失效。
   *
   * @param {string} channel - 收到消息的通道名。
   * @param {string} message - JSON 字符串消息体。
   * @returns {Promise<void>}
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
   * 返回当前失效协调器的运行统计。
   *
   * @returns {Record<string, unknown>} 包含消息收发次数、触发次数、错误数、通道与实例标识。
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
      const IORedis = require("ioredis");
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
   * 注册一个可缓存的异步函数。
   *
   * @template {unknown[]} TArgs
   * @template TResult
   * @param {string} name - 注册名；后续通过 `execute()` / `invalidate()` 按该名称访问。
   * @param {(...args: TArgs) => Promise<TResult>} fn - 原始异步函数。
   * @param {WithCacheOptions} [options={}] - 针对该函数的局部缓存配置。
   * @returns {void}
   * @throws {Error} 当名称为空时抛出参数错误。
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
   *
   * @param {string} name - 已注册函数名。
   * @param {...unknown[]} args - 原函数参数。
   * @returns {Promise<unknown>} 返回原函数或缓存命中的结果。
   * @throws {Error} 当函数未注册时抛出 `FUNCTION_NOT_REGISTERED`。
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
   * 失效某个已注册函数在指定参数下的缓存结果。
   *
   * @param {string} name - 已注册函数名。
   * @param {...unknown[]} args - 用于重建缓存键的原函数参数。
   * @returns {Promise<boolean>} 成功删除缓存时返回 `true`。
   * @throws {Error} 当函数未注册时抛出 `FUNCTION_NOT_REGISTERED`。
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
   * 按模式批量失效当前命名空间下的缓存键。
   *
   * @param {string} pattern - 通配符模式，不包含命名空间前缀时会自动补齐。
   * @returns {Promise<number>} 实际删除的缓存键数量。
   * @throws {Error} 当模式为空时抛出参数错误。
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
   *
   * @param {string} [name] - 传入时只返回某个已注册函数的统计信息；不传则返回全部。
   * @returns {Record<string, unknown>} 统计对象。
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
   * 列出所有已注册函数名。
   *
   * @returns {string[]}
   * @since v1.3.0
   */
  list() {
    return [...this.functions.keys()];
  }
  /**
   * 重置一个或全部已注册函数的统计信息。
   *
   * @param {string} [name] - 传入时仅重置指定函数；否则重置全部。
   * @returns {void}
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
   * 清空所有已注册函数定义。
   *
   * @returns {void}
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

// src/capabilities/lock/index.ts
var import_node_crypto = require("node:crypto");
var LockAcquireError = class extends Error {
  constructor(message) {
    super(message);
    this.code = "LOCK_ACQUIRE_FAILED";
    this.name = "LockAcquireError";
  }
};
var LockTimeoutError = class extends Error {
  constructor(message) {
    super(message);
    this.code = "LOCK_TIMEOUT";
    this.name = "LockTimeoutError";
  }
};
var NoopLockManager = class {
  async releaseLock() {
    return true;
  }
  async renewLock() {
    return true;
  }
};
var globalStore = /* @__PURE__ */ new Map();
var Lock = class {
  constructor(key, lockId, manager, ttl) {
    this.key = key;
    this.lockId = lockId;
    this.manager = manager;
    this.ttl = ttl;
    this.acquiredAt = Date.now();
    this.released = false;
  }
  /**
   * 释放锁。
   * @since v1.4.0
   */
  async release() {
    if (this.released) {
      return false;
    }
    const released = await this.manager.releaseLock(this.key, this.lockId);
    this.released = released || this.released;
    return released;
  }
  /**
   * 续期锁。
   * @since v1.4.0
   */
  async renew(ttl = this.ttl) {
    if (this.released) {
      return false;
    }
    return this.manager.renewLock(this.key, this.lockId, ttl);
  }
  /**
   * 检查锁是否仍持有。
   * @since v1.4.0
   */
  isHeld() {
    return !this.released;
  }
  /**
   * 获取持锁时长。
   * @since v1.4.0
   */
  getHoldTime() {
    return Date.now() - this.acquiredAt;
  }
};
var LockManager = class {
  constructor(options = {}) {
    this.stats = {
      locksAcquired: 0,
      locksReleased: 0,
      lockChecks: 0,
      errors: 0
    };
    this.logger = options.logger ?? null;
    this.lockKeyPrefix = options.lockKeyPrefix ?? "monsqlize:lock:";
    this.maxDuration = options.maxDuration ?? 3e5;
  }
  /**
   * 自动管理业务锁生命周期。
   * @since v1.4.0
   */
  async withLock(key, callback, options = {}) {
    const lock = await this.acquireLock(key, options);
    try {
      return await callback();
    } finally {
      await lock.release();
    }
  }
  /**
   * 获取锁（阻塞重试）。
   * @since v1.4.0
   */
  async acquireLock(key, options = {}) {
    const retryTimes = options.retryTimes ?? 3;
    const retryDelay = options.retryDelay ?? 100;
    const retryBackoff = options.retryBackoff ?? 1;
    for (let attempt = 0; attempt <= retryTimes; attempt += 1) {
      const lock = await this.tryAcquireLock(key, options);
      if (lock) {
        return lock;
      }
      if (attempt === retryTimes) {
        break;
      }
      const delay = retryDelay * Math.pow(retryBackoff, attempt);
      await sleep(delay);
    }
    this.stats.errors += 1;
    if (options.fallbackToNoLock) {
      this.logger?.warn?.(`[LockManager] fallback to no-lock execution for ${key}`);
      return new Lock(this.normalizeKey(key), `noop:${(0, import_node_crypto.randomUUID)()}`, new NoopLockManager(), options.ttl ?? 1e4);
    }
    throw new LockTimeoutError(`Failed to acquire lock for key '${key}' within retry budget.`);
  }
  /**
   * 尝试获取锁（不阻塞）。
   * @since v1.4.0
   */
  async tryAcquireLock(key, options = {}) {
    const normalizedKey = this.normalizeKey(key);
    const ttl = Math.min(options.ttl ?? 1e4, this.maxDuration);
    this.cleanupExpiredLocks();
    this.stats.lockChecks += 1;
    if (globalStore.has(normalizedKey)) {
      return null;
    }
    const lockId = (0, import_node_crypto.randomUUID)();
    globalStore.set(normalizedKey, {
      lockId,
      expiresAt: Date.now() + ttl
    });
    this.stats.locksAcquired += 1;
    this.logger?.debug?.(`[LockManager] acquired ${normalizedKey}`);
    return new Lock(normalizedKey, lockId, this, ttl);
  }
  /**
   * 检查锁是否存在。
   * @since v1.4.0
   */
  isLocked(key) {
    this.cleanupExpiredLocks();
    this.stats.lockChecks += 1;
    return globalStore.has(this.normalizeKey(key));
  }
  /**
   * 释放锁。
   * @since v1.4.0
   */
  async releaseLock(key, lockId) {
    const normalizedKey = this.normalizeKey(key);
    this.cleanupExpiredLocks();
    const current = globalStore.get(normalizedKey);
    if (!current || current.lockId !== lockId) {
      return false;
    }
    globalStore.delete(normalizedKey);
    this.stats.locksReleased += 1;
    this.logger?.debug?.(`[LockManager] released ${normalizedKey}`);
    return true;
  }
  /**
   * 续期锁。
   * @since v1.4.0
   */
  async renewLock(key, lockId, ttl) {
    const normalizedKey = this.normalizeKey(key);
    this.cleanupExpiredLocks();
    const current = globalStore.get(normalizedKey);
    if (!current || current.lockId !== lockId) {
      return false;
    }
    current.expiresAt = Date.now() + Math.min(ttl, this.maxDuration);
    return true;
  }
  /**
   * 获取锁统计。
   * @since v1.4.0
   */
  getStats() {
    this.cleanupExpiredLocks();
    return {
      ...this.stats,
      lockKeyPrefix: this.lockKeyPrefix,
      maxDuration: this.maxDuration,
      activeLocks: globalStore.size
    };
  }
  /**
   * 清空锁（主要用于测试）。
   * @since v1.4.0
   */
  clear() {
    for (const key of [...globalStore.keys()]) {
      if (key.startsWith(this.lockKeyPrefix)) {
        globalStore.delete(key);
      }
    }
  }
  /**
   * 关闭锁管理器。
   * @since v1.4.0
   */
  close() {
    this.cleanupExpiredLocks();
  }
  normalizeKey(key) {
    return key.startsWith(this.lockKeyPrefix) ? key : `${this.lockKeyPrefix}${key}`;
  }
  cleanupExpiredLocks() {
    const now = Date.now();
    for (const [key, value] of globalStore.entries()) {
      if (value.expiresAt <= now) {
        globalStore.delete(key);
      }
    }
  }
};
async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// src/capabilities/model/index.ts
var _a;
_a = Symbol.toStringTag;
var _PopulatePromise = class _PopulatePromise {
  constructor(executor, paths = []) {
    this.executor = executor;
    this.paths = paths;
    this[_a] = "Promise";
  }
  populate(path2) {
    return new _PopulatePromise(this.executor, [...this.paths, path2]);
  }
  exec() {
    return this.executor(this.paths);
  }
  then(onfulfilled, onrejected) {
    return this.exec().then(onfulfilled ?? void 0, onrejected ?? void 0);
  }
  catch(onrejected) {
    return this.exec().catch(onrejected ?? void 0);
  }
  finally(onfinally) {
    return this.exec().finally(onfinally ?? void 0);
  }
};
var PopulatePromise = _PopulatePromise;
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
    for (const path2 of paths) {
      current = await this.populatePath(current, path2);
    }
    return current;
  }
  async populatePath(docs, path2) {
    const config = normalizePopulateConfig(path2);
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
function normalizePopulateConfig(path2) {
  return typeof path2 === "string" ? { path: path2 } : path2;
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
function getByPath(source, path2) {
  return path2.split(".").reduce((current, key) => {
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

// src/capabilities/pool/index.ts
var import_mongodb = require("mongodb");
var DEFAULT_HEALTH_CHECK = {
  enabled: true,
  interval: 5e3,
  timeout: 3e3,
  retries: 3
};
var ConnectionPoolManager = class {
  constructor(options = {}) {
    this.pools = /* @__PURE__ */ new Map();
    this.healthStatus = /* @__PURE__ */ new Map();
    this.stats = /* @__PURE__ */ new Map();
    this.intervals = /* @__PURE__ */ new Map();
    this.roundRobinIndex = /* @__PURE__ */ new Map();
    this.logger = options.logger ?? null;
    this.maxPoolsCount = options.maxPoolsCount ?? 10;
    this.strategy = options.poolStrategy ?? "auto";
    const fallback = typeof options.poolFallback === "boolean" ? { enabled: options.poolFallback, fallbackStrategy: "error", retryDelay: 1e3, maxRetries: 3 } : {
      enabled: options.poolFallback?.enabled ?? false,
      fallbackStrategy: options.poolFallback?.fallbackStrategy ?? "error",
      retryDelay: options.poolFallback?.retryDelay ?? 1e3,
      maxRetries: options.poolFallback?.maxRetries ?? 3
    };
    this.fallback = fallback;
    this.clientFactory = options.clientFactory ?? defaultClientFactory;
    this.healthCheckFn = options.healthCheckFn ?? defaultHealthCheckFn;
  }
  /**
   * 添加连接池。
   * @since v1.0.8
   */
  async addPool(config) {
    validatePoolConfig(config);
    if (this.pools.has(config.name)) {
      throw new Error(`Pool '${config.name}' already exists`);
    }
    if (this.pools.size >= this.maxPoolsCount) {
      throw new Error(`Maximum pool count (${this.maxPoolsCount}) reached`);
    }
    const client = await this.clientFactory(config);
    this.pools.set(config.name, {
      client,
      config,
      createdAt: Date.now()
    });
    this.healthStatus.set(config.name, {
      status: "up",
      consecutiveFailures: 0,
      lastCheckTime: null,
      lastError: null,
      uptime: 0
    });
    this.stats.set(config.name, createEmptyPoolStats(config.name));
  }
  /**
   * 移除连接池。
   * @since v1.0.8
   */
  async removePool(name) {
    const pool = this.pools.get(name);
    if (!pool) {
      throw new Error(`Pool '${name}' not found`);
    }
    this.stopHealthCheck(name);
    await pool.client.close();
    this.pools.delete(name);
    this.healthStatus.delete(name);
    this.stats.delete(name);
  }
  /**
   * 获取连接池原生 client。
   * @since v1.0.8
   */
  getPool(name) {
    return this.pools.get(name)?.client ?? null;
  }
  /**
   * 选择连接池。
   * @since v1.0.8
   */
  selectPool(operation, options = {}) {
    const candidateNames = this.getCandidatePools(operation, options);
    if (candidateNames.length === 0) {
      throw new Error("No available connection pool");
    }
    const selectedName = this.selectPoolName(candidateNames, operation);
    const selected = this.pools.get(selectedName);
    if (!selected) {
      throw new Error(`Selected pool '${selectedName}' not available`);
    }
    this.recordSelection(selectedName, true);
    return {
      name: selectedName,
      client: selected.client,
      db: (name) => selected.client.db(name),
      collection: (databaseName, collectionName) => selected.client.db(databaseName).collection(collectionName)
    };
  }
  /**
   * 启动健康检查。
   * @since v1.0.8
   */
  startHealthCheck(name) {
    const targets = name ? [name] : [...this.pools.keys()];
    for (const poolName of targets) {
      const managed = this.pools.get(poolName);
      if (!managed) {
        continue;
      }
      const healthConfig = {
        ...DEFAULT_HEALTH_CHECK,
        ...managed.config.healthCheck
      };
      if (!healthConfig.enabled) {
        continue;
      }
      this.stopHealthCheck(poolName);
      const timer = setInterval(() => {
        void this.checkPoolHealth(poolName);
      }, healthConfig.interval);
      timer.unref?.();
      this.intervals.set(poolName, timer);
      void this.checkPoolHealth(poolName);
    }
  }
  /**
   * 停止健康检查。
   * @since v1.0.8
   */
  stopHealthCheck(name) {
    const targets = name ? [name] : [...this.intervals.keys()];
    for (const poolName of targets) {
      const timer = this.intervals.get(poolName);
      if (!timer) {
        continue;
      }
      clearInterval(timer);
      this.intervals.delete(poolName);
    }
  }
  /**
   * 获取健康状态。
   * @since v1.0.8
   */
  getHealthStatus() {
    return Object.fromEntries(this.healthStatus.entries());
  }
  /**
   * 获取连接池统计。
   * @since v1.0.8
   */
  getPoolStats() {
    return Object.fromEntries(this.stats.entries());
  }
  /**
   * 关闭全部连接池。
   * @since v1.0.8
   */
  async close() {
    this.stopHealthCheck();
    for (const pool of this.pools.values()) {
      await pool.client.close();
    }
    this.pools.clear();
    this.healthStatus.clear();
    this.stats.clear();
  }
  getCandidatePools(operation, options) {
    if (options.pool) {
      const pool = this.pools.get(options.pool);
      if (!pool) {
        throw new Error(`Pool '${options.pool}' not found`);
      }
      return [options.pool];
    }
    let candidates = [...this.pools.entries()].filter(([name]) => (this.healthStatus.get(name)?.status ?? "down") !== "down");
    if (candidates.length === 0 && this.fallback.enabled) {
      candidates = [...this.pools.entries()];
    }
    if (operation === "write") {
      const primaries = candidates.filter(([, pool]) => (pool.config.role ?? "primary") === "primary");
      if (primaries.length > 0) {
        candidates = primaries;
      }
    } else {
      const secondaries = candidates.filter(([, pool]) => pool.config.role === "secondary" || pool.config.role === "analytics");
      if (secondaries.length > 0) {
        candidates = secondaries;
      }
    }
    if (options.tags?.length) {
      const tagged = candidates.filter(([, pool]) => options.tags?.some((tag) => pool.config.tags?.includes(tag)));
      if (tagged.length > 0) {
        candidates = tagged;
      }
    }
    return candidates.map(([name]) => name);
  }
  selectPoolName(candidateNames, operation) {
    if (candidateNames.length === 1) {
      return candidateNames[0];
    }
    if (this.strategy === "roundRobin") {
      const current = this.roundRobinIndex.get(operation) ?? 0;
      const selected = candidateNames[current % candidateNames.length];
      this.roundRobinIndex.set(operation, current + 1);
      return selected;
    }
    if (this.strategy === "leastConnections") {
      return [...candidateNames].sort((left, right) => {
        const leftStats = this.stats.get(left)?.totalRequests ?? 0;
        const rightStats = this.stats.get(right)?.totalRequests ?? 0;
        return leftStats - rightStats;
      })[0];
    }
    if (this.strategy === "weighted" || this.strategy === "auto") {
      const weighted = candidateNames.flatMap((name) => {
        const weight = this.pools.get(name)?.config.weight ?? 1;
        return Array.from({ length: weight }, () => name);
      });
      return weighted[Math.floor(Math.random() * weighted.length)] ?? candidateNames[0];
    }
    return candidateNames[0];
  }
  async checkPoolHealth(poolName) {
    const managed = this.pools.get(poolName);
    const current = this.healthStatus.get(poolName);
    if (!managed || !current) {
      return;
    }
    try {
      const healthy = await this.healthCheckFn(poolName, managed.client, managed.config);
      current.lastCheckTime = /* @__PURE__ */ new Date();
      current.uptime = Date.now() - managed.createdAt;
      if (healthy) {
        current.status = "up";
        current.consecutiveFailures = 0;
        current.lastError = null;
        return;
      }
      current.consecutiveFailures += 1;
      current.status = current.consecutiveFailures > 1 ? "down" : "degraded";
    } catch (error) {
      current.lastCheckTime = /* @__PURE__ */ new Date();
      current.uptime = Date.now() - managed.createdAt;
      current.consecutiveFailures += 1;
      current.lastError = error instanceof Error ? error : new Error(String(error));
      current.status = current.consecutiveFailures > 1 ? "down" : "degraded";
      this.logger?.warn?.(`[PoolManager] health check failed for ${poolName}`, current.lastError);
    }
  }
  recordSelection(poolName, success) {
    const stats = this.stats.get(poolName);
    if (!stats) {
      return;
    }
    stats.totalRequests += 1;
    if (success) {
      stats.successCount += 1;
    } else {
      stats.errorCount += 1;
    }
    stats.lastRequestTime = /* @__PURE__ */ new Date();
    const samples = [stats.minResponseTime, stats.maxResponseTime].filter((value) => value > 0);
    stats.avgResponseTime = samples.length === 0 ? 0 : samples.reduce((sum, value) => sum + value, 0) / samples.length;
    stats.errorRate = stats.totalRequests === 0 ? 0 : stats.errorCount / stats.totalRequests;
  }
};
function validatePoolConfig(config) {
  if (!config.name?.trim()) {
    throw new Error("Pool config requires a non-empty name");
  }
  if (!config.uri?.trim()) {
    throw new Error("Pool config requires a non-empty uri");
  }
}
function createEmptyPoolStats(name) {
  return {
    name,
    totalRequests: 0,
    successCount: 0,
    errorCount: 0,
    avgResponseTime: 0,
    minResponseTime: 0,
    maxResponseTime: 0,
    errorRate: 0,
    lastRequestTime: null
  };
}
async function defaultClientFactory(config) {
  const client = new import_mongodb.MongoClient(config.uri, config.options);
  await client.connect();
  return client;
}
async function defaultHealthCheckFn(_poolName, client) {
  await client.db("admin").command({ ping: 1 });
  return true;
}

// src/capabilities/saga/index.ts
var SagaExecutionContext = class {
  constructor(executionId, data) {
    this.executionId = executionId;
    this.data = data;
    this.values = /* @__PURE__ */ new Map();
  }
  set(key, value) {
    this.values.set(key, value);
  }
  get(key) {
    return this.values.get(key);
  }
  has(key) {
    return this.values.has(key);
  }
  getAll() {
    return Object.fromEntries(this.values.entries());
  }
};
var SagaOrchestrator = class {
  constructor(options = {}) {
    this.sagas = /* @__PURE__ */ new Map();
    this.stats = {
      totalExecutions: 0,
      successCount: 0,
      failureCount: 0,
      compensationCount: 0
    };
    this.logger = options.logger ?? null;
  }
  /**
   * 注册 Saga 定义。
   * @since v1.1.0
   */
  define(definition) {
    validateSagaDefinition(definition);
    this.sagas.set(definition.name, normalizeSagaDefinition(definition));
  }
  /**
   * `define()` 兼容别名。
   * @since v1.1.0
   */
  defineSaga(definition) {
    this.define(definition);
  }
  /**
   * 执行指定 Saga。
   * @since v1.1.0
   */
  async execute(name, data) {
    const definition = this.sagas.get(name);
    if (!definition) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, `Saga '${name}' is not defined.`);
    }
    const executionId = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    const context = new SagaExecutionContext(executionId, data);
    const completedSteps = [];
    const completedStepNames = [];
    const compensatedSteps = [];
    let lastResult;
    this.stats.totalExecutions += 1;
    try {
      for (const step of definition.steps) {
        lastResult = await executeStepWithRetry(step, context, definition.timeout, this.logger);
        completedSteps.push(step);
        completedStepNames.push(step.name);
        if (lastResult !== void 0) {
          context.set(step.name, lastResult);
        }
      }
      this.stats.successCount += 1;
      return {
        executionId,
        success: true,
        result: lastResult,
        completedSteps: completedStepNames,
        compensatedSteps,
        duration: Date.now() - startedAt
      };
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      this.stats.failureCount += 1;
      for (const step of [...completedSteps].reverse()) {
        if (typeof step.compensate !== "function") {
          continue;
        }
        try {
          await step.compensate(context);
          compensatedSteps.push(step.name);
          this.stats.compensationCount += 1;
        } catch (compensationError) {
          this.logger?.error?.("[Saga] compensation failed", {
            saga: name,
            step: step.name,
            error: compensationError
          });
        }
      }
      return {
        executionId,
        success: false,
        error,
        completedSteps: completedStepNames,
        compensatedSteps,
        duration: Date.now() - startedAt
      };
    }
  }
  /**
   * 获取 Saga 定义。
   * @since v1.1.0
   */
  getSaga(name) {
    return this.sagas.get(name);
  }
  /**
   * 获取已注册的 Saga 名称。
   * @since v1.1.0
   */
  listSagas() {
    return [...this.sagas.keys()];
  }
  /**
   * 获取执行统计。
   * @since v1.1.0
   */
  getStats() {
    return {
      ...this.stats
    };
  }
};
function normalizeSagaDefinition(definition) {
  return {
    name: definition.name,
    timeout: definition.timeout,
    logging: definition.logging ?? true,
    steps: definition.steps.map((step) => ({
      ...step,
      retries: step.retries ?? 0
    }))
  };
}
function validateSagaDefinition(definition) {
  if (!definition || typeof definition !== "object") {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "Saga definition must be an object.");
  }
  if (typeof definition.name !== "string" || definition.name.trim() === "") {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "Saga definition requires a non-empty name.");
  }
  if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "Saga definition requires a non-empty steps array.");
  }
  for (const step of definition.steps) {
    if (!step || typeof step !== "object") {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "Saga step must be an object.");
    }
    if (typeof step.name !== "string" || step.name.trim() === "") {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "Saga step requires a non-empty name.");
    }
    if (typeof step.execute !== "function") {
      throw createError(ErrorCodes.INVALID_ARGUMENT, `Saga step '${step.name}' requires an execute function.`);
    }
    if (step.compensate !== void 0 && typeof step.compensate !== "function") {
      throw createError(ErrorCodes.INVALID_ARGUMENT, `Saga step '${step.name}' compensate must be a function.`);
    }
    if (step.timeout !== void 0 && (!Number.isFinite(step.timeout) || step.timeout <= 0)) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, `Saga step '${step.name}' timeout must be a positive number.`);
    }
    if (step.retries !== void 0 && (!Number.isInteger(step.retries) || step.retries < 0)) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, `Saga step '${step.name}' retries must be a non-negative integer.`);
    }
  }
}
async function executeStepWithRetry(step, context, defaultTimeout, logger) {
  const retries = step.retries ?? 0;
  let attempt = 0;
  while (true) {
    try {
      const promise = step.execute(context);
      const timeout = step.timeout ?? defaultTimeout;
      return timeout && timeout > 0 ? await withTimeout(step.name, promise, timeout) : await promise;
    } catch (cause) {
      if (attempt >= retries) {
        throw cause;
      }
      attempt += 1;
      logger?.warn?.("[Saga] retrying step", {
        step: step.name,
        attempt,
        retries,
        error: cause
      });
    }
  }
}
async function withTimeout(stepName, promise, timeoutMs) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(createError(ErrorCodes.INVALID_ARGUMENT, `Saga step '${stepName}' timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
        timer.unref?.();
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

// src/capabilities/slow-query-log/index.ts
var import_node_crypto2 = require("node:crypto");
var import_mongodb2 = require("mongodb");
var DEFAULT_SLOW_QUERY_LOG_CONFIG = {
  enabled: false,
  storage: {
    type: "mongodb",
    useBusinessConnection: true,
    uri: null,
    database: "admin",
    collection: "slow_query_logs",
    ttl: 7 * 24 * 3600
  },
  batch: {
    enabled: true,
    size: 10,
    interval: 5e3,
    maxBufferSize: 100
  },
  filter: {
    excludeDatabases: [],
    excludeCollections: [],
    excludeOperations: [],
    minExecutionTimeMs: 0
  },
  advanced: {
    errorHandling: "log",
    autoCreateIndexes: true
  }
};
function generateQueryHash(input) {
  return (0, import_node_crypto2.createHash)("sha1").update(stableStringify3(input)).digest("hex");
}
var BatchQueue = class {
  constructor(storage, options = {}, logger = null) {
    this.storage = storage;
    this.buffer = [];
    this.timer = null;
    this.flushing = false;
    this.batchSize = options.size ?? DEFAULT_SLOW_QUERY_LOG_CONFIG.batch.size;
    this.flushInterval = options.interval ?? DEFAULT_SLOW_QUERY_LOG_CONFIG.batch.interval;
    this.maxBufferSize = options.maxBufferSize ?? DEFAULT_SLOW_QUERY_LOG_CONFIG.batch.maxBufferSize;
    this.logger = logger;
  }
  /**
   * 添加日志到队列。
   * @since v1.3.1
   */
  async add(log) {
    this.buffer.push(log);
    if (this.buffer.length >= this.maxBufferSize || this.buffer.length >= this.batchSize) {
      await this.flush();
      return;
    }
    if (!this.timer) {
      this.timer = setTimeout(() => {
        void this.flush();
      }, this.flushInterval);
      this.timer.unref?.();
    }
  }
  /**
   * 刷新缓冲区。
   * @since v1.3.1
   */
  async flush() {
    if (this.flushing || this.buffer.length === 0) {
      return;
    }
    this.flushing = true;
    const payload = this.buffer.splice(0, this.buffer.length);
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      await this.storage.saveBatch(payload);
      this.logger?.debug?.("[SlowQueryLog] batch flushed", { count: payload.length });
    } catch (error) {
      this.logger?.error?.("[SlowQueryLog] batch flush failed", error);
    } finally {
      this.flushing = false;
    }
  }
  /**
   * 关闭队列并刷新残留日志。
   * @since v1.3.1
   */
  async close() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.flush();
  }
};
var SlowQueryLogMemoryStorage = class {
  constructor() {
    this.records = /* @__PURE__ */ new Map();
  }
  async initialize() {
    return void 0;
  }
  async save(log) {
    this.upsertRecord(log);
  }
  async saveBatch(logs) {
    for (const log of logs) {
      this.upsertRecord(log);
    }
  }
  async query(filter = {}, options = {}) {
    let records = [...this.records.values()].filter((record) => matchesFilter(record, filter));
    records = sortRecords(records, options.sort);
    if (options.skip) {
      records = records.slice(options.skip);
    }
    if (options.limit) {
      records = records.slice(0, options.limit);
    }
    return records.map(cloneRecord);
  }
  async close() {
    return void 0;
  }
  upsertRecord(log) {
    const normalized = normalizeSlowQueryLogEntry(log);
    const key = recordKey(normalized);
    const existing = this.records.get(key);
    this.records.set(key, mergeRecord(existing, normalized));
  }
};
var MongoDBSlowQueryLogStorage = class {
  constructor(config = {}, businessClient = null, logger = null, clientFactory = defaultClientFactory2) {
    this.client = null;
    this.collectionRef = null;
    this.logger = logger;
    this.businessClient = businessClient;
    this.clientFactory = clientFactory;
    this.config = {
      ...config,
      database: config.database ?? DEFAULT_SLOW_QUERY_LOG_CONFIG.storage.database ?? "admin",
      collection: config.collection ?? DEFAULT_SLOW_QUERY_LOG_CONFIG.storage.collection ?? "slow_query_logs",
      ttl: config.ttl ?? DEFAULT_SLOW_QUERY_LOG_CONFIG.storage.ttl ?? 7 * 24 * 3600
    };
  }
  async initialize() {
    if (this.collectionRef) {
      return;
    }
    const client = await this.resolveClient();
    this.collectionRef = client.db(this.config.database).collection(this.config.collection);
    if (this.config.ttl && this.config.ttl > 0) {
      await this.collectionRef.createIndex({ lastSeen: 1 }, { expireAfterSeconds: this.config.ttl, name: "slow_query_lastSeen_ttl" });
    }
    await this.collectionRef.createIndex(
      { queryHash: 1, database: 1, collection: 1, operation: 1 },
      { unique: true, name: "slow_query_log_unique" }
    );
  }
  async save(log) {
    await this.initialize();
    const record = normalizeSlowQueryLogEntry(log);
    await this.collectionRef.updateOne(
      {
        queryHash: record.queryHash,
        database: record.database,
        collection: record.collection,
        operation: record.operation
      },
      {
        $setOnInsert: {
          queryHash: record.queryHash,
          database: record.database,
          collection: record.collection,
          operation: record.operation,
          firstSeen: record.firstSeen,
          minTimeMs: record.minTimeMs,
          maxTimeMs: record.maxTimeMs,
          count: 0,
          totalTimeMs: 0
        },
        $set: {
          lastSeen: record.lastSeen,
          sampleQuery: record.sampleQuery,
          metadata: record.metadata
        },
        $inc: {
          count: 1,
          totalTimeMs: record.totalTimeMs
        },
        $min: {
          minTimeMs: record.minTimeMs
        },
        $max: {
          maxTimeMs: record.maxTimeMs
        }
      },
      { upsert: true }
    );
  }
  async saveBatch(logs) {
    for (const log of logs) {
      await this.save(log);
    }
  }
  async query(filter = {}, options = {}) {
    await this.initialize();
    const cursor = this.collectionRef.find(toMongoFilter(filter)).sort(options.sort ?? { lastSeen: -1 });
    if (options.skip) {
      cursor.skip(options.skip);
    }
    if (options.limit) {
      cursor.limit(options.limit);
    }
    const rows = await cursor.toArray();
    return rows.map((row) => ({
      queryHash: String(row.queryHash),
      database: String(row.database),
      collection: String(row.collection),
      operation: String(row.operation),
      count: Number(row.count ?? 0),
      totalTimeMs: Number(row.totalTimeMs ?? 0),
      avgTimeMs: Number(row.count ?? 0) > 0 ? Number(row.totalTimeMs ?? 0) / Number(row.count ?? 1) : 0,
      maxTimeMs: Number(row.maxTimeMs ?? 0),
      minTimeMs: Number(row.minTimeMs ?? 0),
      firstSeen: new Date(row.firstSeen),
      lastSeen: new Date(row.lastSeen),
      sampleQuery: row.sampleQuery,
      metadata: row.metadata
    }));
  }
  async close() {
    if (this.client && this.client !== this.businessClient) {
      await this.client.close();
    }
    this.client = null;
    this.collectionRef = null;
  }
  async resolveClient() {
    if (this.client) {
      return this.client;
    }
    if (this.config.useBusinessConnection !== false && this.businessClient) {
      this.client = this.businessClient;
      return this.client;
    }
    if (!this.config.uri) {
      throw createError(ErrorCodes.INVALID_CONFIG, "slowQueryLog.storage.uri is required when useBusinessConnection is false.");
    }
    this.client = await this.clientFactory(this.config.uri, this.config.options);
    return this.client;
  }
};
var SlowQueryLogConfigManager = class {
  static mergeConfig(userConfig, businessType = "mongodb") {
    if (userConfig === void 0 || userConfig === null) {
      return deepClone(DEFAULT_SLOW_QUERY_LOG_CONFIG);
    }
    if (typeof userConfig === "boolean") {
      const config = deepClone(DEFAULT_SLOW_QUERY_LOG_CONFIG);
      config.enabled = userConfig;
      config.storage.type = businessType === "mongodb" ? "mongodb" : "memory";
      return config;
    }
    const merged = mergeSlowQueryLogConfig(deepClone(DEFAULT_SLOW_QUERY_LOG_CONFIG), userConfig);
    if (merged.storage.type === void 0) {
      merged.storage.type = businessType === "mongodb" ? "mongodb" : "memory";
    }
    if (userConfig.storage && merged.enabled === false) {
      merged.enabled = true;
    }
    return merged;
  }
  static validate(config, businessType = "mongodb") {
    if (!config || typeof config !== "object") {
      throw createError(ErrorCodes.INVALID_CONFIG, "[SlowQueryLog] config must be an object.");
    }
    if (!config.enabled) {
      return true;
    }
    if (!["memory", "mongodb"].includes(config.storage.type ?? "memory")) {
      throw createError(ErrorCodes.INVALID_CONFIG, "[SlowQueryLog] storage.type must be memory or mongodb.");
    }
    if (config.storage.type === "mongodb" && config.storage.useBusinessConnection === false && !config.storage.uri) {
      throw createError(ErrorCodes.INVALID_CONFIG, "[SlowQueryLog] storage.uri is required when mongodb storage does not reuse business connection.");
    }
    if (config.storage.type === "memory" && businessType !== "mongodb") {
      return true;
    }
    if (!Number.isInteger(config.batch.size) || config.batch.size < 1) {
      throw createError(ErrorCodes.INVALID_CONFIG, "[SlowQueryLog] batch.size must be >= 1.");
    }
    if (!Number.isInteger(config.batch.interval) || config.batch.interval < 50) {
      throw createError(ErrorCodes.INVALID_CONFIG, "[SlowQueryLog] batch.interval must be >= 50ms.");
    }
    if (!Number.isInteger(config.batch.maxBufferSize) || config.batch.maxBufferSize < config.batch.size) {
      throw createError(ErrorCodes.INVALID_CONFIG, "[SlowQueryLog] batch.maxBufferSize must be >= batch.size.");
    }
    if (config.filter.minExecutionTimeMs < 0) {
      throw createError(ErrorCodes.INVALID_CONFIG, "[SlowQueryLog] filter.minExecutionTimeMs must be >= 0.");
    }
    return true;
  }
};
var SlowQueryLogManager = class {
  constructor(userConfig, businessClient = null, businessType = "mongodb", logger = null, options = {}) {
    this.initialized = false;
    this.logger = logger;
    this.config = SlowQueryLogConfigManager.mergeConfig(userConfig, businessType);
    SlowQueryLogConfigManager.validate(this.config, businessType);
    this.storage = options.storage ?? (this.config.storage.type === "memory" ? new SlowQueryLogMemoryStorage() : new MongoDBSlowQueryLogStorage(this.config.storage, businessClient, logger));
    this.queue = this.config.batch.enabled ? new BatchQueue(this.storage, this.config.batch, logger) : null;
  }
  /**
   * 初始化管理器。
   * @since v1.3.1
   */
  async initialize() {
    if (this.initialized || !this.config.enabled) {
      return;
    }
    await this.storage.initialize();
    this.initialized = true;
  }
  /**
   * 保存单条慢查询日志。
   * @since v1.3.1
   */
  async save(log) {
    if (!this.config.enabled || this.shouldFilter(log)) {
      return;
    }
    await this.initialize();
    try {
      if (this.queue) {
        await this.queue.add(log);
      } else {
        await this.storage.save(log);
      }
    } catch (error) {
      handleError(this.logger, this.config.advanced.errorHandling, error);
    }
  }
  /**
   * 查询已聚合的慢查询日志。
   * @since v1.3.1
   */
  async query(filter = {}, options = {}) {
    await this.initialize();
    return this.storage.query(filter, options);
  }
  /**
   * 关闭管理器。
   * @since v1.3.1
   */
  async close() {
    await this.queue?.close();
    await this.storage.close();
    this.initialized = false;
  }
  shouldFilter(log) {
    const { filter } = this.config;
    if (filter.excludeDatabases.includes(log.database)) {
      return true;
    }
    if (filter.excludeCollections.includes(log.collection)) {
      return true;
    }
    if (filter.excludeOperations.includes(log.operation)) {
      return true;
    }
    if (log.durationMs < filter.minExecutionTimeMs) {
      return true;
    }
    return false;
  }
};
function handleError(logger, policy, error) {
  if (policy === "throw") {
    throw error instanceof Error ? error : new Error(String(error));
  }
  if (policy === "log") {
    logger?.error?.("[SlowQueryLog] operation failed", error);
  }
}
function toMongoFilter(filter) {
  const query = {};
  if (filter.database) {
    query.database = filter.database;
  }
  if (filter.collection) {
    query.collection = filter.collection;
  }
  if (filter.operation) {
    query.operation = filter.operation;
  }
  if (filter.queryHash) {
    query.queryHash = filter.queryHash;
  }
  return query;
}
function normalizeSlowQueryLogEntry(log) {
  if (!log.database || !log.collection || !log.operation) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "[SlowQueryLog] database / collection / operation are required.");
  }
  if (!Number.isFinite(log.durationMs) || log.durationMs < 0) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "[SlowQueryLog] durationMs must be a non-negative number.");
  }
  const timestamp = log.timestamp ?? /* @__PURE__ */ new Date();
  return {
    queryHash: log.queryHash ?? generateQueryHash({
      database: log.database,
      collection: log.collection,
      operation: log.operation,
      query: log.query
    }),
    database: log.database,
    collection: log.collection,
    operation: log.operation,
    count: 1,
    totalTimeMs: log.durationMs,
    avgTimeMs: log.durationMs,
    maxTimeMs: log.durationMs,
    minTimeMs: log.durationMs,
    firstSeen: timestamp,
    lastSeen: timestamp,
    sampleQuery: log.query,
    metadata: log.metadata
  };
}
function mergeRecord(existing, incoming) {
  if (!existing) {
    return incoming;
  }
  const count = existing.count + incoming.count;
  const totalTimeMs = existing.totalTimeMs + incoming.totalTimeMs;
  return {
    ...existing,
    count,
    totalTimeMs,
    avgTimeMs: totalTimeMs / count,
    maxTimeMs: Math.max(existing.maxTimeMs, incoming.maxTimeMs),
    minTimeMs: Math.min(existing.minTimeMs, incoming.minTimeMs),
    firstSeen: existing.firstSeen < incoming.firstSeen ? existing.firstSeen : incoming.firstSeen,
    lastSeen: existing.lastSeen > incoming.lastSeen ? existing.lastSeen : incoming.lastSeen,
    sampleQuery: incoming.sampleQuery ?? existing.sampleQuery,
    metadata: incoming.metadata ?? existing.metadata
  };
}
function recordKey(record) {
  return `${record.queryHash}:${record.database}:${record.collection}:${record.operation}`;
}
function matchesFilter(record, filter) {
  if (filter.database && record.database !== filter.database) {
    return false;
  }
  if (filter.collection && record.collection !== filter.collection) {
    return false;
  }
  if (filter.operation && record.operation !== filter.operation) {
    return false;
  }
  if (filter.queryHash && record.queryHash !== filter.queryHash) {
    return false;
  }
  return true;
}
function sortRecords(records, sort = { lastSeen: -1 }) {
  const entries = Object.entries(sort);
  return [...records].sort((left, right) => {
    for (const [field, direction] of entries) {
      const leftValue = left[field];
      const rightValue = right[field];
      if (leftValue === rightValue) {
        continue;
      }
      return (leftValue > rightValue ? 1 : -1) * direction;
    }
    return 0;
  });
}
function cloneRecord(record) {
  return {
    ...record,
    firstSeen: new Date(record.firstSeen),
    lastSeen: new Date(record.lastSeen)
  };
}
function deepClone(value) {
  return JSON.parse(JSON.stringify(value, (_key, current) => current instanceof Date ? current.toISOString() : current));
}
function mergeSlowQueryLogConfig(target, source) {
  return {
    ...target,
    ...source,
    storage: {
      ...target.storage,
      ...source.storage ?? {}
    },
    batch: {
      ...target.batch,
      ...source.batch ?? {}
    },
    filter: {
      ...target.filter,
      ...source.filter ?? {}
    },
    advanced: {
      ...target.advanced,
      ...source.advanced ?? {}
    }
  };
}
function stableStringify3(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify3(item)).join(",")}]`;
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, current]) => `${JSON.stringify(key)}:${stableStringify3(current)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
async function defaultClientFactory2(uri, options) {
  const client = new import_mongodb2.MongoClient(uri, options);
  await client.connect();
  return client;
}

// src/capabilities/sync/index.ts
var import_promises = require("node:fs/promises");
var import_node_path = __toESM(require("node:path"));
var import_mongodb3 = require("mongodb");
function validateSyncConfig(config) {
  if (!config || typeof config !== "object") {
    throw createError(ErrorCodes.INVALID_CONFIG, "[Sync] config must be an object.");
  }
  if (typeof config.enabled !== "boolean") {
    throw createError(ErrorCodes.INVALID_CONFIG, "[Sync] enabled must be a boolean.");
  }
  if (!config.enabled) {
    return;
  }
  if (!Array.isArray(config.targets) || config.targets.length === 0) {
    throw createError(ErrorCodes.INVALID_CONFIG, "[Sync] targets must be a non-empty array.");
  }
  if (config.collections !== void 0 && (!Array.isArray(config.collections) || config.collections.length === 0)) {
    throw createError(ErrorCodes.INVALID_CONFIG, "[Sync] collections must be a non-empty array when provided.");
  }
  if (config.filter !== void 0 && typeof config.filter !== "function") {
    throw createError(ErrorCodes.INVALID_CONFIG, "[Sync] filter must be a function.");
  }
  if (config.transform !== void 0 && typeof config.transform !== "function") {
    throw createError(ErrorCodes.INVALID_CONFIG, "[Sync] transform must be a function.");
  }
  config.targets.forEach((target, index) => {
    if (!target || typeof target !== "object") {
      throw createError(ErrorCodes.INVALID_CONFIG, `[Sync] targets[${index}] must be an object.`);
    }
    if (typeof target.name !== "string" || target.name.trim() === "") {
      throw createError(ErrorCodes.INVALID_CONFIG, `[Sync] targets[${index}].name must be a non-empty string.`);
    }
    if (!target.apply && !target.uri && !target.pool) {
      throw createError(ErrorCodes.INVALID_CONFIG, `[Sync] targets[${index}] requires one of apply / uri / pool.`);
    }
    if (target.uri !== void 0 && (typeof target.uri !== "string" || target.uri.trim() === "")) {
      throw createError(ErrorCodes.INVALID_CONFIG, `[Sync] targets[${index}].uri must be a non-empty string when provided.`);
    }
    if (target.pool !== void 0 && (typeof target.pool !== "string" || target.pool.trim() === "")) {
      throw createError(ErrorCodes.INVALID_CONFIG, `[Sync] targets[${index}].pool must be a non-empty string when provided.`);
    }
    if (target.databaseName !== void 0 && (typeof target.databaseName !== "string" || target.databaseName.trim() === "")) {
      throw createError(ErrorCodes.INVALID_CONFIG, `[Sync] targets[${index}].databaseName must be a non-empty string when provided.`);
    }
    if (target.collections !== void 0 && (!Array.isArray(target.collections) || target.collections.length === 0)) {
      throw createError(ErrorCodes.INVALID_CONFIG, `[Sync] targets[${index}].collections must be a non-empty array when provided.`);
    }
    if (target.apply !== void 0 && typeof target.apply !== "function") {
      throw createError(ErrorCodes.INVALID_CONFIG, `[Sync] targets[${index}].apply must be a function when provided.`);
    }
  });
  if (config.resumeToken) {
    validateResumeTokenConfig(config.resumeToken);
  }
}
var ResumeTokenStore = class {
  constructor(options = {}) {
    this.storage = options.storage ?? "file";
    this.tokenPath = options.path ?? "./.sync-resume-token.json";
    this.redis = options.redis;
    this.redisKey = options.key ?? "monsqlize:sync:resume-token";
    this.logger = options.logger ?? null;
    validateResumeTokenConfig(options);
  }
  async load() {
    try {
      if (this.storage === "redis" && this.redis) {
        const payload2 = await Promise.resolve(this.redis.get(this.redisKey));
        return payload2 ? JSON.parse(String(payload2)) : null;
      }
      const payload = await (0, import_promises.readFile)(this.tokenPath, "utf8");
      return JSON.parse(payload);
    } catch (error) {
      const code = error?.code;
      if (code !== "ENOENT") {
        this.logger?.warn?.("[Sync] failed to load resume token", error);
      }
      return null;
    }
  }
  async save(token) {
    try {
      const payload = JSON.stringify(token, null, 2);
      if (this.storage === "redis" && this.redis) {
        await Promise.resolve(this.redis.set(this.redisKey, payload));
        return;
      }
      await (0, import_promises.mkdir)(import_node_path.default.dirname(this.tokenPath), { recursive: true });
      await (0, import_promises.writeFile)(this.tokenPath, payload, "utf8");
    } catch (error) {
      this.logger?.error?.("[Sync] failed to save resume token", error);
    }
  }
  async clear() {
    try {
      if (this.storage === "redis" && this.redis) {
        await Promise.resolve(this.redis.del?.(this.redisKey));
        return;
      }
      await (0, import_promises.unlink)(this.tokenPath);
    } catch (error) {
      const code = error?.code;
      if (code !== "ENOENT") {
        this.logger?.warn?.("[Sync] failed to clear resume token", error);
      }
    }
  }
};
var ChangeStreamSyncManager = class {
  constructor(options) {
    this.targets = [];
    this.changeStream = null;
    this.running = false;
    this.stats = {
      eventCount: 0,
      syncedCount: 0,
      errorCount: 0,
      startTime: null,
      lastEventTime: null
    };
    validateSyncConfig(options.config);
    this.db = options.db;
    this.poolManager = options.poolManager ?? null;
    this.config = options.config;
    this.logger = options.logger ?? null;
    this.tokenStore = options.tokenStore ?? new ResumeTokenStore({
      ...options.config.resumeToken,
      logger: options.logger ?? null
    });
    this.clientFactory = options.clientFactory ?? defaultClientFactory3;
  }
  /**
   * 启动 Change Stream 同步。
   * @since v1.0.9
   */
  async start() {
    if (this.running || !this.config.enabled) {
      return;
    }
    await this.validateEnvironment();
    await this.initializeTargets();
    const resumeAfter = await this.tokenStore.load();
    const options = {
      fullDocument: "updateLookup"
    };
    if (resumeAfter) {
      options.resumeAfter = resumeAfter;
    }
    const stream = this.db.watch(this.buildPipeline(), options);
    stream.on("change", (event) => {
      void this.handleChange(event);
    });
    stream.on("error", (error) => {
      this.stats.errorCount += 1;
      this.logger?.error?.("[Sync] change stream error", error);
    });
    stream.on("close", () => {
      this.logger?.warn?.("[Sync] change stream closed");
    });
    this.changeStream = stream;
    this.running = true;
    this.stats.startTime = /* @__PURE__ */ new Date();
  }
  /**
   * 停止 Change Stream 同步。
   * @since v1.0.9
   */
  async stop() {
    this.running = false;
    if (this.changeStream) {
      await this.changeStream.close();
      this.changeStream = null;
    }
    while (this.targets.length > 0) {
      const target = this.targets.pop();
      await target?.close();
    }
  }
  /**
   * 获取当前统计。
   * @since v1.0.9
   */
  getStats() {
    return {
      isRunning: this.running,
      eventCount: this.stats.eventCount,
      syncedCount: this.stats.syncedCount,
      errorCount: this.stats.errorCount,
      startTime: this.stats.startTime,
      lastEventTime: this.stats.lastEventTime,
      targets: this.targets.map((target) => ({
        name: target.name,
        syncCount: target.stats.syncCount,
        errorCount: target.stats.errorCount,
        lastSyncTime: target.stats.lastSyncTime,
        lastError: target.stats.lastError,
        successRate: target.stats.syncCount + target.stats.errorCount === 0 ? "0%" : `${(target.stats.syncCount / (target.stats.syncCount + target.stats.errorCount) * 100).toFixed(2)}%`
      }))
    };
  }
  async validateEnvironment() {
    try {
      const probe = this.db.watch([], { maxAwaitTimeMS: 1 });
      await probe.close();
    } catch (error) {
      throw createError(
        ErrorCodes.INVALID_CONFIG,
        "Change Stream requires a MongoDB replica set or sharded cluster.",
        void 0,
        error instanceof Error ? error : void 0
      );
    }
  }
  buildPipeline() {
    const pipeline = [
      {
        $match: {
          operationType: {
            $in: ["insert", "update", "replace", "delete"]
          }
        }
      }
    ];
    if (this.config.collections?.length) {
      pipeline.unshift({
        $match: {
          "ns.coll": { $in: this.config.collections }
        }
      });
    }
    return pipeline;
  }
  async initializeTargets() {
    if (this.targets.length > 0) {
      return;
    }
    for (const target of this.config.targets) {
      this.targets.push(await this.resolveTarget(target));
    }
  }
  async resolveTarget(target) {
    const collections = target.collections?.length ? new Set(target.collections) : null;
    if (target.apply) {
      return {
        name: target.name,
        collections,
        apply: target.apply,
        close: async () => {
        },
        stats: {
          syncCount: 0,
          errorCount: 0,
          lastSyncTime: null,
          lastError: null
        }
      };
    }
    if (target.pool) {
      if (!this.poolManager) {
        throw createError(ErrorCodes.INVALID_CONFIG, `[Sync] target '${target.name}' requires poolManager when pool is provided.`);
      }
      const selected = this.poolManager.selectPool("write", {
        pool: target.pool,
        databaseName: target.databaseName ?? this.db.databaseName
      });
      return createMongoTarget(target.name, collections, selected.client, target.databaseName ?? this.db.databaseName, false);
    }
    if (!target.uri) {
      throw createError(ErrorCodes.INVALID_CONFIG, `[Sync] target '${target.name}' requires uri when pool/apply are not provided.`);
    }
    const client = await this.clientFactory(target.uri, target.options);
    return createMongoTarget(target.name, collections, client, target.databaseName ?? this.db.databaseName, true);
  }
  async handleChange(event) {
    this.stats.eventCount += 1;
    this.stats.lastEventTime = /* @__PURE__ */ new Date();
    if (this.config.filter && !this.config.filter(event)) {
      return;
    }
    let document = event.fullDocument;
    if (this.config.transform) {
      document = this.config.transform(document, event);
    }
    let succeeded = 0;
    for (const target of this.targets) {
      if (target.collections && !target.collections.has(event.ns.coll)) {
        continue;
      }
      try {
        await target.apply(event, document);
        target.stats.syncCount += 1;
        target.stats.lastSyncTime = /* @__PURE__ */ new Date();
        target.stats.lastError = null;
        succeeded += 1;
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        target.stats.errorCount += 1;
        target.stats.lastError = normalized;
        this.stats.errorCount += 1;
        this.logger?.error?.("[Sync] target apply failed", {
          target: target.name,
          error: normalized
        });
      }
    }
    if (succeeded > 0) {
      this.stats.syncedCount += 1;
      await this.tokenStore.save(event._id);
    }
  }
};
function validateResumeTokenConfig(config) {
  const storage = config.storage ?? "file";
  if (!["file", "redis"].includes(storage)) {
    throw createError(ErrorCodes.INVALID_CONFIG, "[Sync] resumeToken.storage must be file or redis.");
  }
  if (storage === "redis" && !config.redis) {
    throw createError(ErrorCodes.INVALID_CONFIG, "[Sync] resumeToken.redis is required when storage is redis.");
  }
}
function createMongoTarget(name, collections, client, databaseName, ownsConnection) {
  return {
    name,
    collections,
    async apply(event, document) {
      const collection = client.db(databaseName).collection(event.ns.coll);
      if (event.operationType === "delete") {
        await collection.deleteOne(event.documentKey);
        return;
      }
      if (!document) {
        return;
      }
      const key = event.documentKey;
      const filter = key && Object.keys(key).length > 0 ? key : { _id: document._id };
      await collection.replaceOne(filter, document, { upsert: true });
    },
    async close() {
      if (ownsConnection) {
        await client.close();
      }
    },
    stats: {
      syncCount: 0,
      errorCount: 0,
      lastSyncTime: null,
      lastError: null
    }
  };
}
async function defaultClientFactory3(uri, options) {
  const client = new import_mongodb3.MongoClient(uri, options);
  await client.connect();
  return client;
}

// src/capabilities/transaction/index.ts
var CacheLockManager = class {
  constructor(options = {}) {
    this.locks = /* @__PURE__ */ new Map();
    this.logger = options.logger ?? null;
    this.maxDuration = options.maxDuration ?? 3e5;
    this.cleanupInterval = options.cleanupInterval ?? 1e4;
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredLocks();
    }, this.cleanupInterval);
    this.cleanupTimer.unref?.();
  }
  /**
   * 添加缓存锁。
   * @since v1.4.0
   */
  addLock(key, owner) {
    const ownerId = typeof owner === "string" ? owner : String(owner.id ?? "unknown");
    this.locks.set(key, {
      ownerId,
      expiresAt: Date.now() + this.maxDuration
    });
  }
  /**
   * 检查缓存键是否被锁定。
   * @since v1.4.0
   */
  isLocked(key) {
    this.cleanupExpiredLocks();
    if (this.locks.has(key)) {
      return true;
    }
    for (const pattern of this.locks.keys()) {
      if (!pattern.includes("*")) {
        continue;
      }
      const regex = new RegExp(`^${escapeRegExp(pattern).replace(/\\\*/g, ".*")}$`);
      if (regex.test(key)) {
        return true;
      }
    }
    return false;
  }
  /**
   * 释放 owner 的所有缓存锁。
   * @since v1.4.0
   */
  releaseLocks(owner) {
    const ownerId = typeof owner === "string" ? owner : String(owner.id ?? "unknown");
    for (const [key, record] of this.locks.entries()) {
      if (record.ownerId === ownerId) {
        this.locks.delete(key);
      }
    }
  }
  /**
   * 获取缓存锁统计。
   * @since v1.4.0
   */
  getStats() {
    this.cleanupExpiredLocks();
    return {
      totalLocks: this.locks.size,
      activeLocks: this.locks.size,
      maxDuration: this.maxDuration
    };
  }
  /**
   * 清空缓存锁。
   * @since v1.4.0
   */
  clear() {
    this.locks.clear();
  }
  /**
   * 停止缓存锁管理器。
   * @since v1.4.0
   */
  stop() {
    clearInterval(this.cleanupTimer);
  }
  cleanupExpiredLocks() {
    const now = Date.now();
    for (const [key, value] of this.locks.entries()) {
      if (value.expiresAt <= now) {
        this.locks.delete(key);
      }
    }
  }
};
var Transaction = class {
  constructor(session, options = {}) {
    this.session = session;
    this.options = options;
    this.id = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    this.state = "pending";
    this.startedAt = null;
    this.timeoutTimer = null;
    this.pendingInvalidations = /* @__PURE__ */ new Set();
  }
  /**
   * 启动事务。
   * @since v1.4.0
   */
  async start() {
    if (this.state !== "pending") {
      throw new Error(`Cannot start transaction in state: ${this.state}`);
    }
    this.session.startTransaction();
    this.state = "started";
    this.startedAt = Date.now();
    const timeout = this.options.timeout ?? 3e4;
    if (timeout > 0) {
      this.timeoutTimer = setTimeout(() => {
        if (this.state === "started") {
          this.options.logger?.warn?.(`[Transaction] auto-abort on timeout: ${this.id}`);
          void this.abort();
        }
      }, timeout);
      this.timeoutTimer.unref?.();
    }
  }
  /**
   * 提交事务。
   * @since v1.4.0
   */
  async commit() {
    if (this.state !== "started") {
      throw new Error(`Cannot commit transaction in state: ${this.state}`);
    }
    await this.session.commitTransaction();
    this.state = "committed";
    this.options.lockManager?.releaseLocks(this.id);
    this.pendingInvalidations.clear();
    this.clearTimeout();
  }
  /**
   * 回滚事务。
   * @since v1.4.0
   */
  async abort() {
    if (this.state !== "pending" && this.state !== "started") {
      return;
    }
    if (this.state === "started") {
      await this.session.abortTransaction();
    }
    this.state = "aborted";
    this.options.lockManager?.releaseLocks(this.id);
    this.pendingInvalidations.clear();
    this.clearTimeout();
  }
  /**
   * 结束事务会话。
   * @since v1.4.0
   */
  async end() {
    this.clearTimeout();
    this.options.lockManager?.releaseLocks(this.id);
    await this.session.endSession();
  }
  /**
   * 记录缓存失效意图。
   * @since v1.4.0
   */
  async recordInvalidation(pattern) {
    this.pendingInvalidations.add(pattern);
    this.options.lockManager?.addLock(pattern, this.id);
    if (this.options.cache?.delPattern) {
      await this.options.cache.delPattern(pattern);
    }
  }
  /**
   * 获取事务持续时间。
   * @since v1.4.0
   */
  getDuration() {
    if (!this.startedAt) {
      return 0;
    }
    return Date.now() - this.startedAt;
  }
  /**
   * 获取事务信息。
   * @since v1.4.0
   */
  getInfo() {
    return {
      id: this.id,
      status: this.state,
      duration: this.getDuration(),
      sessionId: stringifySessionId(this.session.id)
    };
  }
  clearTimeout() {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }
};
var TransactionManager = class {
  constructor(options) {
    this.activeTransactions = /* @__PURE__ */ new Map();
    this.durations = [];
    this.stats = {
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0
    };
    this.client = options.client;
    this.cache = options.cache ?? null;
    this.logger = options.logger ?? null;
    this.lockManager = options.lockManager ?? null;
    this.defaultOptions = {
      maxDuration: options.maxDuration ?? 3e4,
      enableRetry: options.enableRetry ?? true,
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 100,
      retryBackoff: options.retryBackoff ?? 2
    };
  }
  /**
   * 创建手动事务会话。
   * @since v1.4.0
   */
  async startSession(options = {}) {
    const session = this.client.startSession({
      causalConsistency: options.causalConsistency !== false
    });
    const transaction = new Transaction(session, {
      cache: this.cache,
      logger: this.logger,
      lockManager: options.enableCacheLock === false ? null : this.lockManager,
      timeout: options.maxDuration ?? this.defaultOptions.maxDuration
    });
    const originalEnd = transaction.end.bind(transaction);
    transaction.end = async () => {
      await originalEnd();
      this.activeTransactions.delete(transaction.id);
    };
    this.activeTransactions.set(transaction.id, transaction);
    return transaction;
  }
  /**
   * 自动管理事务生命周期。
   * @since v1.4.0
   */
  async withTransaction(callback, options = {}) {
    const maxRetries = options.maxRetries ?? this.defaultOptions.maxRetries;
    const retryDelay = options.retryDelay ?? this.defaultOptions.retryDelay;
    const retryBackoff = options.retryBackoff ?? this.defaultOptions.retryBackoff;
    const enableRetry = options.enableRetry ?? this.defaultOptions.enableRetry;
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const transaction = await this.startSession(options);
      const startedAt = Date.now();
      try {
        await transaction.start();
        const result = await callback(transaction);
        await transaction.commit();
        this.recordStats(Date.now() - startedAt, true);
        return result;
      } catch (error) {
        lastError = error;
        await transaction.abort();
        this.recordStats(Date.now() - startedAt, false);
        if (!enableRetry || attempt === maxRetries || !isTransientTransactionError(error)) {
          throw error;
        }
        await sleep2(retryDelay * Math.pow(retryBackoff, attempt));
      } finally {
        await transaction.end();
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Transaction failed.");
  }
  /**
   * 获取活跃事务。
   * @since v1.4.0
   */
  getActiveTransactions() {
    return [...this.activeTransactions.values()];
  }
  /**
   * 中止所有活跃事务。
   * @since v1.4.0
   */
  async abortAll() {
    const transactions = this.getActiveTransactions();
    for (const transaction of transactions) {
      await transaction.abort();
      await transaction.end();
      this.activeTransactions.delete(transaction.id);
    }
  }
  /**
   * 获取事务统计。
   * @since v1.4.0
   */
  getStats() {
    const averageDuration = this.durations.length === 0 ? 0 : this.durations.reduce((sum, item) => sum + item, 0) / this.durations.length;
    return {
      totalTransactions: this.stats.totalTransactions,
      successfulTransactions: this.stats.successfulTransactions,
      failedTransactions: this.stats.failedTransactions,
      activeTransactions: this.activeTransactions.size,
      averageDuration
    };
  }
  recordStats(duration, success) {
    this.stats.totalTransactions += 1;
    if (success) {
      this.stats.successfulTransactions += 1;
    } else {
      this.stats.failedTransactions += 1;
    }
    this.durations.push(duration);
    if (this.durations.length > 100) {
      this.durations.shift();
    }
  }
};
function stringifySessionId(id) {
  if (typeof id === "string") {
    return id;
  }
  if (typeof id === "object" && id !== null) {
    const candidate = id;
    if (typeof candidate.toHexString === "function") {
      return candidate.toHexString();
    }
    if (candidate.id?.buffer) {
      return Buffer.from(candidate.id.buffer).toString("hex");
    }
    if (typeof candidate.toString === "function") {
      return candidate.toString();
    }
  }
  return String(id);
}
function isTransientTransactionError(error) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error;
  if (typeof candidate.hasErrorLabel === "function" && candidate.hasErrorLabel("TransientTransactionError")) {
    return true;
  }
  return candidate.code === 112 || candidate.code === 117;
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
async function sleep2(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// src/adapters/mongodb/common/connect.ts
var import_mongodb4 = require("mongodb");
async function connectMongo(params) {
  const databaseName = params.databaseName?.trim();
  if (!databaseName) {
    throw createError(ErrorCodes.INVALID_DATABASE_NAME, "Database name must be a non-empty string.");
  }
  const uri = params.config?.uri?.trim();
  if (!uri) {
    throw createError(ErrorCodes.INVALID_CONFIG, "MongoDB connect requires config.uri.");
  }
  const client = new import_mongodb4.MongoClient(uri, params.config?.options);
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
var MonSQLizeRuntime = class {
  constructor(options = {}) {
    this.options = options;
    this._connected = false;
    this._events = new import_node_events.EventEmitter();
    this._client = null;
    this._defaultDb = null;
    this._poolManager = null;
    this._syncManager = null;
    this._slowQueryLogManager = null;
    this._sagaOrchestrator = null;
    this._transactionManager = null;
    this._lockManager = null;
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
    this._cacheLockManager = new CacheLockManager({ logger: options.logger ?? null });
    this._cache.setLockManager(this._cacheLockManager);
  }
  /**
   * 建立数据库连接并返回当前 runtime 的标准访问器集合。
   *
   * 行为说明：
   * - 首次调用会真正连接 MongoDB 并初始化已启用的高级能力
   * - 重复调用会复用已有连接
   * - 并发调用会复用同一个连接中的 promise，避免重复建连
   *
   * @returns {Promise<{ collection: (name: string) => CollectionFacade; db: (name?: string) => DbFacade; use: (name: string) => { collection: (collectionName: string) => CollectionFacade; model: <TDocument = Record<string, unknown>>(modelName: string) => ModelInstance<TDocument>; }; instance: MonSQLizeRuntime; }>} 返回包含 `collection`、`db`、`use` 与 `instance` 的访问器对象。
   * @throws {Error} 当连接配置非法、MongoDB 建连失败或初始化依赖能力失败时抛出错误。
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
      await this.ensurePoolManager();
      this.initializeSagaOrchestrator();
      this.initializeSlowQueryLogManager();
      await this.initializeSyncManager();
      this._connected = true;
      this.emit("connected", {
        type: this.options.type,
        db: databaseName
      });
      return this.createRuntimeAccessors();
    })();
    try {
      return await this._connectionPromise;
    } catch (error) {
      this.emit("error", {
        type: this.options.type,
        db: this.resolveDatabaseName(),
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      this._connectionPromise = null;
    }
  }
  /**
   * 返回当前 runtime 绑定的本地缓存实例。
   *
   * @returns {MemoryCache}
   * @since v1.3.0
   */
  getCache() {
    return this._cache;
  }
  /**
   * 返回当前 runtime 的默认公开配置快照。
   *
   * 该方法用于对外暴露当前实例的轻量默认状态，而不是完整内部配置对象。
   *
   * @returns {Record<string, unknown>}
   * @since v1.3.0
   */
  getDefaults() {
    return {
      type: this.options.type,
      databaseName: this.options.databaseName,
      sync: this.options.sync,
      slowQueryLog: this.options.slowQueryLog ?? false
    };
  }
  /**
   * 关闭连接。
   * @since v1.3.0
   */
  async close() {
    await this._syncManager?.stop();
    await this._slowQueryLogManager?.close();
    await this._transactionManager?.abortAll();
    this._cacheLockManager.stop();
    this._lockManager?.close();
    await this._poolManager?.close();
    await closeMongo(this._client, this._logger);
    this._client = null;
    this._defaultDb = null;
    this._connected = false;
    this._poolManager = null;
    this._syncManager = null;
    this._slowQueryLogManager = null;
    this._transactionManager = null;
    this._lockManager = null;
    this._modelInstances.clear();
    this.emit("closed", {
      type: this.options.type,
      db: this.resolveDatabaseName()
    });
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
      cache: {
        enabled: true,
        pools: this._poolManager?.getHealthStatus()
      }
    };
  }
  /**
   * 获取默认数据库下的 Collection 访问器。
   *
   * @param {string} name - 集合名。
   * @returns {CollectionFacade}
   * @throws {Error} 当 runtime 尚未连接时抛出 `NOT_CONNECTED`。
   * @since v1.3.0
   */
  collection(name) {
    this.ensureConnected();
    return this.db().collection(name);
  }
  /**
   * 获取数据库访问器。
   *
   * @param {string} [name] - 可选数据库名；不传时使用默认数据库。
   * @returns {DbFacade}
   * @throws {Error} 当 runtime 尚未连接时抛出 `NOT_CONNECTED`。
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
   * 获取限定到指定数据库的访问器集合。
   *
   * @param {string} name - 目标数据库名。
   * @returns {{ collection: (collectionName: string) => CollectionFacade; model: <TDocument = Record<string, unknown>>(modelName: string) => ModelInstance<TDocument>; }} 返回绑定到该数据库的 `collection()` 与 `model()` 访问器。
   * @throws {Error} 当 runtime 尚未连接时抛出 `NOT_CONNECTED`。
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
   * 获取限定到某个连接池的访问器集合。
   *
   * @param {string} poolName - 连接池名称。
   * @returns {{ collection: (name: string) => CollectionFacade; model: <TDocument = Record<string, unknown>>(name: string) => ModelInstance<TDocument>; use: (dbName: string) => { collection: (name: string) => CollectionFacade; model: <TDocument = Record<string, unknown>>(name: string) => ModelInstance<TDocument>; }; }} 返回绑定到连接池的 collection/model/use 访问器。
   * @throws {Error} 当 runtime 尚未连接，或未配置 `options.pools` / 指定连接池不存在时抛出错误。
   * @since v1.3.0
   */
  pool(poolName) {
    this.ensureConnected();
    const databaseName = this.resolveDatabaseName();
    this.requirePoolManager().getPool(poolName);
    return {
      collection: (name) => this.scopedCollection(name, { database: databaseName, pool: poolName }),
      model: (name) => this.scopedModel(name, { database: databaseName, pool: poolName }),
      use: (dbName) => ({
        collection: (name) => this.scopedCollection(name, { database: dbName, pool: poolName }),
        model: (name) => this.scopedModel(name, { database: dbName, pool: poolName })
      })
    };
  }
  /**
   * 获取可选数据库 / 连接池作用域下的 Collection 访问器。
   *
   * @param {string} name - 集合名。
   * @param {{ database?: string; pool?: string; }} [options={}] - 可选数据库名或连接池名。
   * @returns {CollectionFacade}
   * @throws {Error} 当 runtime 尚未连接，或指定连接池不存在时抛出错误。
   * @since v1.3.0
   */
  scopedCollection(name, options = {}) {
    this.ensureConnected();
    if (options.pool) {
      const databaseName = options.database ?? this.resolveDatabaseName();
      const selected = this.requirePoolManager().selectPool("read", {
        pool: options.pool,
        databaseName
      });
      return new MongoCollectionAccessor(
        databaseName,
        name,
        selected.collection(databaseName, name),
        {
          cache: this._cache,
          logger: this._logger
        }
      );
    }
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
   * 获取默认数据库下的 Model 访问器。
   *
   * @template TDocument
   * @param {string} name - 已注册的模型名。
   * @returns {ModelInstance<TDocument>}
   * @throws {Error} 当 runtime 尚未连接或模型未注册时抛出错误。
   * @since v1.3.0
   */
  model(name) {
    this.ensureConnected();
    return this.createModelInstance(name, {
      database: this.resolveDatabaseName()
    });
  }
  /**
   * 手动开启一个事务会话。
   *
   * @param {TransactionOptions} [options={}] - 事务选项。
   * @returns {Promise<Transaction>}
   * @throws {Error} 当 runtime 尚未连接时抛出 `NOT_CONNECTED`。
   * @since v1.3.0
   */
  async startSession(options = {}) {
    this.ensureConnected();
    return this.getTransactionManager().startSession(options);
  }
  /**
   * 在一个自动管理生命周期的事务中执行回调。
   *
   * @template T
   * @param {(transaction: Transaction) => Promise<T>} callback - 事务体。
   * @param {TransactionOptions} [options={}] - 事务配置。
   * @returns {Promise<T>} 返回回调结果。
   * @throws {Error} 当 runtime 尚未连接，或事务执行失败时抛出错误。
   * @since v1.3.0
   */
  async withTransaction(callback, options = {}) {
    this.ensureConnected();
    return this.getTransactionManager().withTransaction(callback, options);
  }
  /**
   * 在业务锁保护下执行异步回调，并自动管理加锁与释放。
   *
   * @template T
   * @param {string} key - 业务锁键。
   * @param {() => Promise<T>} callback - 受保护的异步逻辑。
   * @param {LockOptions} [options={}] - 锁配置。
   * @returns {Promise<T>} 返回回调结果。
   * @throws {Error} 当 runtime 尚未连接或加锁失败时抛出错误。
   * @since v1.4.0
   */
  async withLock(key, callback, options = {}) {
    this.ensureConnected();
    return this.getLockManager().withLock(key, callback, options);
  }
  /**
   * 获取业务锁（阻塞重试）。
   * @since v1.4.0
   */
  async acquireLock(key, options = {}) {
    this.ensureConnected();
    return this.getLockManager().acquireLock(key, options);
  }
  /**
   * 尝试获取业务锁（不阻塞）。
   * @since v1.4.0
   */
  async tryAcquireLock(key, options = {}) {
    this.ensureConnected();
    return this.getLockManager().tryAcquireLock(key, options);
  }
  /**
   * 获取 Change Stream 同步管理器。
   * @since v1.0.9
   */
  getSyncManager() {
    return this._syncManager;
  }
  /**
   * 获取慢查询日志管理器。
   * @since v1.3.1
   */
  getSlowQueryLogManager() {
    return this._slowQueryLogManager;
  }
  /**
   * 获取 Saga 协调器。
   * @since v1.1.0
   */
  getSagaOrchestrator() {
    return this.initializeSagaOrchestrator();
  }
  /**
   * 获取 Saga façade。
   * @since v1.1.0
   */
  saga() {
    return this.getSagaOrchestrator();
  }
  /**
   * 记录慢查询日志。
   * @since v1.3.1
   */
  async recordSlowQuery(log) {
    this.ensureConnected();
    const manager = this.ensureSlowQueryLogManager();
    await manager.save(log);
    this.emit("slow-query", log);
    this.emit("query", log);
  }
  /**
   * 查询慢查询日志。
   * @since v1.3.1
   */
  async getSlowQueryLogs(filter = {}, options = {}) {
    this.ensureConnected();
    const manager = this.ensureSlowQueryLogManager();
    return manager.query(filter, options);
  }
  /**
   * 注册 Saga 定义。
   * @since v1.1.0
   */
  defineSaga(definition) {
    this.initializeSagaOrchestrator().define(definition);
  }
  /**
   * 执行已注册的 Saga。
   * @since v1.1.0
   */
  async executeSaga(name, data) {
    return this.initializeSagaOrchestrator().execute(name, data);
  }
  /**
   * 列出已注册的 Saga。
   * @since v1.1.0
   */
  listSagas() {
    return this.initializeSagaOrchestrator().listSagas();
  }
  /**
   * 获取 Saga 统计。
   * @since v1.1.0
   */
  getSagaStats() {
    return this.initializeSagaOrchestrator().getStats();
  }
  /**
   * 手动启动同步。
   * @since v1.0.9
   */
  async startSync() {
    this.ensureConnected();
    const manager = await this.initializeSyncManager();
    if (!manager) {
      throw createError(ErrorCodes.INVALID_CONFIG, "MonSQLize sync is not enabled for this runtime.");
    }
    await manager.start();
  }
  /**
   * 手动停止同步。
   * @since v1.0.9
   */
  async stopSync() {
    await this._syncManager?.stop();
  }
  /**
   * 获取同步统计。
   * @since v1.0.9
   */
  getSyncStats() {
    return this._syncManager?.getStats() ?? null;
  }
  /**
   * 事件订阅。
   * @since v1.3.0
   */
  on(event, handler) {
    this._events.on(event, handler);
  }
  /**
   * 一次性事件订阅。
   * @since v1.3.0
   */
  once(event, handler) {
    this._events.once(event, handler);
  }
  /**
   * 取消事件订阅。
   * @since v1.3.0
   */
  off(event, handler) {
    this._events.off(event, handler);
  }
  /**
   * 触发事件。
   * @since v1.3.0
   */
  emit(event, payload) {
    if (event === "error" && this._events.listenerCount("error") === 0) {
      this._logger.error("[MonSQLizeRuntime] error event", payload);
      return;
    }
    this._events.emit(event, payload);
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
  getTransactionManager() {
    if (!this._client) {
      throw createError(ErrorCodes.NOT_CONNECTED, "MonSQLize is not connected yet.");
    }
    if (!this._transactionManager) {
      this._transactionManager = new TransactionManager({
        client: this._client,
        cache: this._cache,
        logger: this.options.logger ?? null,
        lockManager: this._cacheLockManager
      });
    }
    return this._transactionManager;
  }
  getLockManager() {
    if (!this._lockManager) {
      this._lockManager = new LockManager({
        logger: this.options.logger ?? null
      });
    }
    return this._lockManager;
  }
  async ensurePoolManager() {
    if (!this.options.pools?.length) {
      return null;
    }
    if (this._poolManager) {
      return this._poolManager;
    }
    this._poolManager = new ConnectionPoolManager({
      pools: this.options.pools,
      poolStrategy: this.options.poolStrategy,
      poolFallback: this.options.poolFallback,
      maxPoolsCount: this.options.maxPoolsCount,
      logger: this.options.logger ?? null
    });
    for (const pool of this.options.pools) {
      await this._poolManager.addPool(pool);
    }
    this._poolManager.startHealthCheck();
    return this._poolManager;
  }
  async initializeSyncManager() {
    if (!this.options.sync?.enabled || !this._defaultDb) {
      return null;
    }
    if (this._syncManager) {
      return this._syncManager;
    }
    this._syncManager = new ChangeStreamSyncManager({
      db: this._defaultDb.raw(),
      poolManager: this._poolManager,
      config: this.options.sync,
      logger: this.options.logger ?? null
    });
    try {
      await this._syncManager.start();
    } catch (error) {
      this._logger.warn("[Sync] failed to start automatically", error);
      this.emit("error", {
        type: this.options.type,
        db: this.resolveDatabaseName(),
        error: error instanceof Error ? error.message : String(error)
      });
    }
    return this._syncManager;
  }
  initializeSlowQueryLogManager() {
    if (!this.options.slowQueryLog || !this._client) {
      return null;
    }
    if (this._slowQueryLogManager) {
      return this._slowQueryLogManager;
    }
    this._slowQueryLogManager = new SlowQueryLogManager(
      this.options.slowQueryLog,
      this._client,
      "mongodb",
      this.options.logger ?? null
    );
    return this._slowQueryLogManager;
  }
  ensureSlowQueryLogManager() {
    const manager = this.initializeSlowQueryLogManager();
    if (!manager) {
      throw createError(ErrorCodes.INVALID_CONFIG, "MonSQLize slow query log is not enabled for this runtime.");
    }
    return manager;
  }
  initializeSagaOrchestrator() {
    if (!this._sagaOrchestrator) {
      this._sagaOrchestrator = new SagaOrchestrator({
        logger: this.options.logger ?? null
      });
    }
    return this._sagaOrchestrator;
  }
  requirePoolManager() {
    if (!this._poolManager) {
      throw createError(ErrorCodes.INVALID_CONFIG, "MonSQLize pool() requires options.pools configuration.");
    }
    return this._poolManager;
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

// src/entry/index.ts
var MonSQLize = MonSQLizeRuntime;
MonSQLize.Logger = Logger;
MonSQLize.MemoryCache = MemoryCache;
MonSQLize.Transaction = Transaction;
MonSQLize.createRedisCacheAdapter = createRedisCacheAdapter;
MonSQLize.TransactionManager = TransactionManager;
MonSQLize.CacheLockManager = CacheLockManager;
MonSQLize.Lock = Lock;
MonSQLize.LockManager = LockManager;
MonSQLize.LockAcquireError = LockAcquireError;
MonSQLize.LockTimeoutError = LockTimeoutError;
MonSQLize.DistributedCacheInvalidator = DistributedCacheInvalidator;
MonSQLize.ConnectionPoolManager = ConnectionPoolManager;
MonSQLize.Model = Model;
MonSQLize.expr = expr;
MonSQLize.createExpression = createExpression;
MonSQLize.withCache = withCache;
MonSQLize.FunctionCache = FunctionCache;
MonSQLize.ChangeStreamSyncManager = ChangeStreamSyncManager;
MonSQLize.ResumeTokenStore = ResumeTokenStore;
MonSQLize.validateSyncConfig = validateSyncConfig;
MonSQLize.SlowQueryLogManager = SlowQueryLogManager;
MonSQLize.SlowQueryLogConfigManager = SlowQueryLogConfigManager;
MonSQLize.BatchQueue = BatchQueue;
MonSQLize.generateQueryHash = generateQueryHash;
MonSQLize.SagaOrchestrator = SagaOrchestrator;
module.exports = MonSQLize;
