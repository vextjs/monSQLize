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
  INVALID_OPERATION: "INVALID_OPERATION",
  CACHE_UNAVAILABLE: "CACHE_UNAVAILABLE",
  MANAGEMENT_OPERATION_FAILED: "MANAGEMENT_OPERATION_FAILED",
  NOT_CONNECTED: "NOT_CONNECTED",
  CONNECTION_FAILED: "CONNECTION_FAILED",
  CONNECTION_CLOSED: "CONNECTION_CLOSED",
  INVALID_CONFIG: "INVALID_CONFIG",
  OPERATION_TIMEOUT: "OPERATION_TIMEOUT",
  UNSUPPORTED_DATABASE: "UNSUPPORTED_DATABASE",
  /** v1 compat: insertOne requires a non-null, non-array object document */
  DOCUMENT_REQUIRED: "DOCUMENT_REQUIRED",
  /** v1 compat: MongoDB duplicate key (error code 11000) */
  DUPLICATE_KEY: "DUPLICATE_KEY",
  /** v1 compat: general write failure (maps from MongoError in insert/update/delete) */
  WRITE_ERROR: "WRITE_ERROR",
  /** v1 compat: model-layer schema validation failure */
  VALIDATION_ERROR: "VALIDATION_ERROR",
  /** v1 compat: stream mode cannot use page jump (page > 1 with stream: true) */
  STREAM_NO_JUMP: "STREAM_NO_JUMP",
  /** v1 compat: stream mode cannot compute totals */
  STREAM_NO_TOTALS: "STREAM_NO_TOTALS",
  /** v1 compat: stream mode cannot use explain */
  STREAM_NO_EXPLAIN: "STREAM_NO_EXPLAIN",
  /** v1 compat: page jump exceeds the maxHops limit */
  JUMP_TOO_FAR: "JUMP_TOO_FAR",
  /** v1 compat: generic MongoDB driver error (maps numeric MongoDB error codes) */
  MONGODB_ERROR: "MONGODB_ERROR",
  /** v1 compat: cursor sort options mismatch between pages */
  CURSOR_SORT_MISMATCH: "CURSOR_SORT_MISMATCH",
  /** v1 compat: invalid or expired cursor token */
  INVALID_CURSOR: "INVALID_CURSOR",
  /** v1 compat: connection timeout */
  CONNECTION_TIMEOUT: "CONNECTION_TIMEOUT",
  /** v1 compat: generic database error */
  DATABASE_ERROR: "DATABASE_ERROR",
  /** v1 compat: query execution timeout */
  QUERY_TIMEOUT: "QUERY_TIMEOUT",
  /** v1 compat: cache backend error */
  CACHE_ERROR: "CACHE_ERROR",
  /** v1 compat: cache operation timeout */
  CACHE_TIMEOUT: "CACHE_TIMEOUT",
  /** v1 compat: model.define() called without schema */
  MISSING_SCHEMA: "MISSING_SCHEMA",
  /** v1 compat: model already registered under same name */
  MODEL_ALREADY_EXISTS: "MODEL_ALREADY_EXISTS",
  /** v1 compat: write requires at least one document */
  DOCUMENTS_REQUIRED: "DOCUMENTS_REQUIRED",
  /** v1 compat: concurrent write conflict in transaction */
  WRITE_CONFLICT: "WRITE_CONFLICT",
  /** v1 compat: business lock acquire failed */
  LOCK_ACQUIRE_FAILED: "LOCK_ACQUIRE_FAILED",
  /** v1 compat: business lock wait timeout */
  LOCK_TIMEOUT: "LOCK_TIMEOUT",
  /** v1 compat: model.model() called when not connected */
  MODEL_NOT_DEFINED: "MODEL_NOT_DEFINED",
  /** v1 compat: pool() called without pools configured */
  NO_POOL_MANAGER: "NO_POOL_MANAGER",
  /** v1 compat: pool() called with a pool name that does not exist */
  POOL_NOT_FOUND: "POOL_NOT_FOUND",
  /** v1 compat: model definition is not a valid object */
  INVALID_MODEL_DEFINITION: "INVALID_MODEL_DEFINITION",
  /** v1 compat: schema property is not a function or object */
  INVALID_SCHEMA_TYPE: "INVALID_SCHEMA_TYPE"
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

// src/utils/normalize.ts
function normalizeProjection(p) {
  if (!p) return void 0;
  if (Array.isArray(p)) {
    const obj = {};
    for (const k of p) {
      if (typeof k === "string") obj[k] = 1;
    }
    return Object.keys(obj).length ? obj : void 0;
  }
  return p && typeof p === "object" ? p : void 0;
}

// src/adapters/mongodb/management/index.ts
import { createHash } from "node:crypto";
var MongoAdminAccessor = class {
  constructor(dbRef, logger) {
    this.dbRef = dbRef;
    this.logger = logger;
  }
  /**
   * Checks whether the database connection is available.
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
   * Returns MongoDB version and build information.
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
   * Returns a server status snapshot.
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
   * Returns statistics for the current database.
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
  try {
    return await collectionRef.listIndexes().toArray();
  } catch (err) {
    const mongoErr = err;
    if (mongoErr?.code === 26) {
      return [];
    }
    throw err;
  }
}
async function dropIndexDefinition(collectionRef, name) {
  if (!name?.trim()) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "dropIndex: name must be a non-empty string.");
  }
  if (name === "_id_") {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "dropIndex: \u4E0D\u5141\u8BB8\u5220\u9664 _id \u7D22\u5F15");
  }
  try {
    return await collectionRef.dropIndex(name);
  } catch (err) {
    const mongoErr = err;
    if (mongoErr?.code === 27 || mongoErr?.codeName === "IndexNotFound") {
      throw createError(ErrorCodes.MONGODB_ERROR, `\u7D22\u5F15\u4E0D\u5B58\u5728: ${name}`);
    }
    throw err;
  }
}
async function dropIndexDefinitions(collectionRef) {
  try {
    const result = await collectionRef.dropIndexes();
    return result || { ok: 1, nIndexesWas: 0 };
  } catch (err) {
    const mongoErr = err;
    if (mongoErr?.code === 26) {
      return { ok: 1, msg: "collection does not exist, no indexes to drop", nIndexesWas: 0 };
    }
    throw err;
  }
}
async function prewarmBookmarks(params) {
  const cache = ensureBookmarkCache(params.cache);
  const pages = params.pages ?? [];
  if (!Array.isArray(pages) || pages.length === 0) {
    throw createError("INVALID_PAGES", "INVALID_PAGES: pages must be a non-empty array");
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
      const payload = await params.findPage({ ...keyDims, page, totals: false, jump: { step: 1, maxHops: 1e3 } });
      const items = payload.items ?? payload.data ?? [];
      if (items.length > 0) {
        const key = buildBookmarkKey(params.namespace, keyDims, page);
        await Promise.resolve(cache.set(key, {
          page,
          pageInfo: payload.pageInfo,
          size: items.length,
          warmedAt: (/* @__PURE__ */ new Date()).toISOString()
        }));
        result.warmed += 1;
      } else {
        result.failed += 1;
      }
    } catch (cause) {
      result.failed += 1;
      params.logger?.warn("Bookmark prewarm failed", cause);
    }
  }
  result.keys = await resolveKeys(cache, buildBookmarkPattern(params.namespace));
  return result;
}
async function listBookmarks(params) {
  const cache = ensureBookmarkCache(params.cache);
  const normalizedKeyDims = params.keyDims === void 0 ? void 0 : normalizeBookmarkKeyDims(params.keyDims);
  const keys = await resolveKeys(cache, buildBookmarkPattern(params.namespace, normalizedKeyDims));
  const pages = keys.map(extractBookmarkPage).filter((page) => page !== null).sort((a, b) => a - b);
  return {
    count: pages.length,
    pages,
    keys
  };
}
async function clearBookmarks(params) {
  const cache = ensureBookmarkCache(params.cache);
  const normalizedKeyDims = params.keyDims === void 0 ? void 0 : normalizeBookmarkKeyDims(params.keyDims);
  const pattern = buildBookmarkPattern(params.namespace, normalizedKeyDims);
  const keysBefore = await resolveKeys(cache, pattern);
  const cleared = await resolveDeletePattern(cache, pattern);
  return {
    cleared,
    pattern,
    keysBefore: keysBefore.length
  };
}
var VALID_INDEX_VALUES = /* @__PURE__ */ new Set([1, -1, "1", "-1", "text", "2d", "2dsphere", "geoHaystack", "hashed", "columnstore"]);
function validateIndexKeys(keys, operation) {
  if (!keys || typeof keys !== "object" || Array.isArray(keys) || Object.keys(keys).length === 0) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, `${operation}: \u7D22\u5F15\u952E\u4E0D\u80FD\u4E3A\u7A7A`);
  }
  for (const [field, value] of Object.entries(keys)) {
    if (!VALID_INDEX_VALUES.has(value)) {
      throw createError(
        ErrorCodes.INVALID_ARGUMENT,
        `${operation}: invalid value "${value}" for index key "${field}", must be 1, -1, "text", "2d", "2dsphere", "hashed", or "columnstore"`
      );
    }
  }
}
function ensureBookmarkCache(cache) {
  if (!cache || typeof cache.set !== "function" || typeof cache.get !== "function" || typeof cache.keys !== "function" || typeof cache.delPattern !== "function") {
    throw createError(ErrorCodes.CACHE_UNAVAILABLE, "CACHE_UNAVAILABLE: Cache is required for bookmark operations");
  }
  return cache;
}
function normalizeBookmarkKeyDims(keyDims) {
  const normalized = {
    ...keyDims ?? {}
  };
  const sort = normalized.sort && typeof normalized.sort === "object" && !Array.isArray(normalized.sort) ? { ...normalized.sort } : { _id: 1 };
  if (!("_id" in sort)) {
    sort._id = 1;
  }
  normalized.sort = Object.fromEntries(Object.entries(sort).sort(([left], [right]) => left.localeCompare(right)));
  return normalized;
}
function buildBookmarkKey(namespace, keyDims, page) {
  return `${buildBookmarkBaseKey(namespace, keyDims)}:${page}`;
}
function buildBookmarkPattern(namespace, keyDims) {
  return keyDims ? `${buildBookmarkBaseKey(namespace, keyDims)}:*` : `${namespace}:bm:*`;
}
function buildBookmarkBaseKey(namespace, keyDims) {
  return `${namespace}:bm:${hash(stableStringify({
    sort: keyDims.sort,
    limit: keyDims.limit,
    query: keyDims.query,
    pipeline: keyDims.pipeline
  }))}`;
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
  const match = key.match(/:(\d+)$/);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1], 10);
}
function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}
function extractErrorMessage(cause) {
  if (cause instanceof Error) {
    return cause.message;
  }
  return String(cause);
}

// src/adapters/mongodb/queries/index.ts
import { createHmac } from "node:crypto";
import { ObjectId } from "mongodb";

// src/core/expression/index.ts
var FUNC_REGEX = /^(CONCAT|UPPER|LOWER|TRIM|SUBSTR|LENGTH|ABS|CEIL|FLOOR|ROUND|SQRT|POW|SIZE|IN|SLICE|FIRST|LAST|ARRAY_ELEM_AT|FILTER|MAP|INDEX_OF|CONCAT_ARRAYS|TYPE|NOT|EXISTS|IS_NUMBER|IS_ARRAY|SUM|AVG|MAX|MIN|COUNT|PUSH|ADD_TO_SET|YEAR|MONTH|DAY_OF_MONTH|HOUR|MINUTE|SECOND|SPLIT|REPLACE|INDEX_OF_STR|LTRIM|RTRIM|SUBSTR_CP|REGEX|MERGE_OBJECTS|TO_INT|TO_STRING|OBJECT_TO_ARRAY|ARRAY_TO_OBJECT|SET_UNION|SWITCH|DATE_ADD|DATE_SUBTRACT|DATE_DIFF|DATE_TO_STRING|DATE_FROM_STRING|TO_BOOL|TO_DATE|TO_DOUBLE|CONVERT|TO_DECIMAL|TO_LONG|TO_OBJECT_ID|REDUCE|ZIP|REVERSE_ARRAY|RANGE|DATE_FROM_PARTS|DATE_TO_PARTS|ISO_WEEK|ISO_WEEK_YEAR|ISO_DAY_OF_WEEK|DAY_OF_WEEK|DAY_OF_YEAR|WEEK|STR_LEN_BYTES|STR_LEN_CP|SUBSTR_BYTES|LOG|LOG10|ALL_ELEMENTS_TRUE|ANY_ELEMENT_TRUE|COND|IF_NULL|SET_FIELD|UNSET_FIELD|GET_FIELD|SET_DIFFERENCE|SET_EQUALS|SET_INTERSECTION|SET_IS_SUBSET|LET|LITERAL|RAND|SAMPLE_RATE)\s*\((.+)?\)$/i;
var IS_FUNC_CALL_RE = /^(CONCAT|UPPER|LOWER|TRIM|SUBSTR|LENGTH|ABS|CEIL|FLOOR|ROUND|SQRT|POW|SIZE|IN|SLICE|FIRST|LAST|ARRAY_ELEM_AT|FILTER|MAP|INDEX_OF|CONCAT_ARRAYS|TYPE|NOT|EXISTS|IS_NUMBER|IS_ARRAY|SUM|AVG|MAX|MIN|COUNT|PUSH|ADD_TO_SET|YEAR|MONTH|DAY_OF_MONTH|HOUR|MINUTE|SECOND|SPLIT|REPLACE|INDEX_OF_STR|LTRIM|RTRIM|SUBSTR_CP|REGEX|MERGE_OBJECTS|TO_INT|TO_STRING|OBJECT_TO_ARRAY|ARRAY_TO_OBJECT|SET_UNION|SWITCH)\s*\(/i;
function createExpression(expression) {
  if (typeof expression !== "string") {
    throw new TypeError("Expression must be a string");
  }
  const normalized = expression.trim();
  if (!normalized) {
    throw createError(ErrorCodes.INVALID_EXPRESSION, "Expression cannot be empty");
  }
  return { __expr__: normalized, __compiled__: false };
}
var expr = createExpression;
function isExpressionObject(value) {
  return Boolean(
    value && typeof value === "object" && "__expr__" in value && typeof value.__expr__ === "string" && "__compiled__" in value && typeof value.__compiled__ === "boolean"
  );
}
function hasExpressionInObject(value) {
  if (isExpressionObject(value)) return true;
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => hasExpressionInObject(item));
  return Object.values(value).some((item) => hasExpressionInObject(item));
}
function hasExpressionInPipeline(pipeline) {
  return Array.isArray(pipeline) && pipeline.some((stage) => hasExpressionInObject(stage));
}
function compilePipelineExpressions(pipeline) {
  return transformExpressions(pipeline, "project");
}
function transformExpressions(value, context) {
  if (isExpressionObject(value)) {
    const compiled = compileInnerExpression(value.__expr__);
    return context === "match" ? { $expr: compiled } : compiled;
  }
  if (Array.isArray(value)) {
    return value.map((item) => transformStageEntry(item));
  }
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value);
  const result = {};
  for (const [k, v] of entries) {
    result[k] = transformExpressions(v, context);
  }
  return result;
}
function transformStageEntry(stage) {
  if (!stage || typeof stage !== "object" || Array.isArray(stage)) {
    return transformExpressions(stage, "project");
  }
  const entries = Object.entries(stage);
  const result = {};
  for (const [k, v] of entries) {
    const ctx = getStageContext(k);
    result[k] = transformStageValue(v, ctx);
  }
  return result;
}
function getStageContext(key) {
  if (key === "$project" || key === "$addFields" || key === "$set") return "project";
  if (key === "$group") return "group";
  return "match";
}
function transformStageValue(value, context) {
  if (isExpressionObject(value)) {
    const compiled = compileInnerExpression(value.__expr__);
    return context === "match" ? { $expr: compiled } : compiled;
  }
  if (Array.isArray(value)) {
    return value.map((item) => transformStageValue(item, context));
  }
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value);
  const result = {};
  for (const [k, v] of entries) {
    result[k] = transformStageValue(v, context);
  }
  return result;
}
function compileInnerExpression(expression) {
  const expr2 = expression.trim();
  const funcMatch = expr2.match(FUNC_REGEX);
  if (funcMatch) {
    return dispatchFunction(funcMatch[1].toUpperCase(), funcMatch[2] ?? "");
  }
  const andParts = splitTopLevel(expr2, "&&");
  if (andParts.length > 1) {
    return { $and: andParts.map((p) => compileInnerExpression(p.trim())) };
  }
  const orParts = splitTopLevel(expr2, "||");
  if (orParts.length > 1) {
    return { $or: orParts.map((p) => compileInnerExpression(p.trim())) };
  }
  const ternary = /^([^?]+)\s*\?\s*([^:]+)\s*:\s*(.+)$/.exec(expr2);
  if (ternary) {
    const [, cond, thenPart, elsePart] = ternary;
    return {
      $cond: {
        if: compileInnerExpression(cond.trim()),
        then: parseThenElse(thenPart.trim()),
        else: parseThenElse(elsePart.trim())
      }
    };
  }
  const nullCoalParts = splitTopLevel(expr2, "??");
  if (nullCoalParts.length > 1) {
    return { $ifNull: [parseValue(nullCoalParts[0].trim()), parseValue(nullCoalParts[1].trim())] };
  }
  const addSubMatch = /^(.+?)\s*([+\-])\s*(.+)$/.exec(expr2);
  if (addSubMatch) {
    const [, left, op, right] = addSubMatch;
    const opMap = { "+": "$add", "-": "$subtract" };
    return { [opMap[op]]: [parseOperand(left.trim()), parseOperand(right.trim())] };
  }
  const mulDivMatch = /^(.+?)\s*([*\/%])\s*(.+)$/.exec(expr2);
  if (mulDivMatch) {
    const [, left, op, right] = mulDivMatch;
    const opMap = { "*": "$multiply", "/": "$divide", "%": "$mod" };
    return { [opMap[op]]: [parseOperand(left.trim()), parseOperand(right.trim())] };
  }
  const cmpMatch = /^(.+?)\s*(===|!==|>=|<=|>|<)\s*(.+)$/.exec(expr2);
  if (cmpMatch) {
    const [, left, op, right] = cmpMatch;
    const opMap = {
      "===": "$eq",
      "!==": "$ne",
      ">=": "$gte",
      "<=": "$lte",
      ">": "$gt",
      "<": "$lt"
    };
    const leftValue = IS_FUNC_CALL_RE.test(left.trim()) ? compileInnerExpression(left.trim()) : `$${left.trim()}`;
    return { [opMap[op]]: [leftValue, parseValue(right.trim())] };
  }
  const genericFuncCallRe = /^[A-Za-z_][A-Za-z0-9_]*\s*\(.+\)$/;
  if (genericFuncCallRe.test(expr2)) {
    const funcName = expr2.slice(0, expr2.indexOf("(")).trim();
    throw createError(ErrorCodes.INVALID_EXPRESSION, `Unsupported expression function: ${funcName}`);
  }
  return parseValue(expr2);
}
function parseThenElse(s) {
  return s.includes("?") && s.includes(":") ? compileInnerExpression(s) : parseValue(s);
}
function parseValue(value) {
  const v = value.trim();
  if (v.startsWith("'") && v.endsWith("'") || v.startsWith('"') && v.endsWith('"')) {
    return v.slice(1, -1);
  }
  if (v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (!isNaN(Number(v)) && v !== "") return Number(v);
  if (IS_FUNC_CALL_RE.test(v)) {
    return compileInnerExpression(v);
  }
  return `$${v}`;
}
function parseOperand(value) {
  if (/[+\-*/%]/.test(value)) {
    return compileInnerExpression(value);
  }
  return parseValue(value);
}
function dispatchFunction(name, argsStr) {
  const args = splitArgsStr(argsStr);
  switch (name) {
    // ── String ──────────────────────────────────────────────────────────
    case "CONCAT":
      return { $concat: args.map((a) => parseValue(a)) };
    case "UPPER":
      return { $toUpper: parseValue(args[0]) };
    case "LOWER":
      return { $toLower: parseValue(args[0]) };
    case "TRIM":
      return { $trim: { input: parseValue(args[0]) } };
    case "LENGTH":
      return { $strLenCP: parseValue(args[0]) };
    case "SUBSTR": {
      return { $substr: [parseValue(args[0]), parseInt(args[1], 10), parseInt(args[2], 10)] };
    }
    case "SPLIT":
      return { $split: [parseValue(args[0]), parseValue(args[1])] };
    case "REPLACE":
      return { $replaceOne: { input: parseValue(args[0]), find: parseValue(args[1]), replacement: parseValue(args[2]) } };
    case "INDEX_OF_STR": {
      const base = [parseValue(args[0]), parseValue(args[1])];
      if (args[2]) return { $indexOfCP: [...base, parseValue(args[2])] };
      return { $indexOfCP: base };
    }
    case "LTRIM":
      return { $ltrim: { input: parseValue(args[0]) } };
    case "RTRIM":
      return { $rtrim: { input: parseValue(args[0]) } };
    case "SUBSTR_CP": {
      return { $substrCP: [parseValue(args[0]), parseInt(args[1], 10), parseInt(args[2], 10)] };
    }
    // ── String Extended ─────────────────────────────────────────────────
    case "STR_LEN_BYTES":
      return { $strLenBytes: parseValue(args[0]) };
    case "STR_LEN_CP":
      return { $strLenCP: parseValue(args[0]) };
    case "SUBSTR_BYTES":
      return { $substrBytes: [parseValue(args[0]), parseValue(args[1]), parseValue(args[2])] };
    // ── Math ─────────────────────────────────────────────────────────────
    case "ABS":
      return { $abs: parseValue(args[0]) };
    case "CEIL":
      return { $ceil: parseValue(args[0]) };
    case "FLOOR":
      return { $floor: parseValue(args[0]) };
    case "ROUND": {
      if (args[1]) return { $round: [parseValue(args[0]), parseValue(args[1])] };
      return { $round: [parseValue(args[0])] };
    }
    case "SQRT":
      return { $sqrt: parseValue(args[0]) };
    case "POW":
      return { $pow: [parseValue(args[0]), parseValue(args[1])] };
    // ── Math Extended ────────────────────────────────────────────────────
    case "LOG":
      return { $log: [parseValue(args[0]), parseValue(args[1])] };
    case "LOG10":
      return { $log10: parseValue(args[0]) };
    // ── Array ─────────────────────────────────────────────────────────────
    case "SIZE":
      return { $size: parseValue(args[0]) };
    case "IN":
      return { $in: [parseValue(args[0]), parseValue(args[1])] };
    case "SLICE": {
      if (args.length === 3) return { $slice: [parseValue(args[0]), parseInt(args[1], 10), parseInt(args[2], 10)] };
      return { $slice: [parseValue(args[0]), parseInt(args[1], 10)] };
    }
    case "FIRST":
      return { $first: parseValue(args[0]) };
    case "LAST":
      return { $last: parseValue(args[0]) };
    case "ARRAY_ELEM_AT":
      return { $arrayElemAt: [parseValue(args[0]), parseInt(args[1], 10)] };
    case "INDEX_OF":
      return { $indexOfArray: [parseValue(args[0]), parseValue(args[1])] };
    case "CONCAT_ARRAYS":
      return { $concatArrays: args.map((a) => parseValue(a)) };
    case "FILTER": {
      const filterArray = parseValue(args[0]);
      const varName = args[1].replace(/['"]/g, "").trim();
      const filterCondition = compileFilterCondition(args[2], varName);
      return { $filter: { input: filterArray, as: varName, cond: filterCondition } };
    }
    case "MAP": {
      const mapArray = parseValue(args[0]);
      const varName = args[1].replace(/['"]/g, "").trim();
      const mapExpr = compileMapExpression(args[2], varName);
      return { $map: { input: mapArray, as: varName, in: mapExpr } };
    }
    // ── Array Extended ───────────────────────────────────────────────────
    case "REDUCE": {
      const lambdaMatch = /\((\w+),\s*(\w+)\)\s*=>\s*(.+)/.exec(args[2]);
      if (!lambdaMatch) throw new Error("REDUCE requires a lambda: (acc, item) => expr");
      const [, accVar, itemVar, lambdaExpr] = lambdaMatch;
      const compiledExpr = lambdaExpr.replace(new RegExp(`\\b${accVar}\\b`, "g"), "$$value").replace(new RegExp(`\\b${itemVar}\\b`, "g"), "$$this");
      return { $reduce: { input: parseValue(args[0]), initialValue: parseValue(args[1]), in: compileInnerExpression(compiledExpr) } };
    }
    case "ZIP":
      return { $zip: { inputs: args.map((a) => parseValue(a)) } };
    case "REVERSE_ARRAY":
      return { $reverseArray: parseValue(args[0]) };
    case "RANGE": {
      const rangeArgs = [parseValue(args[0]), parseValue(args[1])];
      if (args[2]) rangeArgs.push(parseValue(args[2]));
      return { $range: rangeArgs };
    }
    // ── Type ──────────────────────────────────────────────────────────────
    case "TYPE":
      return { $type: parseValue(args[0]) };
    case "NOT":
      return { $not: [compileInnerExpression(args[0])] };
    case "EXISTS":
      return { $ne: [parseValue(args[0]), null] };
    case "IS_NUMBER":
      return { $isNumber: parseValue(args[0]) };
    case "IS_ARRAY":
      return { $isArray: parseValue(args[0]) };
    // ── Type Conversion ──────────────────────────────────────────────────
    case "TO_INT":
      return { $toInt: parseValue(args[0]) };
    case "TO_STRING":
      return { $toString: parseValue(args[0]) };
    case "OBJECT_TO_ARRAY":
      return { $objectToArray: parseValue(args[0]) };
    case "ARRAY_TO_OBJECT":
      return { $arrayToObject: parseValue(args[0]) };
    case "TO_BOOL":
      return { $toBool: parseValue(args[0]) };
    case "TO_DATE":
      return { $toDate: parseValue(args[0]) };
    case "TO_DOUBLE":
      return { $toDouble: parseValue(args[0]) };
    case "TO_DECIMAL":
      return { $toDecimal: parseValue(args[0]) };
    case "TO_LONG":
      return { $toLong: parseValue(args[0]) };
    case "TO_OBJECT_ID":
      return { $toObjectId: parseValue(args[0]) };
    case "CONVERT": {
      const convertResult = { $convert: { input: parseValue(args[0]), to: args[1].replace(/['"]/g, "") } };
      if (args[2]) convertResult.$convert.onError = parseValue(args[2]);
      if (args[3]) convertResult.$convert.onNull = parseValue(args[3]);
      return convertResult;
    }
    // ── Aggregation ───────────────────────────────────────────────────────
    case "SUM":
      return { $sum: parseValue(args[0]) };
    case "AVG":
      return { $avg: parseValue(args[0]) };
    case "MAX":
      return { $max: parseValue(args[0]) };
    case "MIN":
      return { $min: parseValue(args[0]) };
    case "COUNT":
      return { $sum: 1 };
    case "PUSH":
      return { $push: parseValue(args[0]) };
    case "ADD_TO_SET":
      return { $addToSet: parseValue(args[0]) };
    // ── Date ──────────────────────────────────────────────────────────────
    case "YEAR":
      return { $year: parseValue(args[0]) };
    case "MONTH":
      return { $month: parseValue(args[0]) };
    case "DAY_OF_MONTH":
      return { $dayOfMonth: parseValue(args[0]) };
    case "HOUR":
      return { $hour: parseValue(args[0]) };
    case "MINUTE":
      return { $minute: parseValue(args[0]) };
    case "SECOND":
      return { $second: parseValue(args[0]) };
    case "DATE_ADD": {
      return { $dateAdd: { startDate: parseValue(args[0]), amount: parseValue(args[1]), unit: args[2].replace(/['"]/g, "") } };
    }
    case "DATE_SUBTRACT": {
      return { $dateSubtract: { startDate: parseValue(args[0]), amount: parseValue(args[1]), unit: args[2].replace(/['"]/g, "") } };
    }
    case "DATE_DIFF": {
      return { $dateDiff: { startDate: parseValue(args[0]), endDate: parseValue(args[1]), unit: args[2].replace(/['"]/g, "") } };
    }
    case "DATE_TO_STRING": {
      const dtsResult = { $dateToString: { format: args[1].replace(/['"]/g, ""), date: parseValue(args[0]) } };
      if (args[2]) dtsResult.$dateToString.timezone = args[2].replace(/['"]/g, "");
      return dtsResult;
    }
    case "DATE_FROM_STRING": {
      return { $dateFromString: { dateString: parseValue(args[0]) } };
    }
    // ── Date Extended ────────────────────────────────────────────────────
    case "DATE_FROM_PARTS": {
      const dfp = {};
      const dfpFields = ["year", "month", "day", "hour", "minute", "second", "millisecond"];
      args.forEach((a, i) => {
        if (dfpFields[i]) dfp[dfpFields[i]] = parseValue(a);
      });
      return { $dateFromParts: dfp };
    }
    case "DATE_TO_PARTS": {
      const dtpResult = { $dateToParts: { date: parseValue(args[0]) } };
      if (args[1]) dtpResult.$dateToParts.timezone = args[1].replace(/['"]/g, "");
      return dtpResult;
    }
    case "ISO_WEEK":
      return { $isoWeek: parseValue(args[0]) };
    case "ISO_WEEK_YEAR":
      return { $isoWeekYear: parseValue(args[0]) };
    case "ISO_DAY_OF_WEEK":
      return { $isoDayOfWeek: parseValue(args[0]) };
    case "DAY_OF_WEEK":
      return { $dayOfWeek: parseValue(args[0]) };
    case "DAY_OF_YEAR":
      return { $dayOfYear: parseValue(args[0]) };
    case "WEEK":
      return { $week: parseValue(args[0]) };
    // ── High Frequency ───────────────────────────────────────────────────
    case "REGEX":
      return { $regexMatch: { input: parseValue(args[0]), regex: args[1].replace(/['"]/g, "") } };
    case "MERGE_OBJECTS": {
      const mergeArgs = args.map((a) => {
        if (a.trim().startsWith("{")) {
          try {
            return JSON.parse(a.trim());
          } catch {
            return parseValue(a);
          }
        }
        return parseValue(a);
      });
      return { $mergeObjects: mergeArgs };
    }
    case "SET_UNION": {
      const suArgs = args.map((a) => {
        if (a.trim().startsWith("[")) {
          try {
            return JSON.parse(a.trim());
          } catch {
            return parseValue(a);
          }
        }
        return parseValue(a);
      });
      return { $setUnion: suArgs };
    }
    // ── Switch ───────────────────────────────────────────────────────────
    case "SWITCH": {
      if (args.length < 2) throw new Error("SWITCH requires at least 2 arguments");
      const branches = [];
      let defaultValue = null;
      for (let i = 0; i < args.length - 1; i += 2) {
        if (i + 1 < args.length) {
          branches.push({ case: compileInnerExpression(args[i]), then: parseValue(args[i + 1]) });
        }
      }
      if (args.length % 2 === 1) defaultValue = parseValue(args[args.length - 1]);
      const switchResult = { $switch: { branches } };
      if (defaultValue !== null) switchResult.$switch.default = defaultValue;
      return switchResult;
    }
    // ── Logical Extended ─────────────────────────────────────────────────
    case "ALL_ELEMENTS_TRUE":
      return { $allElementsTrue: [parseValue(args[0])] };
    case "ANY_ELEMENT_TRUE":
      return { $anyElementTrue: [parseValue(args[0])] };
    // ── Conditional Extended ─────────────────────────────────────────────
    case "COND": {
      if (args.length !== 3) throw new Error("COND requires 3 arguments");
      return { $cond: { if: compileInnerExpression(args[0]), then: parseValue(args[1]), else: parseValue(args[2]) } };
    }
    case "IF_NULL": {
      if (args.length !== 2) throw new Error("IF_NULL requires 2 arguments");
      return { $ifNull: [parseValue(args[0]), parseValue(args[1])] };
    }
    // ── Object Operations ────────────────────────────────────────────────
    case "SET_FIELD":
      return { $setField: { field: parseValue(args[0]), input: parseValue(args[2]), value: parseValue(args[1]) } };
    case "UNSET_FIELD":
      return { $unsetField: { field: parseValue(args[0]), input: parseValue(args[1]) } };
    case "GET_FIELD": {
      if (args.length === 1) return { $getField: parseValue(args[0]) };
      return { $getField: { field: parseValue(args[0]), input: parseValue(args[1]) } };
    }
    // ── Set Operations ───────────────────────────────────────────────────
    case "SET_DIFFERENCE":
      return { $setDifference: [parseValue(args[0]), parseValue(args[1])] };
    case "SET_EQUALS":
      return { $setEquals: args.map((a) => parseValue(a)) };
    case "SET_INTERSECTION":
      return { $setIntersection: args.map((a) => parseValue(a)) };
    case "SET_IS_SUBSET":
      return { $setIsSubset: [parseValue(args[0]), parseValue(args[1])] };
    // ── Advanced Operations ──────────────────────────────────────────────
    case "LET": {
      const varsMatch = /\{(.+)\}/.exec(args[0]);
      if (!varsMatch) throw new Error("LET requires an object literal for variables");
      const varPairs = varsMatch[1].split(",").map((pair) => {
        const [k, ...rest] = pair.split(":");
        return [k.trim(), rest.join(":").trim()];
      });
      const vars = {};
      for (const [k, v] of varPairs) vars[k] = parseValue(v);
      return { $let: { vars, in: compileInnerExpression(args[1]) } };
    }
    case "LITERAL":
      return { $literal: parseValue(args[0]) };
    case "RAND":
      return { $rand: {} };
    case "SAMPLE_RATE":
      return { $sampleRate: parseValue(args[0]) };
    default:
      throw new Error(`Unsupported function: ${name}`);
  }
}
function compileFilterCondition(condition, varName) {
  const replaced = condition.replace(new RegExp(`\\b${varName}\\.`, "g"), `$$${varName}.`);
  return compileInnerExpression(replaced);
}
function compileMapExpression(exprStr, varName) {
  const replaced = exprStr.replace(new RegExp(`\\b${varName}\\.`, "g"), `$$${varName}.`);
  return compileInnerExpression(replaced);
}
function splitArgsStr(argsStr) {
  const args = [];
  let current = "";
  let inString = false;
  let stringChar = "";
  let parenDepth = 0;
  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i];
    if ((ch === '"' || ch === "'") && (i === 0 || argsStr[i - 1] !== "\\")) {
      if (!inString) {
        inString = true;
        stringChar = ch;
      } else if (ch === stringChar) {
        inString = false;
        stringChar = "";
      }
      current += ch;
    } else if (ch === "(" && !inString) {
      parenDepth++;
      current += ch;
    } else if (ch === ")" && !inString) {
      parenDepth--;
      current += ch;
    } else if (ch === "," && !inString && parenDepth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
}
function splitTopLevel(source, separator) {
  const parts = [];
  let current = "";
  let parenDepth = 0;
  let inString = false;
  let stringChar = "";
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if ((ch === '"' || ch === "'") && (i === 0 || source[i - 1] !== "\\")) {
      if (!inString) {
        inString = true;
        stringChar = ch;
      } else if (ch === stringChar) {
        inString = false;
        stringChar = "";
      }
      current += ch;
    } else if (!inString && ch === "(") {
      parenDepth++;
      current += ch;
    } else if (!inString && ch === ")") {
      parenDepth--;
      current += ch;
    } else if (!inString && parenDepth === 0 && source.startsWith(separator, i)) {
      parts.push(current);
      current = "";
      i += separator.length - 1;
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

// src/adapters/mongodb/queries/index.ts
function normalizeSortShape(sort) {
  const normalized = {};
  if (Array.isArray(sort)) {
    for (const [field, direction] of sort) {
      normalized[String(field)] = direction === -1 || direction === "desc" || direction === "descending" ? -1 : 1;
    }
  } else if (sort && typeof sort === "object") {
    for (const [field, direction] of Object.entries(sort)) {
      normalized[field] = direction === -1 || direction === "desc" || direction === "descending" ? -1 : 1;
    }
  }
  if (!normalized._id) {
    normalized._id = 1;
  }
  return normalized;
}
function isHexObjectIdString(value) {
  return /^[0-9a-fA-F]{24}$/.test(value);
}
function parseRequiredObjectId(id) {
  if (!id) {
    throw createError(
      ErrorCodes.INVALID_ARGUMENT,
      "id \u53C2\u6570\u662F\u5FC5\u9700\u7684",
      [{ field: "id", type: "required", message: "id must not be empty" }]
    );
  }
  if (typeof id === "string") {
    if (!isHexObjectIdString(id)) {
      throw createError(
        ErrorCodes.INVALID_ARGUMENT,
        `\u65E0\u6548\u7684 ObjectId \u683C\u5F0F: "${id}"`,
        [{
          field: "id",
          type: "format",
          message: "id must be a 24-character hex string or ObjectId instance",
          received: id
        }]
      );
    }
    return new ObjectId(id);
  }
  if (id instanceof ObjectId) {
    return id;
  }
  if (id && typeof id === "object" && typeof id.toHexString === "function") {
    const hex = id.toHexString();
    if (isHexObjectIdString(hex)) {
      return new ObjectId(hex);
    }
  }
  if (id && typeof id === "object" && typeof id.toString === "function") {
    const value = id.toString();
    if (isHexObjectIdString(value)) {
      return new ObjectId(value);
    }
  }
  throw createError(
    ErrorCodes.INVALID_ARGUMENT,
    "id \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6216 ObjectId \u5B9E\u4F8B",
    [{
      field: "id",
      type: "type",
      message: `expected: string or ObjectId, received: ${typeof id}`,
      received: typeof id
    }]
  );
}
function normalizeIdentifier(value, autoConvert = true) {
  if (autoConvert && typeof value === "string" && value.length === 24 && ObjectId.isValid(value)) {
    return new ObjectId(value);
  }
  return value;
}
function normalizeQueryFilter(filter, autoConvert) {
  const result = {};
  for (const [key, value] of Object.entries(filter)) {
    if (key === "$and" || key === "$or" || key === "$nor") {
      result[key] = Array.isArray(value) ? value.map((item) => item && typeof item === "object" ? normalizeQueryFilter(item, autoConvert) : item) : value;
      continue;
    }
    const shouldConvert = autoConvert === true || typeof autoConvert === "object" && autoConvert[key] !== false;
    if (typeof value === "string" && value.length === 24 && ObjectId.isValid(value)) {
      result[key] = shouldConvert ? new ObjectId(value) : value;
    } else if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof ObjectId)) {
      const nested = value;
      const hasOperators = Object.keys(nested).some((k) => k.startsWith("$"));
      if (hasOperators) {
        const nestedResult = {};
        for (const [op, opVal] of Object.entries(nested)) {
          if (shouldConvert && (op === "$in" || op === "$nin" || op === "$all") && Array.isArray(opVal)) {
            nestedResult[op] = opVal.map(
              (item) => typeof item === "string" && item.length === 24 && ObjectId.isValid(item) ? new ObjectId(item) : item
            );
          } else if (shouldConvert && (op === "$eq" || op === "$ne") && typeof opVal === "string" && opVal.length === 24 && ObjectId.isValid(opVal)) {
            nestedResult[op] = new ObjectId(opVal);
          } else if (op === "$elemMatch" && opVal && typeof opVal === "object" && !Array.isArray(opVal)) {
            nestedResult[op] = normalizeQueryFilter(opVal, autoConvert);
          } else {
            nestedResult[op] = opVal;
          }
        }
        result[key] = nestedResult;
      } else {
        result[key] = normalizeQueryFilter(nested, autoConvert);
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}
function encodeCursor(values, secret) {
  const payload = { v: 1, values };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  if (!secret) {
    return encoded;
  }
  const sig = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}
function decodeCursor(cursor, secret) {
  try {
    let raw = cursor;
    if (secret) {
      const dotIndex = cursor.lastIndexOf(".");
      if (dotIndex === -1) {
        throw createError(ErrorCodes.INVALID_PAGINATION, "Cursor signature missing.");
      }
      const encoded = cursor.slice(0, dotIndex);
      const sig = cursor.slice(dotIndex + 1);
      const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
      if (sig !== expected) {
        throw createError(ErrorCodes.INVALID_PAGINATION, "Cursor signature invalid.");
      }
      raw = encoded;
    }
    const payload = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (payload?.v !== 1 || !Array.isArray(payload.values)) {
      throw new Error("Invalid cursor payload.");
    }
    return payload.values;
  } catch (cause) {
    if (cause.code === ErrorCodes.INVALID_PAGINATION) {
      throw cause;
    }
    throw createError(ErrorCodes.INVALID_PAGINATION, "Invalid pagination cursor.", void 0, cause);
  }
}
function reverseSort(sort) {
  return Object.fromEntries(Object.entries(sort).map(([field, direction]) => [field, direction === 1 ? -1 : 1]));
}
function normalizeCursorValue(value) {
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        return d;
      }
    }
    return normalizeIdentifier(value);
  }
  return value;
}
function buildFindDriverOptions(options = {}) {
  const driverOptions = {
    ...options.projection ? { projection: options.projection } : {},
    ...options.sort ? { sort: options.sort } : {},
    ...options.skip !== void 0 ? { skip: options.skip } : {},
    ...options.limit !== void 0 ? { limit: options.limit } : {},
    ...options.hint ? { hint: options.hint } : {},
    ...options.collation ? { collation: options.collation } : {},
    ...options.maxTimeMS !== void 0 ? { maxTimeMS: options.maxTimeMS } : {},
    ...options.batchSize !== void 0 ? { batchSize: options.batchSize } : {},
    ...options.comment ? { comment: options.comment } : {}
  };
  return driverOptions;
}
function buildAggregateDriverOptions(options = {}) {
  const driverOptions = {
    ...options.hint ? { hint: options.hint } : {},
    ...options.collation ? { collation: options.collation } : {},
    ...options.comment ? { comment: options.comment } : {},
    ...options.maxTimeMS !== void 0 ? { maxTimeMS: options.maxTimeMS } : {},
    ...options.allowDiskUse !== void 0 ? { allowDiskUse: options.allowDiskUse } : {},
    ...options.batchSize !== void 0 ? { batchSize: options.batchSize } : {}
  };
  return driverOptions;
}
function buildCursorFilter(sort, cursorValues, direction) {
  const entries = Object.entries(sort);
  const clauses = [];
  for (let index = 0; index < entries.length; index += 1) {
    const equalityPrefix = entries.slice(0, index).reduce((carry, [field2], prefixIndex) => {
      carry[field2] = normalizeCursorValue(cursorValues[prefixIndex]);
      return carry;
    }, {});
    const [field, sortDirection] = entries[index];
    const operator = direction === "after" ? sortDirection === 1 ? "$gt" : "$lt" : sortDirection === 1 ? "$lt" : "$gt";
    clauses.push({
      ...equalityPrefix,
      [field]: {
        [operator]: normalizeCursorValue(cursorValues[index])
      }
    });
  }
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}
function mergeFilters(base, extra) {
  if (!extra || Object.keys(extra).length === 0) {
    return base;
  }
  if (!base || Object.keys(base).length === 0) {
    return extra;
  }
  return { $and: [base, extra] };
}
var _asyncTotalsCache = /* @__PURE__ */ new Map();
async function computeTotals(coll, query, limit, totals) {
  const mode = totals.mode ?? "sync";
  if (mode === "sync") {
    const countOpts = {};
    if (totals.maxTimeMS !== void 0) {
      countOpts.maxTimeMS = totals.maxTimeMS;
    }
    const total = await coll.countDocuments(
      query,
      countOpts
    );
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
    return { mode: "sync", total, totalPages, ts: Date.now() };
  }
  if (mode === "async") {
    const cacheKey = JSON.stringify({ q: query });
    const token = Buffer.from(cacheKey).toString("base64url");
    if (_asyncTotalsCache.has(cacheKey)) {
      return { mode: "async", total: _asyncTotalsCache.get(cacheKey), token };
    }
    setImmediate(async () => {
      try {
        const n = await coll.countDocuments(
          query
        );
        _asyncTotalsCache.set(cacheKey, n);
      } catch {
      }
    });
    return { mode: "async", total: null, token };
  }
  if (mode === "approx") {
    const countOpts = {};
    if (totals.maxTimeMS !== void 0) {
      countOpts.maxTimeMS = totals.maxTimeMS;
    }
    const total = await coll.estimatedDocumentCount(countOpts);
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
    return { mode: "approx", total, totalPages, ts: Date.now() };
  }
  return { mode: mode ?? "sync" };
}
function buildEffectiveProjection(projection, sort) {
  if (!projection) return void 0;
  let projObj;
  if (Array.isArray(projection)) {
    projObj = {};
    for (const f of projection) {
      projObj[f] = 1;
    }
  } else {
    projObj = { ...projection };
  }
  const sortFields = Object.keys(sort || {});
  const isExclusion = Object.entries(projObj).some(
    ([k, v]) => k !== "_id" && (v === 0 || v === false)
  );
  if (isExclusion) {
    for (const k of sortFields) {
      if (projObj[k] === 0 || projObj[k] === false) {
        delete projObj[k];
      }
    }
  } else {
    for (const k of sortFields) {
      if (!projObj[k]) projObj[k] = 1;
    }
  }
  return projObj;
}
async function executeFindPage(collection, options = {}, defaults = {}) {
  const metaEnabled = options.meta === true || typeof options.meta === "object" && options.meta !== null;
  const metaOptions = options.meta && typeof options.meta === "object" ? options.meta : {};
  const metaLevel = options.meta === true ? "op" : metaOptions.level ?? "op";
  const metaStartTs = Date.now();
  const metaSteps = [];
  const ext = options;
  const page = normalizePositiveInteger(options.page, 1, "page");
  const rawLimit = normalizePositiveInteger(options.limit, 20, "limit");
  const limit = defaults.findPageMaxLimit !== void 0 && rawLimit > defaults.findPageMaxLimit ? defaults.findPageMaxLimit : rawLimit;
  const sort = normalizeSortShape(options.sort);
  const baseQuery = options.query ?? {};
  const cursorSecret = defaults.cursorSecret;
  const dbName = collection.dbName ?? collection.namespace?.db ?? "";
  const collectionName = collection.collectionName ?? "";
  const pushMetaStep = (name, durationMs, phase, index) => {
    if (metaEnabled && metaLevel === "sub") {
      metaSteps.push({ name, phase, durationMs, ...index !== void 0 ? { index } : {} });
    }
  };
  const finishResult = (result2) => {
    if (!metaEnabled) {
      return result2;
    }
    const metaEndTs = Date.now();
    if (metaLevel === "sub" && metaSteps.length > 0) {
      const stepTotal = metaSteps.reduce((sum, step) => sum + step.durationMs, 0);
      const delta = metaEndTs - metaStartTs - stepTotal;
      if (delta > 0) {
        metaSteps.push({ name: "finalizeResult", phase: "fetch", durationMs: delta });
      } else if (delta < 0) {
        const lastStep = metaSteps[metaSteps.length - 1];
        lastStep.durationMs = Math.max(0, lastStep.durationMs + delta);
      }
    }
    result2.meta = {
      op: "findPage",
      ns: {
        iid: defaults.namespace?.instanceId ?? "default",
        type: "mongodb",
        db: dbName,
        coll: collectionName
      },
      db: dbName,
      collection: collectionName,
      timestamp: metaStartTs,
      startTs: metaStartTs,
      endTs: metaEndTs,
      durationMs: metaEndTs - metaStartTs,
      ...typeof effectiveMaxTimeMS === "number" ? { maxTimeMS: effectiveMaxTimeMS } : {},
      page,
      after: Boolean(options.after),
      before: Boolean(options.before),
      hops: options.after || options.before ? 1 : Math.max(0, page - 1),
      ...jumpOpts ? { step: jumpOpts.step } : {},
      ...metaLevel === "sub" ? { steps: metaSteps } : {}
    };
    return result2;
  };
  if ((options.after || options.before) && Number.isInteger(options.page)) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "page cannot be used with after/before cursor.");
  }
  if (options.stream === true) {
    if (options.explain !== void 0 && options.explain !== false) {
      throw createError(ErrorCodes.STREAM_NO_EXPLAIN, "stream and explain cannot be used together.");
    }
    if (page > 1) {
      throw createError(ErrorCodes.STREAM_NO_JUMP, "page jump cannot be used in stream mode.");
    }
    if (options.totals !== void 0) {
      throw createError(ErrorCodes.STREAM_NO_TOTALS, "totals cannot be computed in stream mode.");
    }
  }
  const jumpOpts = ext.jump;
  if (jumpOpts && page > 1 && page - 1 > jumpOpts.maxHops) {
    throw createError(ErrorCodes.JUMP_TOO_FAR, "Page jump exceeds maxHops limit.", [
      { page, maxHops: jumpOpts.maxHops, requestedHops: page - 1 }
    ]);
  }
  const driverOpts = { ...options.options ?? {} };
  const effectiveMaxTimeMS = ext.maxTimeMS ?? defaults.maxTimeMS;
  if (effectiveMaxTimeMS !== void 0) driverOpts.maxTimeMS = effectiveMaxTimeMS;
  if (ext.hint !== void 0) driverOpts.hint = ext.hint;
  if (ext.collation !== void 0) driverOpts.collation = ext.collation;
  if (ext.batchSize !== void 0) driverOpts.batchSize = ext.batchSize;
  if (options.projection !== void 0) {
    driverOpts.projection = buildEffectiveProjection(options.projection, sort);
  }
  const buildPageQuery = (cursor, direction = "after") => {
    const cursorFilter = cursor ? buildCursorFilter(sort, decodeCursor(cursor, cursorSecret), direction) : void 0;
    const effectiveSort = direction === "before" ? reverseSort(sort) : sort;
    return { queryFilter: mergeFilters(baseQuery, cursorFilter), effectiveSort };
  };
  const fetchItems = async (queryFilter, effectiveSort, extra = {}) => {
    const fetchLimit = limit + 1;
    let rows;
    if (options.pipeline && options.pipeline.length > 0) {
      const stages = [
        { $match: queryFilter },
        { $sort: effectiveSort }
      ];
      if (extra.skip) stages.push({ $skip: extra.skip });
      stages.push({ $limit: fetchLimit });
      stages.push(...options.pipeline);
      const aggOpts = {};
      if (driverOpts.maxTimeMS !== void 0) aggOpts.maxTimeMS = driverOpts.maxTimeMS;
      if (driverOpts.hint !== void 0) aggOpts.hint = driverOpts.hint;
      if (driverOpts.collation !== void 0) aggOpts.collation = driverOpts.collation;
      rows = await collection.aggregate(stages, aggOpts).toArray();
    } else {
      rows = await collection.find(queryFilter, {
        ...driverOpts,
        sort: effectiveSort,
        limit: fetchLimit,
        ...extra.skip ? { skip: extra.skip } : {}
      }).toArray();
    }
    const hasMore2 = rows.length > limit;
    return { items: hasMore2 ? rows.slice(0, limit) : rows, hasMore: hasMore2 };
  };
  const timedFetchItems = async (name, phase, queryFilter, effectiveSort, extra = {}, index) => {
    const stepStartTs = Date.now();
    const result2 = await fetchItems(queryFilter, effectiveSort, extra);
    pushMetaStep(name, Date.now() - stepStartTs, phase, index);
    return result2;
  };
  const timedComputeTotals = async () => {
    const stepStartTs = Date.now();
    const result2 = await computeTotals(collection, baseQuery, limit, options.totals);
    pushMetaStep("computeTotals", Date.now() - stepStartTs, "totals");
    return result2;
  };
  const buildPageInfo = (items2, hasMore2, extra = {}) => {
    const first = items2[0] ?? null;
    const last = items2[items2.length - 1] ?? null;
    const enc = (item) => item ? encodeCursor(
      Object.keys(sort).map((f) => item[f]),
      cursorSecret
    ) : null;
    return {
      hasNext: hasMore2,
      hasPrev: extra.hasPrev ?? false,
      startCursor: enc(first),
      endCursor: enc(last),
      ...extra.currentPage !== void 0 ? { currentPage: extra.currentPage } : {}
    };
  };
  if (options.stream === true) {
    const direction = options.before ? "before" : "after";
    const { queryFilter, effectiveSort } = buildPageQuery(options.after ?? options.before, direction);
    return collection.find(queryFilter, {
      ...driverOpts,
      sort: effectiveSort,
      limit: limit + 1
    }).stream();
  }
  if (options.explain !== void 0 && options.explain !== false) {
    const verbosity = typeof options.explain === "string" ? options.explain : "queryPlanner";
    const offsetJumpOpts2 = ext.offsetJump;
    let explainQueryFilter;
    const explainExtra = {};
    if (options.after || options.before) {
      const dir = options.after ? "after" : "before";
      explainQueryFilter = buildPageQuery(options.after ?? options.before, dir).queryFilter;
    } else if (offsetJumpOpts2?.enable && page > 1) {
      explainQueryFilter = baseQuery;
      explainExtra.skip = (page - 1) * limit;
    } else {
      explainQueryFilter = baseQuery;
    }
    return collection.find(explainQueryFilter, {
      ...driverOpts,
      ...explainExtra,
      sort,
      limit
    }).explain(verbosity);
  }
  const offsetJumpOpts = ext.offsetJump;
  if (offsetJumpOpts?.enable) {
    const skipCount = page > 1 ? (page - 1) * limit : 0;
    const { queryFilter, effectiveSort } = buildPageQuery();
    const { items: items2, hasMore: hasMore2 } = await timedFetchItems("offsetFetch", "offset", queryFilter, effectiveSort, { skip: skipCount });
    const result2 = {
      items: items2,
      pageInfo: buildPageInfo(items2, hasMore2, { hasPrev: page > 1, currentPage: page })
    };
    if (options.totals && options.totals.mode !== "none") {
      result2.totals = await timedComputeTotals();
    }
    return finishResult(result2);
  }
  if (options.after || options.before) {
    const direction = options.after ? "after" : "before";
    const { queryFilter, effectiveSort } = buildPageQuery(options.after ?? options.before, direction);
    const { items: rawItems, hasMore: hasMore2 } = await timedFetchItems("cursorFetch", "fetch", queryFilter, effectiveSort);
    const items2 = direction === "before" ? [...rawItems].reverse() : rawItems;
    const first = items2[0] ?? null;
    const last = items2[items2.length - 1] ?? null;
    const enc = (item) => item ? encodeCursor(Object.keys(sort).map((f) => item[f]), cursorSecret) : null;
    return finishResult({
      items: items2,
      pageInfo: {
        hasNext: direction === "before" ? Boolean(options.before) : hasMore2,
        hasPrev: direction === "before" ? hasMore2 : Boolean(options.after),
        startCursor: enc(first),
        endCursor: enc(last)
      }
    });
  }
  const { queryFilter: q0, effectiveSort: es0 } = buildPageQuery();
  let { items, hasMore } = await timedFetchItems("initialFetch", page > 1 ? "hop" : "fetch", q0, es0, {}, 1);
  if (page === 1) {
    const result2 = {
      items,
      pageInfo: buildPageInfo(items, hasMore, { currentPage: 1 })
    };
    if (options.totals && options.totals.mode !== "none") {
      result2.totals = await timedComputeTotals();
    }
    return finishResult(result2);
  }
  for (let cp = 2; cp <= page; cp++) {
    const lastItem = items[items.length - 1];
    if (!lastItem) {
      return finishResult({
        items,
        pageInfo: buildPageInfo(items, false, { hasPrev: cp > 2, currentPage: cp - 1 })
      });
    }
    const endCursor = encodeCursor(
      Object.keys(sort).map((f) => lastItem[f]),
      cursorSecret
    );
    const { queryFilter: qN, effectiveSort: esN } = buildPageQuery(endCursor, "after");
    const next = await timedFetchItems(`hop-${cp}`, "hop", qN, esN, {}, cp);
    items = next.items;
    hasMore = next.hasMore;
  }
  const result = {
    items,
    pageInfo: buildPageInfo(items, hasMore, { hasPrev: page > 1, currentPage: page })
  };
  if (options.totals && options.totals.mode !== "none") {
    result.totals = await timedComputeTotals();
  }
  return finishResult(result);
}
var _a;
_a = Symbol.toStringTag;
var FindChain = class {
  constructor(collection, query = {}, initialOptions = {}, defaults = {}, queryCache) {
    this.collection = collection;
    this.defaults = defaults;
    this.queryCache = queryCache;
    this[_a] = "Promise";
    this.executed = false;
    this.options = { ...initialOptions };
    this.normalizedQuery = defaults.autoConvertObjectId ? normalizeQueryFilter(
      query ?? {},
      defaults.autoConvertObjectId
    ) : query;
  }
  buildExecuteOptions() {
    return {
      ...this.defaults.maxTimeMS !== void 0 ? { maxTimeMS: this.defaults.maxTimeMS } : {},
      ...this.defaults.findLimit !== void 0 ? { limit: this.defaults.findLimit } : {},
      ...this.options
    };
  }
  limit(value) {
    if (typeof value !== "number" || value < 0) {
      throw new Error(`limit() requires a non-negative number, got: ${typeof value} (${value})`);
    }
    this.options.limit = value;
    return this;
  }
  skip(value) {
    if (typeof value !== "number" || value < 0) {
      throw new Error(`skip() requires a non-negative number, got: ${typeof value} (${value})`);
    }
    this.options.skip = value;
    return this;
  }
  sort(value) {
    if (!value || typeof value !== "object") {
      throw new Error(`sort() requires an object or array, got: ${typeof value}`);
    }
    this.options.sort = value;
    return this;
  }
  project(value) {
    this.options.projection = value;
    return this;
  }
  hint(value) {
    this.options.hint = value;
    return this;
  }
  collation(value) {
    this.options.collation = value;
    return this;
  }
  comment(value) {
    this.options.comment = value;
    return this;
  }
  maxTimeMS(value) {
    this.options.maxTimeMS = value;
    return this;
  }
  batchSize(value) {
    this.options.batchSize = value;
    return this;
  }
  buildCacheKey() {
    const { cache: _c, explain: _e, stream: _s, ...keyOpts } = this.options;
    return `find:${this.collection.namespace}:${JSON.stringify(this.normalizedQuery)}:${JSON.stringify(keyOpts)}`;
  }
  explain(verbosity = "queryPlanner") {
    return this.collection.find(this.normalizedQuery, buildFindDriverOptions(this.buildExecuteOptions())).explain(verbosity === true ? "queryPlanner" : verbosity);
  }
  stream() {
    return this.collection.find(this.normalizedQuery, buildFindDriverOptions(this.buildExecuteOptions())).stream();
  }
  toArray() {
    if (this.executed) {
      throw new Error("Query already executed.");
    }
    this.executed = true;
    return this.collection.find(this.normalizedQuery, buildFindDriverOptions(this.buildExecuteOptions())).toArray();
  }
  then(onfulfilled, onrejected) {
    if (this.options.explain !== void 0 && this.options.explain !== false) {
      const verbosity = typeof this.options.explain === "string" ? this.options.explain : "queryPlanner";
      return this.explain(verbosity).then(onfulfilled, onrejected ?? void 0);
    }
    const cacheTTL = typeof this.options.cache === "number" ? this.options.cache : 0;
    if (cacheTTL > 0 && this.queryCache) {
      const cacheKey = this.buildCacheKey();
      const cached = this.queryCache.get(cacheKey);
      if (cached !== void 0) {
        return Promise.resolve(cached).then(onfulfilled ?? void 0, onrejected ?? void 0);
      }
      const qc = this.queryCache;
      return this.toArray().then((result) => {
        const setResult = qc.set(cacheKey, result, cacheTTL);
        return result;
      }).then(onfulfilled ?? void 0, onrejected ?? void 0);
    }
    return this.toArray().then(onfulfilled ?? void 0, onrejected ?? void 0);
  }
  catch(onrejected) {
    return this.toArray().catch(onrejected ?? void 0);
  }
  finally(onfinally) {
    return this.toArray().finally(onfinally ?? void 0);
  }
};
var _a2;
_a2 = Symbol.toStringTag;
var AggregateChain = class {
  constructor(collection, pipeline = [], initialOptions = {}, defaults = {}) {
    this.collection = collection;
    this.pipeline = pipeline;
    this.defaults = defaults;
    this[_a2] = "Promise";
    this.executed = false;
    this.options = { ...initialOptions };
  }
  buildExecuteOptions() {
    return {
      ...this.defaults.maxTimeMS !== void 0 ? { maxTimeMS: this.defaults.maxTimeMS } : {},
      ...this.options
    };
  }
  hint(value) {
    this.options.hint = value;
    return this;
  }
  collation(value) {
    this.options.collation = value;
    return this;
  }
  comment(value) {
    this.options.comment = value;
    return this;
  }
  maxTimeMS(value) {
    this.options.maxTimeMS = value;
    return this;
  }
  allowDiskUse(value) {
    this.options.allowDiskUse = value;
    return this;
  }
  batchSize(value) {
    this.options.batchSize = value;
    return this;
  }
  explain(verbosity = "queryPlanner") {
    return this.collection.aggregate(this.pipeline, buildAggregateDriverOptions(this.buildExecuteOptions())).explain(verbosity === true ? "queryPlanner" : verbosity);
  }
  stream() {
    return this.collection.aggregate(this.pipeline, buildAggregateDriverOptions(this.buildExecuteOptions())).stream();
  }
  toArray() {
    if (this.executed) {
      throw new Error("Query already executed.");
    }
    this.executed = true;
    return this.collection.aggregate(this.pipeline, buildAggregateDriverOptions(this.buildExecuteOptions())).toArray();
  }
  then(onfulfilled, onrejected) {
    if (this.options.explain !== void 0 && this.options.explain !== false) {
      const verbosity = typeof this.options.explain === "string" ? this.options.explain : "queryPlanner";
      return this.explain(verbosity).then(onfulfilled, onrejected ?? void 0);
    }
    if (this.options.stream === true) {
      return Promise.resolve(this.stream()).then(onfulfilled, onrejected ?? void 0);
    }
    return this.toArray().then(onfulfilled ?? void 0, onrejected ?? void 0);
  }
  catch(onrejected) {
    return this.toArray().catch(onrejected ?? void 0);
  }
  finally(onfinally) {
    return this.toArray().finally(onfinally ?? void 0);
  }
};
function createFindChain(collection, query, options, defaults, queryCache) {
  return new FindChain(collection, query, options ?? {}, defaults ?? {}, queryCache);
}
function createAggregateChain(collection, pipeline = [], options, defaults) {
  const processedPipeline = hasExpressionInPipeline(pipeline) ? compilePipelineExpressions(pipeline) : pipeline;
  return new AggregateChain(collection, processedPipeline, options ?? {}, defaults ?? {});
}
async function findOneDocument(collection, ...args) {
  const [query, options] = args;
  const rawOptions = options ?? {};
  const findOptions = {};
  if (rawOptions.projection !== void 0) findOptions.projection = rawOptions.projection;
  if (rawOptions.sort !== void 0) findOptions.sort = rawOptions.sort;
  if (rawOptions.maxTimeMS !== void 0) findOptions.maxTimeMS = rawOptions.maxTimeMS;
  if (rawOptions.comment !== void 0) findOptions.comment = rawOptions.comment;
  if (rawOptions.hint !== void 0) findOptions.hint = rawOptions.hint;
  if (rawOptions.collation !== void 0) findOptions.collation = rawOptions.collation;
  if (rawOptions.explain) {
    const verbosity = rawOptions.explain === true ? "queryPlanner" : rawOptions.explain;
    return collection.find(query ?? {}, findOptions).limit(1).explain(verbosity);
  }
  return collection.findOne(
    query ?? {},
    findOptions
  );
}
async function countDocuments(collection, query, options) {
  const rawQuery = query ?? {};
  const rawOptions = options ?? {};
  const isEmptyQuery = Object.keys(rawQuery).length === 0;
  const explain = rawOptions.explain;
  const maxTimeMS = rawOptions.maxTimeMS;
  const comment = rawOptions.comment;
  if (explain) {
    const verbosity = typeof explain === "string" ? explain : "queryPlanner";
    if (isEmptyQuery) {
      return {
        queryPlanner: { plannerVersion: 1, namespace: collection.namespace },
        executionStats: { executionSuccess: true, estimatedCount: true },
        command: { estimatedDocumentCount: collection.collectionName }
      };
    }
    const pipeline = [{ $match: rawQuery }, { $count: "total" }];
    const aggregateOptions = {};
    if (maxTimeMS !== void 0) aggregateOptions.maxTimeMS = maxTimeMS;
    if (rawOptions.hint !== void 0) aggregateOptions.hint = rawOptions.hint;
    if (rawOptions.collation !== void 0) aggregateOptions.collation = rawOptions.collation;
    if (comment) aggregateOptions.comment = comment;
    return collection.aggregate(pipeline, aggregateOptions).explain(verbosity);
  }
  if (isEmptyQuery) {
    const estimatedOptions = {};
    if (maxTimeMS !== void 0) estimatedOptions.maxTimeMS = maxTimeMS;
    if (comment) estimatedOptions.comment = comment;
    return collection.estimatedDocumentCount(estimatedOptions);
  }
  const countOptions = {};
  if (maxTimeMS !== void 0) countOptions.maxTimeMS = maxTimeMS;
  if (rawOptions.hint !== void 0) countOptions.hint = rawOptions.hint;
  if (rawOptions.collation !== void 0) countOptions.collation = rawOptions.collation;
  if (typeof rawOptions.skip === "number") countOptions.skip = rawOptions.skip;
  if (typeof rawOptions.limit === "number") countOptions.limit = rawOptions.limit;
  if (comment) countOptions.comment = comment;
  return collection.countDocuments(rawQuery, countOptions);
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
async function findOneByIdDocument(collection, id, options) {
  const objectId = parseRequiredObjectId(id);
  const rawOptions = options ?? {};
  const normalizedOptions = {};
  const projection = normalizeProjection(rawOptions.projection);
  if (projection) normalizedOptions.projection = projection;
  if (rawOptions.maxTimeMS !== void 0) normalizedOptions.maxTimeMS = rawOptions.maxTimeMS;
  if (rawOptions.comment !== void 0) normalizedOptions.comment = rawOptions.comment;
  return findOneDocument(
    collection,
    { _id: objectId },
    normalizedOptions
  );
}
async function findByIdsDocuments(collection, ids, options, defaults = {}) {
  if (!Array.isArray(ids)) {
    throw createError(
      ErrorCodes.INVALID_ARGUMENT,
      "ids \u5FC5\u987B\u662F\u6570\u7EC4",
      [{ field: "ids", type: "type", message: "ids must be an array", received: typeof ids }]
    );
  }
  if (ids.length === 0) {
    return [];
  }
  const objectIds = [];
  const invalidIds = [];
  for (const [index, id] of ids.entries()) {
    if (id instanceof ObjectId) {
      objectIds.push(id);
      continue;
    }
    if (typeof id === "string" && isHexObjectIdString(id)) {
      objectIds.push(new ObjectId(id));
      continue;
    }
    if (id && typeof id === "object" && typeof id.toHexString === "function") {
      const hex = id.toHexString();
      if (isHexObjectIdString(hex)) {
        objectIds.push(new ObjectId(hex));
        continue;
      }
    }
    invalidIds.push({ index, value: id });
  }
  if (invalidIds.length > 0) {
    throw createError(
      ErrorCodes.INVALID_ARGUMENT,
      `ids \u6570\u7EC4\u5305\u542B ${invalidIds.length} \u4E2A\u65E0\u6548 ID`,
      invalidIds.map((item) => ({
        field: `ids[${item.index}]`,
        type: "format",
        message: "invalid ID",
        received: item.value
      }))
    );
  }
  const uniqueIds = [...new Set(objectIds.map((item) => item.toString()))].map((item) => new ObjectId(item));
  const rawOptions = options ?? {};
  const driverOptions = {};
  const projection = normalizeProjection(rawOptions.projection);
  if (projection) driverOptions.projection = projection;
  if (rawOptions.sort !== void 0) driverOptions.sort = rawOptions.sort;
  if (rawOptions.comment !== void 0) driverOptions.comment = rawOptions.comment;
  if (rawOptions.maxTimeMS !== void 0) {
    driverOptions.maxTimeMS = rawOptions.maxTimeMS;
  } else if (defaults.maxTimeMS !== void 0) {
    driverOptions.maxTimeMS = defaults.maxTimeMS;
  }
  const results = await collection.find({
    _id: { $in: uniqueIds }
  }, driverOptions).toArray();
  if (rawOptions.preserveOrder === true) {
    const resultMap = /* @__PURE__ */ new Map();
    for (const doc of results) {
      const docId = doc._id;
      if (docId instanceof ObjectId) {
        resultMap.set(docId.toString(), doc);
      } else if (docId !== void 0 && docId !== null) {
        resultMap.set(String(docId), doc);
      }
    }
    return objectIds.map((item) => resultMap.get(item.toString())).filter((item) => item !== void 0);
  }
  return results;
}
async function findAndCountDocuments(collection, query, options, defaults) {
  const normalizedQuery = query == null ? {} : query;
  const countDefaults = defaults ? { ...defaults, findLimit: void 0 } : {};
  const [data, total] = await Promise.all([
    createFindChain(collection, normalizedQuery, options, countDefaults).toArray(),
    collection.countDocuments(normalizedQuery)
  ]);
  return { data, total };
}
function streamDocuments(collection, query, options, defaults) {
  const streamDefaults = defaults ? { ...defaults, findLimit: void 0 } : {};
  return createFindChain(collection, query, options, streamDefaults).stream();
}
function explainDocuments(collection, query, options, defaults) {
  return createFindChain(collection, query, options, defaults).explain(options?.explain ?? "queryPlanner");
}
async function findPageDocuments(collection, options = {}, defaults) {
  return executeFindPage(collection, options, defaults ?? {});
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
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
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
      throw createError(ErrorCodes.INVALID_ARGUMENT, "field \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6216\u5BF9\u8C61");
    }
    if (typeof increment !== "number" || Number.isNaN(increment)) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "increment \u5FC5\u987B\u662F\u6570\u5B57");
    }
    incPayload = { [field]: increment };
  } else if (field && typeof field === "object" && !Array.isArray(field)) {
    incPayload = {};
    for (const [key, value] of Object.entries(field)) {
      if (typeof value !== "number" || Number.isNaN(value)) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, "\u589E\u91CF\u5FC5\u987B\u662F\u6570\u5B57");
      }
      incPayload[key] = value;
    }
    if (Object.keys(incPayload).length === 0) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "field \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6216\u5BF9\u8C61");
    }
  } else {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "field \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6216\u5BF9\u8C61");
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
async function findOneAndUpdateDocument(collection, filter, update, options) {
  return collection.findOneAndUpdate(filter, update, ...options !== void 0 ? [options] : []);
}
async function findOneAndReplaceDocument(collection, filter, replacement, options) {
  return collection.findOneAndReplace(filter, replacement, ...options !== void 0 ? [options] : []);
}
async function findOneAndDeleteDocument(collection, filter, options) {
  return collection.findOneAndDelete(filter, ...options !== void 0 ? [options] : []);
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
  if (!Array.isArray(documents)) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "documents \u5FC5\u987B\u662F\u6570\u7EC4\u7C7B\u578B");
  }
  if (documents.length === 0) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "documents \u6570\u7EC4\u4E0D\u80FD\u4E3A\u7A7A");
  }
  const rawOptions = options;
  const {
    batchSize = 1e3,
    ordered = false,
    concurrency,
    onError = "stop",
    retryAttempts = 0,
    retryDelay = 0,
    onProgress,
    onRetry,
    ...driverOptions
  } = rawOptions;
  if (concurrency !== void 0 && (!Number.isInteger(concurrency) || concurrency < 0)) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "concurrency must be a non-negative integer");
  }
  if (!["stop", "skip", "collect", "retry"].includes(onError)) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "onError must be one of: stop/skip/collect/retry");
  }
  if (!Number.isInteger(retryAttempts) || retryAttempts < 0) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "retryAttempts must be a non-negative integer");
  }
  const batches = splitIntoBatches(documents, batchSize);
  const result = {
    acknowledged: true,
    totalCount: documents.length,
    insertedCount: 0,
    batchCount: batches.length,
    errors: [],
    insertedIds: {},
    retries: []
  };
  let offset = 0;
  for (const [batchIndex, batch] of batches.entries()) {
    let attempts = 0;
    while (true) {
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
        onProgress?.({
          currentBatch: batchIndex + 1,
          totalBatches: batches.length,
          inserted: result.insertedCount,
          total: documents.length,
          percentage: Math.round(result.insertedCount / documents.length * 100),
          retries: result.retries.length
        });
        break;
      } catch (cause) {
        const errorRecord = {
          batchIndex,
          message: cause instanceof Error ? cause.message : String(cause),
          error: cause,
          attempts: attempts + 1
        };
        if (onError === "retry" && attempts < retryAttempts) {
          attempts += 1;
          const retryInfo = {
            batchIndex,
            attempt: attempts,
            maxAttempts: retryAttempts,
            delay: retryDelay
          };
          result.retries.push(retryInfo);
          onRetry?.(retryInfo);
          if (retryDelay > 0) {
            await sleep(retryDelay);
          }
          continue;
        }
        result.errors.push(errorRecord);
        onProgress?.({
          currentBatch: batchIndex + 1,
          totalBatches: batches.length,
          inserted: result.insertedCount,
          total: documents.length,
          percentage: Math.round(result.insertedCount / documents.length * 100),
          retries: result.retries.length
        });
        if (onError === "stop") {
          throw createError(ErrorCodes.WRITE_ERROR, errorRecord.message, void 0, cause);
        }
        break;
      }
    }
  }
  return result;
}
async function updateBatchDocuments(collection, filter, update, options = {}) {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "filter \u5FC5\u987B\u662F\u5BF9\u8C61\u7C7B\u578B");
  }
  if (!update || typeof update !== "object") {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "update \u5FC5\u987B\u662F\u5BF9\u8C61\uFF08\u66F4\u65B0\u64CD\u4F5C\u7B26\uFF09\u6216\u6570\u7EC4\uFF08\u805A\u5408\u7BA1\u9053\uFF09");
  }
  if (!Array.isArray(update)) {
    const keys = Object.keys(update);
    if (keys.length === 0 || !keys.some((key) => key.startsWith("$"))) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "update \u5FC5\u987B\u4F7F\u7528\u66F4\u65B0\u64CD\u4F5C\u7B26\uFF08\u5982 $set, $inc \u7B49\uFF09");
    }
  }
  const { batchSize = 1e3, sort = { _id: 1 }, onProgress, ...driverOptions } = options;
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
    upsertedCount: 0,
    batchCount: batches.length,
    errors: [],
    retries: []
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
      result.upsertedCount += batchResult.upsertedCount ?? 0;
      onProgress?.({
        currentBatch: batchIndex + 1,
        totalBatches: batches.length,
        modified: result.modifiedCount,
        matched: result.matchedCount,
        percentage: ids.length === 0 ? 100 : Math.round(result.modifiedCount / ids.length * 100)
      });
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
    throw createError(ErrorCodes.INVALID_ARGUMENT, "filter \u5FC5\u987B\u662F\u5BF9\u8C61\u7C7B\u578B");
  }
  const rawOptions = options;
  const {
    batchSize = 1e3,
    sort = { _id: 1 },
    estimateProgress = true,
    onProgress,
    onError = "stop",
    retryAttempts = 0,
    retryDelay = 0,
    onRetry,
    ...driverOptions
  } = rawOptions;
  if (!["stop", "skip", "collect", "retry"].includes(onError)) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "onError must be one of: stop/skip/collect/retry");
  }
  if (!Number.isInteger(retryAttempts) || retryAttempts < 0) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "retryAttempts must be a non-negative integer");
  }
  const ids = await collection.find(filter, {
    projection: { _id: 1 },
    sort
  }).map((document) => document._id).toArray();
  const batches = splitIntoBatches(ids, batchSize);
  const result = {
    acknowledged: true,
    totalCount: estimateProgress ? ids.length : null,
    deletedCount: 0,
    batchCount: batches.length,
    errors: [],
    retries: []
  };
  for (const [batchIndex, batch] of batches.entries()) {
    let attempts = 0;
    while (true) {
      try {
        const batchResult = await collection.deleteMany(
          { _id: { $in: batch } },
          driverOptions
        );
        result.deletedCount += batchResult.deletedCount;
        onProgress?.({
          currentBatch: batchIndex + 1,
          totalBatches: batches.length,
          deleted: result.deletedCount,
          percentage: estimateProgress && ids.length > 0 ? Math.round(result.deletedCount / ids.length * 100) : null
        });
        break;
      } catch (cause) {
        const errorRecord = {
          batchIndex,
          message: cause instanceof Error ? cause.message : String(cause),
          error: cause,
          attempts: attempts + 1
        };
        if (onError === "retry" && attempts < retryAttempts) {
          attempts += 1;
          const retryInfo = {
            batchIndex,
            attempt: attempts,
            maxAttempts: retryAttempts,
            delay: retryDelay
          };
          result.retries.push(retryInfo);
          onRetry?.(retryInfo);
          if (retryDelay > 0) {
            await sleep(retryDelay);
          }
          continue;
        }
        result.errors.push(errorRecord);
        if (onError === "stop") {
          throw createError(ErrorCodes.WRITE_ERROR, errorRecord.message, void 0, cause);
        }
        break;
      }
    }
  }
  return result;
}
async function incrementOneDocument(collection, filter, field, incrementOrOptions, maybeOptions) {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "filter \u5FC5\u987B\u662F\u975E\u7A7A\u5BF9\u8C61");
  }
  let options = {};
  let increment = 1;
  if (typeof incrementOrOptions === "number" || incrementOrOptions === void 0) {
    increment = typeof incrementOrOptions === "number" ? incrementOrOptions : 1;
    options = maybeOptions ?? {};
  } else if (incrementOrOptions && typeof incrementOrOptions === "object" && !Array.isArray(incrementOrOptions)) {
    options = incrementOrOptions;
  } else {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "increment \u5FC5\u987B\u662F\u6570\u5B57");
  }
  const updateDocument = createIncrementUpdate(field, increment, options.$set);
  const { $set, projection, ...driverOptions } = options;
  void $set;
  const normalizedProjection = normalizeProjection(projection);
  const findOptions = {
    returnDocument: options.returnDocument ?? "after",
    includeResultMetadata: true
  };
  if (normalizedProjection) findOptions.projection = normalizedProjection;
  if (driverOptions.maxTimeMS !== void 0) findOptions.maxTimeMS = driverOptions.maxTimeMS;
  if (driverOptions.comment !== void 0) findOptions.comment = driverOptions.comment;
  const rawResult = await collection.findOneAndUpdate(
    filter,
    updateDocument,
    findOptions
  );
  let value;
  let matchedCount;
  let modifiedCount;
  if (rawResult && typeof rawResult === "object" && "lastErrorObject" in rawResult) {
    const r = rawResult;
    value = r.value ?? null;
    matchedCount = r.lastErrorObject?.n ?? 0;
    modifiedCount = r.lastErrorObject?.updatedExisting === true && value != null ? 1 : 0;
  } else {
    value = rawResult ?? null;
    matchedCount = value != null ? 1 : 0;
    modifiedCount = value != null ? 1 : 0;
  }
  return { acknowledged: true, matchedCount, modifiedCount, value };
}

// src/adapters/mongodb/utils/objectid-converter.ts
import { ObjectId as ObjectId2 } from "mongodb";
var OBJECTID_FIELD_PATTERNS = [
  "_id",
  /^.*Id$/,
  /^.*Ids$/,
  /^.*_id$/,
  /^.*_ids$/
];
var SPECIAL_OPERATORS = /* @__PURE__ */ new Set(["$expr", "$function", "$where", "$accumulator"]);
function shouldConvertField(fieldName) {
  if (!fieldName || typeof fieldName !== "string") return false;
  return OBJECTID_FIELD_PATTERNS.some((pattern) => {
    if (typeof pattern === "string") return fieldName === pattern;
    if (pattern instanceof RegExp) return pattern.test(fieldName);
    return false;
  });
}
function isValidObjectIdString(str) {
  if (typeof str !== "string") return false;
  if (!/^[0-9a-fA-F]{24}$/.test(str)) return false;
  return ObjectId2.isValid(str);
}
function isFieldReference(value) {
  if (typeof value !== "string") return false;
  return value.startsWith("$");
}
function convertObjectIdStrings(obj, fieldPath = "", depth = 0, visited = /* @__PURE__ */ new WeakSet()) {
  const MAX_DEPTH = 10;
  if (depth > MAX_DEPTH) return obj;
  if (obj === null || obj === void 0) return obj;
  if (obj instanceof ObjectId2) return obj;
  if (obj !== null && typeof obj === "object" && obj.constructor?.name === "ObjectId") {
    try {
      const hex = obj.toString();
      if (isValidObjectIdString(hex)) return new ObjectId2(hex);
    } catch {
    }
    return obj;
  }
  if (typeof obj === "string") {
    if (isFieldReference(obj)) return obj;
    if (isValidObjectIdString(obj)) {
      try {
        return new ObjectId2(obj);
      } catch {
        return obj;
      }
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    let changed = false;
    const converted = obj.map((item, i) => {
      const newItem = convertObjectIdStrings(item, `${fieldPath}[${i}]`, depth + 1, visited);
      if (newItem !== item) changed = true;
      return newItem;
    });
    return changed ? converted : obj;
  }
  if (typeof obj === "object") {
    const o = obj;
    if (visited.has(o)) return obj;
    visited.add(o);
    let changed = false;
    const converted = {};
    for (const [key, value] of Object.entries(o)) {
      const currentPath = fieldPath ? `${fieldPath}.${key}` : key;
      if (SPECIAL_OPERATORS.has(key)) {
        converted[key] = value;
        continue;
      }
      if (typeof value === "string" && shouldConvertField(key) && !isFieldReference(value) && isValidObjectIdString(value)) {
        try {
          converted[key] = new ObjectId2(value);
          changed = true;
        } catch {
          converted[key] = value;
        }
      } else {
        const newValue = convertObjectIdStrings(value, currentPath, depth + 1, visited);
        if (newValue !== value) changed = true;
        converted[key] = newValue;
      }
    }
    return changed ? converted : obj;
  }
  return obj;
}
function convertUpdateDocument(update) {
  if (!update || typeof update !== "object" || Array.isArray(update)) return update;
  const ops = update;
  let changed = false;
  const converted = {};
  const CONVERT_OPS = /* @__PURE__ */ new Set(["$set", "$setOnInsert", "$push", "$addToSet", "$pull"]);
  for (const [op, value] of Object.entries(ops)) {
    if (CONVERT_OPS.has(op)) {
      const newVal = convertObjectIdStrings(value, `update.${op}`);
      if (newVal !== value) changed = true;
      converted[op] = newVal;
    } else {
      converted[op] = value;
    }
  }
  return changed ? converted : update;
}

// src/adapters/mongodb/common/accessors.ts
var MongoCollectionAccessor = class {
  constructor(dbName, collectionName, collectionRef, management = {}, dbRef) {
    this.dbName = dbName;
    this.collectionName = collectionName;
    this.collectionRef = collectionRef;
    this.management = management;
    this.dbRef = dbRef;
  }
  /** Auto-convert filter / query if autoConvertObjectId is enabled. */
  _cvFilter(val) {
    if (!this.management.defaults?.autoConvertObjectId) return val;
    return convertObjectIdStrings(val);
  }
  /** Auto-convert plain document (insert/replace) if autoConvertObjectId is enabled. */
  _cvDoc(val) {
    if (!this.management.defaults?.autoConvertObjectId) return val;
    return convertObjectIdStrings(val);
  }
  /** Auto-convert update document ($set/$push/…) if autoConvertObjectId is enabled. */
  _cvUpdate(val) {
    if (!this.management.defaults?.autoConvertObjectId || Array.isArray(val)) return val;
    return convertUpdateDocument(val);
  }
  async invalidateReadCaches(operation) {
    if (!this.management.queryCache?.delPattern) {
      return 0;
    }
    const namespace = this.collectionRef.namespace;
    const bookmarkNamespace = `${this.dbName}:${this.collectionName}`;
    const legacyNamespacePatterns = [
      `${String(this.management.defaults?.namespace?.instanceId)}:mongodb:${this.dbName}:${this.collectionName}:*`
    ];
    const patterns = operation === "find" ? [`find:${namespace}:*`] : operation === "findOne" ? [`findOne:${namespace}:*`] : operation === "count" ? [`count:${namespace}:*`] : operation === "findPage" ? [`bookmark:${bookmarkNamespace}:*`] : [
      `find:${namespace}:*`,
      `findOne:${namespace}:*`,
      `count:${namespace}:*`,
      `bookmark:${bookmarkNamespace}:*`
    ];
    patterns.push(...legacyNamespacePatterns);
    let deleted = 0;
    for (const pattern of patterns) {
      const d = Number(await Promise.resolve(this.management.queryCache.delPattern(pattern)));
      deleted += d;
    }
    return deleted;
  }
  /**
   * Returns the collection namespace.
   * @since v1.3.0
   */
  getNamespace() {
    const instanceId = this.management.defaults?.namespace?.instanceId;
    const iid = instanceId ? `${instanceId}:${this.dbName}:${this.collectionName}` : `${this.dbName}:${this.collectionName}`;
    return {
      iid,
      type: "mongodb",
      db: this.dbName,
      collection: this.collectionName
    };
  }
  /**
   * Returns the underlying native MongoDB Collection.
   * @since v1.3.0
   */
  raw() {
    return this.collectionRef;
  }
  /**
   * Finds a single document matching the query.
   * @since v1.3.0
   */
  async findOne(query, options) {
    const normalizedQuery = this._cvFilter(query);
    const maxTimeMS = this.management.defaults?.maxTimeMS;
    const rawOptions = { ...maxTimeMS !== void 0 ? { maxTimeMS } : {}, ...options ?? {} };
    const projection = normalizeProjection(rawOptions.projection);
    const cacheTTL = rawOptions.explain ? 0 : typeof rawOptions.cache === "number" ? rawOptions.cache : 0;
    const driverOptions = {};
    if (projection) driverOptions.projection = projection;
    if (rawOptions.maxTimeMS !== void 0) driverOptions.maxTimeMS = rawOptions.maxTimeMS;
    if (rawOptions.comment !== void 0) driverOptions.comment = rawOptions.comment;
    if (rawOptions.sort !== void 0) driverOptions.sort = rawOptions.sort;
    if (rawOptions.hint !== void 0) driverOptions.hint = rawOptions.hint;
    if (rawOptions.collation !== void 0) driverOptions.collation = rawOptions.collation;
    if (rawOptions.explain !== void 0) driverOptions.explain = rawOptions.explain;
    if (cacheTTL > 0 && this.management.queryCache) {
      const { cache: _cache, ...keyOptions } = rawOptions;
      void _cache;
      const cacheKey = `findOne:${this.collectionRef.namespace}:${JSON.stringify(normalizedQuery ?? {})}:${JSON.stringify({ ...keyOptions, projection })}`;
      const cached = this.management.queryCache.get(cacheKey);
      if (cached !== void 0) {
        return Promise.resolve(cached);
      }
      const result = await findOneDocument(this.collectionRef, normalizedQuery, driverOptions);
      this.management.queryCache.set(cacheKey, result, cacheTTL);
      return result;
    }
    return findOneDocument(this.collectionRef, normalizedQuery, driverOptions);
  }
  /**
   * Queries multiple documents (restores v1 FindChain compatible form).
   *
   * When `options.stream === true`, returns a Node.js ReadableStream (v1 compatible).
   * @since v1.3.0
   */
  find(query, options) {
    if (options?.stream) {
      return streamDocuments(this.collectionRef, query, options, this.management.defaults);
    }
    return createFindChain(this.collectionRef, query, options, this.management.defaults, this.management.queryCache);
  }
  /**
   * Finds a single document by its `_id`.
   * @since v1.3.0
   */
  async findOneById(id, options) {
    const maxTimeMS = this.management.defaults?.maxTimeMS;
    const merged = maxTimeMS !== void 0 ? { maxTimeMS, ...options } : options;
    return findOneByIdDocument(this.collectionRef, id, merged);
  }
  /**
   * Finds multiple documents by a set of `_id` values.
   * @since v1.3.0
   */
  async findByIds(ids, options) {
    const { findLimit: _skip, ...noLimitDefaults } = this.management.defaults ?? {};
    return findByIdsDocuments(this.collectionRef, ids, options, noLimitDefaults);
  }
  /**
   * Returns both matching documents and the total count.
   * @since v1.3.0
   */
  async findAndCount(query, options) {
    return findAndCountDocuments(
      this.collectionRef,
      query != null ? this._cvFilter(query) : query,
      options,
      this.management.defaults
    );
  }
  /**
   * Returns query results as a streaming cursor.
   * @since v1.3.0
   */
  stream(query, options) {
    return streamDocuments(this.collectionRef, query, options, this.management.defaults);
  }
  /**
   * Returns the query execution plan.
   * @since v1.3.0
   */
  explain(query, options) {
    return explainDocuments(this.collectionRef, query, options, this.management.defaults);
  }
  /**
   * Counts the number of documents matching the query.
   * @since v1.3.0
   */
  async count(query, options) {
    const normalizedQuery = this._cvFilter(query);
    const maxTimeMS = this.management.defaults?.maxTimeMS;
    const merged = { ...maxTimeMS !== void 0 ? { maxTimeMS } : {}, ...options ?? {} };
    const cacheTTL = typeof merged.cache === "number" ? merged.cache : 0;
    const { cache: _cache, ...keyOptions } = merged;
    void _cache;
    const executeCount = () => countDocuments(this.collectionRef, normalizedQuery ?? {}, keyOptions);
    const countQueue = this.management.defaults?.countQueue;
    if (cacheTTL > 0 && this.management.queryCache) {
      const cacheKey = `count:${this.collectionRef.namespace}:${JSON.stringify(normalizedQuery ?? {})}:${JSON.stringify(keyOptions)}`;
      const cached = this.management.queryCache.get(cacheKey);
      if (cached !== void 0) {
        return Promise.resolve(cached);
      }
      const runner = countQueue ? countQueue.execute(executeCount) : executeCount();
      return runner.then((result) => {
        this.management.queryCache?.set(cacheKey, result, cacheTTL);
        return result;
      });
    }
    return countQueue ? countQueue.execute(executeCount) : executeCount();
  }
  /**
   * Runs an aggregation pipeline.
   * @since v1.3.0
   */
  aggregate(pipeline = [], options) {
    const normalizedPipeline = this.management.defaults?.autoConvertObjectId ? pipeline.map((stage) => convertObjectIdStrings(stage)) : pipeline;
    return createAggregateChain(this.collectionRef, normalizedPipeline, options, this.management.defaults);
  }
  /**
   * Returns distinct values for a field.
   * @since v1.3.0
   */
  async distinct(key, query, options) {
    return distinctValues(this.collectionRef, key, this._cvFilter(query), options);
  }
  /**
   * Simplified paginated query.
   * @since v1.3.0
   */
  async findPage(options = {}) {
    const resolvedOptions = options.query ? { ...options, query: this._cvFilter(options.query) } : options;
    return findPageDocuments(this.collectionRef, resolvedOptions, this.management.defaults);
  }
  /**
   * Watches for collection change events.
   * @since v1.3.0
   */
  watch(pipeline = [], options) {
    return watchDocuments(this.collectionRef, pipeline, options);
  }
  /**
   * Passthrough for native single-document insert, with v1 validation and cache invalidation.
   * @since v1.3.0
   */
  async insertOne(doc, options) {
    if (doc === null || doc === void 0 || typeof doc !== "object" || Array.isArray(doc)) {
      throw createError(
        ErrorCodes.DOCUMENT_REQUIRED,
        "document must be an object",
        [{ field: "document", type: "object.required", message: "document is required and must be an object" }]
      );
    }
    let result;
    const t0 = Date.now();
    try {
      result = await insertOneDocument(this.collectionRef, this._cvDoc(doc), options);
    } catch (err) {
      const mongoErr = err;
      if (mongoErr?.code === 11e3) {
        throw createError(
          ErrorCodes.DUPLICATE_KEY,
          `\u6587\u6863\u63D2\u5165\u5931\u8D25\uFF1A\u8FDD\u53CD\u552F\u4E00\u6027\u7EA6\u675F (duplicate key)`,
          [{ field: "_id", message: mongoErr.message ?? "duplicate key" }],
          err
        );
      }
      throw createError(
        ErrorCodes.WRITE_ERROR,
        `insertOne failed: ${mongoErr?.message ?? String(err)}`,
        void 0,
        err
      );
    }
    const elapsed = Date.now() - t0;
    const threshold = this.management.defaults?.slowQueryMs ?? 500;
    if (elapsed > threshold && this.management.logger) {
      try {
        this.management.logger.warn("[insertOne] \u6162\u64CD\u4F5C\u8B66\u544A", {
          ns: `${this.dbName}.${this.collectionName}`,
          threshold,
          duration: elapsed,
          insertedId: result.insertedId,
          comment: options?.comment,
          op: "insertOne",
          ts: (/* @__PURE__ */ new Date()).toISOString()
        });
      } catch (_) {
      }
    }
    await this.invalidateReadCaches("all");
    return result;
  }
  /**
   * Passthrough for native bulk insert.
   * @since v1.3.0
   */
  async insertMany(...args) {
    const [documents, options] = args;
    if (!Array.isArray(documents)) {
      throw createError("DOCUMENTS_REQUIRED", "documents \u5FC5\u987B\u662F\u6570\u7EC4\u7C7B\u578B");
    }
    if (documents.length === 0) {
      throw createError("DOCUMENTS_REQUIRED", "documents \u6570\u7EC4\u4E0D\u80FD\u4E3A\u7A7A");
    }
    if (documents.some((item) => item === null || typeof item !== "object" || Array.isArray(item))) {
      throw createError("DOCUMENTS_REQUIRED", "documents \u4E2D\u7684\u6240\u6709\u5143\u7D20\u5FC5\u987B\u662F\u5BF9\u8C61\u7C7B\u578B");
    }
    const t0 = Date.now();
    let result;
    try {
      const convertedDocs = documents.map((d) => this._cvDoc(d));
      result = await insertManyDocuments(this.collectionRef, ...[convertedDocs, options]);
    } catch (err) {
      const mongoErr = err;
      if (mongoErr?.code === 11e3) {
        throw createError(
          ErrorCodes.DUPLICATE_KEY,
          `\u6279\u91CF\u63D2\u5165\u5931\u8D25\uFF1A\u8FDD\u53CD\u552F\u4E00\u6027\u7EA6\u675F (duplicate key)`,
          [{ field: "_id", message: mongoErr.message ?? "duplicate key" }],
          err
        );
      }
      throw err;
    }
    const elapsed = Date.now() - t0;
    const threshold = this.management.defaults?.slowQueryMs ?? 500;
    if (elapsed >= threshold && this.management.logger) {
      this.management.logger.warn("[insertMany] \u6162\u64CD\u4F5C\u8B66\u544A", {
        ns: `${this.dbName}.${this.collectionName}`,
        threshold,
        duration: elapsed,
        documentCount: documents.length,
        insertedCount: result.insertedCount,
        ordered: options?.ordered ?? true,
        comment: options?.comment,
        op: "insertMany"
      });
    }
    await this.invalidateReadCaches("all");
    return result;
  }
  /**
   * Passthrough for native single-document update, with v1 validation and cache invalidation.
   * @since v1.3.0
   */
  async updateOne(filter, update, options) {
    if (filter === null || filter === void 0 || typeof filter !== "object" || Array.isArray(filter)) {
      throw createError(
        ErrorCodes.INVALID_ARGUMENT,
        "filter \u5FC5\u987B\u662F\u5BF9\u8C61\u7C7B\u578B",
        [{ field: "filter", type: "object.required", message: "filter \u662F\u5FC5\u9700\u53C2\u6570\u4E14\u5FC5\u987B\u662F\u5BF9\u8C61" }]
      );
    }
    if (update === null || update === void 0) {
      throw createError(
        ErrorCodes.INVALID_ARGUMENT,
        "update \u5FC5\u987B\u662F\u5BF9\u8C61\uFF08\u66F4\u65B0\u64CD\u4F5C\u7B26\uFF09\u6216\u6570\u7EC4\uFF08\u805A\u5408\u7BA1\u9053\uFF09",
        [{ field: "update", type: "object|array.required", message: "update \u5FC5\u987B\u662F\u66F4\u65B0\u64CD\u4F5C\u7B26\u5BF9\u8C61\u6216\u805A\u5408\u7BA1\u9053\u6570\u7EC4" }]
      );
    }
    if (Array.isArray(update)) {
      if (update.length === 0) {
        throw createError(
          ErrorCodes.INVALID_ARGUMENT,
          "update \u805A\u5408\u7BA1\u9053\u4E0D\u80FD\u4E3A\u7A7A\u6570\u7EC4",
          [{ field: "update", type: "array.empty", message: "aggregation pipeline must contain at least one stage" }]
        );
      }
      for (let i = 0; i < update.length; i++) {
        const stage = update[i];
        if (stage === null || typeof stage !== "object" || Array.isArray(stage)) {
          throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            `update \u805A\u5408\u7BA1\u9053\u7B2C ${i + 1} \u9636\u6BB5\u5FC5\u987B\u662F\u5BF9\u8C61`,
            [{ field: `update[${i}]`, type: "object.required", message: "pipeline stage must be an object" }]
          );
        }
        const stageKeys = Object.keys(stage);
        if (stageKeys.length === 0) {
          throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            `update \u805A\u5408\u7BA1\u9053\u7B2C ${i + 1} \u9636\u6BB5\u4E0D\u80FD\u4E3A\u7A7A\u5BF9\u8C61`,
            [{ field: `update[${i}]`, type: "object.empty", message: "pipeline stage must not be empty" }]
          );
        }
        const stageOperator = stageKeys[0];
        if (!stageOperator.startsWith("$")) {
          throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            `update pipeline stage ${i + 1} operator must start with $, got "${stageOperator}"`,
            [{ field: `update[${i}]`, type: "object.invalidKeys", message: "pipeline operator must start with $" }]
          );
        }
      }
    } else if (typeof update === "object") {
      const keys = Object.keys(update);
      if (keys.length === 0) {
        throw createError(
          ErrorCodes.INVALID_ARGUMENT,
          "update \u4E0D\u80FD\u4E3A\u7A7A\u5BF9\u8C61",
          [{ field: "update", type: "object.empty", message: "update must not be empty" }]
        );
      }
      const hasOperator = keys.some((k) => k.startsWith("$"));
      if (!hasOperator) {
        throw createError(
          ErrorCodes.INVALID_ARGUMENT,
          "update \u5FC5\u987B\u4F7F\u7528\u66F4\u65B0\u64CD\u4F5C\u7B26\uFF08\u5982 $set, $inc \u7B49\uFF09",
          [{ field: "update", type: "object.invalidKeys", message: "\u8BF7\u4F7F\u7528 $set, $inc, $push \u7B49\u66F4\u65B0\u64CD\u4F5C\u7B26" }]
        );
      }
    }
    const normalizedFilter = this._cvFilter(filter);
    const finalUpdate = Array.isArray(update) ? update : convertUpdateDocument(update);
    const result = await updateOneDocument(this.collectionRef, normalizedFilter, finalUpdate, options);
    if (result.modifiedCount > 0 || result.upsertedId) {
      await this.invalidateReadCaches("all");
    }
    return result;
  }
  /**
   * Passthrough for native bulk update.
   * @since v1.3.0
   */
  async updateMany(...args) {
    const [filter, update, options] = args;
    if (filter === null || filter === void 0 || typeof filter !== "object" || Array.isArray(filter)) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "filter \u5FC5\u987B\u662F\u975E\u7A7A\u5BF9\u8C61");
    }
    if (update === null || update === void 0 || typeof update !== "object") {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "update \u5FC5\u987B\u662F\u5BF9\u8C61\uFF08\u66F4\u65B0\u64CD\u4F5C\u7B26\uFF09\u6216\u6570\u7EC4\uFF08\u805A\u5408\u7BA1\u9053\uFF09");
    }
    if (!Array.isArray(update)) {
      const keys = Object.keys(update);
      if (keys.length === 0 || !keys.some((key) => key.startsWith("$"))) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, "update \u5FC5\u987B\u4F7F\u7528\u66F4\u65B0\u64CD\u4F5C\u7B26\uFF08\u5982 $set, $inc \u7B49\uFF09");
      }
    }
    const result = await updateManyDocuments(this.collectionRef, this._cvFilter(filter), this._cvUpdate(update), options);
    if (result.modifiedCount > 0 || result.upsertedId) {
      await this.invalidateReadCaches("all");
    }
    return result;
  }
  /**
   * Passthrough for native single-document replace.
   * @since v1.3.0
   */
  async replaceOne(...args) {
    const [filter, replacement, options] = args;
    if (filter === null || filter === void 0 || typeof filter !== "object" || Array.isArray(filter)) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "filter \u5FC5\u987B\u662F\u975E\u7A7A\u5BF9\u8C61");
    }
    if (replacement === null || replacement === void 0 || typeof replacement !== "object" || Array.isArray(replacement)) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "replacement \u5FC5\u987B\u662F\u5BF9\u8C61\u7C7B\u578B");
    }
    if (Object.keys(replacement).some((key) => key.startsWith("$"))) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "replacement \u4E0D\u80FD\u5305\u542B\u66F4\u65B0\u64CD\u4F5C\u7B26\uFF08\u5982 $set, $inc \u7B49\uFF09");
    }
    const result = await replaceOneDocument(this.collectionRef, this._cvFilter(filter), this._cvDoc(replacement), options);
    await this.invalidateReadCaches("all");
    return result;
  }
  /**
   * Atomically finds and replaces a single document.
   * @since v1.3.0
   */
  async findOneAndReplace(filter, replacement, options) {
    if (filter === null || filter === void 0 || typeof filter !== "object" || Array.isArray(filter)) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "filter \u5FC5\u987B\u662F\u975E\u7A7A\u5BF9\u8C61");
    }
    if (replacement === null || replacement === void 0 || typeof replacement !== "object" || Array.isArray(replacement)) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "replacement \u5FC5\u987B\u662F\u5BF9\u8C61\u7C7B\u578B");
    }
    if (Object.keys(replacement).some((key) => key.startsWith("$"))) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "replacement \u4E0D\u80FD\u5305\u542B\u66F4\u65B0\u64CD\u4F5C\u7B26\uFF08\u5982 $set, $inc \u7B49\uFF09");
    }
    const result = await findOneAndReplaceDocument(this.collectionRef, this._cvFilter(filter), this._cvDoc(replacement), options);
    if (result) {
      await this.invalidateReadCaches("all");
    }
    return result;
  }
  /**
   * Atomically finds and updates a single document.
   * @since v1.3.0
   */
  async findOneAndUpdate(filter, update, options) {
    if (filter === null || filter === void 0 || typeof filter !== "object" || Array.isArray(filter)) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "filter \u5FC5\u987B\u662F\u975E\u7A7A\u5BF9\u8C61");
    }
    if (update === null || update === void 0 || typeof update !== "object") {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "update \u5FC5\u987B\u662F\u5BF9\u8C61\uFF08\u66F4\u65B0\u64CD\u4F5C\u7B26\uFF09\u6216\u6570\u7EC4\uFF08\u805A\u5408\u7BA1\u9053\uFF09");
    }
    if (!Array.isArray(update)) {
      const keys = Object.keys(update);
      if (keys.length === 0 || !keys.some((key) => key.startsWith("$"))) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, "update \u5FC5\u987B\u4F7F\u7528\u66F4\u65B0\u64CD\u4F5C\u7B26\uFF08\u5982 $set, $inc \u7B49\uFF09");
      }
    }
    const result = await findOneAndUpdateDocument(this.collectionRef, this._cvFilter(filter), this._cvUpdate(update), options);
    if (result) {
      await this.invalidateReadCaches("all");
    }
    return result;
  }
  /**
   * Atomically finds and deletes a single document.
   * @since v1.3.0
   */
  async findOneAndDelete(filter, options) {
    if (filter === null || filter === void 0 || typeof filter !== "object" || Array.isArray(filter)) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "filter \u5FC5\u987B\u662F\u975E\u7A7A\u5BF9\u8C61");
    }
    const result = await findOneAndDeleteDocument(this.collectionRef, this._cvFilter(filter), options);
    if (result) {
      await this.invalidateReadCaches("all");
    }
    return result;
  }
  /**
   * Convenience upsert wrapper.
   * @since v1.3.0
   */
  async upsertOne(filter, update, options) {
    if (filter === null || filter === void 0 || typeof filter !== "object" || Array.isArray(filter)) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "filter \u5FC5\u987B\u662F\u975E\u7A7A\u5BF9\u8C61");
    }
    if (update === null || update === void 0 || typeof update !== "object" || Array.isArray(update)) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "update \u5FC5\u987B\u662F\u975E\u7A7A\u5BF9\u8C61");
    }
    const updateDoc = Object.keys(update).some((key) => key.startsWith("$")) ? update : { $set: update };
    const result = await upsertOneDocument(this.collectionRef, this._cvFilter(filter), this._cvUpdate(updateDoc), options);
    await this.invalidateReadCaches("all");
    const normalizedResult = result.upsertedId === null ? { ...result, upsertedId: void 0 } : result;
    return normalizedResult;
  }
  /**
   * Passthrough for native single-document delete, with v1 validation and cache invalidation.
   * @since v1.3.0
   */
  async deleteOne(filter, options) {
    if (filter === null || filter === void 0 || typeof filter !== "object" || Array.isArray(filter)) {
      throw createError(
        ErrorCodes.INVALID_ARGUMENT,
        "filter \u5FC5\u987B\u662F\u5BF9\u8C61\u7C7B\u578B",
        [{ field: "filter", type: "object.required", message: "filter \u662F\u5FC5\u9700\u53C2\u6570\u4E14\u5FC5\u987B\u662F\u5BF9\u8C61" }]
      );
    }
    const result = await deleteOneDocument(this.collectionRef, this._cvFilter(filter), options);
    if (result.deletedCount > 0) {
      await this.invalidateReadCaches("all");
    }
    return result;
  }
  /**
   * Passthrough for native bulk delete.
   * @since v1.3.0
   */
  async deleteMany(...args) {
    const [filter, options] = args;
    if (filter === null || filter === void 0 || typeof filter !== "object" || Array.isArray(filter)) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "filter \u5FC5\u987B\u662F\u975E\u7A7A\u5BF9\u8C61");
    }
    const result = await deleteManyDocuments(this.collectionRef, this._cvFilter(filter), options);
    if (result.deletedCount > 0) {
      await this.invalidateReadCaches("all");
    }
    return result;
  }
  /**
   * Bulk-inserts documents in batches.
   * @since v1.3.0
   */
  async insertBatch(documents, options) {
    if (!Array.isArray(documents)) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "documents \u5FC5\u987B\u662F\u6570\u7EC4\u7C7B\u578B");
    }
    const result = await insertBatchDocuments(this.collectionRef, documents.map((d) => this._cvDoc(d)), options);
    await this.invalidateReadCaches("all");
    return result;
  }
  /**
   * Bulk-updates matching documents in batches.
   * @since v1.3.0
   */
  async updateBatch(filter, update, options) {
    const result = await updateBatchDocuments(this.collectionRef, this._cvFilter(filter), this._cvUpdate(update), options);
    if (result.modifiedCount > 0) {
      await this.invalidateReadCaches("all");
    }
    return result;
  }
  /**
   * Bulk-deletes matching documents in batches.
   * @since v1.3.0
   */
  async deleteBatch(filter, options) {
    const result = await deleteBatchDocuments(this.collectionRef, this._cvFilter(filter), options);
    if (result.deletedCount > 0) {
      await this.invalidateReadCaches("all");
    }
    return result;
  }
  /**
   * Convenience field increment / decrement.
   * @since v1.3.0
   */
  async incrementOne(filter, field, incrementOrOptions, maybeOptions) {
    const result = await incrementOneDocument(this.collectionRef, this._cvFilter(filter), field, incrementOrOptions, maybeOptions);
    if (result.modifiedCount > 0) {
      await this.invalidateReadCaches("all");
    }
    return result;
  }
  /**
   * Creates a single index.
   * @since v1.3.0
   */
  async createIndex(keys, options) {
    return createIndexDefinition(this.collectionRef, keys, options);
  }
  /**
   * Creates multiple indexes in bulk.
   * @since v1.3.0
   */
  async createIndexes(specs) {
    return createIndexDefinitions(this.collectionRef, specs);
  }
  /**
   * Lists all indexes on the collection.
   * @since v1.3.0
   */
  async listIndexes() {
    return listIndexDefinitions(this.collectionRef);
  }
  /**
   * Drops a specific index.
   * @since v1.3.0
   */
  async dropIndex(name) {
    return dropIndexDefinition(this.collectionRef, name);
  }
  /**
   * Drops all non-`_id_` indexes.
   * @since v1.3.0
   */
  async dropIndexes() {
    return dropIndexDefinitions(this.collectionRef);
  }
  /**
   * Pre-warms the findPage bookmark cache.
   * @since v1.3.0
   */
  async prewarmBookmarks(keyDims = {}, pages = []) {
    return prewarmBookmarks({
      namespace: `${this.dbName}:${this.collectionName}`,
      cache: this.management.getCache ? this.management.getCache() : this.management.cache,
      logger: this.management.logger,
      keyDims,
      pages,
      findPage: (options) => this.findPage(options)
    });
  }
  /**
   * Lists the findPage bookmark cache entries.
   * @since v1.3.0
   */
  async listBookmarks(keyDims) {
    return listBookmarks({
      namespace: `${this.dbName}:${this.collectionName}`,
      cache: this.management.getCache ? this.management.getCache() : this.management.cache,
      keyDims
    });
  }
  /**
   * Clears the findPage bookmark cache.
   * @since v1.3.0
   */
  async clearBookmarks(keyDims) {
    return clearBookmarks({
      namespace: `${this.dbName}:${this.collectionName}`,
      cache: this.management.getCache ? this.management.getCache() : this.management.cache,
      keyDims
    });
  }
  /**
   * Invalidates the cache (v1 compatible).
   * The TS version only maintains the findPage cursor cache; there is no full query cache.
   * - If `op` is `'findPage'` or unspecified, the bookmark cache is cleared.
   * - Other `op` values (`find`/`findOne`/`count`) are no-ops in the TS version and return 0.
   * @since v1.3.0
   */
  async invalidate(op) {
    return this.invalidateReadCaches(op);
  }
  /**
   * Drops the collection (v1 compatible).
   * @since v1.3.0
   */
  async dropCollection() {
    return this.collectionRef.drop();
  }
  /**
   * Creates a collection (v1 compatible).
   * @param name - Collection name; defaults to the currently bound collection name when omitted.
   * @param options - MongoDB createCollection options.
   * @since v1.3.0
   */
  async createCollection(name, options = {}) {
    const db = this.dbRef ?? this.collectionRef.db;
    const collName = name ?? this.collectionName;
    await db.createCollection(collName, options);
    return true;
  }
  /**
   * Creates a view collection (v1 compatible).
   * @param name - View name.
   * @param source - Source collection name.
   * @param pipeline - Aggregation pipeline.
   * @since v1.3.0
   */
  async createView(name, source, pipeline = []) {
    const db = this.dbRef ?? this.collectionRef.db;
    await db.createCollection(name, { viewOn: source, pipeline });
    return true;
  }
  /**
   * Returns index statistics (v1 compatible).
   * @since v1.3.0
   */
  async indexStats() {
    const cursor = this.collectionRef.aggregate([{ $indexStats: {} }]);
    return cursor.toArray();
  }
  /**
   * Sets the collection validation rules (v1 compatible).
   * @param validator - Validator object ($jsonSchema or query expression).
   * @param options - Optional validation level and action configuration.
   * @since v1.3.0
   */
  async setValidator(validator, options = {}) {
    if (validator === null || typeof validator !== "object") {
      throw new Error("Validator must be a non-null object");
    }
    const db = this.dbRef ?? this.collectionRef.db;
    const isEmptyValidator = Object.keys(validator).length === 0;
    const cmd = {
      collMod: this.collectionName,
      validator
    };
    if (options.validationLevel) {
      cmd["validationLevel"] = options.validationLevel;
    } else if (isEmptyValidator) {
      cmd["validationLevel"] = "strict";
      cmd["validationAction"] = "error";
    }
    if (options.validationAction) cmd["validationAction"] = options.validationAction;
    const result = await db.command(cmd);
    return { ok: result["ok"], collection: this.collectionName };
  }
  /**
   * Sets the collection validation level (v1 compatible).
   * @param level - Validation level: `'off'` | `'strict'` | `'moderate'`.
   * @since v1.3.0
   */
  async setValidationLevel(level) {
    if (typeof level !== "string" || !["off", "strict", "moderate"].includes(level)) {
      throw new Error('Invalid validation level: must be "off", "strict", or "moderate"');
    }
    const db = this.dbRef ?? this.collectionRef.db;
    const result = await db.command({ collMod: this.collectionName, validationLevel: level });
    return { ok: result["ok"], validationLevel: level };
  }
  /**
   * Sets the collection validation action (v1 compatible).
   * @param action - Validation action: `'error'` | `'warn'`.
   * @since v1.3.0
   */
  async setValidationAction(action) {
    if (typeof action !== "string" || !["error", "warn"].includes(action)) {
      throw new Error('Invalid validation action: must be "error" or "warn"');
    }
    const db = this.dbRef ?? this.collectionRef.db;
    const result = await db.command({ collMod: this.collectionName, validationAction: action });
    return { ok: result["ok"], validationAction: action };
  }
  /**
   * Returns the collection validation configuration (v1 compatible).
   * @returns The validator, validation level, and validation action.
   * @since v1.3.0
   */
  async getValidator() {
    const db = this.dbRef ?? this.collectionRef.db;
    const cursor = db.listCollections({ name: this.collectionName });
    const collections = await cursor.toArray();
    const info = collections[0];
    return {
      validator: info?.options?.["validator"] ?? null,
      validationLevel: info?.options?.["validationLevel"] ?? "strict",
      validationAction: info?.options?.["validationAction"] ?? "error"
    };
  }
  /**
   * Returns collection statistics (v1 compatible; uses $collStats aggregation).
   * The collStats command was removed in MongoDB 7.x and must be replaced with an aggregation pipeline.
   * @param options - Optional scale factor (bytes/1 = default).
   * @since v1.3.0
   */
  async stats(options = {}) {
    const scale = options.scale ?? 1;
    const pipeline = [{ $collStats: { storageStats: { scale }, count: {} } }];
    const cursor = this.collectionRef.aggregate(pipeline);
    const results = await cursor.toArray();
    const raw = results[0] ?? {};
    const storage = raw["storageStats"] ?? {};
    return {
      ns: raw["ns"] ?? `${this.dbName}.${this.collectionName}`,
      count: storage["count"] ?? 0,
      size: storage["size"] ?? 0,
      storageSize: storage["storageSize"] ?? 0,
      totalIndexSize: storage["totalIndexSize"] ?? 0,
      nindexes: storage["nindexes"] ?? 0,
      avgObjSize: storage["avgObjSize"],
      scaleFactor: storage["scaleFactor"] ?? scale
    };
  }
  /**
   * Renames the collection (v1-compat).
   * @param newName - New collection name.
   * @param options - Optional options (dropTarget: whether to overwrite an existing collection with the new name).
   * @since v1.3.0
   */
  async renameCollection(newName, options = {}) {
    if (!newName || typeof newName !== "string") {
      throw new Error("New collection name is required and must be a non-empty string");
    }
    await this.collectionRef.rename(newName, {
      dropTarget: options.dropTarget ?? false
    });
    return { renamed: true, from: this.collectionName, to: newName };
  }
  /**
   * Modifies collection properties (v1-compat).
   * @param modifications - Object containing the collection property modifications.
   * @since v1.3.0
   */
  async collMod(modifications) {
    if (modifications === null || typeof modifications !== "object") {
      throw new Error("Modifications must be a non-null object");
    }
    const db = this.dbRef ?? this.collectionRef.db;
    const result = await db.command({
      collMod: this.collectionName,
      ...modifications
    });
    return result;
  }
  /**
   * Converts the collection to a fixed-size capped collection (v1-compat).
   * @param size - Maximum byte size of the collection (must be a positive integer).
   * @param options - Optional options (max: maximum document count).
   * @since v1.3.0
   */
  async convertToCapped(size, options = {}) {
    if (typeof size !== "number") {
      throw new Error("Size must be a number");
    }
    if (size <= 0) {
      throw new Error("Size must be a positive number");
    }
    const db = this.dbRef ?? this.collectionRef.db;
    const cmd = { convertToCapped: this.collectionName, size };
    if (options.max !== void 0) cmd["max"] = options.max;
    const result = await db.command(cmd);
    return {
      ok: result["ok"],
      collection: this.collectionName,
      capped: true,
      size
    };
  }
};
var MongoDbAccessor = class {
  constructor(dbName, dbRef, management = {}) {
    this.dbName = dbName;
    this.dbRef = dbRef;
    this.management = management;
  }
  /**
   * Returns the collection accessor.
   * @since v1.3.0
   */
  collection(name) {
    return new MongoCollectionAccessor(
      this.dbName,
      name,
      this.dbRef.collection(name),
      this.management,
      this.dbRef
    );
  }
  /**
   * Returns the native MongoDB Db instance.
   * @since v1.3.0
   */
  raw() {
    return this.dbRef;
  }
  /**
   * Returns the database-level admin façade.
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
  /**
   * Lists all databases (v1-compat).
   * @since v1.3.0
   */
  async listDatabases(options = {}) {
    const admin = this.dbRef.admin();
    const result = await admin.listDatabases();
    if (options.nameOnly) {
      return result.databases.map((db) => db.name);
    }
    return result.databases.map((db) => ({
      name: db.name,
      sizeOnDisk: db.sizeOnDisk ?? 0,
      empty: db.empty ?? false
    }));
  }
  /**
   * Drops the current database (v1-compat; requires confirm: true).
   * @since v1.3.0
   */
  async dropDatabase(options = { confirm: false }) {
    if (!options.confirm) {
      const err = new Error(
        "dropDatabase requires explicit confirmation. Pass { confirm: true } to proceed.\n\n\u26A0\uFE0F  WARNING: This will DELETE ALL DATA in the database!\n\u26A0\uFE0F  This operation CANNOT BE UNDONE!"
      );
      err.code = "CONFIRMATION_REQUIRED";
      throw err;
    }
    const isProduction = process.env["NODE_ENV"] === "production";
    if (isProduction && !options.allowProduction) {
      const err = new Error("dropDatabase is blocked in production. Pass { allowProduction: true } to override.");
      err.code = "PRODUCTION_BLOCKED";
      throw err;
    }
    this.management.logger?.warn?.("[dropDatabase]", { database: this.dbName, user: options.user ?? "unknown" });
    await this.dbRef.dropDatabase();
    return { dropped: true, database: this.dbName, timestamp: /* @__PURE__ */ new Date() };
  }
  /**
   * Lists all collections in the current database (v1-compat).
   * @since v1.3.0
   */
  async listCollections(filter = {}, options = {}) {
    const cursor = this.dbRef.listCollections(filter, options);
    return cursor.toArray();
  }
  /**
   * Executes a raw database command (v1-compat).
   * @since v1.3.0
   */
  async runCommand(command, options = {}) {
    return this.dbRef.command(command, options);
  }
};

// src/entry/runtime-core.ts
import { EventEmitter } from "node:events";
import { performance } from "node:perf_hooks";

// src/capabilities/cache/index.ts
import { MemoryCache as HubMemoryCache } from "cache-hub";
var MemoryCache = class _MemoryCache {
  constructor(options = {}) {
    this._lockManager = null;
    this._calls = 0;
    const { maxSize, ...rest } = options;
    this._hub = new HubMemoryCache({
      ...rest,
      // v1 uses maxSize, cache-hub uses maxEntries — map for compat
      maxEntries: rest.maxEntries ?? maxSize
    });
  }
  /**
   * Set the cache lock manager.
   * @since v1.3.0
   */
  setLockManager(lockManager) {
    this._lockManager = lockManager;
  }
  /**
   * Get the cache lock manager.
   * @since v1.3.0
   */
  getLockManager() {
    return this._lockManager;
  }
  /**
   * Get a cached value. Every call is counted in `calls` stats.
   * @since v1.3.0
   */
  get(key) {
    this._calls += 1;
    return this._hub.get(key);
  }
  /**
   * Write a cached value. Returns false if the key is locked by the lock manager.
   * @since v1.3.0
   */
  set(key, value, ttl = 0) {
    if (this._lockManager?.isLocked(key)) {
      return false;
    }
    this._hub.set(key, value, ttl);
    return true;
  }
  /**
   * Delete a cached value.
   * @since v1.3.0
   */
  delete(key) {
    return this._hub.del(key);
  }
  /**
   * Alias for `delete()`.
   * @since v1.3.0
   */
  del(key) {
    return this.delete(key);
  }
  /**
   * Check whether a cache key exists (also counted in calls stats).
   * @since v1.3.0
   */
  exists(key) {
    return this._hub.exists(key);
  }
  /**
   * Read multiple cache entries (each key is counted in calls stats).
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
   * Write multiple cache entries (each key is checked against the lock manager).
   * @since v1.3.0
   */
  setMany(values, ttl = 0) {
    for (const [key, value] of Object.entries(values)) {
      this.set(key, value, ttl);
    }
    return true;
  }
  /**
   * Delete multiple cache entries.
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
   * Clear the cache.
   * @since v1.3.0
   */
  clear() {
    this._hub.clear();
  }
  /**
   * List cache keys matching a wildcard pattern.
   * @since v1.3.0
   */
  keys(pattern = "*") {
    return this._hub.keys(pattern);
  }
  /**
   * Delete cache keys matching a wildcard pattern.
   * @since v1.3.0
   */
  delPattern(pattern = "*") {
    return this._hub.delPattern(pattern);
  }
  /**
   * Get cache statistics (including the `calls` field required by v1).
   * @since v1.3.0
   */
  getStats() {
    const s = this._hub.getStats();
    const calls = this._calls;
    return {
      hits: s.hits,
      misses: s.misses,
      calls,
      hitRate: calls > 0 ? s.hits / calls : 0,
      sets: s.sets,
      deletes: s.deletes,
      evictions: s.evictions,
      size: s.entries,
      memoryUsage: s.memoryUsage,
      memoryUsageMB: s.memoryUsageMB
    };
  }
  /**
   * Reset cache statistics (including calls).
   * @since v1.3.0
   */
  resetStats() {
    this._hub.resetStats();
    this._calls = 0;
  }
  /**
   * Get or create a cache instance.
   * @since v1.3.0
   */
  static getOrCreateCache(cache) {
    return cache instanceof _MemoryCache ? cache : new _MemoryCache(cache);
  }
};
function createRedisCacheAdapter(redisUrlOrInstance, adapterOptions = {}) {
  const { client, prefix, ownsConnection } = resolveRedisClient(redisUrlOrInstance, adapterOptions);
  const withPrefix = (key) => `${prefix}${key}`;
  const stripPrefix = (key) => key.startsWith(prefix) ? key.slice(prefix.length) : key;
  const getValue = async (key) => {
    const value = await Promise.resolve(client.get(withPrefix(key)));
    if (value === null || value === void 0) {
      return null;
    }
    try {
      return JSON.parse(String(value));
    } catch {
      return null;
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
    this._ownsConnections = false;
    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      invalidationsTriggered: 0,
      errors: 0
    };
    if (!options.cache) {
      throw createError(ErrorCodes.INVALID_CONFIG, "DistributedCacheInvalidator requires a cache instance");
    }
    this.channel = options.channel ?? "monsqlize:cache:invalidate";
    this.instanceId = options.instanceId ?? `instance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.logger = options.logger;
    const cache = options.cache;
    if ("local" in cache || "remote" in cache) {
      const scopedCache = options.cache;
      this.local = scopedCache.local;
      this.remote = scopedCache.remote;
    } else {
      this.local = options.cache;
    }
    if (options.redis) {
      this.pub = options.redis;
      this.sub = options.redis;
      this._ownsConnections = false;
    } else if (options.redisUrl) {
      const IoRedis = __require("ioredis");
      this.pub = new IoRedis(options.redisUrl);
      this.sub = new IoRedis(options.redisUrl);
      this._ownsConnections = true;
    } else {
      this.pub = options.pub;
      this.sub = options.sub;
    }
    if (this.pub && this.pub.on) {
      this.pub.on("error", (err) => {
        this.stats.errors++;
        this.logger?.error?.("[DistributedCacheInvalidator] Redis pub error:", err.message);
      });
    }
    if (this.sub && this.sub !== this.pub && this.sub.on) {
      this.sub.on("error", (err) => {
        this.stats.errors++;
        this.logger?.error?.("[DistributedCacheInvalidator] Redis sub error:", err.message);
      });
    }
    if (this.sub) {
      this._setupSubscription();
    }
  }
  _setupSubscription() {
    this.sub.subscribe(this.channel, (err) => {
      if (err) {
        this.stats.errors++;
        this.logger?.error?.("[DistributedCacheInvalidator] Subscribe error:", err.message);
      } else {
        this.logger?.info?.(`[DistributedCacheInvalidator] Subscribed to channel: ${this.channel}`);
      }
    });
    this.sub.on("message", async (channel, message) => {
      if (channel !== this.channel) return;
      this.stats.messagesReceived++;
      try {
        const data = JSON.parse(message);
        if (data.instanceId === this.instanceId) return;
        if (data.type === "invalidate" && data.pattern) {
          await this._handleInvalidation(data.pattern);
        }
      } catch (error) {
        this.stats.errors++;
        this.logger?.error?.("[DistributedCacheInvalidator] Message parse error:", error.message);
      }
    });
  }
  async _handleInvalidation(pattern) {
    try {
      if (this.local?.delPattern) {
        const localDeleted = Number(await Promise.resolve(this.local.delPattern(pattern)));
        this.logger?.debug?.(`[DistributedCacheInvalidator] Invalidated local cache: ${pattern}, deleted: ${localDeleted} keys`);
      }
      if (this.remote?.delPattern) {
        const remoteDeleted = Number(await Promise.resolve(this.remote.delPattern(pattern)));
        this.logger?.debug?.(`[DistributedCacheInvalidator] Invalidated remote cache: ${pattern}, deleted: ${remoteDeleted} keys`);
      }
      this.stats.invalidationsTriggered++;
    } catch (error) {
      this.stats.errors++;
      this.logger?.error?.("[DistributedCacheInvalidator] Invalidation error:", error.message);
    }
  }
  /**
   * Broadcast a cache invalidation message to other instances.
   * Only publishes — local cache of the sending instance is NOT cleared here.
   * (Cache clearing happens in _handleInvalidation when OTHER instances receive the message.)
   */
  async invalidate(pattern) {
    if (!pattern) return;
    await this._handleInvalidation(pattern);
    if (!this.pub) return;
    const message = JSON.stringify({
      type: "invalidate",
      pattern,
      instanceId: this.instanceId,
      timestamp: Date.now()
    });
    try {
      await Promise.resolve(this.pub.publish(this.channel, message));
      this.stats.messagesSent++;
      this.logger?.debug?.(`[DistributedCacheInvalidator] Published invalidation: ${pattern}`);
    } catch (error) {
      this.stats.errors++;
      this.logger?.error?.("[DistributedCacheInvalidator] Publish error:", error.message);
      throw error;
    }
  }
  /**
   * Manually handle a message from the subscription channel (for external message routing).
   */
  async handleMessage(channel, message) {
    if (channel !== this.channel) return;
    this.stats.messagesReceived++;
    try {
      const data = JSON.parse(message);
      if (data.instanceId === this.instanceId || data.type !== "invalidate" || !data.pattern) return;
      await this._handleInvalidation(data.pattern);
    } catch (cause) {
      this.stats.errors++;
      this.logger?.error?.("[DistributedCacheInvalidator] Failed to parse message", cause);
    }
  }
  getStats() {
    return {
      ...this.stats,
      channel: this.channel,
      instanceId: this.instanceId
    };
  }
  async close() {
    try {
      if (this.sub?.unsubscribe) {
        await Promise.resolve(this.sub.unsubscribe(this.channel));
      }
      if (this.pub?.quit) {
        await Promise.resolve(this.pub.quit());
      }
      if (this.sub?.quit) {
        await Promise.resolve(this.sub.quit());
      }
      this.logger?.info?.("[DistributedCacheInvalidator] Closed");
    } catch (error) {
      this.logger?.error?.("[DistributedCacheInvalidator] Close error:", error.message);
    }
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

// src/capabilities/function-cache/index.ts
import { createHash as createHash2 } from "node:crypto";
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
  if (typeof ttl !== "number" || ttl < 0) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "withCache: ttl must be a non-negative number.");
  }
  if (keyBuilder && typeof keyBuilder !== "function") {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "withCache: keyBuilder must be a function.");
  }
  if (condition && typeof condition !== "function") {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "withCache: condition must be a function.");
  }
  if (typeof cache.get !== "function" || typeof cache.set !== "function") {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "withCache: Invalid cache instance: must implement CacheLike interface");
  }
  const stats = {
    hits: 0,
    misses: 0,
    errors: 0,
    calls: 0,
    totalTime: 0
  };
  const wrapped = (async (...args) => {
    const startedAt = Date.now();
    let cacheKey;
    try {
      const baseKey = keyBuilder ? `${namespace}:${keyBuilder(...args)}` : `${namespace}:${fn.name || "anonymous"}:${stableStringify2(args)}`;
      if (baseKey.length > 1024) {
        const hash2 = createHash2("sha256").update(baseKey).digest("hex");
        cacheKey = `${namespace}:${fn.name || "anonymous"}:hash:${hash2}`;
      } else {
        cacheKey = baseKey;
      }
    } catch {
      if (enableStats) stats.errors += 1;
      return fn(...args);
    }
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
        let shouldCache = true;
        if (condition) {
          try {
            shouldCache = condition(result);
          } catch {
            if (enableStats) stats.errors += 1;
            shouldCache = true;
          }
        }
        if (shouldCache) {
          try {
            await Promise.resolve(cache.set(cacheKey, result, ttl));
          } catch {
            if (enableStats) stats.errors += 1;
          }
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
    let cacheKey;
    try {
      const baseKey = keyBuilder ? `${namespace}:${keyBuilder(...args)}` : `${namespace}:${fn.name || "anonymous"}:${stableStringify2(args)}`;
      if (baseKey.length > 1024) {
        const hash2 = createHash2("sha256").update(baseKey).digest("hex");
        cacheKey = `${namespace}:${fn.name || "anonymous"}:hash:${hash2}`;
      } else {
        cacheKey = baseKey;
      }
    } catch {
      return false;
    }
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
    this.functions = /* @__PURE__ */ new Map();
    if (options !== null && typeof options !== "object") {
      throw new Error("options must be an object");
    }
    const namespace = options.namespace;
    if (namespace !== void 0 && typeof namespace !== "string") {
      throw new Error("namespace must be a string");
    }
    this.options = options;
    this.cache = resolveCache(cacheOrDb);
    if ((this.options.defaultTTL ?? 6e4) < 0) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "FunctionCache: defaultTTL must be a non-negative number.");
    }
  }
  /**
   * Register a cacheable async function.
   *
   * @template {unknown[]} TArgs
   * @template TResult
   * @param {string} name - Registration name; accessed later via `execute()` / `invalidate()`.
   * @param {(...args: TArgs) => Promise<TResult>} fn - The original async function.
   * @param {WithCacheOptions} [options={}] - Per-function local cache configuration.
   * @returns {void}
   * @throws {Error} Throws an argument error when the name is empty.
   * @since v1.3.0
   */
  register(name, fn, options = {}) {
    if (!name?.trim()) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "Function name must be a non-empty string");
    }
    if (typeof fn !== "function") {
      throw new Error("fn must be a function");
    }
    if (options && typeof options !== "object") {
      throw new Error("options must be an object");
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
   * Execute a registered function.
   *
   * @param {string} name - Name of the registered function.
   * @param {...unknown[]} args - Arguments to pass to the original function.
   * @returns {Promise<unknown>} Returns the result from the original function or a cache hit.
   * @throws {Error} Throws `FUNCTION_NOT_REGISTERED` when the function is not registered.
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
   * Invalidate the cached result for a registered function under the given arguments.
   *
   * @param {string} name - Name of the registered function.
   * @param {...unknown[]} args - Original function arguments used to reconstruct the cache key.
   * @returns {Promise<boolean>} Returns `true` when the cache entry was successfully deleted.
   * @throws {Error} Throws `FUNCTION_NOT_REGISTERED` when the function is not registered.
   * @since v1.3.0
   */
  async invalidate(name, ...args) {
    if (!name || typeof name !== "string") {
      throw new Error("Function name must be a non-empty string");
    }
    const fn = this.functions.get(name);
    if (!fn) {
      throw createError("FUNCTION_NOT_REGISTERED", `Function not registered: ${name}`);
    }
    return fn.invalidate(...args);
  }
  /**
   * Bulk-invalidate cache keys under the current namespace matching a pattern.
   *
   * @param {string} pattern - Wildcard pattern; the namespace prefix is prepended automatically when absent.
   * @returns {Promise<number>} Number of cache keys actually deleted.
   * @throws {Error} Throws an argument error when the pattern is empty.
   * @since v1.3.0
   */
  async invalidatePattern(pattern) {
    if (!pattern?.trim()) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "Pattern must be a non-empty string");
    }
    return Number(await Promise.resolve(this.cache.delPattern?.(`${this.options.namespace ?? "action"}:${pattern}`) ?? 0));
  }
  /**
   * Get statistics.
   *
   * @param {string} [name] - When provided, returns stats for that specific registered function only; otherwise returns all.
   * @returns {Record<string, unknown>} Statistics object.
   * @since v1.3.0
   */
  getStats(name) {
    if (name) {
      if (this.options.enableStats === false) return null;
      const stats = this.functions.get(name)?.getCacheStats();
      return stats ? { ...stats } : null;
    }
    return Object.fromEntries(
      [...this.functions.entries()].map(([functionName, fn]) => [functionName, fn.getCacheStats()])
    );
  }
  /**
   * List all registered function names.
   *
   * @returns {string[]}
   * @since v1.3.0
   */
  list() {
    return [...this.functions.keys()];
  }
  /**
   * Reset statistics for one or all registered functions.
   *
   * @param {string} [name] - When provided, resets only the specified function; otherwise resets all.
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
   * Clear all registered function definitions.
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
function stableStringify2(value, _seen = /* @__PURE__ */ new WeakSet()) {
  if (typeof value === "function" || typeof value === "symbol") {
    return JSON.stringify("[UNSUPPORTED]");
  }
  if (typeof value === "number" && Number.isNaN(value)) {
    return JSON.stringify("NaN");
  }
  if (value instanceof RegExp) {
    return JSON.stringify(value.toString());
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify2(item, _seen)).join(",")}]`;
  }
  if (_seen.has(value)) {
    return JSON.stringify("[CIRCULAR]");
  }
  _seen.add(value);
  const keys = Object.keys(value).sort();
  const result = `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify2(value[k], _seen)}`).join(",")}}`;
  _seen.delete(value);
  return result;
}

// src/capabilities/lock/index.ts
import { randomUUID } from "node:crypto";
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
   * Release the lock.
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
   * Renew the lock.
   * @since v1.4.0
   */
  async renew(ttl) {
    if (this.released) {
      return false;
    }
    return this.manager.renewLock(this.key, this.lockId, ttl ?? this.ttl);
  }
  /**
   * Check whether the lock is still held.
   * @since v1.4.0
   */
  isHeld() {
    return !this.released;
  }
  /**
   * Get the duration the lock has been held.
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
   * Automatically manage the business lock lifecycle.
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
   * Acquire a lock (blocking with retries).
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
      await sleep2(delay);
    }
    this.stats.errors += 1;
    if (options.fallbackToNoLock) {
      this.logger?.warn?.(`[LockManager] fallback to no-lock execution for ${key}`);
      return new Lock(this.normalizeKey(key), `noop:${randomUUID()}`, new NoopLockManager(), options.ttl ?? 1e4);
    }
    throw new LockTimeoutError(`Failed to acquire lock for key '${key}' within retry budget.`);
  }
  /**
   * Try to acquire a lock (non-blocking).
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
    const lockId = randomUUID();
    globalStore.set(normalizedKey, {
      lockId,
      expiresAt: Date.now() + ttl
    });
    this.stats.locksAcquired += 1;
    this.logger?.debug?.(`[LockManager] acquired ${normalizedKey}`);
    return new Lock(normalizedKey, lockId, this, ttl);
  }
  /**
   * Check whether a lock exists.
   * @since v1.4.0
   */
  isLocked(key) {
    this.cleanupExpiredLocks();
    this.stats.lockChecks += 1;
    return globalStore.has(this.normalizeKey(key));
  }
  /**
   * Release a lock.
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
   * Renew a lock.
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
   * Get lock statistics.
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
   * Clear all locks (primarily for testing).
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
   * Close the lock manager.
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
async function sleep2(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// src/capabilities/model/index.ts
var _schemaDslFn = null;
var _schemaValidateFn = null;
try {
  const mod = __require("schema-dsl");
  _schemaDslFn = mod.dsl;
  _schemaValidateFn = mod.validate;
} catch {
}
var KNOWN_SCHEMA_BASE_TYPES = /* @__PURE__ */ new Set([
  "string",
  "number",
  "boolean",
  "integer",
  "float",
  "int",
  "double",
  "decimal",
  "date",
  "objectid",
  "uuid",
  "email",
  "url",
  "buffer",
  "binary",
  "object",
  "array",
  "any",
  "mixed",
  "null"
]);
function _extractBaseType(typeStr) {
  const m = typeStr.match(/^[a-zA-Z_]+/);
  return m ? m[0].toLowerCase() : "";
}
function _makeValidatingDslFn(realDsl) {
  const validating = function validatingDsl(fields) {
    if (fields && typeof fields === "object") {
      for (const [field, spec] of Object.entries(fields)) {
        if (typeof spec === "string") {
          if (spec.includes("|")) {
            continue;
          }
          const base = _extractBaseType(spec);
          if (base && !KNOWN_SCHEMA_BASE_TYPES.has(base)) {
            throw new TypeError(
              `[schema] Invalid type "${base}" in field "${field}". Known types: ${[...KNOWN_SCHEMA_BASE_TYPES].join(", ")}.`
            );
          }
        }
      }
    }
    return realDsl(fields);
  };
  return validating;
}
var _a3;
_a3 = Symbol.toStringTag;
var _PopulatePromise = class _PopulatePromise {
  constructor(executor, paths = []) {
    this.executor = executor;
    this.paths = paths;
    this[_a3] = "Promise";
  }
  populate(path2, options) {
    const config = typeof path2 === "string" ? { path: path2, ...options } : { ...path2, ...options };
    return new _PopulatePromise(this.executor, [...this.paths, config]);
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
  static {
    this._redefinedNames = /* @__PURE__ */ new Set();
  }
  static define(collectionName, definition) {
    const normalizedName = validateCollectionName(collectionName);
    if (this.registry.has(normalizedName)) {
      throw createError(ErrorCodes.MODEL_ALREADY_EXISTS, `Model '${normalizedName}' is already defined.`);
    }
    validateDefinition(definition);
    processTimestamps(definition);
    if (_schemaDslFn !== null && typeof definition.schema === "function") {
      const validatingDsl = _makeValidatingDslFn(_schemaDslFn);
      try {
        definition.schema(validatingDsl);
      } catch (err) {
        if (err instanceof TypeError && err.message.includes("[schema] Invalid type")) {
          throw err;
        }
      }
    }
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
    const normalizedName = validateCollectionName(collectionName);
    this.registry.delete(normalizedName);
    validateDefinition(definition);
    processTimestamps(definition);
    this._redefinedNames.add(normalizedName);
    this.registry.set(normalizedName, {
      collectionName: normalizedName,
      definition
    });
    this.bumpRevision(normalizedName);
  }
  static _clear() {
    const names = [...this.registry.keys()];
    for (const name of names) {
      this._redefinedNames.add(name);
      this.bumpRevision(name);
    }
    this.registry.clear();
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
    // ── v1 compatibility private state ──────────────────────────────────────────
    this._schemaCache = null;
    this._schemaError = null;
    this._validateEnabled = true;
    // true = validate on insert; false = skip globally
    this._timestampsConfig = null;
    this._softDeleteConfig = null;
    this._versionConfig = null;
    this._v1HooksFactory = null;
    this._v1InstanceMethods = {};
    // Expose softDeleteConfig for v1 test assertions
    this.softDeleteConfig = null;
    this.collectionName = options.collectionName;
    this.dbName = options.dbName;
    this.poolName = options.poolName;
    this.definition = options.definition;
    this.relations = new Map(Object.entries(options.definition.relations ?? {}));
    for (const [name, config] of this.relations) {
      validateRelationConfig(name, config);
    }
    if (typeof options.definition.methods !== "function") {
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
    if (_schemaDslFn !== null && typeof options.definition.schema === "function") {
      const validatingDsl = _makeValidatingDslFn(_schemaDslFn);
      try {
        this._schemaCache = options.definition.schema.call(
          options.definition,
          validatingDsl
        );
      } catch (err) {
        this._schemaCache = null;
        this._schemaError = err instanceof Error ? err : new Error(String(err));
        if (err instanceof TypeError && err.message.includes("[schema] Invalid type")) {
          throw err;
        }
      }
    }
    const validateOpt = options.definition.options?.validate;
    if (validateOpt === false) this._validateEnabled = false;
    const tsOpts = options.definition.options?.timestamps;
    if (tsOpts && tsOpts !== false) {
      if (tsOpts === true) {
        this._timestampsConfig = { createdAt: "createdAt", updatedAt: "updatedAt" };
      } else if (typeof tsOpts === "object") {
        const ca = tsOpts.createdAt;
        const ua = tsOpts.updatedAt;
        this._timestampsConfig = {
          createdAt: ca === false ? false : typeof ca === "string" ? ca : "createdAt",
          updatedAt: ua === false ? false : typeof ua === "string" ? ua : "updatedAt"
        };
      }
    }
    const sdOpts = options.definition.options?.softDelete;
    if (sdOpts) {
      this._softDeleteConfig = sdOpts === true ? { enabled: true, field: "deletedAt", type: "timestamp", ttl: null } : {
        enabled: sdOpts.enabled !== false,
        field: sdOpts.field ?? "deletedAt",
        type: sdOpts.type ?? "timestamp",
        ttl: sdOpts.ttl ?? null
      };
      this.softDeleteConfig = this._softDeleteConfig;
      if (this._softDeleteConfig.enabled && this._softDeleteConfig.type === "timestamp" && this._softDeleteConfig.ttl) {
        const sd = this._softDeleteConfig;
        setImmediate(() => {
          this.collection.createIndex({ [sd.field]: 1 }, { expireAfterSeconds: sd.ttl }).catch(() => {
          });
        });
      }
    }
    const vOpts = options.definition.options?.version;
    if (vOpts) {
      this._versionConfig = vOpts === true ? { enabled: true, field: "version" } : { enabled: vOpts.enabled !== false, field: vOpts.field ?? "version" };
    }
    if (typeof options.definition.hooks === "function") {
      this._v1HooksFactory = options.definition.hooks;
    }
    const definedIndexes = options.definition.indexes;
    if (Array.isArray(definedIndexes) && definedIndexes.length > 0) {
      setImmediate(() => {
        for (const idxSpec of definedIndexes) {
          if (!idxSpec?.key) continue;
          const { key, ...idxOpts } = idxSpec;
          this.collection.createIndex(key, idxOpts).catch(() => {
          });
        }
      });
    }
    if (typeof options.definition.methods === "function") {
      try {
        const methodsFactory = options.definition.methods;
        const customMethods = methodsFactory(this);
        this._v1InstanceMethods = customMethods.instance ?? {};
        for (const [name, fn] of Object.entries(customMethods.static ?? {})) {
          if (typeof fn === "function" && !(name in this)) {
            Object.defineProperty(this, name, {
              configurable: true,
              enumerable: false,
              writable: false,
              value: (...args) => fn.apply(this, args)
            });
          }
        }
      } catch {
        this._v1InstanceMethods = {};
      }
    }
  }
  /** v1 compat: expose relations map as _relations */
  get _relations() {
    return this.relations;
  }
  /** v1 compat: get relations as plain object */
  getRelations() {
    return Object.fromEntries(this.relations);
  }
  /** v1 compat: get enums from definition */
  getEnums() {
    return this.definition.enums ?? {};
  }
  getNamespace() {
    return this.collection.getNamespace();
  }
  raw() {
    return this.collection.raw();
  }
  // ── v1 hooks helpers ──────────────────────────────────────────────────────────
  _v1GetOpType(method) {
    if (/^(find|count|distinct|aggregate)/i.test(method)) return "find";
    if (/^insert/i.test(method)) return "insert";
    if (/^(update|replace|upsert|findOneAnd(Update|Replace)|increment)/i.test(method)) return "update";
    if (/^(delete|findOneAndDelete)/i.test(method)) return "delete";
    return "find";
  }
  async _runV1Hook(opType, phase, ctx, ...args) {
    if (!this._v1HooksFactory) return void 0;
    const hooks = this._v1HooksFactory(this);
    const opHooks = hooks[opType];
    if (!opHooks) return void 0;
    const hookFn = opHooks[phase];
    if (typeof hookFn !== "function") return void 0;
    return hookFn(ctx, ...args);
  }
  // ── v1 schema validation ──────────────────────────────────────────────────────
  async _validateDoc(doc, opts) {
    if (!this._validateEnabled) return;
    if (opts?.skipValidation) return;
    if (!this._schemaCache || !_schemaValidateFn) return;
    const result = _schemaValidateFn(this._schemaCache, doc);
    if (!result.valid) {
      const errors = result.errors ?? [];
      const fields = [...new Set(errors.map((e) => e.path ?? e.field).filter(Boolean))];
      const summary = fields.length > 0 ? ` (${fields.join(", ")})` : "";
      const err = createError(ErrorCodes.VALIDATION_ERROR, `Schema validation failed${summary}`);
      err.errors = errors;
      throw err;
    }
  }
  // ── v1 soft-delete filter ─────────────────────────────────────────────────────
  _applySoftDeleteFilter(query, options) {
    const sd = this._softDeleteConfig;
    if (!sd || !sd.enabled) return query ?? {};
    const opts = options ?? {};
    const q = query ?? {};
    if (q[sd.field] !== void 0) return q;
    if (opts.withDeleted) return q;
    if (opts.onlyDeleted) return { ...q, [sd.field]: { $ne: null } };
    return { ...q, [sd.field]: null };
  }
  // ── timestamps helpers ────────────────────────────────────────────────────────
  _nowDate() {
    return /* @__PURE__ */ new Date();
  }
  _applyInsertTimestamps(doc) {
    const ts = this._timestampsConfig;
    if (!ts) return doc;
    const now = this._nowDate();
    const result = { ...doc };
    if (ts.createdAt !== false && result[ts.createdAt] === void 0) result[ts.createdAt] = now;
    if (ts.updatedAt !== false && result[ts.updatedAt] === void 0) result[ts.updatedAt] = now;
    return result;
  }
  _applyUpdateTimestamps(update) {
    const ts = this._timestampsConfig;
    if (!ts || ts.updatedAt === false) return update;
    const u = update ?? {};
    const $set = { ...u["$set"] ?? {}, [ts.updatedAt]: this._nowDate() };
    return { ...u, $set };
  }
  _applyVersionIncrement(update) {
    const vc = this._versionConfig;
    if (!vc?.enabled) return update;
    const u = update ?? {};
    const $inc = u["$inc"] ?? {};
    if ($inc[vc.field] !== void 0) return update;
    return { ...u, $inc: { ...$inc, [vc.field]: 1 } };
  }
  _applyUpsertTimestamps(update) {
    const ts = this._timestampsConfig;
    if (!ts) return update;
    const u = update ?? {};
    const result = { ...u };
    if (ts.updatedAt !== false) {
      const $set = { ...u["$set"] ?? {}, [ts.updatedAt]: this._nowDate() };
      result["$set"] = $set;
    }
    if (ts.createdAt !== false) {
      const $setOnInsert = { ...u["$setOnInsert"] ?? {} };
      if ($setOnInsert[ts.createdAt] === void 0) $setOnInsert[ts.createdAt] = this._nowDate();
      result["$setOnInsert"] = $setOnInsert;
    }
    return result;
  }
  _applyReplaceTimestamps(replacement) {
    const ts = this._timestampsConfig;
    if (!ts || ts.updatedAt === false) return replacement;
    const r = replacement ?? {};
    if (r[ts.updatedAt] !== void 0) return r;
    return { ...r, [ts.updatedAt]: this._nowDate() };
  }
  // ── public API ────────────────────────────────────────────────────────────────
  find(query, options) {
    return new PopulatePromise(async (paths) => {
      const ctx = {};
      const filteredQuery = this._applySoftDeleteFilter(query, options);
      if (this._v1HooksFactory) {
        await this._runV1Hook("find", "before", ctx, options);
      } else {
        await this.runHook("beforeFind", { operation: "find", collection: this.collectionName, filter: filteredQuery });
      }
      const docs = await this.collection.find(filteredQuery, options);
      let result = await this.populateDocuments(this.hydrateDocuments(docs), paths);
      if (this._v1HooksFactory) {
        try {
          const hookResult = await this._runV1Hook("find", "after", ctx, result);
          if (hookResult !== void 0) result = hookResult;
        } catch {
        }
      } else {
        await this.runHook("afterFind", { operation: "find", collection: this.collectionName, filter: filteredQuery, result });
      }
      return result;
    });
  }
  findOne(query, options) {
    return new PopulatePromise(async (paths) => {
      const ctx = {};
      const filteredQuery = this._applySoftDeleteFilter(query, options);
      if (this._v1HooksFactory) {
        await this._runV1Hook("find", "before", ctx, options);
      }
      const doc = await this.collection.findOne(filteredQuery, options);
      let result = await this.populateSingle(this.hydrateDocument(doc), paths);
      if (this._v1HooksFactory) {
        try {
          const hookResult = await this._runV1Hook("find", "after", ctx, result);
          if (hookResult !== void 0) result = hookResult;
        } catch {
        }
      }
      return result;
    });
  }
  findOneById(id, options) {
    return new PopulatePromise(async (paths) => {
      const doc = await this.collection.findOneById(id, options);
      return this.populateSingle(this.hydrateDocument(doc), paths);
    });
  }
  findById(id, options) {
    return this.findOneById(id, options);
  }
  findByIds(ids, options) {
    return new PopulatePromise(async (paths) => {
      const docs = await this.collection.findByIds(ids, options);
      return this.populateDocuments(this.hydrateDocuments(docs), paths);
    });
  }
  findPage(options) {
    return new PopulatePromise(async (paths) => {
      const result = await this.collection.findPage(options);
      return {
        ...result,
        items: await this.populateDocuments(this.hydrateDocuments(result.items), paths)
      };
    });
  }
  findAndCount(query, options) {
    return new PopulatePromise(async (paths) => {
      const filteredQuery = this._applySoftDeleteFilter(query, options);
      const result = await this.collection.findAndCount(filteredQuery, options);
      return {
        data: await this.populateDocuments(this.hydrateDocuments(result.data), paths),
        total: result.total
      };
    });
  }
  count(query, options) {
    const filteredQuery = this._applySoftDeleteFilter(query, options);
    return this.collection.count(filteredQuery, options);
  }
  async insertOne(document, options) {
    const ctx = {};
    let payload = this.applyDefaults(document);
    if (this._v1HooksFactory) {
      const hookResult = await this._runV1Hook("insert", "before", ctx, payload);
      if (hookResult !== void 0 && typeof hookResult === "object") payload = hookResult;
    } else {
      await this.runHook("beforeCreate", { operation: "insertOne", collection: this.collectionName, data: payload });
    }
    await this._validateDoc(payload, options);
    payload = this._applyInsertTimestamps(payload);
    if (this._versionConfig?.enabled) {
      if (payload[this._versionConfig.field] === void 0) {
        payload = { ...payload, [this._versionConfig.field]: 0 };
      }
    }
    const result = await this.collection.insertOne(payload, options);
    if (this._v1HooksFactory) {
      try {
        await this._runV1Hook("insert", "after", ctx, result);
      } catch {
      }
    } else {
      await this.runHook("afterCreate", { operation: "insertOne", collection: this.collectionName, data: payload, result });
    }
    return result;
  }
  async insertMany(documents, options) {
    const opts = options ?? {};
    const docs = [];
    for (let i = 0; i < (documents ?? []).length; i++) {
      let d = this.applyDefaults((documents ?? [])[i]);
      if (!opts.skipValidation && this._validateEnabled && this._schemaCache && _schemaValidateFn) {
        const vr = _schemaValidateFn(this._schemaCache, d);
        if (!vr.valid) {
          const errors = vr.errors ?? [];
          const fields = [...new Set(errors.map((e) => e.path ?? e.field).filter(Boolean))];
          const summary = fields.length > 0 ? ` (${fields.join(", ")})` : "";
          const err = createError(ErrorCodes.VALIDATION_ERROR, `Schema validation failed${summary}`);
          err.errors = errors;
          err.index = i;
          throw err;
        }
      }
      d = this._applyInsertTimestamps(d);
      if (this._versionConfig?.enabled && d[this._versionConfig.field] === void 0) {
        d = { ...d, [this._versionConfig.field]: 0 };
      }
      docs.push(d);
    }
    return this.collection.insertMany(docs, options);
  }
  async updateOne(filter, update, options) {
    const ctx = {};
    let u = update;
    if (this._v1HooksFactory) {
      await this._runV1Hook("update", "before", ctx, filter, u);
    } else {
      await this.runHook("beforeUpdate", { operation: "updateOne", collection: this.collectionName, filter, update: u });
    }
    u = this._applyVersionIncrement(this._applyUpdateTimestamps(u));
    const result = await this.collection.updateOne(filter, u, options);
    if (this._v1HooksFactory) {
      try {
        await this._runV1Hook("update", "after", ctx, result);
      } catch {
      }
    } else {
      await this.runHook("afterUpdate", { operation: "updateOne", collection: this.collectionName, filter, update: u, result });
    }
    return result;
  }
  async updateMany(filter, update, options) {
    const u = this._applyVersionIncrement(this._applyUpdateTimestamps(update));
    return this.collection.updateMany(filter, u, options);
  }
  async replaceOne(filter, replacement, options) {
    const r = this._applyReplaceTimestamps(replacement);
    return this.collection.replaceOne(filter, r, options);
  }
  findOneAndUpdate(filter, update, options) {
    const u = this._applyUpdateTimestamps(update);
    return this.collection.findOneAndUpdate(filter, u, options);
  }
  findOneAndReplace(filter, replacement, options) {
    const r = this._applyReplaceTimestamps(replacement);
    return this.collection.findOneAndReplace(filter, r, options);
  }
  findOneAndDelete(filter, options) {
    return this.collection.findOneAndDelete(filter, options);
  }
  async upsertOne(filter, update, options) {
    const u = this._applyUpsertTimestamps(update);
    return this.collection.upsertOne(filter, u, options);
  }
  async incrementOne(filter, field, increment, options) {
    const ts = this._timestampsConfig;
    if (ts && ts.updatedAt !== false) {
      const opts = options ?? {};
      const $set = { ...opts["$set"] ?? {}, [ts.updatedAt]: this._nowDate() };
      return this.collection.incrementOne(filter, field, increment, { ...opts, $set });
    }
    return this.collection.incrementOne(filter, field, increment, options);
  }
  async insertBatch(docs, options) {
    const ts = this._timestampsConfig;
    const docsToInsert = ts ? docs.map((d) => this._applyInsertTimestamps(d)) : docs;
    return this.collection.insertBatch(docsToInsert, options);
  }
  async updateBatch(filter, update, options) {
    const u = this._applyUpdateTimestamps(update);
    return this.collection.updateBatch(filter, u, options);
  }
  async deleteOne(filter, options) {
    const sd = this._softDeleteConfig;
    const opts = options ?? {};
    const ctx = {};
    if (this._v1HooksFactory) {
      await this._runV1Hook("delete", "before", ctx, filter);
    } else {
      await this.runHook("beforeDelete", { operation: "deleteOne", collection: this.collectionName, filter });
    }
    let result;
    if (sd?.enabled && !opts._forceDelete) {
      result = await this.collection.updateOne(
        { ...filter ?? {}, [sd.field]: null },
        { $set: { [sd.field]: sd.type === "boolean" ? true : this._nowDate() } },
        options
      );
    } else {
      result = await this.collection.deleteOne(filter, options);
    }
    if (this._v1HooksFactory) {
      try {
        await this._runV1Hook("delete", "after", ctx, result);
      } catch {
      }
    } else {
      await this.runHook("afterDelete", { operation: "deleteOne", collection: this.collectionName, filter, result });
    }
    return result;
  }
  async deleteMany(filter, options) {
    const sd = this._softDeleteConfig;
    const opts = options ?? {};
    if (sd?.enabled && !opts._forceDelete) {
      return this.collection.updateMany(
        { ...filter ?? {}, [sd.field]: null },
        { $set: { [sd.field]: sd.type === "boolean" ? true : this._nowDate() } },
        options
      );
    }
    return this.collection.deleteMany(filter, options);
  }
  // ── soft-delete extended methods (only meaningful when softDelete is enabled) ──
  findWithDeleted(query, options) {
    return new PopulatePromise(async (paths) => {
      const opts = { ...options ?? {}, withDeleted: true };
      const docs = await this.collection.find(query, opts);
      return this.populateDocuments(this.hydrateDocuments(docs), paths);
    });
  }
  findOnlyDeleted(query, options) {
    return new PopulatePromise(async (paths) => {
      const sd = this._softDeleteConfig;
      const deletedFilter = sd ? { ...query ?? {}, [sd.field]: { $ne: null } } : query ?? {};
      const docs = await this.collection.find(deletedFilter, options);
      return this.populateDocuments(this.hydrateDocuments(docs), paths);
    });
  }
  findOneWithDeleted(query, options) {
    return new PopulatePromise(async (paths) => {
      const opts = { ...options ?? {}, withDeleted: true };
      const doc = await this.collection.findOne(query, opts);
      return this.populateSingle(this.hydrateDocument(doc), paths);
    });
  }
  findOneOnlyDeleted(query, options) {
    return new PopulatePromise(async (paths) => {
      const sd = this._softDeleteConfig;
      const deletedFilter = sd ? { ...query ?? {}, [sd.field]: { $ne: null } } : query ?? {};
      const doc = await this.collection.findOne(deletedFilter, options);
      return this.populateSingle(this.hydrateDocument(doc), paths);
    });
  }
  countWithDeleted(query, options) {
    return this.collection.count(query, { ...options ?? {}, withDeleted: true });
  }
  countOnlyDeleted(query, options) {
    const sd = this._softDeleteConfig;
    const deletedFilter = sd ? { ...query ?? {}, [sd.field]: { $ne: null } } : query ?? {};
    return this.collection.count(deletedFilter, { ...options ?? {}, withDeleted: true });
  }
  async restore(filter, options) {
    const sd = this._softDeleteConfig;
    if (!sd?.enabled) return { modifiedCount: 0 };
    return this.collection.updateOne(
      { ...filter ?? {}, [sd.field]: { $ne: null } },
      { $unset: { [sd.field]: 1 } },
      options
    );
  }
  async restoreMany(filter, options) {
    const sd = this._softDeleteConfig;
    if (!sd?.enabled) return { modifiedCount: 0 };
    return this.collection.updateMany(
      { ...filter ?? {}, [sd.field]: { $ne: null } },
      { $unset: { [sd.field]: 1 } },
      options
    );
  }
  async forceDelete(filter, options) {
    return this.collection.deleteOne(filter, options);
  }
  async forceDeleteMany(filter, options) {
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
  validate(document) {
    try {
      if (this._schemaError) {
        return {
          valid: false,
          errors: [{ field: "_schema", message: `Schema validation failed: ${this._schemaError.message}` }]
        };
      }
      if (!this._schemaCache || !_schemaValidateFn) return { valid: true, errors: [] };
      const result = _schemaValidateFn(this._schemaCache, document ?? {});
      return { valid: result.valid, errors: (result.errors ?? []).map((e) => ({
        field: e.field ?? e.path ?? "",
        message: e.message ?? ""
      })) };
    } catch (err) {
      return {
        valid: false,
        errors: [{ field: "_schema", message: `Schema validation failed: ${err instanceof Error ? err.message : String(err)}` }]
      };
    }
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
    if (docs.length === 0) {
      return docs;
    }
    const relation = this.relations.get(config.path);
    if (!relation) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, `\u672A\u5B9A\u4E49\u7684\u5173\u7CFB: ${config.path}`);
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
    if (config.populate) {
      const nestedRaw = config.populate;
      const isValidNestedConfig = (n) => {
        if (typeof n === "string") return true;
        if (Array.isArray(n)) return true;
        if (typeof n === "object" && n !== null && n.path) return true;
        return false;
      };
      if (!isValidNestedConfig(nestedRaw)) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, "\u5D4C\u5957 populate \u53C2\u6570\u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u3001\u6570\u7EC4\u6216\u5BF9\u8C61");
      }
      if (relatedModel) {
        const nestedPaths = Array.isArray(config.populate) ? config.populate : [config.populate];
        hydrated = await relatedModel.populateDocuments(hydrated, nestedPaths);
      }
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
    if (typeof this.definition.methods === "function") {
      for (const [name, method] of Object.entries(this._v1InstanceMethods)) {
        Object.defineProperty(hydrated, name, {
          configurable: true,
          enumerable: false,
          writable: false,
          value: (...args) => method.apply(hydrated, args)
        });
      }
    } else {
      for (const [name, method] of Object.entries(this.definition.methods ?? {})) {
        Object.defineProperty(hydrated, name, {
          configurable: true,
          enumerable: false,
          writable: false,
          value: (...args) => method.apply(hydrated, args)
        });
      }
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
    if (typeof this.definition.hooks === "function") return;
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
function processTimestamps(definition) {
  const tsOpt = definition.options?.timestamps;
  if (tsOpt === null) return;
  if (tsOpt !== void 0 && typeof tsOpt !== "boolean" && typeof tsOpt !== "object") {
    throw createError(ErrorCodes.INVALID_MODEL_DEFINITION, "options.timestamps must be boolean or object.");
  }
  if (!tsOpt && tsOpt !== false) {
    return;
  }
  const defAny = definition;
  if (!defAny._internalHooks) defAny._internalHooks = {};
  if (tsOpt === false) {
    defAny._internalHooks.timestamps = void 0;
    return;
  }
  if (tsOpt === true) {
    defAny._internalHooks.timestamps = { createdAt: "createdAt", updatedAt: "updatedAt" };
    return;
  }
  const result = {};
  let createdAtAdded = false;
  const ca = tsOpt.createdAt;
  if (ca === false) {
  } else if (ca === true) {
    result.createdAt = "createdAt";
    createdAtAdded = true;
  } else if (typeof ca === "string") {
    result.createdAt = ca;
    createdAtAdded = true;
  }
  const ua = tsOpt.updatedAt;
  if (ua === false) {
  } else if (ua === true) {
    result.updatedAt = "updatedAt";
  } else if (typeof ua === "string") {
    result.updatedAt = ua;
  } else if (ua === void 0 && createdAtAdded) {
    result.updatedAt = "updatedAt";
  }
  defAny._internalHooks.timestamps = Object.keys(result).length ? result : void 0;
}
function validateDefinition(definition) {
  if (!definition || typeof definition !== "object") {
    throw createError(ErrorCodes.INVALID_MODEL_DEFINITION, "Model definition must be an object.");
  }
  if (definition.schema === void 0 || definition.schema === null) {
    throw createError(ErrorCodes.MISSING_SCHEMA, "Model definition must include a schema property.");
  }
  if (typeof definition.schema !== "function" && (typeof definition.schema !== "object" || definition.schema === null)) {
    throw createError(ErrorCodes.INVALID_SCHEMA_TYPE, "Schema must be a function or object.");
  }
  if (definition.connection) {
    if (definition.connection.pool !== void 0 && (typeof definition.connection.pool !== "string" || definition.connection.pool.trim() === "")) {
      throw createError(ErrorCodes.INVALID_MODEL_DEFINITION, "connection.pool must be a non-empty string.");
    }
    if (definition.connection.database !== void 0 && (typeof definition.connection.database !== "string" || definition.connection.database.trim() === "")) {
      throw createError(ErrorCodes.INVALID_MODEL_DEFINITION, "connection.database must be a non-empty string.");
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
    const value = config[field];
    if (value === void 0 || value === null) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, `relations \u914D\u7F6E\u7F3A\u5C11\u5FC5\u9700\u5B57\u6BB5: ${field}`);
    }
    if (typeof value !== "string" || value.trim() === "") {
      throw createError(ErrorCodes.INVALID_ARGUMENT, `relations.${field} \u5FC5\u987B\u662F\u5B57\u7B26\u4E32`);
    }
  }
  if (config.single !== void 0 && typeof config.single !== "boolean") {
    throw createError(ErrorCodes.INVALID_ARGUMENT, `relations.single \u5FC5\u987B\u662F\u5E03\u5C14\u503C`);
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
import { MongoClient as MongoDriverClient } from "mongodb";
var PoolStatsManager = class {
  constructor(options = {}) {
    this._stats = /* @__PURE__ */ new Map();
    this._buffer = [];
    this._logger = options.logger ?? console;
    this._batchInterval = setInterval(() => {
      this._flush();
    }, 100);
    this._batchInterval.unref?.();
  }
  recordSelection(poolName, operation) {
    this._buffer.push({ poolName, type: "selection", operation, timestamp: Date.now() });
    this._flush();
  }
  async recordQuery(poolName, responseTime, error) {
    this.recordRequest(poolName, responseTime, !error);
    this._flush();
  }
  recordConnections(poolName, count) {
    let stats = this._stats.get(poolName);
    if (!stats) {
      stats = this._emptyStats();
      this._stats.set(poolName, stats);
    }
    stats.connections = count;
  }
  recordRequest(poolName, responseTime, success) {
    this._buffer.push({ poolName, type: "request", responseTime, success, timestamp: Date.now() });
  }
  _flush() {
    if (this._buffer.length === 0) return;
    const batch = this._buffer.splice(0);
    for (const item of batch) {
      this._updateStats(item);
    }
  }
  _updateStats(item) {
    let stats = this._stats.get(item.poolName);
    if (!stats) {
      stats = this._emptyStats();
      this._stats.set(item.poolName, stats);
    }
    if (item.type === "selection") {
      stats.totalRequests++;
    } else if (item.type === "request") {
      stats.totalRequests++;
      if (item.success) {
        stats.successRequests++;
      } else {
        stats.failedRequests++;
      }
      stats.totalResponseTime += item.responseTime ?? 0;
      stats.avgResponseTime = stats.totalResponseTime / stats.totalRequests;
      stats.errorRate = stats.failedRequests / stats.totalRequests;
    }
  }
  _emptyStats() {
    return { connections: 0, available: 0, waiting: 0, totalRequests: 0, successRequests: 0, failedRequests: 0, totalResponseTime: 0, avgResponseTime: 0, errorRate: 0 };
  }
  getStats(poolName) {
    return { ...this._stats.get(poolName) ?? this._emptyStats() };
  }
  getAllStats() {
    const result = {};
    for (const [poolName, stats] of this._stats.entries()) {
      result[poolName] = { ...stats };
    }
    return result;
  }
  reset(poolName) {
    if (poolName) {
      this._stats.delete(poolName);
    } else {
      this._stats.clear();
    }
  }
  resetAll() {
    this._stats.clear();
    this._buffer = [];
  }
  close() {
    if (this._batchInterval) {
      clearInterval(this._batchInterval);
      this._batchInterval = null;
    }
    this._flush();
  }
};
var PoolSelector = class {
  constructor(options = {}) {
    this._roundRobinIndex = /* @__PURE__ */ new Map();
    this._strategy = options.strategy ?? "auto";
    this._logger = options.logger ?? console;
  }
  select(pools, context) {
    if (!pools || pools.length === 0) throw new Error("No available pools");
    switch (this._strategy) {
      case "auto":
        return this._selectByAuto(pools, context);
      case "roundRobin":
        return this._selectByRoundRobin(pools, context);
      case "leastConnections":
        return this._selectByLeastConnections(pools, context);
      case "weighted":
        return this._selectByWeighted(pools, context);
      case "manual":
        return pools[0].name;
      default:
        this._logger.warn?.(`[PoolSelector] Unknown strategy: ${this._strategy}, falling back to auto`);
        return this._selectByAuto(pools, context);
    }
  }
  _selectByAuto(pools, context) {
    const { operation, poolPreference } = context;
    let candidates = pools;
    if (operation === "read") {
      const secondaries = pools.filter((p) => p.role === "secondary");
      if (secondaries.length > 0) candidates = secondaries;
    } else if (operation === "write") {
      const primaries = pools.filter((p) => p.role === "primary");
      if (primaries.length > 0) candidates = primaries;
    }
    if (poolPreference) {
      if (poolPreference.role) {
        const filtered = candidates.filter((p) => p.role === poolPreference.role);
        if (filtered.length > 0) candidates = filtered;
      }
      if (poolPreference.tags && poolPreference.tags.length > 0) {
        const tags = poolPreference.tags;
        const filtered = candidates.filter((p) => {
          if (!p.tags) return false;
          return tags.length === 1 ? tags.some((tag) => p.tags.includes(tag)) : tags.every((tag) => p.tags.includes(tag));
        });
        if (filtered.length > 0) candidates = filtered;
      }
    }
    if (candidates.length === 1) return candidates[0].name;
    return this._selectByWeighted(candidates, context);
  }
  _selectByRoundRobin(pools, context) {
    let candidates = pools;
    if (context.operation === "read") {
      const nonPrimary = pools.filter((p) => p.role === "secondary" || p.role === "analytics");
      if (nonPrimary.length > 0) candidates = nonPrimary;
    } else if (context.operation === "write") {
      const primaries = pools.filter((p) => (p.role ?? "primary") === "primary");
      if (primaries.length > 0) candidates = primaries;
    }
    const key = context.operation ?? "default";
    const index = this._roundRobinIndex.get(key) ?? 0;
    const pool = candidates[index % candidates.length];
    this._roundRobinIndex.set(key, (index + 1) % candidates.length);
    return pool.name;
  }
  _selectByLeastConnections(pools, context) {
    const { stats } = context;
    if (!stats) return this._selectByRoundRobin(pools, context);
    let minConnections = Infinity;
    let selectedPool = pools[0];
    for (const pool of pools) {
      const poolStats = stats[pool.name];
      if (!poolStats) continue;
      const connections = poolStats.connections ?? 0;
      if (connections < minConnections) {
        minConnections = connections;
        selectedPool = pool;
      }
    }
    return selectedPool.name;
  }
  _selectByWeighted(pools, _context) {
    let totalWeight = 0;
    for (const pool of pools) totalWeight += pool.weight ?? 1;
    let random = Math.random() * totalWeight;
    for (const pool of pools) {
      random -= pool.weight ?? 1;
      if (random <= 0) return pool.name;
    }
    return pools[0].name;
  }
  setStrategy(strategy) {
    this._strategy = strategy;
    this._logger.info?.(`[PoolSelector] Strategy changed: ${strategy}`);
  }
  getStrategy() {
    return this._strategy;
  }
};
var HealthChecker = class {
  constructor(options = {}) {
    this._healthStatus = /* @__PURE__ */ new Map();
    this._checkConfigs = /* @__PURE__ */ new Map();
    this._clients = /* @__PURE__ */ new Map();
    this._intervals = /* @__PURE__ */ new Map();
    this._started = false;
    this._poolManager = options.poolManager ?? null;
    this._logger = options.logger ?? console;
  }
  register(poolNameOrConfig, configOrClient) {
    let poolName;
    let healthCheckConfig;
    let client = null;
    if (typeof poolNameOrConfig === "string") {
      poolName = poolNameOrConfig;
      healthCheckConfig = configOrClient ?? {};
    } else {
      poolName = poolNameOrConfig.name;
      healthCheckConfig = poolNameOrConfig.healthCheck ?? {};
      client = configOrClient ?? null;
    }
    this._checkConfigs.set(poolName, healthCheckConfig);
    if (client !== null) this._clients.set(poolName, client);
    const initialStatus = typeof poolNameOrConfig === "string" ? "up" : "unknown";
    this._healthStatus.set(poolName, { status: initialStatus, lastCheck: /* @__PURE__ */ new Date(), consecutiveFailures: 0 });
    if (this._started) this._startCheckForPool(poolName, healthCheckConfig);
  }
  unregister(poolName) {
    this._stopCheckForPool(poolName);
    this._healthStatus.delete(poolName);
    this._checkConfigs.delete(poolName);
    this._clients.delete(poolName);
  }
  start() {
    if (this._started) return;
    this._started = true;
    for (const [poolName, config] of this._checkConfigs.entries()) {
      this._startCheckForPool(poolName, config);
    }
    this._logger.info?.("[HealthChecker] Health check started");
  }
  stop() {
    if (!this._started) return;
    this._started = false;
    for (const poolName of this._intervals.keys()) this._stopCheckForPool(poolName);
    this._logger.info?.("[HealthChecker] Health check stopped");
  }
  /** Public single-check method (fixes v1 bug: v1 only had private _checkPool) */
  async checkPool(poolName) {
    const config = this._checkConfigs.get(poolName) ?? {};
    await this._checkPool(poolName, config);
  }
  _startCheckForPool(poolName, config) {
    if (config.enabled === false) return;
    this._stopCheckForPool(poolName);
    const interval = config.interval ?? 5e3;
    const timer = setInterval(async () => {
      await this._checkPool(poolName, config);
    }, interval);
    timer.unref?.();
    this._intervals.set(poolName, timer);
    setImmediate(async () => {
      await this._checkPool(poolName, config);
    });
  }
  _stopCheckForPool(poolName) {
    const timer = this._intervals.get(poolName);
    if (timer) {
      clearInterval(timer);
      this._intervals.delete(poolName);
    }
  }
  async _checkPool(poolName, config) {
    const status = this._healthStatus.get(poolName);
    if (!status) return;
    status.status = "checking";
    status.lastCheck = /* @__PURE__ */ new Date();
    const retries = config.retries ?? 3;
    let success = false;
    let lastError = null;
    try {
      await this._pingPool(poolName, config.timeout ?? 3e3);
      success = true;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    if (success) {
      status.status = "up";
      status.consecutiveFailures = 0;
      delete status.lastError;
    } else {
      status.consecutiveFailures++;
      if (lastError) status.lastError = lastError;
      if (status.consecutiveFailures >= retries) {
        status.status = "down";
      }
    }
  }
  async _pingPool(poolName, timeout) {
    const stored = this._clients.get(poolName);
    const client = stored ?? this._poolManager?._getPool(poolName);
    if (!client) throw new Error(`No client for pool: ${poolName}`);
    const db = client.db("admin");
    const pingFn = db.command ? () => db.command({ ping: 1 }) : () => db.admin().ping();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Ping timeout")), timeout));
    await Promise.race([pingFn(), timeoutPromise]);
  }
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  getStatus(poolName) {
    return this._healthStatus.get(poolName) ?? null;
  }
  getAllStatus() {
    return new Map(this._healthStatus);
  }
};
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
    // v1 compat properties
    this._closed = false;
    this._configs = /* @__PURE__ */ new Map();
    this._pendingAdds = /* @__PURE__ */ new Set();
    this.logger = options.logger ?? null;
    this.maxPoolsCount = options.maxPoolsCount ?? 10;
    this.strategy = options.poolStrategy ?? "auto";
    const rawFallback = options.fallback ?? options.poolFallback;
    const fallback = typeof rawFallback === "boolean" ? { enabled: rawFallback, fallbackStrategy: "error", retryDelay: 1e3, maxRetries: 3 } : {
      enabled: rawFallback?.enabled ?? false,
      fallbackStrategy: rawFallback?.fallbackStrategy ?? "error",
      retryDelay: rawFallback?.retryDelay ?? 1e3,
      maxRetries: rawFallback?.maxRetries ?? 3
    };
    this.fallback = fallback;
    this.clientFactory = options.clientFactory ?? defaultClientFactory;
    this.healthCheckFn = options.healthCheckFn ?? defaultHealthCheckFn;
    this._fallbackConfig = this.fallback;
    this._fallback = this.fallback;
    this._pools = this.pools;
    this._selector = new PoolSelector({ strategy: this.strategy });
    this._healthChecker = new HealthChecker({ poolManager: this });
    this._stats = new PoolStatsManager({ logger: options.logger ?? void 0 });
  }
  /**
   * Add a connection pool.
   * @since v1.0.8
   */
  async addPool(config) {
    _validatePoolConfigInternal(config);
    if (this.pools.has(config.name) || this._pendingAdds.has(config.name)) {
      throw new Error(`Pool '${config.name}' already exists`);
    }
    if (this.maxPoolsCount > 0 && this.pools.size >= this.maxPoolsCount) {
      throw new Error(`Maximum pool count (${this.maxPoolsCount}) reached`);
    }
    this._pendingAdds.add(config.name);
    try {
      const client = await this.clientFactory(config);
      if (this.pools.has(config.name)) {
        await client.close().catch(() => {
        });
        throw new Error(`Pool '${config.name}' already exists`);
      }
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
      this._configs.set(config.name, config);
      this._healthChecker.register(config.name, config.healthCheck ?? {});
    } catch (err) {
      const msg = err?.message ?? "";
      const hasNetworkKeyword = msg.includes("connect") || msg.includes("ETIMEDOUT") || msg.includes("ECONNREFUSED");
      if (!hasNetworkKeyword && err?.name && err.name.toLowerCase().includes("mongo")) {
        const enhanced = new Error(`connect ETIMEDOUT: ${msg}`);
        enhanced.name = err.name;
        enhanced.code = err.code;
        throw enhanced;
      }
      throw err;
    } finally {
      this._pendingAdds.delete(config.name);
    }
  }
  /**
   * Remove a connection pool.
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
    this._configs.delete(name);
    this._healthChecker.unregister(name);
  }
  /**
   * Get the native MongoClient for a pool.
   * @since v1.0.8
   */
  getPool(name) {
    return this.pools.get(name)?.client ?? null;
  }
  /**
   * Select a connection pool.
   * @since v1.0.8
   */
  selectPool(operation, options = {}) {
    if (options.pool) {
      const poolData2 = this.pools.get(options.pool);
      if (!poolData2) throw new Error(`Pool '${options.pool}' not found`);
      return this._createPoolResult(options.pool, poolData2.client);
    }
    let candidates = this._getHealthyPools();
    if (candidates.length === 0) {
      if (!this.fallback.enabled) {
        throw new Error("No available connection pool");
      }
      candidates = this._handleAllPoolsDown(operation);
      if (candidates.length === 0) {
        throw new Error("No available connection pool");
      }
    }
    const poolName = this._selector.select(candidates, {
      operation,
      stats: this._stats.getAllStats(),
      poolPreference: options.poolPreference
    });
    const poolData = this.pools.get(poolName);
    if (!poolData) {
      throw new Error(`Selected pool '${poolName}' not available`);
    }
    this._stats.recordSelection(poolName, operation);
    this.recordSelection(poolName, true);
    return this._createPoolResult(poolName, poolData.client);
  }
  _createPoolResult(name, client) {
    return {
      name,
      client,
      db: (n) => client.db(n),
      collection: (databaseName, collectionName) => client.db(databaseName).collection(collectionName)
    };
  }
  /**
   * Start health checks.
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
   * Stop health checks.
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
   * Get health status.
   * @since v1.0.8
   */
  getHealthStatus() {
    return Object.fromEntries(this.healthStatus.entries());
  }
  /**
   * Get all pool names.
   * @since v1.3.0
   */
  getPoolNames() {
    return Array.from(this.pools.keys());
  }
  /**
   * Get pool statistics.
   * @since v1.0.8
   */
  getPoolStats() {
    const result = {};
    for (const name of this.pools.keys()) {
      const healthStatus = this.healthStatus.get(name);
      const poolStats = this._stats.getStats(name);
      result[name] = {
        connections: poolStats?.connections || 0,
        available: poolStats?.available || 0,
        waiting: poolStats?.waiting || 0,
        status: healthStatus?.status || "unknown",
        avgResponseTime: poolStats?.avgResponseTime || 0,
        totalRequests: poolStats?.totalRequests || 0,
        errorRate: poolStats?.errorRate || 0
      };
    }
    return result;
  }
  /**
   * Close all connection pools.
   * @since v1.0.8
   */
  async close() {
    this.stopHealthCheck();
    this._healthChecker.stop();
    this._stats.close();
    for (const pool of this.pools.values()) {
      await pool.client.close();
    }
    this.pools.clear();
    this.healthStatus.clear();
    this.stats.clear();
    this._closed = true;
  }
  // ─── v1 compat methods ───────────────────────────────────────────────────────────
  /** v1 compat: get pool health Map */
  getPoolHealth() {
    return new Map(this.healthStatus);
  }
  /** v1 compat: get healthy pool config list (iterates _configs, matches v1 logic) */
  _getHealthyPools() {
    const result = [];
    for (const [name, config] of this._configs.entries()) {
      const status = this._healthChecker.getStatus(name);
      if (!status || status.status !== "down") {
        result.push(config);
      }
    }
    return result;
  }
  /** v1 compat: get raw MongoClient */
  _getPool(name) {
    return this.pools.get(name)?.client ?? null;
  }
  /** v1 compat: get pool config list by role */
  _getPoolsByRole(role) {
    const result = [];
    for (const [, config] of this._configs.entries()) {
      if (config.role === role) result.push(config);
    }
    return result;
  }
  /** v1 compat: fallback when all pools are down (synchronously returns candidate pool list) */
  _handleAllPoolsDown(operation) {
    this.logger?.warn?.(`[PoolManager] All pools down, fallback strategy: ${this.fallback.fallbackStrategy}`);
    const { fallbackStrategy } = this.fallback;
    if (fallbackStrategy === "readonly") {
      if (operation === "write") return [];
      return this._getPoolsByRole("secondary");
    }
    if (fallbackStrategy === "secondary") {
      return this._getPoolsByRole("secondary");
    }
    return [];
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
function _validatePoolConfigInternal(config) {
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
  const client = new MongoDriverClient(config.uri, config.options);
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
    /** Whether Redis storage is used (always false in memory mode). */
    this.useRedis = false;
    /** Map of registered Saga definitions. */
    this.sagas = /* @__PURE__ */ new Map();
    this._stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      compensatedExecutions: 0
    };
    this.logger = options.logger ?? null;
  }
  /**
   * Register a Saga definition.
   * @since v1.1.0
   */
  define(definition) {
    validateSagaDefinition(definition);
    this.sagas.set(definition.name, normalizeSagaDefinition(definition));
  }
  /**
   * Compatibility alias for `define()` — async and returns the registered Saga definition object.
   * @since v1.1.0
   */
  async defineSaga(definition) {
    this.define(definition);
    return { name: definition.name };
  }
  /**
   * Execute the specified Saga.
   * @since v1.1.0
   */
  async execute(name, data) {
    const definition = this.sagas.get(name);
    if (!definition) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, `Saga '${name}' \u672A\u5B9A\u4E49`);
    }
    const sagaId = `saga_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    const context = new SagaExecutionContext(sagaId, data);
    const completedSteps = [];
    this._stats.totalExecutions += 1;
    try {
      for (const step of definition.steps) {
        const result = await executeStepWithRetry(step, context, definition.timeout, this.logger);
        completedSteps.push({ step, result });
        if (result !== void 0) {
          context.set(step.name, result);
        }
      }
      this._stats.successfulExecutions += 1;
      return {
        success: true,
        sagaId,
        sagaName: name,
        completedSteps: completedSteps.length,
        result: completedSteps[completedSteps.length - 1]?.result,
        duration: Date.now() - startedAt
      };
    } catch (cause) {
      const errorMessage = cause instanceof Error ? cause.message : String(cause);
      this._stats.failedExecutions += 1;
      const compensationResults = [];
      for (const { step, result: stepResult } of [...completedSteps].reverse()) {
        if (typeof step.compensate !== "function") {
          compensationResults.push({ stepName: step.name, success: false, reason: "no-compensate-defined" });
          continue;
        }
        const compStart = Date.now();
        try {
          await step.compensate(context, stepResult);
          compensationResults.push({ stepName: step.name, success: true, duration: Date.now() - compStart });
          this._stats.compensatedExecutions += 1;
        } catch (compensationError) {
          const compMsg = compensationError instanceof Error ? compensationError.message : String(compensationError);
          compensationResults.push({ stepName: step.name, success: false, error: compMsg });
          this.logger?.error?.("[Saga] compensation failed", {
            saga: name,
            step: step.name,
            error: compensationError
          });
        }
      }
      const compensationSuccess = compensationResults.every(
        (r) => r.success || r.reason === "no-compensate-defined"
      );
      return {
        success: false,
        sagaId,
        sagaName: name,
        completedSteps: completedSteps.length,
        compensatedSteps: compensationResults.filter((r) => r.reason !== "no-compensate-defined").map((r) => r.stepName),
        duration: Date.now() - startedAt,
        error: errorMessage,
        compensation: {
          success: compensationSuccess,
          results: compensationResults
        }
      };
    }
  }
  /**
   * Get a Saga definition.
   * @since v1.1.0
   */
  getSaga(name) {
    return this.sagas.get(name);
  }
  /**
   * Get all registered Saga names.
   * @since v1.1.0
   */
  async listSagas() {
    return [...this.sagas.keys()];
  }
  /**
   * Get execution statistics.
   * @since v1.1.0
   */
  getStats() {
    const { totalExecutions, successfulExecutions, failedExecutions, compensatedExecutions } = this._stats;
    const successRate = totalExecutions > 0 ? `${Math.round(successfulExecutions / totalExecutions * 100)}%` : "0%";
    return {
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      compensatedExecutions,
      successRate,
      storageMode: "\u5185\u5B58",
      // v1 aliases
      successCount: successfulExecutions,
      failureCount: failedExecutions,
      compensationCount: compensatedExecutions
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
    throw createError(ErrorCodes.INVALID_ARGUMENT, "Saga name is required");
  }
  if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "Saga steps must be a non-empty array");
  }
  for (const step of definition.steps) {
    if (!step || typeof step !== "object") {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "Saga step must be an object.");
    }
    if (typeof step.name !== "string" || step.name.trim() === "") {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "Saga step requires a non-empty name.");
    }
    if (typeof step.execute !== "function") {
      throw createError(ErrorCodes.INVALID_ARGUMENT, `Each step must have name and execute function`);
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
import { createHash as createHash3 } from "node:crypto";
import { MongoClient as MongoDriverClient2 } from "mongodb";
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
  return createHash3("sha1").update(stableStringify3(input)).digest("hex");
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
   * Add a log entry to the queue.
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
   * Flush the buffer.
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
   * Close the queue and flush any remaining log entries.
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
          firstSeen: record.firstSeen
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
   * Initialize the manager.
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
   * Save a single slow-query log entry.
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
   * Query aggregated slow-query log records.
   * @since v1.3.1
   */
  async query(filter = {}, options = {}) {
    await this.initialize();
    return this.storage.query(filter, options);
  }
  /**
   * Close the manager.
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
  const client = new MongoDriverClient2(uri, options);
  await client.connect();
  return client;
}

// src/capabilities/count-queue/index.ts
import { cpus } from "node:os";
var CountQueue = class {
  constructor(options = {}) {
    this.running = 0;
    this.queue = [];
    this.stats = {
      executed: 0,
      queued: 0,
      timeout: 0,
      rejected: 0,
      avgWaitTime: 0,
      maxWaitTime: 0
    };
    const cpuCount = cpus().length;
    const defaultConcurrency = Math.max(4, Math.min(cpuCount, 16));
    this.concurrency = options.concurrency ?? defaultConcurrency;
    this.maxQueueSize = options.maxQueueSize ?? 1e4;
    this.timeout = options.timeout ?? 6e4;
  }
  /**
   * Execute a count operation with queue control.
   *
   * @param fn - The count function to execute (returns Promise<number>)
   * @returns The count result
   * @throws When the queue is full or the wait times out
   */
  async execute(fn) {
    const startTime = Date.now();
    if (this.running >= this.concurrency) {
      if (this.queue.length >= this.maxQueueSize) {
        this.stats.rejected++;
        throw createError(ErrorCodes.INVALID_OPERATION, `Count queue is full (${this.maxQueueSize})`);
      }
      this.stats.queued++;
      const waitResult = await this._waitInQueue(startTime);
      if (waitResult === "cleared") {
        return void 0;
      }
    }
    this.running++;
    this.stats.executed++;
    try {
      return await this._executeWithTimeout(fn);
    } finally {
      this.running--;
      this._wakeNext();
    }
  }
  /**
   * Get queue statistics (including live state).
   */
  getStats() {
    return {
      ...this.stats,
      running: this.running,
      queuedNow: this.queue.length,
      concurrency: this.concurrency,
      maxQueueSize: this.maxQueueSize
    };
  }
  /**
   * Reset accumulated statistics (does not affect in-flight requests).
   */
  resetStats() {
    this.stats = {
      executed: 0,
      queued: 0,
      timeout: 0,
      rejected: 0,
      avgWaitTime: 0,
      maxWaitTime: 0
    };
  }
  /**
   * Clear all queued pending requests without executing them.
   */
  clear() {
    while (this.queue.length > 0) {
      const entry = this.queue.shift();
      if (entry) {
        clearTimeout(entry.timer);
        entry.resolve("cleared");
      }
    }
  }
  _waitInQueue(startTime) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.queue.findIndex((item) => item.resolve === resolve);
        if (index !== -1) {
          this.queue.splice(index, 1);
          this.stats.timeout++;
          reject(createError(ErrorCodes.OPERATION_TIMEOUT, `Count queue wait timeout (${this.timeout}ms)`));
        }
      }, this.timeout);
      this.queue.push({
        resolve: (reason) => {
          const waitTime = Date.now() - startTime;
          this._updateWaitTimeStats(waitTime);
          resolve(reason);
        },
        reject,
        timer,
        startTime
      });
    });
  }
  _wakeNext() {
    if (this.queue.length > 0) {
      const entry = this.queue.shift();
      if (entry) {
        clearTimeout(entry.timer);
        entry.resolve("run");
      }
    }
  }
  _executeWithTimeout(fn) {
    return Promise.race([
      fn(),
      new Promise(
        (_, reject) => setTimeout(
          () => reject(createError(ErrorCodes.OPERATION_TIMEOUT, `Count execution timeout (${this.timeout}ms)`)),
          this.timeout
        )
      )
    ]);
  }
  _updateWaitTimeStats(waitTime) {
    const totalQueued = this.stats.queued;
    this.stats.avgWaitTime = (this.stats.avgWaitTime * (totalQueued - 1) + waitTime) / totalQueued;
    if (waitTime > this.stats.maxWaitTime) {
      this.stats.maxWaitTime = waitTime;
    }
  }
};

// src/capabilities/sync/index.ts
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { MongoClient as MongoDriverClient3 } from "mongodb";
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
    this.path = options.path ?? "./.sync-resume-token";
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
      const payload = await readFile(this.path, "utf8");
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
      await mkdir(path.dirname(this.path), { recursive: true });
      await writeFile(this.path, payload, "utf8");
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
      await unlink(this.path);
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
   * Start Change Stream synchronization.
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
   * Stop Change Stream synchronization.
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
   * Get current statistics.
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
  const client = new MongoDriverClient3(uri, options);
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
   * Add a cache lock.
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
   * Check whether a cache key is locked.
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
   * Release all cache locks held by the given owner.
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
   * Get cache lock statistics.
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
   * Clear all cache locks.
   * @since v1.4.0
   */
  clear() {
    this.locks.clear();
  }
  /**
   * Stop the cache lock manager.
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
    this.session.__monSQLizeTransaction = this;
  }
  /**
   * Start the transaction.
   * @since v1.4.0
   */
  async start() {
    if (this.state !== "pending") {
      throw new Error(`Cannot start transaction in state: ${this.state}`);
    }
    this.session.startTransaction();
    this.state = "active";
    const timeout = this.options.timeout ?? 3e4;
    if (timeout > 0) {
      this.timeoutTimer = setTimeout(() => {
        if (this.state === "active") {
          this.options.logger?.warn?.(`[Transaction] auto-abort on timeout: ${this.id}`);
          void this.abort();
        }
      }, timeout);
      this.timeoutTimer.unref?.();
    }
  }
  /**
   * Commit the transaction.
   * @since v1.4.0
   */
  async commit() {
    if (this.state !== "active") {
      throw new Error(`Cannot commit transaction in state: ${this.state}`);
    }
    if (typeof this.session.commitTransaction === "function") {
      await this.session.commitTransaction();
    }
    this.state = "committed";
    this.options.lockManager?.releaseLocks(this.id);
    this.pendingInvalidations.clear();
    this.clearTimeout();
  }
  /**
   * Roll back the transaction.
   * @since v1.4.0
   */
  async abort() {
    if (this.state !== "pending" && this.state !== "active") {
      return;
    }
    if (this.state === "active") {
      if (typeof this.session.abortTransaction === "function") {
        await this.session.abortTransaction();
      }
    }
    this.state = "aborted";
    this.options.lockManager?.releaseLocks(this.id);
    this.pendingInvalidations.clear();
    this.clearTimeout();
  }
  /**
   * End the transaction session.
   * @since v1.4.0
   */
  async end() {
    this.clearTimeout();
    this.options.lockManager?.releaseLocks(this.id);
    await this.session.endSession();
  }
  /**
   * Record a cache invalidation intent.
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
   * Get the transaction duration.
   * @since v1.4.0
   */
  getDuration() {
    if (!this.startedAt) {
      return 0;
    }
    return Date.now() - this.startedAt;
  }
  /**
   * Get transaction info.
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
  constructor(input, legacyCache, legacyOptions = {}) {
    this.activeTransactions = /* @__PURE__ */ new Map();
    this.durations = [];
    this.stats = {
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0
    };
    const options = "client" in input ? input : {
      client: input,
      cache: legacyCache,
      ...legacyOptions
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
   * Create a manual transaction session.
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
      timeout: options.timeout ?? options.maxDuration ?? this.defaultOptions.maxDuration
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
   * Automatically manage the transaction lifecycle.
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
        await sleep3(retryDelay * Math.pow(retryBackoff, attempt));
      } finally {
        await transaction.end();
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Transaction failed.");
  }
  /**
   * Get all active transactions.
   * @since v1.4.0
   */
  getActiveTransactions() {
    return [...this.activeTransactions.values()];
  }
  /**
   * Abort all active transactions.
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
   * Get transaction statistics.
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
async function sleep3(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// src/adapters/mongodb/common/connect.ts
import { MongoClient } from "mongodb";
var _memoryServerInstance = null;
async function startMemoryServer(logger, memoryServerOptions = {}) {
  if (_memoryServerInstance) {
    return _memoryServerInstance.getUri();
  }
  const { MongoMemoryReplSet } = __require("mongodb-memory-server");
  logger?.info?.("\u{1F680} Starting MongoDB Memory ReplSet (transactions supported)...");
  const defaultConfig = {
    replSet: { count: 1, storageEngine: "wiredTiger" },
    binary: { version: "6.0.12" },
    instanceOpts: [{ ...memoryServerOptions?.instance ?? {} }]
  };
  const resolvedConfig = {
    ...defaultConfig,
    binary: { ...defaultConfig.binary, ...memoryServerOptions?.binary ?? {} }
  };
  try {
    _memoryServerInstance = await MongoMemoryReplSet.create(resolvedConfig);
    const uri = _memoryServerInstance.getUri();
    logger?.info?.("\u2705 MongoDB Memory ReplSet started", { uri });
    return uri;
  } catch (err) {
    logger?.error?.("\u274C Failed to start MongoDB Memory ReplSet", err);
    throw new Error(`Failed to start MongoDB Memory ReplSet: ${err.message}`);
  }
}
async function connectMongo(params) {
  const databaseName = params.databaseName?.trim();
  if (!databaseName) {
    throw createError(ErrorCodes.INVALID_DATABASE_NAME, "Database name must be a non-empty string.");
  }
  let effectiveUri = params.config?.uri?.trim();
  if (!effectiveUri && params.config?.useMemoryServer === true) {
    if (process.env["MONSQLIZE_USE_SYSTEM_MONGO"] === "true") {
      const systemUri = process.env["MONSQLIZE_SYSTEM_MONGO_URI"] ?? "mongodb://127.0.0.1:27017";
      params.logger?.info?.("\u{1F527} Using system MongoDB instead of memory server", { uri: systemUri });
      effectiveUri = systemUri;
    } else {
      effectiveUri = await startMemoryServer(params.logger, params.config.memoryServerOptions);
    }
  }
  if (!effectiveUri) {
    throw createError(ErrorCodes.INVALID_CONFIG, "MongoDB connect requires config.uri.");
  }
  const client = new MongoClient(effectiveUri, params.config?.options);
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

// src/utils/validation.ts
function validateRange(value, min, max, name) {
  if (typeof value !== "number" || isNaN(value)) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, `${name} \u5FC5\u987B\u662F\u4E00\u4E2A\u6709\u6548\u7684\u6570\u5B57`);
  }
  if (!isFinite(value)) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, `${name} \u5FC5\u987B\u662F\u6709\u9650\u6570\u5B57`);
  }
  if (value < min || value > max) {
    throw createError(
      ErrorCodes.INVALID_ARGUMENT,
      `${name} \u5FC5\u987B\u5728 ${min} \u5230 ${max} \u4E4B\u95F4\uFF0C\u5F53\u524D\u503C: ${value}`
    );
  }
  return value;
}

// src/core/logger/index.ts
import { AsyncLocalStorage } from "node:async_hooks";
var _storage = null;
try {
  _storage = new AsyncLocalStorage();
} catch {
  _storage = null;
}
var Logger = class _Logger {
  constructor(_logger = null, _options = {}) {
    this._logger = _logger;
    this._options = _options;
  }
  _formatStructured(level, msg, ctx) {
    const entry = {
      level: level.toUpperCase(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message: msg
    };
    if (_storage) {
      const store = _storage.getStore();
      if (store?.traceId) {
        entry.traceId = store.traceId;
      }
    }
    if (ctx !== void 0) {
      entry.context = ctx;
    }
    return JSON.stringify(entry);
  }
  /**
   * Outputs a debug log.
   * @since v1.3.0
   */
  debug(msg, ctx) {
    if (this._options.structured) {
      this._logger?.debug?.(this._formatStructured("debug", msg, ctx));
    } else {
      ctx !== void 0 ? this._logger?.debug?.(msg, ctx) : this._logger?.debug?.(msg);
    }
  }
  /**
   * Outputs an info log.
   * @since v1.3.0
   */
  info(msg, ctx) {
    if (this._options.structured) {
      this._logger?.info?.(this._formatStructured("info", msg, ctx));
    } else {
      ctx !== void 0 ? this._logger?.info?.(msg, ctx) : this._logger?.info?.(msg);
    }
  }
  /**
   * Outputs a warn log.
   * @since v1.3.0
   */
  warn(msg, ctx) {
    if (this._options.structured) {
      this._logger?.warn?.(this._formatStructured("warn", msg, ctx));
    } else {
      ctx !== void 0 ? this._logger?.warn?.(msg, ctx) : this._logger?.warn?.(msg);
    }
  }
  /**
   * Outputs an error log.
   * @since v1.3.0
   */
  error(msg, ctx) {
    if (this._options.structured) {
      this._logger?.error?.(this._formatStructured("error", msg, ctx));
    } else {
      ctx !== void 0 ? this._logger?.error?.(msg, ctx) : this._logger?.error?.(msg);
    }
  }
  /**
   * Creates a Logger instance.
   * @since v1.3.0
   */
  static create(logger = null, options = {}) {
    const effectiveLogger = logger !== null && _Logger.isValidLogger(logger) ? logger : null;
    return new _Logger(effectiveLogger, options);
  }
  /**
   * Creates a silent logger that discards all output.
   * @since v1.4.0
   */
  static createSilent() {
    const noop = () => {
    };
    return { debug: noop, info: noop, warn: noop, error: noop };
  }
  /**
   * Generates a random 16-character hex trace ID.
   * @since v1.4.0
   */
  static generateTraceId() {
    return __require("crypto").randomBytes(8).toString("hex");
  }
  /**
   * Returns true when the given value is a valid logger (has all four log-level methods).
   * @since v1.4.0
   */
  static isValidLogger(logger) {
    if (!logger || typeof logger !== "object") return false;
    const l = logger;
    return typeof l.debug === "function" && typeof l.info === "function" && typeof l.warn === "function" && typeof l.error === "function";
  }
  static {
    /**
     * Runs `fn` inside an AsyncLocalStorage context tagged with `traceId`.
     * When AsyncLocalStorage is unavailable this is `undefined`.
     * @since v1.4.0
     */
    this.withTraceId = _storage ? (fn, traceId) => _storage.run({ traceId: traceId ?? _Logger.generateTraceId() }, fn) : void 0;
  }
  static {
    /**
     * Returns the trace ID from the current AsyncLocalStorage context, or `null` if none.
     * When AsyncLocalStorage is unavailable this is `undefined`.
     * @since v1.4.0
     */
    this.getTraceId = _storage ? () => _storage.getStore()?.traceId ?? null : void 0;
  }
  /**
   * Creates a logger that prepends an ISO timestamp to every message.
   * @since v1.4.0
   */
  static createWithTimestamp(customLogger) {
    const base = new _Logger(customLogger ?? null);
    const ts = () => (/* @__PURE__ */ new Date()).toISOString();
    return {
      debug: (msg, ...args) => base.debug(`${ts()} ${msg}`, ...args),
      info: (msg, ...args) => base.info(`${ts()} ${msg}`, ...args),
      warn: (msg, ...args) => base.warn(`${ts()} ${msg}`, ...args),
      error: (msg, ...args) => base.error(`${ts()} ${msg}`, ...args)
    };
  }
};

// src/entry/runtime-core.ts
var MonSQLizeRuntime = class {
  constructor(options = {}) {
    this.options = options;
    this._connected = false;
    this._events = new EventEmitter();
    this._client = null;
    this._defaultDb = null;
    this._poolManager = null;
    this._syncManager = null;
    this._slowQueryLogManager = null;
    this._sagaOrchestrator = null;
    this._transactionManager = null;
    this._lockManager = null;
    this._iidCache = null;
    this._modelInstances = /* @__PURE__ */ new Map();
    this._connectionPromise = null;
    const type = options.type;
    if (!type || !["mongodb"].includes(type)) {
      throw createError(ErrorCodes.UNSUPPORTED_DATABASE, "Invalid database type. Supported types are: mongodb");
    }
    this.options = {
      ...options,
      type
    };
    if (options.maxTimeMS !== void 0 && options.maxTimeMS !== null) {
      validateRange(options.maxTimeMS, 1, 3e5, "maxTimeMS");
    }
    if (options.findLimit !== void 0 && options.findLimit !== null) {
      validateRange(options.findLimit, 1, 1e4, "findLimit");
    }
    if (options.findPageMaxLimit !== void 0 && options.findPageMaxLimit !== null) {
      validateRange(options.findPageMaxLimit, 1, 1e4, "findPageMaxLimit");
    }
    this._cache = MemoryCache.getOrCreateCache(options.cache);
    this._logger = Logger.create(options.logger ?? null);
    this._cacheLockManager = new CacheLockManager({ logger: options.logger ?? null });
    this._cache.setLockManager(this._cacheLockManager);
    this._runtimeDefaults = this._buildRuntimeDefaults();
    this._adapterCacheOverride = void 0;
    this._adapterBridge = {};
    Object.defineProperties(this._adapterBridge, {
      db: {
        enumerable: true,
        get: () => this._defaultDb?.raw() ?? null
      },
      client: {
        enumerable: true,
        get: () => this._client
      },
      cache: {
        enumerable: true,
        get: () => this.resolveAdapterCache(),
        set: (value) => {
          this._adapterCacheOverride = value;
        }
      },
      instanceId: {
        enumerable: true,
        get: () => this._runtimeDefaults.namespace?.instanceId
      }
    });
    Object.defineProperties(this._adapterBridge, {
      ping: {
        enumerable: true,
        value: async () => {
          this.ensureConnected();
          return this.db().admin().ping();
        }
      },
      buildInfo: {
        enumerable: true,
        value: async () => {
          this.ensureConnected();
          return this.db().admin().buildInfo();
        }
      },
      serverStatus: {
        enumerable: true,
        value: async (options2) => {
          this.ensureConnected();
          return this.db().admin().serverStatus(options2 ?? {});
        }
      },
      stats: {
        enumerable: true,
        value: async (options2) => {
          this.ensureConnected();
          return this.db().admin().stats(options2 ?? {});
        }
      },
      listDatabases: {
        enumerable: true,
        value: async (options2) => {
          this.ensureConnected();
          return this.db().listDatabases(options2 ?? {});
        }
      },
      dropDatabase: {
        enumerable: true,
        value: async (name, options2) => {
          this.ensureConnected();
          if (!name || typeof name !== "string") {
            throw new Error("Database name is required and must be a non-empty string");
          }
          if (!options2?.confirm) {
            const err = new Error(
              "dropDatabase requires explicit confirmation. Pass { confirm: true } to proceed.\n\n\u26A0\uFE0F  WARNING: This will DELETE ALL DATA in the database!\n\u26A0\uFE0F  This operation CANNOT BE UNDONE!"
            );
            err.code = "CONFIRMATION_REQUIRED";
            throw err;
          }
          const isProduction = process.env["NODE_ENV"] === "production";
          if (isProduction && !options2?.allowProduction) {
            const err = new Error("dropDatabase is blocked in production. Pass { allowProduction: true } to override.");
            err.code = "PRODUCTION_BLOCKED";
            throw err;
          }
          if (!this._client) {
            throw createError(ErrorCodes.NOT_CONNECTED, "MonSQLize is not connected yet.");
          }
          await this._client.db(name).dropDatabase();
          return { dropped: true, database: name, timestamp: /* @__PURE__ */ new Date() };
        }
      },
      listCollections: {
        enumerable: true,
        value: async (options2) => {
          this.ensureConnected();
          const opts = options2 ?? {};
          const nameOnly = opts["nameOnly"] === true;
          const filter = { ...opts };
          delete filter["nameOnly"];
          const results = await this.db().listCollections(filter);
          if (nameOnly) {
            return results.map((c) => c.name);
          }
          return results;
        }
      },
      runCommand: {
        enumerable: true,
        value: async (command, options2) => {
          this.ensureConnected();
          if (command === null || typeof command !== "object") {
            throw new Error("Command must be a non-null object");
          }
          return this.db().runCommand(command, options2 ?? {});
        }
      }
    });
    Object.defineProperty(this._adapterBridge, "_iidCache", {
      enumerable: true,
      get: () => this._iidCache,
      set: (value) => {
        this._iidCache = value;
      }
    });
    Object.defineProperty(this._adapterBridge, "collection", {
      enumerable: true,
      value: (dbName, collName) => {
        if (!this._client) {
          throw createError(ErrorCodes.NOT_CONNECTED, "MonSQLize is not connected yet.");
        }
        const nativeColl = this._client.db(dbName).collection(collName);
        const withSlowQuery = async (op, exec, query) => {
          const t0 = performance.now();
          const result = await exec();
          const durationMs = Math.max(1, Math.ceil(performance.now() - t0));
          const threshold = this.options.slowQueryMs ?? 500;
          const manager = this.initializeSlowQueryLogManager();
          if (manager && durationMs >= threshold) {
            const entry = {
              database: dbName,
              collection: collName,
              operation: op,
              durationMs,
              query,
              timestamp: /* @__PURE__ */ new Date()
            };
            await manager.save(entry);
            this.emit("slow-query", entry);
            this.emit("query", entry);
          }
          return result;
        };
        return {
          find: async (query, options2) => withSlowQuery("find", () => nativeColl.find(query ?? {}, options2).toArray(), query),
          findOne: async (query, options2) => withSlowQuery("findOne", () => nativeColl.findOne(query, options2), query),
          insertOne: async (doc, options2) => withSlowQuery("insertOne", () => nativeColl.insertOne(doc, options2)),
          insertMany: async (docs, options2) => withSlowQuery("insertMany", () => nativeColl.insertMany(docs, options2)),
          updateOne: async (filter, update, options2) => withSlowQuery("updateOne", () => nativeColl.updateOne(filter, update, options2)),
          updateMany: async (filter, update, options2) => withSlowQuery("updateMany", () => nativeColl.updateMany(filter, update, options2)),
          deleteOne: async (filter, options2) => withSlowQuery("deleteOne", () => nativeColl.deleteOne(filter, options2)),
          deleteMany: async (filter, options2) => withSlowQuery("deleteMany", () => nativeColl.deleteMany(filter, options2)),
          aggregate: async (pipeline, options2) => withSlowQuery("aggregate", () => nativeColl.aggregate(pipeline, options2).toArray()),
          countDocuments: async (filter, options2) => withSlowQuery("countDocuments", () => nativeColl.countDocuments(filter ?? {}, options2)),
          drop: async () => nativeColl.drop()
        };
      }
    });
    Object.defineProperty(this._adapterBridge, "slowQueryLogManager", {
      enumerable: true,
      configurable: true,
      get: () => this._slowQueryLogManager
    });
    const _deepMerge = (base, patch) => {
      const out = { ...base };
      for (const k of Object.keys(patch || {})) {
        const v = patch[k];
        if (v && typeof v === "object" && !Array.isArray(v)) {
          out[k] = _deepMerge(base[k] || {}, v);
        } else if (v !== void 0) {
          out[k] = v;
        }
      }
      return out;
    };
    const DEFAULTS = {
      maxTimeMS: 2e3,
      findLimit: 10,
      slowQueryMs: 500,
      namespace: { scope: "database" },
      findPageMaxLimit: 500,
      cursorSecret: void 0,
      log: { slowQueryTag: { event: "slow_query", code: "SLOW_QUERY" } }
    };
    this.defaults = Object.freeze(_deepMerge(DEFAULTS, {
      maxTimeMS: options.maxTimeMS,
      findLimit: options.findLimit,
      findPageMaxLimit: options.findPageMaxLimit,
      slowQueryMs: options.slowQueryMs,
      namespace: options.namespace,
      cursorSecret: options.cursorSecret,
      autoConvertObjectId: options.autoConvertObjectId,
      log: options.log,
      slowQueryLog: options.slowQueryLog,
      cacheAutoInvalidate: options.cacheAutoInvalidate
    }));
    this.autoConvertConfig = this._initAutoConvertConfig(options.autoConvertObjectId, options.type);
  }
  /** v1-compatible: public logger access (tests may monkey-patch .warn/.info). */
  get logger() {
    return this._logger;
  }
  /** v1-compatible: initialize autoConvertConfig from constructor options. */
  _initAutoConvertConfig(config, type) {
    if (type !== "mongodb") {
      return { enabled: false };
    }
    if (config === false) {
      return { enabled: false };
    }
    const defaults = { enabled: true, excludeFields: [], customFieldPatterns: [], maxDepth: 10, logLevel: "warn" };
    if (config === true || config === void 0) {
      return defaults;
    }
    if (typeof config === "object" && config !== null) {
      if (config.enabled === false) {
        return { enabled: false };
      }
      return {
        ...defaults,
        ...config,
        enabled: true
      };
    }
    return defaults;
  }
  _buildRuntimeDefaults() {
    const o = this.options;
    const defaults = {};
    if (o.maxTimeMS !== void 0) defaults.maxTimeMS = o.maxTimeMS;
    if (o.findLimit !== void 0) defaults.findLimit = o.findLimit;
    if (o.findPageMaxLimit !== void 0) defaults.findPageMaxLimit = o.findPageMaxLimit;
    if (o.slowQueryMs !== void 0) defaults.slowQueryMs = o.slowQueryMs;
    defaults.autoConvertObjectId = o.autoConvertObjectId !== void 0 ? o.autoConvertObjectId : o.type === "mongodb" || !o.type ? true : false;
    if (o.cursorSecret !== void 0) defaults.cursorSecret = o.cursorSecret;
    if (o.namespace !== void 0) defaults.namespace = o.namespace;
    if (o.countQueue?.enabled) {
      defaults.countQueue = new CountQueue({
        concurrency: o.countQueue.concurrency,
        maxQueueSize: o.countQueue.maxQueueSize,
        timeout: o.countQueue.timeout
      });
    }
    return defaults;
  }
  /**
   * Establishes the database connection and returns the standard accessor set for the current runtime.
   *
   * Behavior:
   * - The first call actually connects to MongoDB and initializes all enabled capabilities
   * - Subsequent calls reuse the existing connection
   * - Concurrent calls share the same in-progress connection promise to avoid duplicate connections
   *
   * @returns {Promise<{ collection: (name: string) => CollectionFacade; db: (name?: string) => DbFacade; use: (name: string) => { collection: (collectionName: string) => CollectionFacade; model: <TDocument = Record<string, unknown>>(modelName: string) => ModelInstance<TDocument>; }; instance: MonSQLizeRuntime; }>} Returns an accessor object containing `collection`, `db`, `use`, and `instance`.
   * @throws {Error} Thrown when the connection configuration is invalid, the MongoDB connection fails, or initialization of a capability fails.
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
        cache: this.resolveAdapterCache(),
        queryCache: this.resolveAdapterCache(),
        getCache: () => this.resolveAdapterCache(),
        getQueryCache: () => this.resolveAdapterCache(),
        logger: this._logger,
        defaults: this._runtimeDefaults,
        cacheAutoInvalidate: !!this.options.cache?.autoInvalidate
      });
      await this.ensurePoolManager();
      this.initializeSagaOrchestrator();
      this.initializeSlowQueryLogManager();
      await this.initializeSyncManager();
      this._connected = true;
      await this._loadModels();
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
   * Returns the local cache instance bound to the current runtime.
   *
   * @returns {MemoryCache}
   * @since v1.3.0
   */
  getCache() {
    return this._cache;
  }
  /**
   * Returns a snapshot of the current instance's default public configuration.
   *
   * This method exposes the lightweight default state of the current instance, rather than the full internal configuration object.
   *
   * @returns {Record<string, unknown>}
   * @since v1.3.0
   */
  getDefaults() {
    const d = this.defaults;
    return {
      type: this.options.type,
      databaseName: this.options.databaseName,
      sync: this.options.sync,
      slowQueryLog: d.slowQueryLog ?? this.options.slowQueryLog ?? false,
      maxTimeMS: d.maxTimeMS,
      findLimit: d.findLimit,
      findPageMaxLimit: d.findPageMaxLimit,
      autoConvertObjectId: d.autoConvertObjectId,
      cursorSecret: this.options.cursorSecret !== void 0 ? "***" : void 0,
      namespace: d.namespace,
      log: d.log,
      countQueue: this.options.countQueue,
      models: this.options.models
    };
  }
  /**
   * Closes the connection.
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
    this._iidCache = null;
    this._modelInstances.clear();
    this.emit("closed", {
      type: this.options.type,
      db: this.resolveDatabaseName()
    });
  }
  /**
   * Health check.
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
   * v1-compat: Exposes the cache property publicly.
   * In v1, `msq.cache` directly exposes the internal MemoryCache instance.
   * @since v1.3.0 (v1-compat)
   */
  get cache() {
    return this._cache;
  }
  /**
   * v1-compat adapter accessor.
   *
   * In v1 tests, the native MongoDB Db object is accessed via `msq._adapter.db`.
   * @since v1.3.0 (v1-compat)
   */
  get _adapter() {
    if (this._client === null) return null;
    return this._adapterBridge;
  }
  /**
   * v1-compat: Connection instance; null when not connected or after close.
   * In v1, `dbInstance` is the { collection, db } object returned by connect().
   * @since v1.3.0 (v1-compat)
   */
  get dbInstance() {
    if (this._client === null) return null;
    return {
      collection: (name) => this.collection(name),
      db: (name) => this.db(name)
    };
  }
  /**
   * v1-compat: Connection-lock Promise; set to null after the connection succeeds or fails.
   * In v1, `_connecting` is the in-progress connection Promise, set to null after completion.
   * @since v1.3.0 (v1-compat)
   */
  get _connecting() {
    return this._connectionPromise;
  }
  /**
   * Returns the Collection accessor for the default database.
   *
   * @param {string} name - Collection name.
   * @returns {CollectionFacade}
   * @throws {Error} Throws `NOT_CONNECTED` when the runtime is not yet connected.
   * @since v1.3.0
   */
  collection(name) {
    if (!name || typeof name !== "string" || !name.trim()) {
      const err = new Error("Collection name must be a non-empty string");
      err.code = "INVALID_COLLECTION_NAME";
      throw err;
    }
    const self = this;
    if (!self["dbInstance"]) {
      throw createError(ErrorCodes.NOT_CONNECTED, "Database is not connected. Call connect() before accessing collections.");
    }
    if (this._client) {
      if (!this._iidCache) this._iidCache = /* @__PURE__ */ new Map();
      return this.db().collection(name);
    }
    return self["dbInstance"].collection(name);
  }
  /**
   * Returns the database accessor.
   *
   * @param {string} [name] - Optional database name; uses the default database when omitted.
   * @returns {DbFacade}
   * @throws {Error} Throws `NOT_CONNECTED` when the runtime is not yet connected.
   * @since v1.3.0
   */
  db(name) {
    if (name !== void 0) {
      if (!name || typeof name !== "string" || !name.trim()) {
        const err = new Error("Database name must be a non-empty string");
        err.code = "INVALID_DATABASE_NAME";
        throw err;
      }
    }
    this.ensureConnected();
    if (!this._client) {
      throw createError(ErrorCodes.NOT_CONNECTED, "MonSQLize is not connected yet.");
    }
    const databaseName = name ?? this.resolveDatabaseName();
    if (databaseName === this.resolveDatabaseName() && this._defaultDb) {
      return this._defaultDb;
    }
    return new MongoDbAccessor(databaseName, this._client.db(databaseName), {
      cache: this.resolveAdapterCache(),
      queryCache: this.resolveAdapterCache(),
      getCache: () => this.resolveAdapterCache(),
      getQueryCache: () => this.resolveAdapterCache(),
      logger: this._logger,
      defaults: this._runtimeDefaults,
      cacheAutoInvalidate: !!this.options.cache?.autoInvalidate
    });
  }
  resolveAdapterCache() {
    return this._adapterCacheOverride === void 0 ? this._cache : this._adapterCacheOverride;
  }
  /**
   * Returns the accessor set scoped to the specified database.
   *
   * @param {string} name - Target database name.
   * @returns {{ collection: (collectionName: string) => CollectionFacade; model: <TDocument = Record<string, unknown>>(modelName: string) => ModelInstance<TDocument>; }} Returns `collection()` and `model()` accessors bound to the given database.
   * @throws {Error} Throws `NOT_CONNECTED` when the runtime is not yet connected.
   * @since v1.3.0
   */
  use(name) {
    const self = this;
    if (!self["dbInstance"]) {
      throw createError(ErrorCodes.NOT_CONNECTED, "Database is not connected. Call connect() first.");
    }
    return {
      collection: (collectionName) => this.scopedCollection(collectionName, { database: name }),
      model: (modelName) => this.scopedModel(modelName, { database: name })
    };
  }
  /**
   * Returns the accessor set scoped to the specified connection pool.
   *
   * @param {string} poolName - Name of the connection pool.
   * @returns {{ collection: (name: string) => CollectionFacade; model: <TDocument = Record<string, unknown>>(name: string) => ModelInstance<TDocument>; use: (dbName: string) => { collection: (name: string) => CollectionFacade; model: <TDocument = Record<string, unknown>>(name: string) => ModelInstance<TDocument>; }; }} Returns collection/model/use accessors bound to the connection pool.
   * @throws {Error} Thrown when the runtime is not yet connected, `options.pools` is not configured, or the specified pool does not exist.
   * @since v1.3.0
   */
  pool(poolName) {
    const self = this;
    if (!self["dbInstance"]) {
      throw createError(ErrorCodes.NOT_CONNECTED, "Database is not connected. Call connect() first.");
    }
    const poolMgr = self["_poolManager"];
    if (!poolMgr) {
      throw createError(ErrorCodes.NO_POOL_MANAGER, "No pool manager configured. Add pools to MonSQLize constructor options.");
    }
    const getPoolV1 = poolMgr["_getPool"];
    const getPoolV2 = poolMgr["getPool"];
    let client = null;
    if (typeof getPoolV1 === "function") {
      client = getPoolV1.call(poolMgr, poolName);
    } else if (typeof getPoolV2 === "function") {
      try {
        client = getPoolV2.call(poolMgr, poolName);
      } catch {
        client = null;
      }
    }
    if (!client) {
      const getNames = poolMgr["getPoolNames"];
      const available = typeof getNames === "function" ? getNames.call(poolMgr) : [];
      const err = createError(ErrorCodes.POOL_NOT_FOUND, `Pool '${poolName}' not found. Available pools: [${available.join(", ")}]`);
      err["available"] = available;
      throw err;
    }
    return {
      collection: (name) => this.scopedCollection(name, { pool: poolName }),
      model: (name) => this.scopedModel(name, { pool: poolName }),
      use: (dbName) => ({
        collection: (name) => this.scopedCollection(name, { pool: poolName, database: dbName }),
        model: (name) => this.scopedModel(name, { pool: poolName, database: dbName })
      })
    };
  }
  /**
   * Returns the Collection accessor under the optional database / connection pool scope.
   *
   * @param {string} name - Collection name.
   * @param {{ database?: string; pool?: string; }} [options={}] - Optional database name or connection pool name.
   * @returns {CollectionFacade}
   * @throws {Error} Thrown when the runtime is not yet connected or the specified pool does not exist.
   * @since v1.3.0
   */
  scopedCollection(name, options = {}) {
    const self = this;
    if (!self["dbInstance"]) {
      throw createError(ErrorCodes.NOT_CONNECTED, "Database is not connected. Call connect() first.");
    }
    const { pool, database } = options;
    if (!pool && !database) {
      return this.collection(name);
    }
    return this._resolveModelCollection(name, { pool, database });
  }
  /**
   * v1-compat: Resolves the model/collection route, supporting pool and database switching.
   * In mock environments uses _adapter.collectionFromClient; in real v2 uses the pool manager's selectPool.
   * @since v1.3.0
   */
  _resolveModelCollection(collectionName, connection) {
    const poolName = connection.pool;
    const self = this;
    const optsRaw = self["options"];
    const defaultDb = self["databaseName"] ?? optsRaw?.["databaseName"] ?? optsRaw?.["database"] ?? "default";
    const dbName = connection.database || defaultDb;
    if (poolName) {
      const poolMgr = self["_poolManager"];
      if (!poolMgr) {
        throw createError(ErrorCodes.NO_POOL_MANAGER, `Model '${collectionName}' requires pool '${poolName}' but no pools are configured. Add 'pools' to MonSQLize constructor options.`);
      }
      let client = null;
      const getPoolV1 = poolMgr["_getPool"];
      const getPoolV2 = poolMgr["getPool"];
      if (typeof getPoolV1 === "function") {
        client = getPoolV1.call(poolMgr, poolName);
      } else if (typeof getPoolV2 === "function") {
        try {
          client = getPoolV2.call(poolMgr, poolName);
        } catch {
          client = null;
        }
      }
      if (!client) {
        const getNames = poolMgr["getPoolNames"];
        const available = typeof getNames === "function" ? getNames.call(poolMgr) : [];
        const err = createError(ErrorCodes.POOL_NOT_FOUND, `Pool '${poolName}' not found. Available pools: [${available.join(", ")}]`);
        err["available"] = available;
        throw err;
      }
      const adapter = self["_adapter"];
      if (adapter && typeof adapter["collectionFromClient"] === "function") {
        return adapter["collectionFromClient"](client, dbName, collectionName);
      }
      if (this._poolManager) {
        const selected = this._poolManager.selectPool("read", { pool: poolName, databaseName: dbName });
        return new MongoCollectionAccessor(
          dbName,
          collectionName,
          selected.collection(dbName, collectionName),
          { cache: this._cache, logger: this._logger, defaults: this._runtimeDefaults }
        );
      }
      return null;
    }
    if (this._client) {
      return this.db(dbName).collection(collectionName);
    }
    const dbInst = self["dbInstance"];
    if (!dbInst) {
      throw createError(ErrorCodes.NOT_CONNECTED, "Database is not connected. Call connect() first.");
    }
    return dbInst.db(dbName).collection(collectionName);
  }
  /**
   * Returns the Model accessor scoped to the specified database (v1-compat implementation).
   * @since v1.3.0
   */
  scopedModel(name, options = {}) {
    const self = this;
    if (!self["dbInstance"]) {
      throw createError(ErrorCodes.NOT_CONNECTED, "Database is not connected. Call connect() first.");
    }
    if (this._client) {
      return this.createModelInstance(name, options);
    }
    const registered = Model.get(name);
    if (!registered) {
      throw createError(ErrorCodes.MODEL_NOT_DEFINED, `Model '${name}' is not defined. Call Model.define() first.`);
    }
    const regDef = registered.definition;
    const actualCollectionName = regDef.collection || regDef.name || registered.collectionName;
    const merged = { ...regDef.connection ?? {}, ...options };
    const { pool, database } = merged;
    const collection = pool || database ? this._resolveModelCollection(actualCollectionName, { pool, database }) : self["dbInstance"].collection(actualCollectionName);
    return new ModelInstance(
      collection,
      this,
      {
        collectionName: actualCollectionName,
        dbName: database ?? self["databaseName"] ?? "default",
        poolName: pool,
        definition: registered.definition
      }
    );
  }
  /**
   * Returns the Model accessor for the default database.
   *
   * @template TDocument
   * @param {string} name - Name of the registered model.
   * @returns {ModelInstance<TDocument>}
   * @throws {Error} Thrown when the runtime is not yet connected or the model is not registered.
   * @since v1.3.0
   */
  model(name) {
    if (this._client) {
      this.ensureConnected();
      return this.createModelInstance(name, {
        database: this.resolveDatabaseName()
      });
    }
    const self = this;
    if (!self["dbInstance"]) {
      throw createError(ErrorCodes.NOT_CONNECTED, "Database is not connected. Call connect() first.");
    }
    if (self["_modelInstances"] != null) {
      const cache = self["_modelInstances"];
      if (cache.has(name)) {
        if (!Model._redefinedNames.has(name)) {
          return cache.get(name);
        }
        cache.delete(name);
        Model._redefinedNames.delete(name);
      }
    }
    const registered = Model.get(name);
    if (!registered) {
      throw createError(ErrorCodes.MODEL_NOT_DEFINED, `Model '${name}' is not defined.`);
    }
    const regDef2 = registered.definition;
    const actualCollectionName = regDef2.collection || regDef2.name || registered.collectionName;
    const connection = regDef2.connection;
    const collection = connection && (connection.pool || connection.database) ? this._resolveModelCollection(actualCollectionName, connection) : self["dbInstance"].collection(actualCollectionName);
    const instance = new ModelInstance(
      collection,
      this,
      {
        collectionName: actualCollectionName,
        dbName: self["databaseName"] ?? "default",
        definition: registered.definition
      }
    );
    if (self["_modelInstances"] == null) {
      self["_modelInstances"] = /* @__PURE__ */ new Map();
    }
    self["_modelInstances"].set(name, instance);
    return instance;
  }
  /**
   * Manually starts a transaction session.
   *
   * @param {TransactionOptions} [options={}] - Transaction options.
   * @returns {Promise<Transaction>}
   * @throws {Error} Throws `NOT_CONNECTED` when the runtime is not yet connected.
   * @since v1.3.0
   */
  async startSession(options = {}) {
    this.ensureConnected();
    return this.getTransactionManager().startSession(options);
  }
  /**
   * Executes a callback inside a transaction with automatic lifecycle management.
   *
   * @template T
   * @param {(transaction: Transaction) => Promise<T>} callback - Transaction body.
   * @param {TransactionOptions} [options={}] - Transaction options.
   * @returns {Promise<T>} Resolves with the callback's return value.
   * @throws {Error} Thrown when the runtime is not yet connected or the transaction fails.
   * @since v1.3.0
   */
  async withTransaction(callback, options = {}) {
    this.ensureConnected();
    return this.getTransactionManager().withTransaction(callback, options);
  }
  /**
   * Executes an async callback under a distributed lock with automatic acquire/release lifecycle.
   *
   * @template T
   * @param {string} key - Lock key.
   * @param {() => Promise<T>} callback - The protected async logic.
   * @param {LockOptions} [options={}] - Lock options.
   * @returns {Promise<T>} Resolves with the callback's return value.
   * @throws {Error} Thrown when the runtime is not yet connected or the lock cannot be acquired.
   * @since v1.4.0
   */
  async withLock(key, callback, options = {}) {
    this.ensureConnected();
    return this.getLockManager().withLock(key, callback, options);
  }
  /**
   * Acquires a lock (blocking with retries).
   * @since v1.4.0
   */
  async acquireLock(key, options = {}) {
    this.ensureConnected();
    return this.getLockManager().acquireLock(key, options);
  }
  /**
   * Attempts to acquire a lock (non-blocking).
   * @since v1.4.0
   */
  async tryAcquireLock(key, options = {}) {
    this.ensureConnected();
    return this.getLockManager().tryAcquireLock(key, options);
  }
  /**
   * Returns the Change Stream sync manager.
   * @since v1.0.9
   */
  getSyncManager() {
    return this._syncManager;
  }
  /**
   * Returns the slow query log manager.
   * @since v1.3.1
   */
  getSlowQueryLogManager() {
    return this._slowQueryLogManager;
  }
  /**
   * Returns the Saga orchestrator.
   * @since v1.1.0
   */
  getSagaOrchestrator() {
    return this.initializeSagaOrchestrator();
  }
  /**
   * Returns the Saga façade.
   * @since v1.1.0
   */
  saga() {
    return this.getSagaOrchestrator();
  }
  /**
   * Records a slow query log entry.
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
   * Queries the slow query log.
   * @since v1.3.1
   */
  async getSlowQueryLogs(filter = {}, options = {}) {
    this.ensureConnected();
    const manager = this.ensureSlowQueryLogManager();
    return manager.query(filter, options);
  }
  /**
   * Registers a Saga definition.
   * @since v1.1.0
   */
  defineSaga(definition) {
    this.initializeSagaOrchestrator().define(definition);
  }
  /**
   * Executes a registered Saga.
   * @since v1.1.0
   */
  async executeSaga(name, data) {
    return this.initializeSagaOrchestrator().execute(name, data);
  }
  /**
   * Lists all registered Sagas.
   * @since v1.1.0
   */
  async listSagas() {
    return this.initializeSagaOrchestrator().listSagas();
  }
  /**
   * Returns Saga statistics.
   * @since v1.1.0
   */
  getSagaStats() {
    return this.initializeSagaOrchestrator().getStats();
  }
  /**
   * Manually starts synchronization.
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
   * Manually stops synchronization.
   * @since v1.0.9
   */
  async stopSync() {
    await this._syncManager?.stop();
  }
  /**
   * Returns sync statistics.
   * @since v1.0.9
   */
  getSyncStats() {
    return this._syncManager?.getStats() ?? null;
  }
  /**
   * Subscribes to an event.
   * @since v1.3.0
   */
  on(event, handler) {
    this._events.on(event, handler);
  }
  /**
   * Subscribes to an event once.
   * @since v1.3.0
   */
  once(event, handler) {
    this._events.once(event, handler);
  }
  /**
   * Unsubscribes from an event.
   * @since v1.3.0
   */
  off(event, handler) {
    this._events.off(event, handler);
  }
  /**
   * Emits an event.
   * @since v1.3.0
   */
  emit(event, payload) {
    if (event === "error" && this._events.listenerCount("error") === 0) {
      this._logger.error("[MonSQLizeRuntime] error event", payload);
      return;
    }
    this._events.emit(event, payload);
  }
  /**
   * Adds a connection pool (v1-compat).
   * @since v1.3.0
   */
  async addPool(config) {
    await this.requirePoolManager().addPool(config);
  }
  /**
   * Removes a connection pool (v1-compat).
   * @since v1.3.0
   */
  async removePool(name) {
    await this.requirePoolManager().removePool(name);
  }
  /**
   * Returns all connection pool names (v1-compat).
   * @since v1.3.0
   */
  getPoolNames() {
    return this.requirePoolManager().getPoolNames();
  }
  /**
   * Returns connection pool statistics (v1-compat).
   * @since v1.3.0
   */
  getPoolStats() {
    return Object.values(this.requirePoolManager().getPoolStats());
  }
  /**
   * Returns connection pool health status (v1-compat).
   * @since v1.3.0
   */
  getPoolHealth() {
    return Object.values(this.requirePoolManager().getHealthStatus());
  }
  /**
   * Returns lock statistics (v1-compat).
   * @since v1.3.0
   */
  getLockStats() {
    return this._lockManager?.getStats() ?? null;
  }
  /**
   * Lists all databases (v1-compat; delegates to the default db accessor).
   * @since v1.3.0
   */
  async listDatabases(options = {}) {
    this.ensureConnected();
    const dbAccessor = this.db();
    return dbAccessor.listDatabases(options);
  }
  /**
   * Drops the specified database (v1-compat; delegates to the default db accessor).
   * @since v1.3.0
   */
  async dropDatabase(options = { confirm: false }) {
    this.ensureConnected();
    const dbAccessor = this.db();
    return dbAccessor.dropDatabase(options);
  }
  /**
   * Lists all collections in the current database (v1-compat).
   * @since v1.3.0
   */
  async listCollections(filter = {}, options = {}) {
    this.ensureConnected();
    const dbAccessor = this.db();
    return dbAccessor.listCollections(filter, options);
  }
  /**
   * Executes a raw database command (v1-compat).
   * @since v1.3.0
   */
  async runCommand(command, options = {}) {
    this.ensureConnected();
    const dbAccessor = this.db();
    return dbAccessor.runCommand(command, options);
  }
  ensureConnected() {
    if (!this._connected) {
      throw createError(ErrorCodes.NOT_CONNECTED, "Database is not connected. Please call connect() first.");
    }
  }
  createRuntimeAccessors() {
    const defaultDb = this._defaultDb;
    return {
      collection: (name) => {
        if (!name || typeof name !== "string" || !name.trim()) {
          const err = new Error("Collection name must be a non-empty string");
          err.code = "INVALID_COLLECTION_NAME";
          throw err;
        }
        if (!this._iidCache) this._iidCache = /* @__PURE__ */ new Map();
        return defaultDb.collection(name);
      },
      db: (name) => this.db(name),
      use: (name) => this.use(name),
      instance: this
    };
  }
  resolveDatabaseName() {
    return this.options["database"] ?? this.options.databaseName ?? "default";
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
  /**
   * Automatically loads Model definition files from the configured path (mirrors v1 behavior).
   *
   * Supports two configuration formats:
   * - String: `models: './models'` → scans for `*.model.{js,ts,mjs,cjs}`, non-recursive
   * - Object: `models: { path, pattern?, recursive? }` → full control
   *
   * Each file must export an object containing a `name` field (i.e. the argument to Model.define()).
   */
  async _loadModels(opts = {}) {
    const modelsConfig = this.options.models;
    if (!modelsConfig) return;
    if (typeof modelsConfig !== "string" && typeof modelsConfig !== "object") return;
    const { readdirSync } = await import("node:fs");
    const { resolve, join, isAbsolute } = await import("node:path");
    const { createRequire } = await import("node:module");
    let targetPath;
    let pattern;
    let recursive;
    if (typeof modelsConfig === "string") {
      targetPath = isAbsolute(modelsConfig) ? modelsConfig : resolve(process.cwd(), modelsConfig);
      pattern = "*.model.{js,ts,mjs,cjs}";
      recursive = false;
    } else {
      const p = modelsConfig.path;
      targetPath = isAbsolute(p) ? p : resolve(process.cwd(), p);
      pattern = modelsConfig.pattern ?? "*.model.{js,ts,mjs,cjs}";
      recursive = modelsConfig.recursive ?? false;
    }
    const globToRegex = (glob) => {
      const escaped = glob.replace(/\./g, "\\.").replace(/\{([^}]+)\}/g, (_, inner) => `(?:${inner.split(",").join("|")})`).replace(/\*/g, "[^/\\\\]*");
      return new RegExp(`^${escaped}$`);
    };
    const filePattern = globToRegex(pattern);
    const collectFiles = (dir) => {
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        this._logger.warn(`[Models] cannot read directory: ${dir}`);
        return [];
      }
      const files2 = [];
      for (const entry of entries) {
        const entryName = typeof entry.name === "string" ? entry.name : entry.name.toString();
        if (entry.isDirectory() && recursive) {
          files2.push(...collectFiles(join(dir, entryName)));
        } else if (entry.isFile() && filePattern.test(entryName)) {
          files2.push(join(dir, entryName));
        }
      }
      return files2;
    };
    const files = collectFiles(targetPath);
    if (files.length === 0) return;
    const req = createRequire(resolve(process.cwd(), "package.json"));
    for (const file of files) {
      try {
        delete req.cache[req.resolve(file)];
        const mod = req(file);
        const definition = mod.default ?? mod;
        if (!definition?.name) {
          this._logger.warn(`[Models] ${file}: exported object must have a 'name' field`);
          continue;
        }
        if (opts.reload && Model.has(definition.name)) {
          Model.redefine(definition.name, definition);
        } else {
          Model.define(definition.name, definition);
        }
      } catch (err) {
        this._logger.warn(`[Models] failed to load ${file}`, err);
      }
    }
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
    let slowQueryLogConfig = this.options.slowQueryLog;
    if (this.options.slowQueryMs !== void 0 && typeof slowQueryLogConfig === "object" && slowQueryLogConfig !== null) {
      const config = slowQueryLogConfig;
      if (!config.filter?.minExecutionTimeMs) {
        slowQueryLogConfig = {
          ...config,
          filter: {
            ...config.filter,
            minExecutionTimeMs: this.options.slowQueryMs
          }
        };
      }
    }
    this._slowQueryLogManager = new SlowQueryLogManager(
      slowQueryLogConfig,
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
      throw createError(ErrorCodes.MODEL_NOT_DEFINED, `Model '${name}' is not defined.`);
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
  BatchQueue,
  CacheLockManager,
  ChangeStreamSyncManager,
  ConnectionPoolManager,
  DistributedCacheInvalidator,
  FunctionCache,
  Logger,
  MemoryCache,
  Model,
  MonSQLize,
  ResumeTokenStore,
  SagaOrchestrator,
  SlowQueryLogConfigManager,
  SlowQueryLogManager,
  TransactionManager,
  createExpression,
  createRedisCacheAdapter,
  index_default as default,
  expr,
  generateQueryHash,
  validateSyncConfig,
  withCache
};
