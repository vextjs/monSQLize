var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/entry/runtime-core.ts
import { EventEmitter } from "node:events";

// src/capabilities/cache/memory-cache.ts
import { MemoryCache as BaseMemoryCache } from "cache-hub";
var MemoryCache = class extends BaseMemoryCache {
  getStats() {
    const s = super.getStats();
    return { ...s, size: s.entries };
  }
};

// src/capabilities/cache/redis-cache-adapter.ts
import { createRedisCacheAdapter } from "cache-hub/redis";

// src/capabilities/cache/distributed-cache-invalidator.ts
import { randomBytes } from "crypto";
var DistributedCacheInvalidator = class {
  constructor(options) {
    if (!options.cache) {
      throw new Error("DistributedCacheInvalidator requires a cache instance");
    }
    this._cache = options.cache;
    this._logger = options.logger ?? null;
    this.channel = options.channel ?? "monsqlize:cache:invalidate";
    this.instanceId = options.instanceId ?? `instance-${Date.now()}-${randomBytes(4).toString("hex")}`;
    this._stats = { messagesSent: 0, messagesReceived: 0, invalidationsTriggered: 0, errors: 0 };
    if (options.redis) {
      this.pub = options.redis;
      this.sub = options.redis;
    } else if (options.redisUrl) {
      const Redis = __require("ioredis");
      this.pub = new Redis(options.redisUrl);
      this.sub = new Redis(options.redisUrl);
    } else {
      throw new Error("DistributedCacheInvalidator requires either redis or redisUrl");
    }
    this._setupSubscription();
  }
  _setupSubscription() {
    this.sub.subscribe(this.channel, () => {
    });
    this.sub.on("message", async (channel, rawMessage) => {
      if (channel !== this.channel) return;
      let message;
      try {
        message = JSON.parse(rawMessage);
      } catch {
        this._stats.errors++;
        return;
      }
      if (message.type !== "invalidate") return;
      if (message.instanceId === this.instanceId) return;
      this._stats.messagesReceived++;
      try {
        if (this._cache.local) {
          await this._cache.local.delPattern(message.pattern);
          this._logger?.debug(`[DistributedCacheInvalidator] Invalidated local cache: ${message.pattern}`);
        }
        if (this._cache.remote) {
          await this._cache.remote.delPattern(message.pattern);
          this._logger?.debug(`[DistributedCacheInvalidator] Invalidated remote cache: ${message.pattern}`);
        }
        this._stats.invalidationsTriggered++;
      } catch (err) {
        this._stats.errors++;
        this._logger?.error(`[DistributedCacheInvalidator] Cache invalidation error: ${err.message}`);
      }
    });
  }
  async invalidate(pattern) {
    if (!pattern) return;
    const message = JSON.stringify({
      type: "invalidate",
      pattern,
      instanceId: this.instanceId,
      timestamp: Date.now()
    });
    try {
      await this.pub.publish(this.channel, message);
      this._stats.messagesSent++;
      this._logger?.debug(`[DistributedCacheInvalidator] Published invalidation: ${pattern}`);
    } catch (err) {
      this._stats.errors++;
      throw err;
    }
  }
  getStats() {
    return { ...this._stats, instanceId: this.instanceId, channel: this.channel };
  }
  async close() {
    try {
      await this.sub.unsubscribe();
      await this.sub.quit();
      await this.pub.quit();
    } catch (err) {
      this._logger?.error(`[DistributedCacheInvalidator] Error closing connections: ${err.message}`);
    }
  }
};

// src/capabilities/cache/index.ts
import { MultiLevelCache } from "cache-hub";

// src/capabilities/model/schema-dsl.ts
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

// src/capabilities/model/populate-promise.ts
var _a;
_a = Symbol.toStringTag;
var _PopulatePromise = class _PopulatePromise {
  constructor(executor, paths = []) {
    this.executor = executor;
    this.paths = paths;
    this[_a] = "Promise";
  }
  /**
   * Append a populate path and return a new PopulatePromise (chainable).
   */
  populate(path2, options) {
    if (typeof path2 !== "string" && (typeof path2 !== "object" || path2 === null || Array.isArray(path2))) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "populate param must be a string or object");
    }
    const config = typeof path2 === "string" ? { path: path2, ...options } : { ...path2, ...options };
    return new _PopulatePromise(this.executor, [...this.paths, config]);
  }
  /**
   * Trigger the actual query, populate related documents, and return the final Promise.
   */
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

// src/capabilities/model/definition-validator.ts
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
      throw createError(ErrorCodes.INVALID_ARGUMENT, `relations config is missing required field: ${field}`);
    }
    if (typeof value !== "string" || value.trim() === "") {
      throw createError(ErrorCodes.INVALID_ARGUMENT, `relations.${field} must be a string`);
    }
  }
  if (config.single !== void 0 && typeof config.single !== "boolean") {
    throw createError(ErrorCodes.INVALID_ARGUMENT, `relations.single must be a boolean`);
  }
}
function normalizePopulateConfig(path2) {
  return typeof path2 === "string" ? { path: path2 } : path2;
}

// src/capabilities/model/model-registry.ts
var Model = class {
  static {
    // collection name → registered model definition
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.registry = /* @__PURE__ */ new Map();
  }
  static {
    // collection name → revision number (incremented on each define/redefine/undefine, used for hot-reload detection)
    this.revisions = /* @__PURE__ */ new Map();
  }
  static {
    /** Collection names that have been redefined (used by the runtime to trigger hot-reload). */
    this._redefinedNames = /* @__PURE__ */ new Set();
  }
  /**
   * Register a new model definition.
   * Throws MODEL_ALREADY_EXISTS if a model with the same name already exists.
   * Validates the definition, resolves the timestamps option, and pre-validates schema type strings.
   */
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    });
    this.bumpRevision(normalizedName);
  }
  /**
   * Look up a registered model definition; returns undefined if not found.
   */
  static get(collectionName) {
    return this.registry.get(collectionName);
  }
  /** Check whether the given collection name has been registered. */
  static has(collectionName) {
    return this.registry.has(collectionName);
  }
  /** Return a list of all registered collection names. */
  static list() {
    return [...this.registry.keys()];
  }
  /**
   * Unregister the model definition for the given collection name.
   * Returns true if the entry existed and was removed; false if it did not exist.
   */
  static undefine(collectionName) {
    const existed = this.registry.delete(collectionName);
    this.bumpRevision(collectionName);
    return existed;
  }
  /**
   * Re-register a model (deletes the old entry before registering the new one).
   * v1-compat: if validation fails the old entry is not restored (it stays deleted).
   * Used for hot-reload; the runtime is notified via _redefinedNames.
   */
  static redefine(collectionName, definition) {
    const normalizedName = validateCollectionName(collectionName);
    this.registry.delete(normalizedName);
    validateDefinition(definition);
    processTimestamps(definition);
    this._redefinedNames.add(normalizedName);
    this.registry.set(normalizedName, {
      collectionName: normalizedName,
      definition
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    });
    this.bumpRevision(normalizedName);
  }
  /**
   * Clear the entire registry (for test frameworks only).
   * All registered collection names are added to _redefinedNames and their revisions are incremented.
   */
  static _clear() {
    const names = [...this.registry.keys()];
    for (const name of names) {
      this._redefinedNames.add(name);
      this.bumpRevision(name);
    }
    this.registry.clear();
  }
  /**
   * Get the current revision number for a collection name.
   * Incremented on every define / redefine / undefine; used for runtime hot-reload detection.
   */
  static getRevision(collectionName) {
    return this.revisions.get(collectionName) ?? 0;
  }
  static bumpRevision(collectionName) {
    this.revisions.set(collectionName, (this.revisions.get(collectionName) ?? 0) + 1);
  }
};

// src/capabilities/model/model-utils.ts
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
      if (leftValue == null) return direction;
      if (rightValue == null) return -direction;
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

// src/capabilities/model/model-instance-helpers.ts
async function populateModelPath(context, docs, path2) {
  const config = normalizePopulateConfig(path2);
  if (docs.length === 0) {
    return docs;
  }
  const relation = context.relations.get(config.path);
  if (!relation) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, `Undefined relation: ${config.path}`);
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
    database: registered?.definition.connection?.database ?? context.dbName,
    pool: registered?.definition.connection?.pool ?? context.poolName
  };
  const relatedCollection = context.runtime.scopedCollection(relation.from, scope);
  const relatedModel = Model.has(relation.from) ? context.runtime.scopedModel(relation.from, scope) : null;
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
    const isValidNestedConfig = (value) => {
      if (typeof value === "string" || Array.isArray(value)) return true;
      if (typeof value === "object" && value !== null && value.path) return true;
      return false;
    };
    if (!isValidNestedConfig(nestedRaw)) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "nested populate must be a string, array, or object");
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
function hydrateModelDocument(context, doc) {
  if (!doc || typeof doc !== "object") {
    return null;
  }
  const hydrated = { ...doc };
  for (const [name, virtual] of Object.entries(context.definition.virtuals ?? {})) {
    Object.defineProperty(hydrated, name, {
      configurable: true,
      enumerable: true,
      get: () => virtual.get.call(hydrated),
      set: virtual.set ? (value) => virtual.set?.call(hydrated, value) : void 0
    });
  }
  if (typeof context.definition.methods === "function") {
    for (const [name, method] of Object.entries(context.v1InstanceMethods)) {
      Object.defineProperty(hydrated, name, {
        configurable: true,
        enumerable: false,
        writable: false,
        value: (...args) => method.apply(hydrated, args)
      });
    }
  } else {
    for (const [name, method] of Object.entries(context.definition.methods ?? {})) {
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
      value: async () => context.saveDocument(hydrated)
    },
    remove: {
      configurable: true,
      enumerable: false,
      value: async () => context.removeDocument(hydrated)
    },
    validate: {
      configurable: true,
      enumerable: false,
      value: async () => context.validateDocument(hydrated)
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
function validateModelDocument(runtime, document) {
  try {
    if (runtime.schemaError) {
      return {
        valid: false,
        errors: [{ field: "_schema", message: `Schema validation failed: ${runtime.schemaError.message}` }]
      };
    }
    if (!runtime.schemaCache || !runtime.schemaValidateFn) {
      return { valid: true, errors: [] };
    }
    const result = runtime.schemaValidateFn(runtime.schemaCache, document ?? {});
    return {
      valid: result.valid,
      errors: (result.errors ?? []).map((error) => ({
        field: error.field ?? error.path ?? "",
        message: error.message ?? ""
      }))
    };
  } catch (error) {
    return {
      valid: false,
      errors: [{ field: "_schema", message: `Schema validation failed: ${error instanceof Error ? error.message : String(error)}` }]
    };
  }
}
function applyModelDefaults(definition, document) {
  const payload = { ...document ?? {} };
  for (const [key, value] of Object.entries(definition.defaults ?? {})) {
    if (payload[key] === void 0) {
      payload[key] = typeof value === "function" ? value(void 0, payload) : value;
    }
  }
  return payload;
}
async function saveModelDocument(collection, document) {
  const payload = serializeDocument(document);
  if (payload._id !== void 0) {
    await collection.replaceOne({ _id: payload._id }, payload, { upsert: true });
    return document;
  }
  const result = await collection.insertOne(payload);
  document._id = result.insertedId;
  return document;
}
async function removeModelDocument(collection, document) {
  if (document._id === void 0) {
    return false;
  }
  const result = await collection.deleteOne({ _id: document._id });
  return Boolean(result.deletedCount ?? result.acknowledged);
}

// src/capabilities/model/model-soft-delete-helpers.ts
function deletedFilter(filter, softDeleteConfig) {
  if (!softDeleteConfig) {
    return filter ?? {};
  }
  return { ...filter ?? {}, [softDeleteConfig.field]: { $ne: null } };
}
function findWithDeletedDocuments(context, query, options) {
  return new PopulatePromise(async (paths) => {
    const opts = { ...options ?? {}, withDeleted: true };
    const docs = await context.collection.find(query, opts);
    return context.populateDocuments(context.hydrateDocuments(docs), paths);
  });
}
function findOnlyDeletedDocuments(context, query, options) {
  return new PopulatePromise(async (paths) => {
    const docs = await context.collection.find(deletedFilter(query, context.softDeleteConfig), options);
    return context.populateDocuments(context.hydrateDocuments(docs), paths);
  });
}
function findOneWithDeletedDocument(context, query, options) {
  return new PopulatePromise(async (paths) => {
    const opts = { ...options ?? {}, withDeleted: true };
    const doc = await context.collection.findOne(query, opts);
    return context.populateSingle(context.hydrateDocument(doc), paths);
  });
}
function findOneOnlyDeletedDocument(context, query, options) {
  return new PopulatePromise(async (paths) => {
    const doc = await context.collection.findOne(deletedFilter(query, context.softDeleteConfig), options);
    return context.populateSingle(context.hydrateDocument(doc), paths);
  });
}
function countWithDeletedDocuments(context, query, options) {
  return context.collection.count(query, { ...options ?? {}, withDeleted: true });
}
function countOnlyDeletedDocuments(context, query, options) {
  return context.collection.count(
    deletedFilter(query, context.softDeleteConfig),
    { ...options ?? {}, withDeleted: true }
  );
}
function restoreSoftDeletedDocuments(context, filter, options) {
  const softDeleteConfig = context.softDeleteConfig;
  if (!softDeleteConfig?.enabled) {
    return Promise.resolve({ modifiedCount: 0 });
  }
  return context.collection.updateOne(
    { ...filter ?? {}, [softDeleteConfig.field]: { $ne: null } },
    { $unset: { [softDeleteConfig.field]: 1 } },
    options
  );
}
function restoreManySoftDeletedDocuments(context, filter, options) {
  const softDeleteConfig = context.softDeleteConfig;
  if (!softDeleteConfig?.enabled) {
    return Promise.resolve({ modifiedCount: 0 });
  }
  return context.collection.updateMany(
    { ...filter ?? {}, [softDeleteConfig.field]: { $ne: null } },
    { $unset: { [softDeleteConfig.field]: 1 } },
    options
  );
}
function forceDeleteDocument(context, filter, options) {
  return context.collection.deleteOne(filter, options);
}
function forceDeleteManyDocuments(context, filter, options) {
  return context.collection.deleteMany(filter, options);
}

// src/capabilities/model/model-instance-config.ts
function toCompatDefinition(definition) {
  return definition;
}
function getModelEnums(definition) {
  return toCompatDefinition(definition).enums ?? {};
}
function attachModelStatics(target, definition) {
  const compat = toCompatDefinition(definition);
  if (typeof compat.methods === "function") {
    return;
  }
  for (const [name, handler] of Object.entries(compat.statics ?? {})) {
    if (typeof handler === "function" && !(name in target)) {
      Object.defineProperty(target, name, {
        configurable: true,
        enumerable: false,
        writable: false,
        value: (...args) => handler.apply(target, args)
      });
    }
  }
}
function buildModelSchemaState(definition) {
  const compat = toCompatDefinition(definition);
  if (_schemaDslFn === null || typeof compat.schema !== "function") {
    return {
      schemaCache: null,
      schemaError: null
    };
  }
  const validatingDsl = _makeValidatingDslFn(_schemaDslFn);
  try {
    return {
      schemaCache: compat.schema.call(definition, validatingDsl),
      schemaError: null
    };
  } catch (error) {
    const schemaError = error instanceof Error ? error : new Error(String(error));
    if (schemaError instanceof TypeError && schemaError.message.includes("[schema] Invalid type")) {
      throw schemaError;
    }
    return {
      schemaCache: null,
      schemaError
    };
  }
}
function isModelValidationEnabled(definition) {
  return toCompatDefinition(definition).options?.validate !== false;
}
function resolveModelTimestampsConfig(definition) {
  const timestamps = toCompatDefinition(definition).options?.timestamps;
  if (timestamps == null || timestamps === false) {
    return null;
  }
  if (timestamps === true) {
    return {
      createdAt: "createdAt",
      updatedAt: "updatedAt"
    };
  }
  return {
    createdAt: timestamps.createdAt === false ? false : typeof timestamps.createdAt === "string" ? timestamps.createdAt : "createdAt",
    updatedAt: timestamps.updatedAt === false ? false : typeof timestamps.updatedAt === "string" ? timestamps.updatedAt : "updatedAt"
  };
}
function resolveModelSoftDeleteConfig(definition) {
  const softDelete = toCompatDefinition(definition).options?.softDelete;
  if (!softDelete) {
    return null;
  }
  if (softDelete === true) {
    return {
      enabled: true,
      field: "deletedAt",
      type: "timestamp",
      ttl: null
    };
  }
  return {
    enabled: softDelete.enabled !== false,
    field: softDelete.field ?? "deletedAt",
    type: softDelete.type ?? "timestamp",
    ttl: softDelete.ttl ?? null
  };
}
function resolveModelVersionConfig(definition) {
  const version = toCompatDefinition(definition).options?.version;
  if (!version) {
    return null;
  }
  if (version === true) {
    return {
      enabled: true,
      field: "version"
    };
  }
  return {
    enabled: version.enabled !== false,
    field: version.field ?? "version"
  };
}
function resolveModelHooksFactory(definition) {
  const hooks = toCompatDefinition(definition).hooks;
  return typeof hooks === "function" ? hooks : null;
}
function initializeModelV1Methods(target, definition) {
  const methods = toCompatDefinition(definition).methods;
  if (typeof methods !== "function") {
    return {};
  }
  try {
    const customMethods = methods(target);
    for (const [name, fn] of Object.entries(customMethods.static ?? {})) {
      if (typeof fn === "function" && !(name in target)) {
        Object.defineProperty(target, name, {
          configurable: true,
          enumerable: false,
          writable: false,
          value: (...args) => fn.apply(target, args)
        });
      }
    }
    return customMethods.instance ?? {};
  } catch (error) {
    console.warn("[MonSQLize] initializeModelV1Methods: methods() factory threw an error", error);
    return {};
  }
}
function scheduleModelIndexes(collection, definition, softDeleteConfig) {
  if (softDeleteConfig?.enabled && softDeleteConfig.type === "timestamp" && softDeleteConfig.ttl) {
    const softDeleteIndex = softDeleteConfig;
    setImmediate(() => {
      collection.createIndex(
        { [softDeleteIndex.field]: 1 },
        { expireAfterSeconds: softDeleteIndex.ttl }
      ).catch(() => {
      });
    });
  }
  const indexes = toCompatDefinition(definition).indexes;
  if (!Array.isArray(indexes) || indexes.length === 0) {
    return;
  }
  setImmediate(() => {
    for (const indexSpec of indexes) {
      if (!indexSpec?.key) {
        continue;
      }
      const { key, ...indexOptions } = indexSpec;
      collection.createIndex(key, indexOptions).catch(() => {
      });
    }
  });
}

// src/capabilities/model/model-write-helpers.ts
function withModelErrorMetadata(error, metadata) {
  return Object.assign(error, metadata);
}
async function runModelV1Hook(hooksFactory, model, operation, phase, context, ...args) {
  if (!hooksFactory) {
    return void 0;
  }
  const hooks = hooksFactory(model);
  const operationHooks = hooks[operation];
  if (!operationHooks) {
    return void 0;
  }
  const hook = operationHooks[phase];
  if (typeof hook !== "function") {
    return void 0;
  }
  return hook(context, ...args);
}
function validateModelSchemaPayload(context, document, options, metadata = {}) {
  if (!context.validateEnabled) {
    return;
  }
  if (options?.skipValidation) {
    return;
  }
  if (!context.schemaCache || !context.schemaValidateFn) {
    return;
  }
  const result = context.schemaValidateFn(context.schemaCache, document);
  if (result.valid) {
    return;
  }
  const errors = result.errors ?? [];
  const fields = [...new Set(errors.map((item) => item.path ?? item.field).filter(Boolean))];
  const summary = fields.length > 0 ? ` (${fields.join(", ")})` : "";
  throw withModelErrorMetadata(
    createError(ErrorCodes.VALIDATION_ERROR, `Schema validation failed${summary}`),
    {
      errors,
      ...metadata
    }
  );
}
function applyModelSoftDeleteFilter(query, options, softDeleteConfig) {
  if (!softDeleteConfig?.enabled) {
    return query ?? {};
  }
  const resolvedOptions = options ?? {};
  const resolvedQuery = query ?? {};
  if (resolvedQuery[softDeleteConfig.field] !== void 0) {
    return resolvedQuery;
  }
  if (resolvedOptions.withDeleted) {
    return resolvedQuery;
  }
  if (resolvedOptions.onlyDeleted) {
    return { ...resolvedQuery, [softDeleteConfig.field]: { $ne: null } };
  }
  return { ...resolvedQuery, [softDeleteConfig.field]: null };
}
function applyModelInsertTimestamps(document, timestampsConfig, nowFactory) {
  if (!timestampsConfig) {
    return document;
  }
  const now = nowFactory();
  const result = { ...document };
  if (timestampsConfig.createdAt !== false && result[timestampsConfig.createdAt] === void 0) {
    result[timestampsConfig.createdAt] = now;
  }
  if (timestampsConfig.updatedAt !== false && result[timestampsConfig.updatedAt] === void 0) {
    result[timestampsConfig.updatedAt] = now;
  }
  return result;
}
function applyModelInsertVersion(document, versionConfig) {
  if (!versionConfig?.enabled || document[versionConfig.field] !== void 0) {
    return document;
  }
  return { ...document, [versionConfig.field]: 0 };
}
function applyModelUpdateTimestamps(update, timestampsConfig, nowFactory) {
  if (!timestampsConfig || timestampsConfig.updatedAt === false) {
    return update;
  }
  const resolvedUpdate = update ?? {};
  const $set = {
    ...resolvedUpdate.$set ?? {},
    [timestampsConfig.updatedAt]: nowFactory()
  };
  return { ...resolvedUpdate, $set };
}
function applyModelVersionIncrement(update, versionConfig) {
  if (!versionConfig?.enabled) {
    return update;
  }
  const resolvedUpdate = update ?? {};
  const $inc = resolvedUpdate.$inc ?? {};
  if ($inc[versionConfig.field] !== void 0) {
    return update;
  }
  return {
    ...resolvedUpdate,
    $inc: {
      ...$inc,
      [versionConfig.field]: 1
    }
  };
}
function applyModelUpsertTimestamps(update, timestampsConfig, nowFactory) {
  if (!timestampsConfig) {
    return update;
  }
  const now = nowFactory();
  const resolvedUpdate = update ?? {};
  const result = { ...resolvedUpdate };
  if (timestampsConfig.updatedAt !== false) {
    result.$set = {
      ...resolvedUpdate.$set ?? {},
      [timestampsConfig.updatedAt]: now
    };
  }
  if (timestampsConfig.createdAt !== false) {
    const $setOnInsert = {
      ...resolvedUpdate.$setOnInsert ?? {}
    };
    if ($setOnInsert[timestampsConfig.createdAt] === void 0) {
      $setOnInsert[timestampsConfig.createdAt] = now;
    }
    result.$setOnInsert = $setOnInsert;
  }
  return result;
}
function applyModelReplaceTimestamps(replacement, timestampsConfig, nowFactory) {
  if (!timestampsConfig || timestampsConfig.updatedAt === false) {
    return replacement;
  }
  const resolvedReplacement = replacement ?? {};
  if (resolvedReplacement[timestampsConfig.updatedAt] !== void 0) {
    return resolvedReplacement;
  }
  return {
    ...resolvedReplacement,
    [timestampsConfig.updatedAt]: nowFactory()
  };
}

// src/capabilities/model/model-mutation-orchestrator.ts
async function invokeV1Hook(context, operation, phase, hookContext, ...args) {
  return runModelV1Hook(context.hooksFactory, context, operation, phase, hookContext, ...args);
}
async function invokeStandardHook(context, hookName, payload) {
  if (context.hooksFactory) {
    return;
  }
  await context.runHook(hookName, payload);
}
async function orchestrateModelInsertOne(context, document, options) {
  const hookContext = {};
  let payload = context.applyDefaults(document);
  if (context.hooksFactory) {
    const hookResult = await invokeV1Hook(context, "insert", "before", hookContext, payload);
    if (hookResult !== void 0 && typeof hookResult === "object") {
      payload = hookResult;
    }
  } else {
    await invokeStandardHook(context, "beforeCreate", { operation: "insertOne", collection: context.collectionName, data: payload });
  }
  validateModelSchemaPayload({
    validateEnabled: context.validateEnabled,
    schemaCache: context.schemaCache,
    schemaValidateFn: context.schemaValidateFn
  }, payload, options);
  payload = applyModelInsertTimestamps(payload, context.timestampsConfig, () => context.nowDate());
  payload = applyModelInsertVersion(payload, context.versionConfig);
  const result = await context.collection.insertOne(payload, options);
  if (context.hooksFactory) {
    try {
      await invokeV1Hook(context, "insert", "after", hookContext, result);
    } catch {
    }
  } else {
    await invokeStandardHook(context, "afterCreate", {
      operation: "insertOne",
      collection: context.collectionName,
      data: payload,
      result
    });
  }
  return result;
}
async function orchestrateModelInsertMany(context, documents, options) {
  const resolvedOptions = options ?? {};
  const docs = [];
  for (let index = 0; index < (documents ?? []).length; index++) {
    let doc = context.applyDefaults((documents ?? [])[index]);
    validateModelSchemaPayload({
      validateEnabled: context.validateEnabled,
      schemaCache: context.schemaCache,
      schemaValidateFn: context.schemaValidateFn
    }, doc, resolvedOptions, { index });
    doc = applyModelInsertTimestamps(doc, context.timestampsConfig, () => context.nowDate());
    doc = applyModelInsertVersion(doc, context.versionConfig);
    docs.push(doc);
  }
  return context.collection.insertMany(docs, options);
}
async function orchestrateModelUpdateOne(context, filter, update, options) {
  const hookContext = {};
  let nextUpdate = update;
  if (context.hooksFactory) {
    await invokeV1Hook(context, "update", "before", hookContext, filter, nextUpdate);
  } else {
    await invokeStandardHook(context, "beforeUpdate", {
      operation: "updateOne",
      collection: context.collectionName,
      filter,
      update: nextUpdate
    });
  }
  nextUpdate = applyModelVersionIncrement(
    applyModelUpdateTimestamps(nextUpdate, context.timestampsConfig, () => context.nowDate()),
    context.versionConfig
  );
  const result = await context.collection.updateOne(filter, nextUpdate, options);
  if (context.hooksFactory) {
    try {
      await invokeV1Hook(context, "update", "after", hookContext, result);
    } catch {
    }
  } else {
    await invokeStandardHook(context, "afterUpdate", {
      operation: "updateOne",
      collection: context.collectionName,
      filter,
      update: nextUpdate,
      result
    });
  }
  return result;
}
async function orchestrateModelUpdateMany(context, filter, update, options) {
  const nextUpdate = applyModelVersionIncrement(
    applyModelUpdateTimestamps(update, context.timestampsConfig, () => context.nowDate()),
    context.versionConfig
  );
  return context.collection.updateMany(filter, nextUpdate, options);
}
async function orchestrateModelReplaceOne(context, filter, replacement, options) {
  const nextReplacement = applyModelReplaceTimestamps(replacement, context.timestampsConfig, () => context.nowDate());
  return context.collection.replaceOne(filter, nextReplacement, options);
}
async function orchestrateModelFindOneAndUpdate(context, filter, update, options) {
  const nextUpdate = applyModelUpdateTimestamps(update, context.timestampsConfig, () => context.nowDate());
  return context.collection.findOneAndUpdate(filter, nextUpdate, options);
}
async function orchestrateModelFindOneAndReplace(context, filter, replacement, options) {
  const nextReplacement = applyModelReplaceTimestamps(replacement, context.timestampsConfig, () => context.nowDate());
  return context.extendedCollection().findOneAndReplace(filter, nextReplacement, options);
}
async function orchestrateModelFindOneAndDelete(context, filter, options) {
  return context.collection.findOneAndDelete(filter, options);
}
async function orchestrateModelUpsertOne(context, filter, update, options) {
  const nextUpdate = applyModelUpsertTimestamps(update, context.timestampsConfig, () => context.nowDate());
  return context.collection.upsertOne(filter, nextUpdate, options);
}
async function orchestrateModelIncrementOne(context, filter, field, increment, options) {
  const timestamps = context.timestampsConfig;
  if (timestamps && timestamps.updatedAt !== false) {
    const resolvedOptions = options ?? {};
    const $set = {
      ...resolvedOptions.$set ?? {},
      [timestamps.updatedAt]: context.nowDate()
    };
    return context.extendedCollection().incrementOne(filter, field, increment, { ...resolvedOptions, $set });
  }
  return context.extendedCollection().incrementOne(filter, field, increment, options);
}
async function orchestrateModelInsertBatch(context, docs, options) {
  const docsToInsert = docs.map((doc) => {
    let record = doc;
    record = applyModelInsertTimestamps(record, context.timestampsConfig, () => context.nowDate());
    record = applyModelInsertVersion(record, context.versionConfig);
    return record;
  });
  return context.extendedCollection().insertBatch(docsToInsert, options);
}
async function orchestrateModelUpdateBatch(context, filter, update, options) {
  const nextUpdate = applyModelUpdateTimestamps(update, context.timestampsConfig, () => context.nowDate());
  return context.extendedCollection().updateBatch(filter, nextUpdate, options);
}
async function orchestrateModelDeleteOne(context, filter, options) {
  const softDeleteConfig = context.softDeleteConfig;
  const resolvedOptions = options ?? {};
  const hookContext = {};
  if (context.hooksFactory) {
    await invokeV1Hook(context, "delete", "before", hookContext, filter);
  } else {
    await invokeStandardHook(context, "beforeDelete", {
      operation: "deleteOne",
      collection: context.collectionName,
      filter
    });
  }
  let result;
  if (softDeleteConfig?.enabled && !resolvedOptions._forceDelete) {
    result = await context.collection.updateOne(
      { ...filter ?? {}, [softDeleteConfig.field]: null },
      { $set: { [softDeleteConfig.field]: softDeleteConfig.type === "boolean" ? true : context.nowDate() } },
      options
    );
  } else {
    result = await context.collection.deleteOne(filter, options);
  }
  if (context.hooksFactory) {
    try {
      await invokeV1Hook(context, "delete", "after", hookContext, result);
    } catch {
    }
  } else {
    await invokeStandardHook(context, "afterDelete", {
      operation: "deleteOne",
      collection: context.collectionName,
      filter,
      result
    });
  }
  return result;
}
async function orchestrateModelDeleteMany(context, filter, options) {
  const softDeleteConfig = context.softDeleteConfig;
  const resolvedOptions = options ?? {};
  if (softDeleteConfig?.enabled && !resolvedOptions._forceDelete) {
    return context.collection.updateMany(
      { ...filter ?? {}, [softDeleteConfig.field]: null },
      { $set: { [softDeleteConfig.field]: softDeleteConfig.type === "boolean" ? true : context.nowDate() } },
      options
    );
  }
  return context.collection.deleteMany(filter, options);
}

// src/capabilities/model/index.ts
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
    attachModelStatics(this, options.definition);
    const schemaState = buildModelSchemaState(options.definition);
    this._schemaCache = schemaState.schemaCache;
    this._schemaError = schemaState.schemaError;
    this._validateEnabled = isModelValidationEnabled(options.definition);
    this._timestampsConfig = resolveModelTimestampsConfig(options.definition);
    this._softDeleteConfig = resolveModelSoftDeleteConfig(options.definition);
    this.softDeleteConfig = this._softDeleteConfig;
    this._versionConfig = resolveModelVersionConfig(options.definition);
    this._v1HooksFactory = resolveModelHooksFactory(options.definition);
    scheduleModelIndexes(this.collection, options.definition, this._softDeleteConfig);
    this._v1InstanceMethods = initializeModelV1Methods(this, options.definition);
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
    return getModelEnums(this.definition);
  }
  getNamespace() {
    return this.collection.getNamespace();
  }
  raw() {
    return this.collection.raw();
  }
  extendedCollection() {
    return this.collection;
  }
  nowDate() {
    return /* @__PURE__ */ new Date();
  }
  // ── public API ────────────────────────────────────────────────────────────────
  find(query, options) {
    return new PopulatePromise(async (paths) => {
      const ctx = {};
      const filteredQuery = applyModelSoftDeleteFilter(query, options, this._softDeleteConfig);
      if (this._v1HooksFactory) {
        await runModelV1Hook(this._v1HooksFactory, this, "find", "before", ctx, options);
      } else {
        await this.runHook("beforeFind", { operation: "find", collection: this.collectionName, filter: filteredQuery });
      }
      const docs = await this.collection.find(filteredQuery, options);
      let result = await this.populateDocuments(this.hydrateDocuments(docs), paths);
      if (this._v1HooksFactory) {
        try {
          const hookResult = await runModelV1Hook(this._v1HooksFactory, this, "find", "after", ctx, result);
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
      const filteredQuery = applyModelSoftDeleteFilter(query, options, this._softDeleteConfig);
      if (this._v1HooksFactory) {
        await runModelV1Hook(this._v1HooksFactory, this, "find", "before", ctx, options);
      }
      const doc = await this.collection.findOne(filteredQuery, options);
      let result = await this.populateSingle(this.hydrateDocument(doc), paths);
      if (this._v1HooksFactory) {
        try {
          const hookResult = await runModelV1Hook(this._v1HooksFactory, this, "find", "after", ctx, result);
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
      const filteredQuery = applyModelSoftDeleteFilter(query, options, this._softDeleteConfig);
      const result = await this.collection.findAndCount(filteredQuery, options);
      return {
        data: await this.populateDocuments(this.hydrateDocuments(result.data), paths),
        total: result.total
      };
    });
  }
  count(query, options) {
    const filteredQuery = applyModelSoftDeleteFilter(query, options, this._softDeleteConfig);
    return this.collection.count(filteredQuery, options);
  }
  async insertOne(document, options) {
    return orchestrateModelInsertOne(this.mutationContext(), document, options);
  }
  async insertMany(documents, options) {
    return orchestrateModelInsertMany(this.mutationContext(), documents, options);
  }
  async updateOne(filter, update, options) {
    return orchestrateModelUpdateOne(this.mutationContext(), filter, update, options);
  }
  async updateMany(filter, update, options) {
    return orchestrateModelUpdateMany(this.mutationContext(), filter, update, options);
  }
  async replaceOne(filter, replacement, options) {
    return orchestrateModelReplaceOne(this.mutationContext(), filter, replacement, options);
  }
  findOneAndUpdate(filter, update, options) {
    return orchestrateModelFindOneAndUpdate(this.mutationContext(), filter, update, options);
  }
  findOneAndReplace(filter, replacement, options) {
    return orchestrateModelFindOneAndReplace(this.mutationContext(), filter, replacement, options);
  }
  findOneAndDelete(filter, options) {
    return orchestrateModelFindOneAndDelete(this.mutationContext(), filter, options);
  }
  async upsertOne(filter, update, options) {
    return orchestrateModelUpsertOne(this.mutationContext(), filter, update, options);
  }
  async incrementOne(filter, field, increment, options) {
    return orchestrateModelIncrementOne(this.mutationContext(), filter, field, increment, options);
  }
  async insertBatch(docs, options) {
    return orchestrateModelInsertBatch(this.mutationContext(), docs, options);
  }
  async updateBatch(filter, update, options) {
    return orchestrateModelUpdateBatch(this.mutationContext(), filter, update, options);
  }
  async deleteOne(filter, options) {
    return orchestrateModelDeleteOne(this.mutationContext(), filter, options);
  }
  async deleteMany(filter, options) {
    return orchestrateModelDeleteMany(this.mutationContext(), filter, options);
  }
  // ── soft-delete extended methods (only meaningful when softDelete is enabled) ──
  findWithDeleted(query, options) {
    return findWithDeletedDocuments(this.softDeleteContext(), query, options);
  }
  findOnlyDeleted(query, options) {
    return findOnlyDeletedDocuments(this.softDeleteContext(), query, options);
  }
  findOneWithDeleted(query, options) {
    return findOneWithDeletedDocument(this.softDeleteContext(), query, options);
  }
  findOneOnlyDeleted(query, options) {
    return findOneOnlyDeletedDocument(this.softDeleteContext(), query, options);
  }
  countWithDeleted(query, options) {
    return countWithDeletedDocuments(this.softDeleteContext(), query, options);
  }
  countOnlyDeleted(query, options) {
    return countOnlyDeletedDocuments(this.softDeleteContext(), query, options);
  }
  async restore(filter, options) {
    return restoreSoftDeletedDocuments(this.softDeleteContext(), filter, options);
  }
  async restoreMany(filter, options) {
    return restoreManySoftDeletedDocuments(this.softDeleteContext(), filter, options);
  }
  async forceDelete(filter, options) {
    return forceDeleteDocument(this.softDeleteContext(), filter, options);
  }
  async forceDeleteMany(filter, options) {
    return forceDeleteManyDocuments(this.softDeleteContext(), filter, options);
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
    return validateModelDocument({
      schemaError: this._schemaError,
      schemaCache: this._schemaCache,
      schemaValidateFn: _schemaValidateFn
    }, document);
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
    return populateModelPath({
      relations: this.relations,
      runtime: this.runtime,
      dbName: this.dbName,
      poolName: this.poolName
    }, docs, path2);
  }
  hydrateDocuments(docs) {
    return docs.filter(Boolean).map((doc) => this.hydrateDocument(doc));
  }
  hydrateDocument(doc) {
    return hydrateModelDocument({
      definition: this.definition,
      v1InstanceMethods: this._v1InstanceMethods,
      saveDocument: (document) => this.saveDocument(document),
      removeDocument: (document) => this.removeDocument(document),
      validateDocument: (document) => this.validate(document)
    }, doc);
  }
  softDeleteContext() {
    return {
      collection: this.collection,
      softDeleteConfig: this._softDeleteConfig,
      hydrateDocuments: (docs) => this.hydrateDocuments(docs),
      hydrateDocument: (doc) => this.hydrateDocument(doc),
      populateDocuments: (docs, paths) => this.populateDocuments(docs, paths),
      populateSingle: (doc, paths) => this.populateSingle(doc, paths)
    };
  }
  async saveDocument(document) {
    return saveModelDocument(this.collection, document);
  }
  async removeDocument(document) {
    return removeModelDocument(this.collection, document);
  }
  applyDefaults(document) {
    return applyModelDefaults(this.definition, document);
  }
  mutationContext() {
    return {
      collectionName: this.collectionName,
      collection: this.collection,
      extendedCollection: () => this.extendedCollection(),
      applyDefaults: (document) => this.applyDefaults(document),
      nowDate: () => this.nowDate(),
      timestampsConfig: this._timestampsConfig,
      softDeleteConfig: this._softDeleteConfig,
      versionConfig: this._versionConfig,
      validateEnabled: this._validateEnabled,
      schemaCache: this._schemaCache,
      schemaValidateFn: _schemaValidateFn,
      hooksFactory: this._v1HooksFactory,
      runHook: (hookName, context) => this.runHook(hookName, context)
    };
  }
  async runHook(hookName, context) {
    if (this._v1HooksFactory) return;
    const hook = this.definition.hooks?.[hookName];
    if (typeof hook === "function") {
      await hook(context);
    }
  }
};

// src/capabilities/transaction/index.ts
import { randomBytes as randomBytes2 } from "node:crypto";
var CacheLockManager = class {
  constructor(options = {}) {
    this.locks = /* @__PURE__ */ new Map();
    this._totalLocksAdded = 0;
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
    this._totalLocksAdded += 1;
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
      totalLocks: this._totalLocksAdded,
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
    this.id = `tx_${randomBytes2(8).toString("hex")}`;
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
    this.startedAt = Date.now();
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
        await sleep(retryDelay * Math.pow(retryBackoff, attempt));
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
async function sleep(ms) {
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

// src/capabilities/ssh/index.ts
import * as net from "node:net";
import * as fs from "node:fs";
import * as os from "node:os";
function loadSsh2Client() {
  try {
    return __require("ssh2").Client;
  } catch {
    throw new Error(
      'ssh2 is not installed. SSH tunnel support requires the optional "ssh2" package.\nRun: npm install ssh2'
    );
  }
}
var SSHTunnelSSH2 = class {
  constructor(sshConfig, remoteHost, remotePort, opts) {
    this.isConnected = false;
    this.localPort = null;
    this.sshClient = null;
    this.server = null;
    this._sshConfig = sshConfig;
    this.remoteHost = remoteHost;
    this.remotePort = remotePort;
    this.name = opts?.name ?? "MongoDB";
  }
  _buildAuthConfig() {
    const {
      host,
      username,
      password,
      privateKey,
      privateKeyPath,
      passphrase,
      port = 22,
      readyTimeout = 2e4,
      keepaliveInterval = 3e4
    } = this._sshConfig;
    if (!host || !username) {
      throw new Error("SSH config requires: host, username");
    }
    if (!password && !privateKey && !privateKeyPath) {
      throw new Error("SSH authentication required: provide password, privateKey, or privateKeyPath");
    }
    const config = { host, port, username, readyTimeout, keepaliveInterval };
    if (password) {
      config.password = password;
    } else if (privateKey) {
      config.privateKey = privateKey;
      if (passphrase) config.passphrase = passphrase;
    } else {
      const keyPath = privateKeyPath.replace(/^~/, os.homedir());
      config.privateKey = fs.readFileSync(keyPath);
      if (passphrase) config.passphrase = passphrase;
    }
    return config;
  }
  async connect() {
    const authConfig = this._buildAuthConfig();
    const SshClient = loadSsh2Client();
    return new Promise((resolve, reject) => {
      const ssh = new SshClient();
      let settled = false;
      const server = net.createServer((socket) => {
        ssh.forwardOut(
          "127.0.0.1",
          0,
          this.remoteHost,
          this.remotePort,
          (err, stream) => {
            if (err) {
              socket.destroy();
              return;
            }
            socket.pipe(stream);
            stream.pipe(socket);
            stream.on("close", () => socket.destroy());
            socket.on("close", () => {
              try {
                stream.close();
              } catch {
              }
            });
          }
        );
      });
      server.on("error", (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
      server.listen(this._sshConfig.localPort ?? 0, "127.0.0.1", () => {
        this.server = server;
        const addr = server.address();
        this.localPort = addr.port;
        ssh.on("ready", () => {
          if (!settled) {
            settled = true;
            this.sshClient = ssh;
            this.isConnected = true;
            resolve();
          }
        });
        ssh.on("error", (err) => {
          if (!settled) {
            settled = true;
            server.close();
            reject(err);
          }
        });
        ssh.connect(authConfig);
      });
    });
  }
  getTunnelUri(_protocol, originalUri) {
    if (!this.isConnected || this.localPort === null) {
      throw new Error(`SSH tunnel [${this.remoteHost}:${this.remotePort}] not connected`);
    }
    return originalUri.replace(
      `${this.remoteHost}:${this.remotePort}`,
      `localhost:${this.localPort}`
    );
  }
  getLocalAddress() {
    if (!this.isConnected || this.localPort === null) {
      throw new Error(`SSH tunnel [${this.remoteHost}:${this.remotePort}] not connected`);
    }
    return `localhost:${this.localPort}`;
  }
  async close() {
    const server = this.server;
    const ssh = this.sshClient;
    this.isConnected = false;
    this.localPort = null;
    this.sshClient = null;
    this.server = null;
    await new Promise((resolve) => {
      if (server) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    });
    ssh?.end();
  }
};
function parseHostFromUri(uri) {
  const m = uri.match(/mongodb(?:\+srv)?:\/\/(?:[^@]+@)?([^/:?,[\]]+)/);
  return m?.[1] ?? "localhost";
}
function parsePortFromUri(uri) {
  const m = uri.match(/mongodb(?:\+srv)?:\/\/(?:[^@]+@)?[^/:?[\]]+:(\d+)/);
  return m ? parseInt(m[1], 10) : 27017;
}

// src/utils/validation.ts
function validateRange(value, min, max, name) {
  if (typeof value !== "number" || isNaN(value)) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, `${name} must be a valid number`);
  }
  if (!isFinite(value)) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, `${name} must be a finite number`);
  }
  if (value < min || value > max) {
    throw createError(
      ErrorCodes.INVALID_ARGUMENT,
      `${name} must be between ${min} and ${max}, current value: ${value}`
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
   * Execute a queue-controlled count operation.
   *
   * Execution logic:
   * - If running < concurrency: execute fn immediately (fast path).
   * - If running >= concurrency:
   *   - Queue not full → enqueue and wait; wait time is recorded in stats.
   *   - Queue full → reject, increment rejected counter, throw INVALID_OPERATION.
   * - After fn completes (success or error), running is decremented and
   *   _wakeNext() is called to unblock the next queued request.
   *
   * @param fn - The count function to guard with concurrency control (returns Promise<T>)
   * @returns The result of fn
   * @throws A controlled error when the queue is full or the wait times out
   */
  async execute(fn) {
    const startTime = Date.now();
    if (this.running >= this.concurrency) {
      if (this.queue.length >= this.maxQueueSize) {
        this.stats.rejected += 1;
        throw createError(ErrorCodes.INVALID_OPERATION, `Count queue is full (${this.maxQueueSize})`);
      }
      this.stats.queued += 1;
      const waitResult = await this._waitInQueue(startTime);
      if (waitResult === "cleared") {
        return void 0;
      }
    }
    this.running += 1;
    this.stats.executed += 1;
    try {
      const elapsed = Date.now() - startTime;
      const remainingMs = Math.max(1, this.timeout - elapsed);
      return await this._executeWithTimeout(fn, remainingMs);
    } finally {
      this.running -= 1;
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
          this.stats.timeout += 1;
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
  _executeWithTimeout(fn, timeoutMs = this.timeout) {
    let timer = null;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(createError(ErrorCodes.OPERATION_TIMEOUT, `Count execution timeout (${this.timeout}ms)`)),
        timeoutMs
      );
    });
    return Promise.race([fn(), timeoutPromise]).finally(() => {
      if (timer !== null) clearTimeout(timer);
    });
  }
  _updateWaitTimeStats(waitTime) {
    const totalQueued = this.stats.queued;
    this.stats.avgWaitTime = (this.stats.avgWaitTime * (totalQueued - 1) + waitTime) / totalQueued;
    if (waitTime > this.stats.maxWaitTime) {
      this.stats.maxWaitTime = waitTime;
    }
  }
};

// src/capabilities/pool/pool-health-checker.ts
var HealthChecker = class {
  constructor(options = {}) {
    this._healthStatus = /* @__PURE__ */ new Map();
    this._checkConfigs = /* @__PURE__ */ new Map();
    this._clients = /* @__PURE__ */ new Map();
    this._intervals = /* @__PURE__ */ new Map();
    this._inProgress = /* @__PURE__ */ new Set();
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
    if (this._inProgress.has(poolName)) return;
    this._inProgress.add(poolName);
    try {
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
        status.consecutiveFailures += 1;
        if (lastError) status.lastError = lastError;
        if (status.consecutiveFailures >= retries) {
          status.status = "down";
        }
      }
    } finally {
      this._inProgress.delete(poolName);
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
  getStatus(poolName) {
    return this._healthStatus.get(poolName) ?? null;
  }
  getAllStatus() {
    return new Map(this._healthStatus);
  }
};

// src/capabilities/pool/pool-selector.ts
var PoolSelector = class {
  constructor(options = {}) {
    this._roundRobinIndex = /* @__PURE__ */ new Map();
    this._strategy = options.strategy ?? "auto";
    this._logger = options.logger ?? console;
  }
  select(pools, context) {
    if (!pools || pools.length === 0) {
      throw new Error("No available pools");
    }
    switch (this._strategy) {
      case "auto":
        return this.selectByAuto(pools, context);
      case "roundRobin":
        return this.selectByRoundRobin(pools, context);
      case "leastConnections":
        return this.selectByLeastConnections(pools, context);
      case "weighted":
        return this.selectByWeighted(pools);
      case "manual":
        return pools[0].name;
      default:
        this._logger.warn?.(`[PoolSelector] Unknown strategy: ${this._strategy}, falling back to auto`);
        return this.selectByAuto(pools, context);
    }
  }
  selectByAuto(pools, context) {
    const { operation, poolPreference } = context;
    let candidates = pools;
    if (operation === "read") {
      const secondaries = pools.filter((pool) => pool.role === "secondary");
      if (secondaries.length > 0) {
        candidates = secondaries;
      }
    } else if (operation === "write") {
      const primaries = pools.filter((pool) => pool.role === "primary");
      if (primaries.length > 0) {
        candidates = primaries;
      }
    }
    if (poolPreference?.role) {
      const filteredByRole = candidates.filter((pool) => pool.role === poolPreference.role);
      if (filteredByRole.length > 0) {
        candidates = filteredByRole;
      }
    }
    if (poolPreference?.tags?.length) {
      const tags = poolPreference.tags;
      const filteredByTags = candidates.filter((pool) => {
        if (!pool.tags) {
          return false;
        }
        return tags.length === 1 ? tags.some((tag) => pool.tags?.includes(tag)) : tags.every((tag) => pool.tags?.includes(tag));
      });
      if (filteredByTags.length > 0) {
        candidates = filteredByTags;
      }
    }
    if (candidates.length === 1) {
      return candidates[0].name;
    }
    return this.selectByWeighted(candidates);
  }
  selectByRoundRobin(pools, context) {
    let candidates = pools;
    if (context.operation === "read") {
      const nonPrimary = pools.filter((pool2) => pool2.role === "secondary" || pool2.role === "analytics");
      if (nonPrimary.length > 0) {
        candidates = nonPrimary;
      }
    } else if (context.operation === "write") {
      const primaries = pools.filter((pool2) => pool2.role === "primary");
      if (primaries.length > 0) {
        candidates = primaries;
      }
    }
    const key = context.operation ?? "default";
    const index = this._roundRobinIndex.get(key) ?? 0;
    const pool = candidates[index % candidates.length];
    this._roundRobinIndex.set(key, (index + 1) % candidates.length);
    return pool.name;
  }
  selectByLeastConnections(pools, context) {
    if (!context.stats) {
      return this.selectByRoundRobin(pools, context);
    }
    let minConnections = Infinity;
    let selectedPool = pools[0];
    for (const pool of pools) {
      const poolStats = context.stats[pool.name];
      if (!poolStats) {
        continue;
      }
      const connections = poolStats.connections ?? 0;
      if (connections < minConnections) {
        minConnections = connections;
        selectedPool = pool;
      }
    }
    return selectedPool.name;
  }
  selectByWeighted(pools) {
    let totalWeight = 0;
    for (const pool of pools) {
      totalWeight += pool.weight ?? 1;
    }
    let random = Math.random() * totalWeight;
    for (const pool of pools) {
      random -= pool.weight ?? 1;
      if (random <= 0) {
        return pool.name;
      }
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

// src/capabilities/pool/pool-stats-manager.ts
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
      stats.totalRequests += 1;
    } else if (item.type === "request") {
      stats.totalRequests += 1;
      if (item.success) {
        stats.successRequests += 1;
      } else {
        stats.failedRequests += 1;
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

// src/capabilities/pool/pool-runtime-helpers.ts
import { MongoClient as MongoDriverClient } from "mongodb";
function validatePoolConfigInternal(config) {
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
    connections: 0,
    available: 0,
    waiting: 0,
    status: "unknown",
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

// src/capabilities/pool/index.ts
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
    validatePoolConfigInternal(config);
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
      const error = err;
      const msg = error.message ?? "";
      const hasNetworkKeyword = msg.includes("connect") || msg.includes("ETIMEDOUT") || msg.includes("ECONNREFUSED");
      if (!hasNetworkKeyword && error.name && error.name.toLowerCase().includes("mongo")) {
        const enhanced = new Error(`connect ETIMEDOUT: ${msg}`);
        enhanced.name = error.name;
        enhanced.code = error.code;
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
      const internalStats = this._stats.getStats(name);
      const poolStats = this.stats.get(name) ?? createEmptyPoolStats(name);
      result[name] = {
        name,
        connections: internalStats.connections,
        available: internalStats.available,
        waiting: internalStats.waiting,
        status: healthStatus?.status ?? "unknown",
        totalRequests: poolStats.totalRequests || internalStats.totalRequests,
        successCount: poolStats.successCount,
        errorCount: poolStats.errorCount,
        avgResponseTime: internalStats.avgResponseTime,
        minResponseTime: poolStats.minResponseTime,
        maxResponseTime: poolStats.maxResponseTime,
        errorRate: poolStats.errorRate || internalStats.errorRate,
        lastRequestTime: poolStats.lastRequestTime
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
    stats.errorRate = stats.totalRequests === 0 ? 0 : stats.errorCount / stats.totalRequests;
  }
};

// src/entry/capability-wiring.ts
function initAutoConvertConfig(config, type) {
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
    return { ...defaults, ...config, enabled: true };
  }
  return defaults;
}
function buildRuntimeDefaults(options) {
  const o = options;
  const defaults = {};
  if (o.maxTimeMS !== void 0) defaults.maxTimeMS = o.maxTimeMS;
  if (o.findLimit !== void 0) defaults.findLimit = o.findLimit;
  if (o.findPageMaxLimit !== void 0) defaults.findPageMaxLimit = o.findPageMaxLimit;
  if (o.slowQueryMs !== void 0) defaults.slowQueryMs = o.slowQueryMs;
  defaults.autoConvertObjectId = o.autoConvertObjectId !== void 0 ? o.autoConvertObjectId : o.type === "mongodb" || !o.type ? true : false;
  if (o.cursorSecret !== void 0) defaults.cursorSecret = o.cursorSecret;
  if (o.namespace !== void 0) defaults.namespace = o.namespace;
  const countQueueCfg = o.countQueue ?? { enabled: true, maxQueueSize: 1e4, timeout: 6e4 };
  if (countQueueCfg.enabled) {
    defaults.countQueue = new CountQueue({
      concurrency: countQueueCfg.concurrency,
      maxQueueSize: countQueueCfg.maxQueueSize,
      timeout: countQueueCfg.timeout
    });
  }
  return defaults;
}
async function createAndStartPoolManager(options) {
  if (!options.pools?.length) {
    return null;
  }
  const pm = new ConnectionPoolManager({
    pools: options.pools,
    poolStrategy: options.poolStrategy,
    poolFallback: options.poolFallback,
    maxPoolsCount: options.maxPoolsCount,
    logger: options.logger ?? null
  });
  for (const pool of options.pools) {
    await pm.addPool(pool);
  }
  pm.startHealthCheck();
  return pm;
}
async function initializeDistributedCacheInvalidator(options, cache, logger) {
  const rawCache = options.cache;
  if (!rawCache || typeof rawCache !== "object" || Array.isArray(rawCache)) return null;
  if (typeof rawCache["get"] === "function") return null;
  const distConfig = rawCache["distributed"];
  if (!distConfig || typeof distConfig !== "object" || Array.isArray(distConfig)) return null;
  if (distConfig["enabled"] === false) return null;
  try {
    return new DistributedCacheInvalidator({
      redisUrl: distConfig["redisUrl"],
      redis: distConfig["redis"],
      channel: distConfig["channel"],
      instanceId: distConfig["instanceId"],
      cache,
      logger
    });
  } catch (err) {
    logger.warn?.("[Cache] Failed to initialize distributed cache invalidator \u2014 is ioredis installed?", err);
    return null;
  }
}
async function loadModelFiles(options, logger, opts = {}) {
  const modelsConfig = options.models;
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
      logger.warn?.(`[Models] cannot read directory: ${dir}`);
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
        logger.warn?.(`[Models] ${file}: exported object must have a 'name' field`);
        continue;
      }
      if (opts.reload && Model.has(definition.name)) {
        Model.redefine(definition.name, definition);
      } else {
        Model.define(definition.name, definition);
      }
    } catch (err) {
      logger.warn?.(`[Models] failed to load ${file}`, err);
    }
  }
}

// src/entry/runtime-defaults.ts
function deepMerge(base, patch) {
  const output = { ...base };
  for (const key of Object.keys(patch || {})) {
    const value = patch[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      output[key] = deepMerge(base[key] || {}, value);
    } else if (value !== void 0) {
      output[key] = value;
    }
  }
  return output;
}
function buildPublicDefaults(options) {
  return Object.freeze(deepMerge({
    maxTimeMS: 2e3,
    findLimit: 10,
    slowQueryMs: 500,
    namespace: { scope: "database" },
    findPageMaxLimit: 500,
    cursorSecret: void 0,
    log: { slowQueryTag: { event: "slow_query", code: "SLOW_QUERY" } }
  }, {
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
    throw createError(ErrorCodes.INVALID_ARGUMENT, "dropIndex: dropping the _id index is not allowed");
  }
  try {
    return await collectionRef.dropIndex(name);
  } catch (err) {
    const mongoErr = err;
    if (mongoErr?.code === 27 || mongoErr?.codeName === "IndexNotFound") {
      throw createError(ErrorCodes.MONGODB_ERROR, `Index does not exist: ${name}`);
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
    throw createError(ErrorCodes.INVALID_ARGUMENT, `${operation}: index keys must not be empty`);
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

// src/adapters/mongodb/common/collection-accessor-management-helpers.ts
function resolveDb(collectionRef, dbRef) {
  return dbRef ?? collectionRef.db;
}
function resolveBookmarkCache(context) {
  return context.getCache ? context.getCache() : context.cache;
}
function createIndexForAccessor(collectionRef, keys, options) {
  return createIndexDefinition(collectionRef, keys, options);
}
function createIndexesForAccessor(collectionRef, specs) {
  return createIndexDefinitions(collectionRef, specs);
}
function listIndexesForAccessor(collectionRef) {
  return listIndexDefinitions(collectionRef);
}
function dropIndexForAccessor(collectionRef, name) {
  return dropIndexDefinition(collectionRef, name);
}
function dropIndexesForAccessor(collectionRef) {
  return dropIndexDefinitions(collectionRef);
}
function prewarmBookmarksForAccessor(context, keyDims = {}, pages = []) {
  return prewarmBookmarks({
    namespace: context.namespace,
    cache: resolveBookmarkCache(context),
    logger: context.logger,
    keyDims,
    pages,
    findPage: context.findPage
  });
}
function listBookmarksForAccessor(context, keyDims) {
  return listBookmarks({
    namespace: context.namespace,
    cache: resolveBookmarkCache(context),
    keyDims
  });
}
function clearBookmarksForAccessor(context, keyDims) {
  return clearBookmarks({
    namespace: context.namespace,
    cache: resolveBookmarkCache(context),
    keyDims
  });
}
function dropCollectionForAccessor(collectionRef) {
  return collectionRef.drop();
}
async function createCollectionForAccessor(collectionRef, collectionName, dbRef, name, options = {}) {
  await resolveDb(collectionRef, dbRef).createCollection(name ?? collectionName, options);
  return true;
}
async function createViewForAccessor(collectionRef, dbRef, name, source, pipeline = []) {
  await resolveDb(collectionRef, dbRef).createCollection(name, { viewOn: source, pipeline });
  return true;
}
async function indexStatsForAccessor(collectionRef) {
  return collectionRef.aggregate([{ $indexStats: {} }]).toArray();
}
async function setValidatorForAccessor(collectionRef, collectionName, dbRef, validator, options = {}) {
  if (validator === null || typeof validator !== "object") {
    throw new Error("Validator must be a non-null object");
  }
  const isEmptyValidator = Object.keys(validator).length === 0;
  const command = {
    collMod: collectionName,
    validator
  };
  if (options.validationLevel) {
    command["validationLevel"] = options.validationLevel;
  } else if (isEmptyValidator) {
    command["validationLevel"] = "strict";
    command["validationAction"] = "error";
  }
  if (options.validationAction) {
    command["validationAction"] = options.validationAction;
  }
  const result = await resolveDb(collectionRef, dbRef).command(command);
  return { ok: result["ok"], collection: collectionName };
}
async function setValidationLevelForAccessor(collectionRef, collectionName, dbRef, level) {
  if (typeof level !== "string" || !["off", "strict", "moderate"].includes(level)) {
    throw new Error('Invalid validation level: must be "off", "strict", or "moderate"');
  }
  const result = await resolveDb(collectionRef, dbRef).command({ collMod: collectionName, validationLevel: level });
  return { ok: result["ok"], validationLevel: level };
}
async function setValidationActionForAccessor(collectionRef, collectionName, dbRef, action) {
  if (typeof action !== "string" || !["error", "warn"].includes(action)) {
    throw new Error('Invalid validation action: must be "error" or "warn"');
  }
  const result = await resolveDb(collectionRef, dbRef).command({ collMod: collectionName, validationAction: action });
  return { ok: result["ok"], validationAction: action };
}
async function getValidatorForAccessor(collectionRef, collectionName, dbRef) {
  const collections = await resolveDb(collectionRef, dbRef).listCollections({ name: collectionName }).toArray();
  const info = collections[0];
  return {
    validator: info?.options?.["validator"] ?? null,
    validationLevel: info?.options?.["validationLevel"] ?? "strict",
    validationAction: info?.options?.["validationAction"] ?? "error"
  };
}
async function statsForAccessor(collectionRef, dbName, collectionName, options = {}) {
  const scale = options.scale ?? 1;
  const results = await collectionRef.aggregate([{ $collStats: { storageStats: { scale }, count: {} } }]).toArray();
  const raw = results[0] ?? {};
  const storage = raw["storageStats"] ?? {};
  return {
    ns: raw["ns"] ?? `${dbName}.${collectionName}`,
    count: storage["count"] ?? 0,
    size: storage["size"] ?? 0,
    storageSize: storage["storageSize"] ?? 0,
    totalIndexSize: storage["totalIndexSize"] ?? 0,
    nindexes: storage["nindexes"] ?? 0,
    avgObjSize: storage["avgObjSize"],
    scaleFactor: storage["scaleFactor"] ?? scale
  };
}
async function renameCollectionForAccessor(collectionRef, collectionName, newName, options = {}) {
  if (!newName || typeof newName !== "string") {
    throw new Error("New collection name is required and must be a non-empty string");
  }
  await collectionRef.rename(newName, { dropTarget: options.dropTarget ?? false });
  return { renamed: true, from: collectionName, to: newName };
}
async function collModForAccessor(collectionRef, collectionName, dbRef, modifications) {
  if (modifications === null || typeof modifications !== "object") {
    throw new Error("Modifications must be a non-null object");
  }
  return resolveDb(collectionRef, dbRef).command({
    collMod: collectionName,
    ...modifications
  });
}
async function convertToCappedForAccessor(collectionRef, collectionName, dbRef, size, options = {}) {
  if (typeof size !== "number") {
    throw new Error("Size must be a number");
  }
  if (size <= 0) {
    throw new Error("Size must be a positive number");
  }
  const command = { convertToCapped: collectionName, size };
  if (options.max !== void 0) {
    command["max"] = options.max;
  }
  const result = await resolveDb(collectionRef, dbRef).command(command);
  return { ok: result["ok"], collection: collectionName, capped: true, size };
}

// src/core/expression/expression-compiler.ts
var FUNC_REGEX = /^(CONCAT|UPPER|LOWER|TRIM|SUBSTR|LENGTH|ABS|CEIL|FLOOR|ROUND|SQRT|POW|SIZE|IN|SLICE|FIRST|LAST|ARRAY_ELEM_AT|FILTER|MAP|INDEX_OF|CONCAT_ARRAYS|TYPE|NOT|EXISTS|IS_NUMBER|IS_ARRAY|SUM|AVG|MAX|MIN|COUNT|PUSH|ADD_TO_SET|YEAR|MONTH|DAY_OF_MONTH|HOUR|MINUTE|SECOND|SPLIT|REPLACE|INDEX_OF_STR|LTRIM|RTRIM|SUBSTR_CP|REGEX|MERGE_OBJECTS|TO_INT|TO_STRING|OBJECT_TO_ARRAY|ARRAY_TO_OBJECT|SET_UNION|SWITCH|DATE_ADD|DATE_SUBTRACT|DATE_DIFF|DATE_TO_STRING|DATE_FROM_STRING|TO_BOOL|TO_DATE|TO_DOUBLE|CONVERT|TO_DECIMAL|TO_LONG|TO_OBJECT_ID|REDUCE|ZIP|REVERSE_ARRAY|RANGE|DATE_FROM_PARTS|DATE_TO_PARTS|ISO_WEEK|ISO_WEEK_YEAR|ISO_DAY_OF_WEEK|DAY_OF_WEEK|DAY_OF_YEAR|WEEK|STR_LEN_BYTES|STR_LEN_CP|SUBSTR_BYTES|LOG|LOG10|ALL_ELEMENTS_TRUE|ANY_ELEMENT_TRUE|COND|IF_NULL|SET_FIELD|UNSET_FIELD|GET_FIELD|SET_DIFFERENCE|SET_EQUALS|SET_INTERSECTION|SET_IS_SUBSET|LET|LITERAL|RAND|SAMPLE_RATE)\s*\((.+)?\)$/i;
var IS_FUNC_CALL_RE = /^(CONCAT|UPPER|LOWER|TRIM|SUBSTR|LENGTH|ABS|CEIL|FLOOR|ROUND|SQRT|POW|SIZE|IN|SLICE|FIRST|LAST|ARRAY_ELEM_AT|FILTER|MAP|INDEX_OF|CONCAT_ARRAYS|TYPE|NOT|EXISTS|IS_NUMBER|IS_ARRAY|SUM|AVG|MAX|MIN|COUNT|PUSH|ADD_TO_SET|YEAR|MONTH|DAY_OF_MONTH|HOUR|MINUTE|SECOND|SPLIT|REPLACE|INDEX_OF_STR|LTRIM|RTRIM|SUBSTR_CP|REGEX|MERGE_OBJECTS|TO_INT|TO_STRING|OBJECT_TO_ARRAY|ARRAY_TO_OBJECT|SET_UNION|SWITCH)\s*\(/i;
function compileInnerExpression(expression) {
  const expr2 = expression.trim();
  const funcMatch = expr2.match(FUNC_REGEX);
  if (funcMatch) {
    return dispatchFunction(funcMatch[1].toUpperCase(), funcMatch[2] ?? "");
  }
  const andParts = splitTopLevel(expr2, "&&");
  if (andParts.length > 1) {
    return { $and: andParts.map((part) => compileInnerExpression(part.trim())) };
  }
  const orParts = splitTopLevel(expr2, "||");
  if (orParts.length > 1) {
    return { $or: orParts.map((part) => compileInnerExpression(part.trim())) };
  }
  const ternary = /^([^?]+)\s*\?\s*([^:]+)\s*:\s*(.+)$/.exec(expr2);
  if (ternary) {
    const [, condition, thenPart, elsePart] = ternary;
    return {
      $cond: {
        if: compileInnerExpression(condition.trim()),
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
    const [, left, operator, right] = addSubMatch;
    const operatorMap = { "+": "$add", "-": "$subtract" };
    return { [operatorMap[operator]]: [parseOperand(left.trim()), parseOperand(right.trim())] };
  }
  const mulDivMatch = /^(.+?)\s*([*\/%])\s*(.+)$/.exec(expr2);
  if (mulDivMatch) {
    const [, left, operator, right] = mulDivMatch;
    const operatorMap = { "*": "$multiply", "/": "$divide", "%": "$mod" };
    return { [operatorMap[operator]]: [parseOperand(left.trim()), parseOperand(right.trim())] };
  }
  const cmpMatch = /^(.+?)\s*(===|!==|>=|<=|>|<)\s*(.+)$/.exec(expr2);
  if (cmpMatch) {
    const [, left, operator, right] = cmpMatch;
    const operatorMap = {
      "===": "$eq",
      "!==": "$ne",
      ">=": "$gte",
      "<=": "$lte",
      ">": "$gt",
      "<": "$lt"
    };
    const leftValue = IS_FUNC_CALL_RE.test(left.trim()) ? compileInnerExpression(left.trim()) : `$${left.trim()}`;
    return { [operatorMap[operator]]: [leftValue, parseValue(right.trim())] };
  }
  const genericFuncCallRe = /^[A-Za-z_][A-Za-z0-9_]*\s*\(.+\)$/;
  if (genericFuncCallRe.test(expr2)) {
    const funcName = expr2.slice(0, expr2.indexOf("(")).trim();
    throw createError(ErrorCodes.INVALID_EXPRESSION, `Unsupported expression function: ${funcName}`);
  }
  return parseValue(expr2);
}
function parseThenElse(source) {
  return source.includes("?") && source.includes(":") ? compileInnerExpression(source) : parseValue(source);
}
function parseValue(value) {
  const normalized = stripOuterParentheses(value.trim());
  if (normalized.startsWith("'") && normalized.endsWith("'") || normalized.startsWith('"') && normalized.endsWith('"')) {
    return normalized.slice(1, -1);
  }
  if (normalized === "null") return null;
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  if (!isNaN(Number(normalized)) && normalized !== "") return Number(normalized);
  if (IS_FUNC_CALL_RE.test(normalized)) {
    return compileInnerExpression(normalized);
  }
  return `$${normalized}`;
}
function parseOperand(value) {
  const normalized = stripOuterParentheses(value);
  if (/[+\-*/%]/.test(normalized)) {
    return compileInnerExpression(normalized);
  }
  return parseValue(normalized);
}
function dispatchFunction(name, argsStr) {
  const args = splitArgsStr(argsStr);
  switch (name) {
    case "CONCAT":
      return { $concat: args.map((arg) => parseValue(arg)) };
    case "UPPER":
      return { $toUpper: parseValue(args[0]) };
    case "LOWER":
      return { $toLower: parseValue(args[0]) };
    case "TRIM":
      return { $trim: { input: parseValue(args[0]) } };
    case "LENGTH":
      return { $strLenCP: parseValue(args[0]) };
    case "SUBSTR":
      return { $substr: [parseValue(args[0]), parseInt(args[1], 10), parseInt(args[2], 10)] };
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
    case "SUBSTR_CP":
      return { $substrCP: [parseValue(args[0]), parseInt(args[1], 10), parseInt(args[2], 10)] };
    case "STR_LEN_BYTES":
      return { $strLenBytes: parseValue(args[0]) };
    case "STR_LEN_CP":
      return { $strLenCP: parseValue(args[0]) };
    case "SUBSTR_BYTES":
      return { $substrBytes: [parseValue(args[0]), parseValue(args[1]), parseValue(args[2])] };
    case "ABS":
      return { $abs: parseValue(args[0]) };
    case "CEIL":
      return { $ceil: parseValue(args[0]) };
    case "FLOOR":
      return { $floor: parseValue(args[0]) };
    case "ROUND":
      return args[1] ? { $round: [parseValue(args[0]), parseValue(args[1])] } : { $round: [parseValue(args[0])] };
    case "SQRT":
      return { $sqrt: parseValue(args[0]) };
    case "POW":
      return { $pow: [parseValue(args[0]), parseValue(args[1])] };
    case "LOG":
      return { $log: [parseValue(args[0]), parseValue(args[1])] };
    case "LOG10":
      return { $log10: parseValue(args[0]) };
    case "SIZE":
      return { $size: parseValue(args[0]) };
    case "IN":
      return { $in: [parseValue(args[0]), parseValue(args[1])] };
    case "SLICE":
      return args.length === 3 ? { $slice: [parseValue(args[0]), parseInt(args[1], 10), parseInt(args[2], 10)] } : { $slice: [parseValue(args[0]), parseInt(args[1], 10)] };
    case "FIRST":
      return { $first: parseValue(args[0]) };
    case "LAST":
      return { $last: parseValue(args[0]) };
    case "ARRAY_ELEM_AT":
      return { $arrayElemAt: [parseValue(args[0]), parseInt(args[1], 10)] };
    case "INDEX_OF":
      return { $indexOfArray: [parseValue(args[0]), parseValue(args[1])] };
    case "CONCAT_ARRAYS":
      return { $concatArrays: args.map((arg) => parseValue(arg)) };
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
    case "REDUCE": {
      const lambdaMatch = /\((\w+),\s*(\w+)\)\s*=>\s*(.+)/.exec(args[2]);
      if (!lambdaMatch) throw new Error("REDUCE requires a lambda: (acc, item) => expr");
      const [, accVar, itemVar, lambdaExpr] = lambdaMatch;
      const compiledExpr = lambdaExpr.replace(new RegExp(`\\b${accVar}\\b`, "g"), "$$value").replace(new RegExp(`\\b${itemVar}\\b`, "g"), "$$this");
      return { $reduce: { input: parseValue(args[0]), initialValue: parseValue(args[1]), in: compileInnerExpression(compiledExpr) } };
    }
    case "ZIP":
      return { $zip: { inputs: args.map((arg) => parseValue(arg)) } };
    case "REVERSE_ARRAY":
      return { $reverseArray: parseValue(args[0]) };
    case "RANGE": {
      const rangeArgs = [parseValue(args[0]), parseValue(args[1])];
      if (args[2]) rangeArgs.push(parseValue(args[2]));
      return { $range: rangeArgs };
    }
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
      const result = { $convert: { input: parseValue(args[0]), to: args[1].replace(/['"]/g, "") } };
      if (args[2]) result.$convert.onError = parseValue(args[2]);
      if (args[3]) result.$convert.onNull = parseValue(args[3]);
      return result;
    }
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
    case "DATE_ADD":
      return { $dateAdd: { startDate: parseValue(args[0]), amount: parseValue(args[1]), unit: args[2].replace(/['"]/g, "") } };
    case "DATE_SUBTRACT":
      return { $dateSubtract: { startDate: parseValue(args[0]), amount: parseValue(args[1]), unit: args[2].replace(/['"]/g, "") } };
    case "DATE_DIFF":
      return { $dateDiff: { startDate: parseValue(args[0]), endDate: parseValue(args[1]), unit: args[2].replace(/['"]/g, "") } };
    case "DATE_TO_STRING": {
      const result = { $dateToString: { format: args[1].replace(/['"]/g, ""), date: parseValue(args[0]) } };
      if (args[2]) result.$dateToString.timezone = args[2].replace(/['"]/g, "");
      return result;
    }
    case "DATE_FROM_STRING":
      return { $dateFromString: { dateString: parseValue(args[0]) } };
    case "DATE_FROM_PARTS": {
      const parts = {};
      const partNames = ["year", "month", "day", "hour", "minute", "second", "millisecond"];
      args.forEach((arg, index) => {
        if (partNames[index]) {
          parts[partNames[index]] = parseValue(arg);
        }
      });
      return { $dateFromParts: parts };
    }
    case "DATE_TO_PARTS": {
      const result = { $dateToParts: { date: parseValue(args[0]) } };
      if (args[1]) result.$dateToParts.timezone = args[1].replace(/['"]/g, "");
      return result;
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
    case "REGEX":
      return { $regexMatch: { input: parseValue(args[0]), regex: args[1].replace(/['"]/g, "") } };
    case "MERGE_OBJECTS": {
      const mergeArgs = args.map((arg) => {
        if (arg.trim().startsWith("{")) {
          try {
            return JSON.parse(arg.trim());
          } catch {
            return parseValue(arg);
          }
        }
        return parseValue(arg);
      });
      return { $mergeObjects: mergeArgs };
    }
    case "SET_UNION": {
      const unionArgs = args.map((arg) => {
        if (arg.trim().startsWith("[")) {
          try {
            return JSON.parse(arg.trim());
          } catch {
            return parseValue(arg);
          }
        }
        return parseValue(arg);
      });
      return { $setUnion: unionArgs };
    }
    case "SWITCH": {
      if (args.length < 2) throw new Error("SWITCH requires at least 2 arguments");
      const branches = [];
      let defaultValue = null;
      for (let index = 0; index < args.length - 1; index += 2) {
        if (index + 1 < args.length) {
          branches.push({ case: compileInnerExpression(args[index]), then: parseValue(args[index + 1]) });
        }
      }
      if (args.length % 2 === 1) defaultValue = parseValue(args[args.length - 1]);
      const result = { $switch: { branches } };
      if (defaultValue !== null) result.$switch.default = defaultValue;
      return result;
    }
    case "ALL_ELEMENTS_TRUE":
      return { $allElementsTrue: [parseValue(args[0])] };
    case "ANY_ELEMENT_TRUE":
      return { $anyElementTrue: [parseValue(args[0])] };
    case "COND": {
      if (args.length !== 3) throw new Error("COND requires 3 arguments");
      return { $cond: { if: compileInnerExpression(args[0]), then: parseValue(args[1]), else: parseValue(args[2]) } };
    }
    case "IF_NULL": {
      if (args.length !== 2) throw new Error("IF_NULL requires 2 arguments");
      return { $ifNull: [parseValue(args[0]), parseValue(args[1])] };
    }
    case "SET_FIELD": {
      if (args.length !== 3) throw new Error("SET_FIELD requires 3 arguments: (field, value, input)");
      return { $setField: { field: parseValue(args[0]), input: parseValue(args[2]), value: parseValue(args[1]) } };
    }
    case "UNSET_FIELD":
      return { $unsetField: { field: parseValue(args[0]), input: parseValue(args[1]) } };
    case "GET_FIELD":
      return args.length === 1 ? { $getField: parseValue(args[0]) } : { $getField: { field: parseValue(args[0]), input: parseValue(args[1]) } };
    case "SET_DIFFERENCE":
      return { $setDifference: [parseValue(args[0]), parseValue(args[1])] };
    case "SET_EQUALS":
      return { $setEquals: args.map((arg) => parseValue(arg)) };
    case "SET_INTERSECTION":
      return { $setIntersection: args.map((arg) => parseValue(arg)) };
    case "SET_IS_SUBSET":
      return { $setIsSubset: [parseValue(args[0]), parseValue(args[1])] };
    case "LET": {
      const varsMatch = /\{(.+)\}/.exec(args[0]);
      if (!varsMatch) throw new Error("LET requires an object literal for variables");
      const varPairs = varsMatch[1].split(",").map((pair) => {
        const [key, ...rest] = pair.split(":");
        return [key.trim(), rest.join(":").trim()];
      });
      const vars = {};
      for (const [key, value] of varPairs) {
        vars[key] = parseValue(value);
      }
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
  for (let index = 0; index < argsStr.length; index++) {
    const ch = argsStr[index];
    if ((ch === '"' || ch === "'") && (index === 0 || argsStr[index - 1] !== "\\")) {
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
  for (let index = 0; index < source.length; index++) {
    const ch = source[index];
    if ((ch === '"' || ch === "'") && (index === 0 || source[index - 1] !== "\\")) {
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
    } else if (!inString && parenDepth === 0 && source.startsWith(separator, index)) {
      parts.push(current);
      current = "";
      index += separator.length - 1;
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
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
  for (let index = 0; index < source.length; index++) {
    const ch = source[index];
    const prev = source[index - 1];
    if ((ch === '"' || ch === "'") && prev !== "\\") {
      if (quote === ch) quote = null;
      else if (!quote) quote = ch;
      continue;
    }
    if (quote) continue;
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0 && index < source.length - 1) return false;
    }
  }
  return true;
}

// src/core/expression/index.ts
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
  for (const [key, current] of entries) {
    result[key] = transformExpressions(current, context);
  }
  return result;
}
function transformStageEntry(stage) {
  if (!stage || typeof stage !== "object" || Array.isArray(stage)) {
    return transformExpressions(stage, "project");
  }
  const entries = Object.entries(stage);
  const result = {};
  for (const [key, current] of entries) {
    const context = getStageContext(key);
    result[key] = transformStageValue(current, context);
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
  for (const [key, current] of entries) {
    result[key] = transformStageValue(current, context);
  }
  return result;
}

// src/adapters/mongodb/queries/query-helpers.ts
import { createHmac } from "node:crypto";
import { ObjectId } from "mongodb";
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
      "id is required",
      [{ field: "id", type: "required", message: "id must not be empty" }]
    );
  }
  if (typeof id === "string") {
    if (!isHexObjectIdString(id)) {
      throw createError(
        ErrorCodes.INVALID_ARGUMENT,
        `invalid ObjectId format: "${id}"`,
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
    "id must be a string or ObjectId instance",
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

// src/adapters/mongodb/queries/find-page.ts
function normalizePositiveInteger(value, fallback, field) {
  if (value === void 0 || value === null) {
    return fallback;
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw createError(ErrorCodes.INVALID_PAGINATION, `${field} must be a positive integer.`);
  }
  return value;
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
var _asyncTotalsCache = new MemoryCache({
  maxEntries: 1e4,
  enableStats: false
});
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
    const cacheKey = JSON.stringify({ ns: coll.namespace, q: query });
    const token = Buffer.from(cacheKey).toString("base64url");
    const cachedTotal = _asyncTotalsCache.get(cacheKey);
    if (cachedTotal !== void 0) {
      return { mode: "async", total: cachedTotal, token };
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
  let effectiveMaxTimeMS;
  const driverOpts = { ...options.options ?? {} };
  effectiveMaxTimeMS = ext.maxTimeMS ?? defaults.maxTimeMS;
  if (effectiveMaxTimeMS !== void 0) driverOpts.maxTimeMS = effectiveMaxTimeMS;
  if (ext.hint !== void 0) driverOpts.hint = ext.hint;
  if (ext.collation !== void 0) driverOpts.collation = ext.collation;
  if (ext.batchSize !== void 0) driverOpts.batchSize = ext.batchSize;
  if (options.projection !== void 0) {
    driverOpts.projection = buildEffectiveProjection(options.projection, sort);
  }
  const jumpOpts = ext.jump;
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
  if (jumpOpts && page > 1 && page - 1 > jumpOpts.maxHops) {
    throw createError(ErrorCodes.JUMP_TOO_FAR, "Page jump exceeds maxHops limit.", [
      { page, maxHops: jumpOpts.maxHops, requestedHops: page - 1 }
    ]);
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
async function findPageDocuments(collection, options = {}, defaults) {
  return executeFindPage(collection, options, defaults ?? {});
}

// src/adapters/mongodb/queries/find-by-id.ts
import { ObjectId as ObjectId2 } from "mongodb";
async function findOneByIdDocument(collection, id, options) {
  const objectId = parseRequiredObjectId(id);
  const rawOptions = options ?? {};
  const findOptions = {};
  const projection = normalizeProjection(rawOptions.projection);
  if (projection) findOptions.projection = projection;
  if (rawOptions.maxTimeMS !== void 0) findOptions.maxTimeMS = rawOptions.maxTimeMS;
  if (rawOptions.comment !== void 0) findOptions.comment = rawOptions.comment;
  return collection.findOne(
    { _id: objectId },
    findOptions
  );
}
async function findByIdsDocuments(collection, ids, options, defaults = {}) {
  if (!Array.isArray(ids)) {
    throw createError(
      ErrorCodes.INVALID_ARGUMENT,
      "ids must be an array",
      [{ field: "ids", type: "type", message: "ids must be an array", received: typeof ids }]
    );
  }
  if (ids.length === 0) {
    return [];
  }
  const objectIds = [];
  const invalidIds = [];
  for (const [index, id] of ids.entries()) {
    if (id instanceof ObjectId2) {
      objectIds.push(id);
      continue;
    }
    if (typeof id === "string" && isHexObjectIdString(id)) {
      objectIds.push(new ObjectId2(id));
      continue;
    }
    if (id && typeof id === "object" && typeof id.toHexString === "function") {
      const hex = id.toHexString();
      if (isHexObjectIdString(hex)) {
        objectIds.push(new ObjectId2(hex));
        continue;
      }
    }
    invalidIds.push({ index, value: id });
  }
  if (invalidIds.length > 0) {
    throw createError(
      ErrorCodes.INVALID_ARGUMENT,
      `ids array contains ${invalidIds.length} invalid ID(s)`,
      invalidIds.map((item) => ({
        field: `ids[${item.index}]`,
        type: "format",
        message: "invalid ID",
        received: item.value
      }))
    );
  }
  const uniqueIds = [...new Set(objectIds.map((item) => item.toString()))].map((item) => new ObjectId2(item));
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
      if (docId instanceof ObjectId2) {
        resultMap.set(docId.toString(), doc);
      } else if (docId !== void 0 && docId !== null) {
        resultMap.set(String(docId), doc);
      }
    }
    return uniqueIds.map((item) => resultMap.get(item.toString())).filter((item) => item !== void 0);
  }
  return results;
}

// src/adapters/mongodb/queries/find-and-count.ts
async function findAndCountDocuments(collection, query, options, defaults) {
  const normalizedQuery = query == null ? {} : query;
  const rawOptions = options ?? {};
  const driverOptions = {};
  const projection = normalizeProjection(rawOptions.projection);
  if (projection) driverOptions.projection = projection;
  if (rawOptions.sort !== void 0) driverOptions.sort = rawOptions.sort;
  if (rawOptions.limit !== void 0) driverOptions.limit = rawOptions.limit;
  if (rawOptions.skip !== void 0) driverOptions.skip = rawOptions.skip;
  if (rawOptions.maxTimeMS !== void 0) {
    driverOptions.maxTimeMS = rawOptions.maxTimeMS;
  } else if (defaults?.maxTimeMS !== void 0) {
    driverOptions.maxTimeMS = defaults.maxTimeMS;
  }
  if (rawOptions.comment !== void 0) driverOptions.comment = rawOptions.comment;
  if (rawOptions.hint !== void 0) driverOptions.hint = rawOptions.hint;
  const [data, total] = await Promise.all([
    collection.find(
      normalizedQuery,
      driverOptions
    ).toArray(),
    collection.countDocuments(normalizedQuery)
  ]);
  return { data, total, documents: data };
}

// src/adapters/mongodb/queries/index.ts
var _a2;
_a2 = Symbol.toStringTag;
var FindChain = class {
  constructor(collection, query = {}, initialOptions = {}, defaults = {}, queryCache) {
    this.collection = collection;
    this.defaults = defaults;
    this.queryCache = queryCache;
    this[_a2] = "Promise";
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
var _a3;
_a3 = Symbol.toStringTag;
var AggregateChain = class {
  constructor(collection, pipeline = [], initialOptions = {}, defaults = {}) {
    this.collection = collection;
    this.pipeline = pipeline;
    this.defaults = defaults;
    this[_a3] = "Promise";
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
function streamDocuments(collection, query, options, defaults) {
  const streamDefaults = defaults ? { ...defaults, findLimit: void 0 } : {};
  return createFindChain(collection, query, options, streamDefaults).stream();
}
function explainDocuments(collection, query, options, defaults) {
  return createFindChain(collection, query, options, defaults).explain(options?.explain ?? "queryPlanner");
}

// src/adapters/mongodb/utils/objectid-converter.ts
import { ObjectId as ObjectId3 } from "mongodb";
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
  return ObjectId3.isValid(str);
}
function isFieldReference(value) {
  if (typeof value !== "string") return false;
  return value.startsWith("$");
}
function convertObjectIdStrings(obj, fieldPath = "", depth = 0, visited = /* @__PURE__ */ new WeakSet()) {
  const MAX_DEPTH = 10;
  if (depth > MAX_DEPTH) return obj;
  if (obj === null || obj === void 0) return obj;
  if (obj instanceof ObjectId3) return obj;
  if (obj !== null && typeof obj === "object" && obj.constructor?.name === "ObjectId") {
    try {
      const hex = obj.toString();
      if (isValidObjectIdString(hex)) return new ObjectId3(hex);
    } catch {
    }
    return obj;
  }
  if (typeof obj === "string") {
    if (isFieldReference(obj)) return obj;
    if (isValidObjectIdString(obj)) {
      try {
        return new ObjectId3(obj);
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
          converted[key] = new ObjectId3(value);
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

// src/adapters/mongodb/writes/write-utils.ts
function sleep2(ms) {
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
      throw createError(ErrorCodes.INVALID_ARGUMENT, "field must be a string or object");
    }
    if (typeof increment !== "number" || Number.isNaN(increment)) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "increment must be a number");
    }
    incPayload = { [field]: increment };
  } else if (field && typeof field === "object" && !Array.isArray(field)) {
    incPayload = {};
    for (const [key, value] of Object.entries(field)) {
      if (typeof value !== "number" || Number.isNaN(value)) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, "increment value must be a number");
      }
      incPayload[key] = value;
    }
    if (Object.keys(incPayload).length === 0) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "field must be a string or object");
    }
  } else {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "field must be a string or object");
  }
  return {
    $inc: incPayload,
    ...setPatch && Object.keys(setPatch).length > 0 ? { $set: setPatch } : {}
  };
}

// src/adapters/mongodb/writes/write-basic.ts
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
  if (options !== void 0) {
    return collection.findOneAndUpdate(filter, update, options);
  }
  return collection.findOneAndUpdate(filter, update);
}
async function findOneAndReplaceDocument(collection, filter, replacement, options) {
  if (options !== void 0) {
    return collection.findOneAndReplace(filter, replacement, options);
  }
  return collection.findOneAndReplace(filter, replacement);
}
async function findOneAndDeleteDocument(collection, filter, options) {
  if (options !== void 0) {
    return collection.findOneAndDelete(filter, options);
  }
  return collection.findOneAndDelete(filter);
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
async function incrementOneDocument(collection, filter, field, incrementOrOptions, maybeOptions) {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "filter must be a non-empty object");
  }
  let options = {};
  let increment = 1;
  if (typeof incrementOrOptions === "number" || incrementOrOptions === void 0) {
    increment = typeof incrementOrOptions === "number" ? incrementOrOptions : 1;
    options = maybeOptions ?? {};
  } else if (incrementOrOptions && typeof incrementOrOptions === "object" && !Array.isArray(incrementOrOptions)) {
    options = incrementOrOptions;
  } else {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "increment must be a number");
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
    const result = rawResult;
    value = result.value ?? null;
    matchedCount = result.lastErrorObject?.n ?? 0;
    modifiedCount = result.lastErrorObject?.updatedExisting === true && value != null ? 1 : 0;
  } else {
    value = rawResult ?? null;
    matchedCount = value != null ? 1 : 0;
    modifiedCount = value != null ? 1 : 0;
  }
  return { acknowledged: true, matchedCount, modifiedCount, value };
}

// src/adapters/mongodb/writes/write-batch.ts
async function insertBatchDocuments(collection, documents, options = {}) {
  if (!Array.isArray(documents)) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "documents must be an array");
  }
  if (documents.length === 0) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "documents array must not be empty");
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
            await sleep2(retryDelay);
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
    throw createError(ErrorCodes.INVALID_ARGUMENT, "filter must be a non-array object");
  }
  if (!update || typeof update !== "object") {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "update must be an object (update operators) or array (aggregation pipeline)");
  }
  if (!Array.isArray(update)) {
    const keys = Object.keys(update);
    if (keys.length === 0 || !keys.some((key) => key.startsWith("$"))) {
      throw createError(ErrorCodes.INVALID_ARGUMENT, "update must use update operators (e.g. $set, $inc)");
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
    throw createError(ErrorCodes.INVALID_ARGUMENT, "filter must be a non-array object");
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
            await sleep2(retryDelay);
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

// src/adapters/mongodb/common/collection-accessor-batch-helpers.ts
async function insertBatchForAccessor(context, documents, options) {
  if (!Array.isArray(documents)) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "documents must be an array");
  }
  const result = await insertBatchDocuments(context.collectionRef, documents.map((document) => context.cvDoc(document)), options);
  await context.invalidateAll();
  return result;
}
async function updateBatchForAccessor(context, filter, update, options) {
  const result = await updateBatchDocuments(context.collectionRef, context.cvFilter(filter), context.cvUpdate(update), options);
  if (result.modifiedCount > 0) {
    await context.invalidateAll();
  }
  return result;
}
async function deleteBatchForAccessor(context, filter, options) {
  const result = await deleteBatchDocuments(context.collectionRef, context.cvFilter(filter), options);
  if (result.deletedCount > 0) {
    await context.invalidateAll();
  }
  return result;
}
async function incrementOneForAccessor(context, filter, field, incrementOrOptions, maybeOptions) {
  const result = await incrementOneDocument(
    context.collectionRef,
    context.cvFilter(filter),
    field,
    incrementOrOptions,
    maybeOptions
  );
  if (result.modifiedCount > 0) {
    await context.invalidateAll();
  }
  return result;
}

// src/adapters/mongodb/common/collection-accessor-write-helpers.ts
function assertObjectArgument(value, field, message, errorCode = ErrorCodes.INVALID_ARGUMENT) {
  if (value === null || value === void 0 || typeof value !== "object" || Array.isArray(value)) {
    throw createError(errorCode, message, [{ field, type: "object.required", message }]);
  }
}
function assertUpdateDocument(update) {
  if (update === null || update === void 0) {
    throw createError(
      ErrorCodes.INVALID_ARGUMENT,
      "update must be an object (update operators) or array (aggregation pipeline)",
      [{ field: "update", type: "object|array.required", message: "update must be an update-operator object or aggregation pipeline array" }]
    );
  }
  if (Array.isArray(update)) {
    if (update.length === 0) {
      throw createError(
        ErrorCodes.INVALID_ARGUMENT,
        "update aggregation pipeline must not be an empty array",
        [{ field: "update", type: "array.empty", message: "aggregation pipeline must contain at least one stage" }]
      );
    }
    for (let index = 0; index < update.length; index++) {
      const stage = update[index];
      if (stage === null || typeof stage !== "object" || Array.isArray(stage)) {
        throw createError(
          ErrorCodes.INVALID_ARGUMENT,
          `update pipeline stage ${index + 1} must be an object`,
          [{ field: `update[${index}]`, type: "object.required", message: "pipeline stage must be an object" }]
        );
      }
      const stageKeys = Object.keys(stage);
      if (stageKeys.length === 0) {
        throw createError(
          ErrorCodes.INVALID_ARGUMENT,
          `update pipeline stage ${index + 1} must not be an empty object`,
          [{ field: `update[${index}]`, type: "object.empty", message: "pipeline stage must not be empty" }]
        );
      }
      const stageOperator = stageKeys[0];
      if (!stageOperator.startsWith("$")) {
        throw createError(
          ErrorCodes.INVALID_ARGUMENT,
          `update pipeline stage ${index + 1} operator must start with $, got "${stageOperator}"`,
          [{ field: `update[${index}]`, type: "object.invalidKeys", message: "pipeline operator must start with $" }]
        );
      }
    }
    return;
  }
  if (typeof update !== "object") {
    throw createError(
      ErrorCodes.INVALID_ARGUMENT,
      "update must be an object (update operators) or array (aggregation pipeline)",
      [{ field: "update", type: "object|array.required", message: "update must be an update-operator object or aggregation pipeline array" }]
    );
  }
  const keys = Object.keys(update);
  if (keys.length === 0) {
    throw createError(
      ErrorCodes.INVALID_ARGUMENT,
      "update must not be an empty object",
      [{ field: "update", type: "object.empty", message: "update must not be empty" }]
    );
  }
  if (!keys.some((key) => key.startsWith("$"))) {
    throw createError(
      ErrorCodes.INVALID_ARGUMENT,
      "update must use update operators (e.g. $set, $inc)",
      [{ field: "update", type: "object.invalidKeys", message: "use update operators such as $set, $inc, $push" }]
    );
  }
}
function assertReplacementDocument(replacement) {
  assertObjectArgument(replacement, "replacement", "replacement must be an object");
  if (Object.keys(replacement).some((key) => key.startsWith("$"))) {
    throw createError(ErrorCodes.INVALID_ARGUMENT, "replacement must not contain update operators (e.g. $set, $inc)");
  }
}
async function insertOneForAccessor(context, doc, options) {
  assertObjectArgument(doc, "document", "document must be an object", ErrorCodes.DOCUMENT_REQUIRED);
  let result;
  const startedAt = Date.now();
  try {
    result = await insertOneDocument(context.collectionRef, context.cvDoc(doc), options);
  } catch (err) {
    const mongoErr = err;
    if (mongoErr?.code === 11e3) {
      throw createError(
        ErrorCodes.DUPLICATE_KEY,
        "Insert failed: duplicate key violation",
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
  const elapsed = Date.now() - startedAt;
  const threshold = context.defaults?.slowQueryMs ?? 500;
  if (elapsed > threshold && context.logger) {
    try {
      context.logger.warn("[insertOne] \u6162\u64CD\u4F5C\u8B66\u544A", {
        ns: `${context.dbName}.${context.collectionName}`,
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
  await context.invalidateAll();
  return result;
}
async function insertManyForAccessor(context, documents, options) {
  if (!Array.isArray(documents)) {
    throw createError("DOCUMENTS_REQUIRED", "documents must be an array");
  }
  if (documents.length === 0) {
    throw createError("DOCUMENTS_REQUIRED", "documents array must not be empty");
  }
  if (documents.some((item) => item === null || typeof item !== "object" || Array.isArray(item))) {
    throw createError("DOCUMENTS_REQUIRED", "every element in documents must be an object");
  }
  const startedAt = Date.now();
  let result;
  try {
    const convertedDocs = documents.map((document) => context.cvDoc(document));
    result = await insertManyDocuments(context.collectionRef, convertedDocs, options);
  } catch (err) {
    const mongoErr = err;
    if (mongoErr?.code === 11e3) {
      throw createError(
        ErrorCodes.DUPLICATE_KEY,
        "insertMany failed: duplicate key violation",
        [{ field: "_id", message: mongoErr.message ?? "duplicate key" }],
        err
      );
    }
    throw err;
  }
  const elapsed = Date.now() - startedAt;
  const threshold = context.defaults?.slowQueryMs ?? 500;
  if (elapsed >= threshold && context.logger) {
    context.logger.warn("[insertMany] \u6162\u64CD\u4F5C\u8B66\u544A", {
      ns: `${context.dbName}.${context.collectionName}`,
      threshold,
      duration: elapsed,
      documentCount: documents.length,
      insertedCount: result.insertedCount,
      ordered: options?.ordered ?? true,
      comment: options?.comment,
      op: "insertMany"
    });
  }
  await context.invalidateAll();
  return result;
}
async function updateOneForAccessor(context, filter, update, options) {
  assertObjectArgument(filter, "filter", "filter must be an object");
  assertUpdateDocument(update);
  const normalizedFilter = context.cvFilter(filter);
  const finalUpdate = Array.isArray(update) ? update : convertUpdateDocument(update);
  const result = await updateOneDocument(context.collectionRef, normalizedFilter, finalUpdate, options);
  if (result.modifiedCount > 0 || result.upsertedId) {
    await context.invalidateAll();
  }
  return result;
}
async function updateManyForAccessor(context, filter, update, options) {
  assertObjectArgument(filter, "filter", "filter must be a non-empty object");
  assertUpdateDocument(update);
  const result = await updateManyDocuments(context.collectionRef, context.cvFilter(filter), context.cvUpdate(update), options);
  if (result.modifiedCount > 0 || result.upsertedId) {
    await context.invalidateAll();
  }
  return result;
}
async function replaceOneForAccessor(context, filter, replacement, options) {
  assertObjectArgument(filter, "filter", "filter must be a non-empty object");
  assertReplacementDocument(replacement);
  const result = await replaceOneDocument(context.collectionRef, context.cvFilter(filter), context.cvDoc(replacement), options);
  await context.invalidateAll();
  return result;
}
async function findOneAndReplaceForAccessor(context, filter, replacement, options) {
  assertObjectArgument(filter, "filter", "filter must be a non-empty object");
  assertReplacementDocument(replacement);
  const result = await findOneAndReplaceDocument(context.collectionRef, context.cvFilter(filter), context.cvDoc(replacement), options);
  if (result) {
    await context.invalidateAll();
  }
  return result;
}
async function findOneAndUpdateForAccessor(context, filter, update, options) {
  assertObjectArgument(filter, "filter", "filter must be a non-empty object");
  assertUpdateDocument(update);
  const result = await findOneAndUpdateDocument(context.collectionRef, context.cvFilter(filter), context.cvUpdate(update), options);
  if (result) {
    await context.invalidateAll();
  }
  return result;
}
async function findOneAndDeleteForAccessor(context, filter, options) {
  assertObjectArgument(filter, "filter", "filter must be a non-empty object");
  const result = await findOneAndDeleteDocument(context.collectionRef, context.cvFilter(filter), options);
  if (result) {
    await context.invalidateAll();
  }
  return result;
}
async function upsertOneForAccessor(context, filter, update, options) {
  assertObjectArgument(filter, "filter", "filter must be a non-empty object");
  assertObjectArgument(update, "update", "update must be a non-empty object");
  const updateDoc = Object.keys(update).some((key) => key.startsWith("$")) ? update : { $set: update };
  const result = await upsertOneDocument(
    context.collectionRef,
    context.cvFilter(filter),
    context.cvUpdate(updateDoc),
    options
  );
  await context.invalidateAll();
  const normalizedResult = result.upsertedId === null ? { ...result, upsertedId: void 0 } : result;
  return normalizedResult;
}
async function deleteOneForAccessor(context, filter, options) {
  assertObjectArgument(filter, "filter", "filter must be an object");
  const result = await deleteOneDocument(context.collectionRef, context.cvFilter(filter), options);
  if (result.deletedCount > 0) {
    await context.invalidateAll();
  }
  return result;
}
async function deleteManyForAccessor(context, filter, options) {
  assertObjectArgument(filter, "filter", "filter must be a non-empty object");
  const result = await deleteManyDocuments(context.collectionRef, context.cvFilter(filter), options);
  if (result.deletedCount > 0) {
    await context.invalidateAll();
  }
  return result;
}

// src/adapters/mongodb/common/collection-accessor.ts
var MongoCollectionAccessor = class {
  constructor(dbName, collectionName, collectionRef, management = {}, dbRef) {
    this.dbName = dbName;
    this.collectionName = collectionName;
    this.collectionRef = collectionRef;
    this.management = management;
    this.dbRef = dbRef;
  }
  /** When autoConvertObjectId is enabled, auto-converts filter/query values. */
  _cvFilter(val) {
    if (!this.management.defaults?.autoConvertObjectId) return val;
    return convertObjectIdStrings(val);
  }
  /** When autoConvertObjectId is enabled, auto-converts plain documents (insert/replace). */
  _cvDoc(val) {
    if (!this.management.defaults?.autoConvertObjectId) return val;
    return convertObjectIdStrings(val);
  }
  /** When autoConvertObjectId is enabled, auto-converts update documents ($set/$push/etc.). */
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
  raw() {
    return this.collectionRef;
  }
  /** Finds a single document matching the query, with optional cache support. */
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
  /** Returns a find chain (or a readable stream when `options.stream` is true). */
  find(query, options) {
    if (options?.stream) {
      return streamDocuments(this.collectionRef, query, options, this.management.defaults);
    }
    return createFindChain(this.collectionRef, query, options, this.management.defaults, this.management.queryCache);
  }
  /** Finds a single document by its `_id` field. */
  async findOneById(id, options) {
    const maxTimeMS = this.management.defaults?.maxTimeMS;
    return findOneByIdDocument(this.collectionRef, id, maxTimeMS !== void 0 ? { maxTimeMS, ...options } : options);
  }
  /** Finds multiple documents by an array of `_id` values. */
  async findByIds(ids, options) {
    const { findLimit: _skip, ...noLimitDefaults } = this.management.defaults ?? {};
    return findByIdsDocuments(this.collectionRef, ids, options, noLimitDefaults);
  }
  /** Returns `{ data, total }` — the matched documents together with the total count in a single round-trip. */
  async findAndCount(query, options) {
    return findAndCountDocuments(this.collectionRef, query != null ? this._cvFilter(query) : query, options, this.management.defaults);
  }
  /** Returns a Node.js Readable stream of documents matching the query (object mode). */
  stream(query, options) {
    return streamDocuments(this.collectionRef, query, options, this.management.defaults);
  }
  /** Returns the MongoDB query plan for the given query (passes `explain` to the driver). */
  explain(query, options) {
    return explainDocuments(this.collectionRef, query, options, this.management.defaults);
  }
  /** Counts documents matching the query, with optional cache and queue support. */
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
  /** Runs an aggregation pipeline and returns a chainable aggregate cursor. */
  aggregate(pipeline = [], options) {
    const normalizedPipeline = this.management.defaults?.autoConvertObjectId ? pipeline.map((stage) => convertObjectIdStrings(stage)) : pipeline;
    return createAggregateChain(this.collectionRef, normalizedPipeline, options, this.management.defaults);
  }
  /** Returns an array of distinct values for the given field key. */
  async distinct(key, query, options) {
    return distinctValues(this.collectionRef, key, this._cvFilter(query), options);
  }
  async findPage(options = {}) {
    const resolvedOptions = options.query ? { ...options, query: this._cvFilter(options.query) } : options;
    return findPageDocuments(this.collectionRef, resolvedOptions, this.management.defaults);
  }
  /** Opens a change stream on the collection with an optional aggregation pipeline. */
  watch(pipeline = [], options) {
    return watchDocuments(this.collectionRef, pipeline, options);
  }
  /** Inserts a single document and invalidates read caches. */
  async insertOne(doc, options) {
    return insertOneForAccessor(this.writeContext(), doc, options);
  }
  /** Inserts multiple documents and invalidates read caches. */
  async insertMany(...args) {
    const [documents, options] = args;
    return insertManyForAccessor(this.writeContext(), documents, options);
  }
  /**
   * Passthrough for native single-document update, with v1 validation and cache invalidation.
   * @since v1.3.0
   */
  async updateOne(filter, update, options) {
    return updateOneForAccessor(this.writeContext(), filter, update, options);
  }
  /** Updates all documents matching the filter and invalidates read caches. */
  async updateMany(...args) {
    const [filter, update, options] = args;
    return updateManyForAccessor(this.writeContext(), filter, update, options);
  }
  /** Replaces a single matching document and invalidates read caches. */
  async replaceOne(...args) {
    const [filter, replacement, options] = args;
    return replaceOneForAccessor(this.writeContext(), filter, replacement, options);
  }
  /**
   * Atomically finds and replaces a single document.
   * @since v1.3.0
   */
  async findOneAndReplace(filter, replacement, options) {
    return findOneAndReplaceForAccessor(this.writeContext(), filter, replacement, options);
  }
  /**
   * Atomically finds and updates a single document.
   * @since v1.3.0
   */
  async findOneAndUpdate(filter, update, options) {
    return findOneAndUpdateForAccessor(this.writeContext(), filter, update, options);
  }
  /**
   * Atomically finds and deletes a single document.
   * @since v1.3.0
   */
  async findOneAndDelete(filter, options) {
    return findOneAndDeleteForAccessor(this.writeContext(), filter, options);
  }
  /**
   * Convenience upsert wrapper.
   * @since v1.3.0
   */
  async upsertOne(filter, update, options) {
    return upsertOneForAccessor(this.writeContext(), filter, update, options);
  }
  /**
   * Passthrough for native single-document delete, with v1 validation and cache invalidation.
   * @since v1.3.0
   */
  async deleteOne(filter, options) {
    return deleteOneForAccessor(this.writeContext(), filter, options);
  }
  /** Deletes all documents matching the filter and invalidates read caches. */
  async deleteMany(...args) {
    const [filter, options] = args;
    return deleteManyForAccessor(this.writeContext(), filter, options);
  }
  /** Inserts documents in configurable batches to avoid exceeding driver limits. */
  async insertBatch(documents, options) {
    return insertBatchForAccessor(this.batchContext(), documents, options);
  }
  /** Applies an update to matching documents in configurable batches. */
  async updateBatch(filter, update, options) {
    return updateBatchForAccessor(this.batchContext(), filter, update, options);
  }
  /** Deletes matching documents in configurable batches. */
  async deleteBatch(filter, options) {
    return deleteBatchForAccessor(this.batchContext(), filter, options);
  }
  /** Atomically increments one or more numeric fields on a matching document. */
  async incrementOne(filter, field, incrementOrOptions, maybeOptions) {
    return incrementOneForAccessor(this.batchContext(), filter, field, incrementOrOptions, maybeOptions);
  }
  /** Creates a single index on the collection. */
  async createIndex(keys, options) {
    return createIndexForAccessor(this.collectionRef, keys, options);
  }
  /** Creates multiple indexes in a single command. */
  async createIndexes(specs) {
    return createIndexesForAccessor(this.collectionRef, specs);
  }
  /** Lists all indexes on the collection. */
  async listIndexes() {
    return listIndexesForAccessor(this.collectionRef);
  }
  /** Drops a named index from the collection. */
  async dropIndex(name) {
    return dropIndexForAccessor(this.collectionRef, name);
  }
  /** Drops all non-`_id` indexes from the collection. */
  async dropIndexes() {
    return dropIndexesForAccessor(this.collectionRef);
  }
  /** Pre-populates bookmark cache entries for the specified key dimensions and page numbers. */
  async prewarmBookmarks(keyDims = {}, pages = []) {
    return prewarmBookmarksForAccessor(this.bookmarkContext(), keyDims, pages);
  }
  /** Lists cached bookmark entries, optionally filtered by key dimensions. */
  async listBookmarks(keyDims) {
    return listBookmarksForAccessor(this.bookmarkContext(), keyDims);
  }
  /** Removes cached bookmark entries, optionally scoped to specific key dimensions. */
  async clearBookmarks(keyDims) {
    return clearBookmarksForAccessor(this.bookmarkContext(), keyDims);
  }
  async invalidate(op) {
    return this.invalidateReadCaches(op);
  }
  /** Drops the collection from the database. */
  async dropCollection() {
    return dropCollectionForAccessor(this.collectionRef);
  }
  /** Creates a collection (or a named alternative) with the given options. */
  async createCollection(name, options = {}) {
    return createCollectionForAccessor(this.collectionRef, this.collectionName, this.dbRef, name, options);
  }
  /** Creates a MongoDB view backed by the given source collection and aggregation pipeline. */
  async createView(name, source, pipeline = []) {
    return createViewForAccessor(this.collectionRef, this.dbRef, name, source, pipeline);
  }
  /** Returns usage statistics for each index on the collection. */
  async indexStats() {
    return indexStatsForAccessor(this.collectionRef);
  }
  /** Sets the JSON Schema validator and optional validation level/action for the collection. */
  async setValidator(validator, options = {}) {
    return setValidatorForAccessor(this.collectionRef, this.collectionName, this.dbRef, validator, options);
  }
  /** Sets the validation level (`off`, `moderate`, or `strict`) for the collection. */
  async setValidationLevel(level) {
    return setValidationLevelForAccessor(this.collectionRef, this.collectionName, this.dbRef, level);
  }
  /** Sets the validation action (`error` or `warn`) for the collection. */
  async setValidationAction(action) {
    return setValidationActionForAccessor(this.collectionRef, this.collectionName, this.dbRef, action);
  }
  /** Retrieves the current validator schema, validation level, and validation action. */
  async getValidator() {
    return getValidatorForAccessor(this.collectionRef, this.collectionName, this.dbRef);
  }
  /** Returns storage and document statistics for the collection. */
  async stats(options = {}) {
    return statsForAccessor(this.collectionRef, this.dbName, this.collectionName, options);
  }
  /** Renames the collection, optionally dropping an existing target collection. */
  async renameCollection(newName, options = {}) {
    return renameCollectionForAccessor(this.collectionRef, this.collectionName, newName, options);
  }
  /** Runs a `collMod` command to modify collection options or validator settings. */
  async collMod(modifications) {
    return collModForAccessor(this.collectionRef, this.collectionName, this.dbRef, modifications);
  }
  /** Converts the collection to a capped collection with the given maximum byte size. */
  async convertToCapped(size, options = {}) {
    return convertToCappedForAccessor(this.collectionRef, this.collectionName, this.dbRef, size, options);
  }
  batchContext() {
    return {
      collectionRef: this.collectionRef,
      cvFilter: (value) => this._cvFilter(value),
      cvDoc: (value) => this._cvDoc(value),
      cvUpdate: (value) => this._cvUpdate(value),
      invalidateAll: () => this.invalidateReadCaches("all")
    };
  }
  writeContext() {
    return {
      dbName: this.dbName,
      collectionName: this.collectionName,
      collectionRef: this.collectionRef,
      defaults: this.management.defaults,
      logger: this.management.logger,
      cvFilter: (value) => this._cvFilter(value),
      cvDoc: (value) => this._cvDoc(value),
      cvUpdate: (value) => this._cvUpdate(value),
      invalidateAll: () => this.invalidateReadCaches("all")
    };
  }
  bookmarkContext() {
    return {
      namespace: `${this.dbName}:${this.collectionName}`,
      cache: this.management.cache,
      getCache: this.management.getCache,
      logger: this.management.logger,
      findPage: (options) => this.findPage(options)
    };
  }
};

// src/adapters/mongodb/common/db-accessor.ts
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

// src/entry/runtime-db-facade.ts
function createRuntimeDbFacade(host, databaseName) {
  return new MongoDbAccessor(
    databaseName,
    host._client.db(databaseName),
    {
      cache: host.resolveAdapterCache(),
      queryCache: host.resolveAdapterCache(),
      getCache: () => host.resolveAdapterCache(),
      getQueryCache: () => host.resolveAdapterCache(),
      logger: host._logger,
      defaults: host._runtimeDefaults,
      // v2: cacheAutoInvalidate top-level option; v1 compat: cache.autoInvalidate nested field.
      cacheAutoInvalidate: !!host.options.cacheAutoInvalidate || !!host.options.cache?.autoInvalidate
    }
  );
}
function resolveDatabaseName(options) {
  return options["database"] ?? options.databaseName ?? "default";
}
function createRuntimeAccessors(config) {
  return {
    collection: (name) => {
      if (!name || typeof name !== "string" || !name.trim()) {
        const error = new Error("Collection name must be a non-empty string");
        error.code = "INVALID_COLLECTION_NAME";
        throw error;
      }
      if (!config.getIidCache()) {
        config.setIidCache(new MemoryCache({
          maxEntries: 1e5,
          enableStats: false
        }));
      }
      return config.defaultDb.collection(name);
    },
    db: (name) => config.db(name),
    use: (name) => config.use(name),
    instance: config.runtime
  };
}

// src/entry/runtime-model.ts
function createRuntimeModelHost(config) {
  return {
    options: config.options,
    _modelInstances: config.modelInstances,
    runtime: config.runtime,
    scopedCollection: (name, options) => config.scopedCollection(name, options)
  };
}
function createRuntimeModelInstance(host, name, scope) {
  const registered = Model.get(name);
  if (!registered) {
    throw createError(ErrorCodes.MODEL_NOT_DEFINED, `Model '${name}' is not defined.`);
  }
  const databaseName = registered.definition.connection?.database ?? scope.database ?? resolveDatabaseName(host.options);
  const poolName = registered.definition.connection?.pool ?? scope.pool;
  const cacheKey = `${poolName ?? "default"}:${databaseName}:${registered.collectionName}`;
  const revision = Model.getRevision(registered.collectionName);
  const cached = host._modelInstances.get(cacheKey);
  if (cached && cached.revision === revision) {
    return cached.instance;
  }
  const instance = new ModelInstance(
    host.scopedCollection(registered.collectionName, { database: databaseName }),
    host.runtime,
    {
      collectionName: registered.collectionName,
      dbName: databaseName,
      poolName,
      definition: registered.definition
    }
  );
  host._modelInstances.set(cacheKey, {
    revision,
    instance
  });
  return instance;
}

// src/entry/runtime-compat-accessors.ts
function asRuntimeCompatRecord(value) {
  return value;
}
function requireCompatDbInstance(value) {
  const dbInstance = asRuntimeCompatRecord(value).dbInstance;
  if (!dbInstance) {
    throw createError(ErrorCodes.NOT_CONNECTED, "Database is not connected. Call connect() first.");
  }
  return dbInstance;
}
function requireCompatPoolManagerRecord(value) {
  const poolManager = asRuntimeCompatRecord(value)._poolManager;
  if (!poolManager) {
    throw createError(ErrorCodes.NO_POOL_MANAGER, "No pool manager configured. Add pools to MonSQLize constructor options.");
  }
  return poolManager;
}
function resolvePoolClientFromRecord(poolManager, poolName) {
  const getPoolV1 = poolManager["_getPool"];
  const getPoolV2 = poolManager["getPool"];
  if (typeof getPoolV1 === "function") {
    return getPoolV1.call(poolManager, poolName) ?? null;
  }
  if (typeof getPoolV2 === "function") {
    try {
      return getPoolV2.call(poolManager, poolName) ?? null;
    } catch {
      return null;
    }
  }
  return null;
}
function assertCompatPoolExists(poolManager, poolName) {
  if (resolvePoolClientFromRecord(poolManager, poolName)) {
    return;
  }
  const getNames = poolManager["getPoolNames"];
  const available = typeof getNames === "function" ? getNames.call(poolManager) : [];
  const error = createError(ErrorCodes.POOL_NOT_FOUND, `Pool '${poolName}' not found. Available pools: [${available.join(", ")}]`);
  error["available"] = available;
  throw error;
}
function createPoolScope(runtime, poolName) {
  return {
    collection: (name) => runtime.scopedCollection(name, { pool: poolName }),
    model: (name) => runtime.scopedModel(name, { pool: poolName }),
    use: (dbName) => ({
      collection: (name) => runtime.scopedCollection(name, { pool: poolName, database: dbName }),
      model: (name) => runtime.scopedModel(name, { pool: poolName, database: dbName })
    })
  };
}
function getRegisteredModelMetadata(registered) {
  const definition = registered.definition;
  return {
    actualCollectionName: definition.collection ?? definition.name ?? registered.collectionName,
    connection: definition.connection
  };
}
function getRuntimeDatabaseName(value) {
  return asRuntimeCompatRecord(value).databaseName ?? "default";
}
function getCompatModelInstanceCache(value) {
  const record = asRuntimeCompatRecord(value);
  if (!record._modelInstances) {
    record._modelInstances = new MemoryCache({
      maxEntries: 1e5,
      enableStats: false
    });
  }
  return record._modelInstances;
}
function createCompatModelInstance(config) {
  return new ModelInstance(
    config.collection,
    config.runtime,
    {
      collectionName: config.collectionName,
      dbName: config.dbName,
      poolName: config.poolName,
      definition: config.definition
    }
  );
}

// src/entry/runtime-admin-bridge.ts
import { performance } from "node:perf_hooks";
function createLegacyCollectionBridge(config) {
  return (dbName, collName) => {
    const client = config.getClient();
    if (!client) {
      throw createError(ErrorCodes.NOT_CONNECTED, "MonSQLize is not connected yet.");
    }
    const nativeCollection = client.db(dbName).collection(collName);
    const withSlowQuery = async (operation, execute, query) => {
      const startedAt = performance.now();
      const result = await execute();
      const durationMs = Math.max(1, Math.ceil(performance.now() - startedAt));
      const threshold = config.slowQueryMs ?? 500;
      const manager = config.initializeSlowQueryLogManager();
      if (manager && durationMs >= threshold) {
        const entry = {
          database: dbName,
          collection: collName,
          operation,
          durationMs,
          query,
          timestamp: /* @__PURE__ */ new Date()
        };
        await manager.save(entry);
        config.emit("slow-query", entry);
        config.emit("query", entry);
      }
      return result;
    };
    return {
      find: async (query, options) => withSlowQuery("find", () => nativeCollection.find(query ?? {}, options).toArray(), query),
      findOne: async (query, options) => withSlowQuery("findOne", () => nativeCollection.findOne(query, options), query),
      insertOne: async (document, options) => withSlowQuery("insertOne", () => nativeCollection.insertOne(document, options)),
      insertMany: async (documents, options) => withSlowQuery("insertMany", () => nativeCollection.insertMany(documents, options)),
      updateOne: async (filter, update, options) => withSlowQuery("updateOne", () => nativeCollection.updateOne(filter, update, options)),
      updateMany: async (filter, update, options) => withSlowQuery("updateMany", () => nativeCollection.updateMany(filter, update, options)),
      deleteOne: async (filter, options) => withSlowQuery("deleteOne", () => nativeCollection.deleteOne(filter, options)),
      deleteMany: async (filter, options) => withSlowQuery("deleteMany", () => nativeCollection.deleteMany(filter, options)),
      aggregate: async (pipeline, options) => withSlowQuery("aggregate", () => nativeCollection.aggregate(pipeline, options).toArray()),
      countDocuments: async (filter, options) => withSlowQuery("countDocuments", () => nativeCollection.countDocuments(filter ?? {}, options)),
      drop: async () => nativeCollection.drop()
    };
  };
}
function createAdapterBridge(config) {
  const bridge = {};
  Object.defineProperties(bridge, {
    db: {
      enumerable: true,
      get: config.getDb
    },
    client: {
      enumerable: true,
      get: config.getClient
    },
    cache: {
      enumerable: true,
      get: config.getCache,
      set: config.setCache
    },
    instanceId: {
      enumerable: true,
      get: config.getInstanceId
    },
    ping: {
      enumerable: true,
      value: config.ping
    },
    buildInfo: {
      enumerable: true,
      value: config.buildInfo
    },
    serverStatus: {
      enumerable: true,
      value: config.serverStatus
    },
    stats: {
      enumerable: true,
      value: config.stats
    },
    listDatabases: {
      enumerable: true,
      value: config.listDatabases
    },
    dropDatabase: {
      enumerable: true,
      value: config.dropDatabase
    },
    listCollections: {
      enumerable: true,
      value: config.listCollections
    },
    runCommand: {
      enumerable: true,
      value: config.runCommand
    },
    collection: {
      enumerable: true,
      value: createLegacyCollectionBridge(config)
    },
    slowQueryLogManager: {
      enumerable: true,
      configurable: true,
      get: config.getSlowQueryLogManager
    },
    _iidCache: {
      enumerable: true,
      get: config.getIidCache,
      set: config.setIidCache
    }
  });
  return bridge;
}
function createRuntimeAdapterBridge(host) {
  return createAdapterBridge({
    getDb: () => host._defaultDb?.raw() ?? null,
    getClient: () => host._client,
    getCache: () => host.resolveAdapterCache(),
    setCache: (value) => host.setAdapterCache(value),
    getInstanceId: () => host._runtimeDefaults.namespace?.instanceId,
    ping: async () => {
      host.ensureConnected();
      return host.db().admin().ping();
    },
    buildInfo: async () => {
      host.ensureConnected();
      return host.db().admin().buildInfo();
    },
    serverStatus: async (adminOptions) => {
      host.ensureConnected();
      return host.db().admin().serverStatus(adminOptions ?? {});
    },
    stats: async (adminOptions) => {
      host.ensureConnected();
      return host.db().admin().stats(adminOptions ?? {});
    },
    listDatabases: async (adminOptions) => {
      host.ensureConnected();
      return host.db().listDatabases(adminOptions ?? {});
    },
    dropDatabase: async (name, adminOptions) => {
      host.ensureConnected();
      if (!name || typeof name !== "string") {
        throw new Error("Database name is required and must be a non-empty string");
      }
      if (!adminOptions?.confirm) {
        const error = new Error(
          "dropDatabase requires explicit confirmation. Pass { confirm: true } to proceed.\n\n\u26A0\uFE0F  WARNING: This will DELETE ALL DATA in the database!\n\u26A0\uFE0F  This operation CANNOT BE UNDONE!"
        );
        error.code = "CONFIRMATION_REQUIRED";
        throw error;
      }
      const isProduction = process.env["NODE_ENV"] === "production";
      if (isProduction && !adminOptions.allowProduction) {
        const error = new Error("dropDatabase is blocked in production. Pass { allowProduction: true } to override.");
        error.code = "PRODUCTION_BLOCKED";
        throw error;
      }
      if (!host._client) {
        throw createError(ErrorCodes.NOT_CONNECTED, "MonSQLize is not connected yet.");
      }
      await host._client.db(name).dropDatabase();
      return { dropped: true, database: name, timestamp: /* @__PURE__ */ new Date() };
    },
    listCollections: async (adminOptions) => {
      host.ensureConnected();
      const optionsRecord = adminOptions ?? {};
      const nameOnly = optionsRecord["nameOnly"] === true;
      const filter = { ...optionsRecord };
      delete filter["nameOnly"];
      const results = await host.db().listCollections(filter);
      if (nameOnly) {
        return results.map((collection) => collection.name);
      }
      return results;
    },
    runCommand: async (command, adminOptions) => {
      host.ensureConnected();
      if (command === null || typeof command !== "object") {
        throw new Error("Command must be a non-null object");
      }
      return host.db().runCommand(command, adminOptions ?? {});
    },
    getIidCache: () => host._iidCache,
    setIidCache: (value) => {
      host._iidCache = value;
    },
    initializeSlowQueryLogManager: () => host.initializeSlowQueryLogManager(),
    getSlowQueryLogManager: () => host._slowQueryLogManager,
    emit: (event, payload) => host.emit(event, payload),
    slowQueryMs: host.options.slowQueryMs
  });
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
      await sleep3(delay);
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
async function sleep3(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// src/capabilities/saga/index.ts
import { randomBytes as randomBytes3 } from "node:crypto";
var SagaExecutionContext = class {
  constructor(executionId, data) {
    this.executionId = executionId;
    this.data = data;
    this.values = /* @__PURE__ */ new Map();
    // v1 compat: tracked separately so existing code that reads these fields still works.
    /** @deprecated v1 compat — ordered list of completed step names. */
    this.completedSteps = [];
    this._stepResults = /* @__PURE__ */ new Map();
  }
  /** @deprecated Use `executionId` — v1 compatibility alias. */
  get sagaId() {
    return this.executionId;
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
  /**
   * Mark a step as completed and record its result.
   * @deprecated v1 compat — called automatically by the orchestrator. Use `ctx.get(stepName)` to retrieve step results.
   */
  markStepCompleted(stepName, result) {
    this.completedSteps.push(stepName);
    this._stepResults.set(stepName, result);
  }
  /**
   * Return the result of a previously completed step.
   * @deprecated v1 compat — use `ctx.get(stepName)` instead.
   */
  getStepResult(stepName) {
    return this._stepResults.get(stepName);
  }
  /**
   * Return an ordered copy of completed step names.
   * @deprecated v1 compat — use `ctx.getAll()` instead.
   */
  getCompletedSteps() {
    return [...this.completedSteps];
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
      throw createError(ErrorCodes.INVALID_ARGUMENT, `Saga '${name}' is not defined`);
    }
    const sagaId = `saga_${randomBytes3(8).toString("hex")}`;
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
        context.markStepCompleted(step.name, result);
      }
      this._stats.successfulExecutions += 1;
      const stepNames = completedSteps.map(({ step }) => step.name);
      return {
        sagaId,
        executionId: sagaId,
        sagaName: name,
        success: true,
        completedSteps: completedSteps.length,
        completedStepNames: stepNames,
        compensatedSteps: [],
        result: completedSteps[completedSteps.length - 1]?.result,
        duration: Date.now() - startedAt
      };
    } catch (cause) {
      const errorMessage = cause instanceof Error ? cause.message : String(cause);
      this._stats.failedExecutions += 1;
      const compensationResults = [];
      const hasCompensationSteps = completedSteps.some(({ step }) => typeof step.compensate === "function");
      if (hasCompensationSteps) {
        this._stats.compensatedExecutions += 1;
      }
      for (const { step, result: stepResult } of [...completedSteps].reverse()) {
        if (typeof step.compensate !== "function") {
          compensationResults.push({ stepName: step.name, success: false, reason: "no-compensate-defined" });
          continue;
        }
        const compStart = Date.now();
        try {
          await step.compensate(context, stepResult);
          compensationResults.push({ stepName: step.name, success: true, duration: Date.now() - compStart });
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
        sagaId,
        executionId: sagaId,
        sagaName: name,
        success: false,
        completedSteps: completedSteps.length,
        completedStepNames: completedSteps.map(({ step }) => step.name),
        compensatedSteps: compensationResults.filter((r) => r.reason !== "no-compensate-defined").map((r) => r.stepName),
        duration: Date.now() - startedAt,
        error: errorMessage,
        errorCause: cause instanceof Error ? cause : void 0,
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
      storageMode: "memory",
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

// src/capabilities/slow-query-log/slow-query-log-config.ts
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

// src/capabilities/slow-query-log/slow-query-log-batch-queue.ts
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
  async add(log) {
    this.buffer.push(log);
    if (this.buffer.length >= this.maxBufferSize || this.buffer.length >= this.batchSize) {
      await this.flush();
      return;
    }
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, this.flushInterval);
      this.timer.unref?.();
    }
  }
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
  async close() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.flush();
  }
};

// src/capabilities/slow-query-log/slow-query-log-storage.ts
import { MongoClient as MongoDriverClient2 } from "mongodb";

// src/capabilities/slow-query-log/slow-query-log-records.ts
import { createHash as createHash2 } from "node:crypto";
function stableStringify2(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify2(item)).join(",")}]`;
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, current]) => `${JSON.stringify(key)}:${stableStringify2(current)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function generateQueryHash(input) {
  return createHash2("sha1").update(stableStringify2(input)).digest("hex");
}
function handleSlowQueryLogError(logger, policy, error) {
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
function mergeSlowQueryLogRecord(existing, incoming) {
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
function matchesSlowQueryLogFilter(record, filter) {
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
function sortSlowQueryLogRecords(records, sort = { lastSeen: -1 }) {
  const entries = Object.entries(sort);
  return [...records].sort((left, right) => {
    for (const [field, direction] of entries) {
      const leftValue = left[field];
      const rightValue = right[field];
      if (leftValue === rightValue) {
        continue;
      }
      if (leftValue == null) return direction;
      if (rightValue == null) return -direction;
      return (leftValue > rightValue ? 1 : -1) * direction;
    }
    return 0;
  });
}
function cloneSlowQueryLogRecord(record) {
  return {
    ...record,
    firstSeen: new Date(record.firstSeen),
    lastSeen: new Date(record.lastSeen)
  };
}

// src/capabilities/slow-query-log/slow-query-log-storage.ts
async function defaultClientFactory2(uri, options) {
  const client = new MongoDriverClient2(uri, options);
  await client.connect();
  return client;
}
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
    let records = [...this.records.values()].filter((record) => matchesSlowQueryLogFilter(record, filter));
    records = sortSlowQueryLogRecords(records, options.sort);
    if (options.skip) {
      records = records.slice(options.skip);
    }
    if (options.limit) {
      records = records.slice(0, options.limit);
    }
    return records.map(cloneSlowQueryLogRecord);
  }
  async close() {
    return void 0;
  }
  upsertRecord(log) {
    const normalized = normalizeSlowQueryLogEntry(log);
    const key = recordKey(normalized);
    const existing = this.records.get(key);
    this.records.set(key, mergeSlowQueryLogRecord(existing, normalized));
  }
};
var MongoDBSlowQueryLogStorage = class {
  constructor(config = {}, businessClient = null, logger = null, clientFactory = defaultClientFactory2) {
    this.client = null;
    this.collectionRef = null;
    this._initializingPromise = null;
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
    if (this._initializingPromise) {
      return this._initializingPromise;
    }
    this._initializingPromise = (async () => {
      const client = await this.resolveClient();
      this.collectionRef = client.db(this.config.database).collection(this.config.collection);
      if (this.config.ttl && this.config.ttl > 0) {
        await this.collectionRef.createIndex({ lastSeen: 1 }, { expireAfterSeconds: this.config.ttl, name: "slow_query_lastSeen_ttl" });
      }
      await this.collectionRef.createIndex(
        { queryHash: 1, database: 1, collection: 1, operation: 1 },
        { unique: true, name: "slow_query_log_unique" }
      );
    })().finally(() => {
      this._initializingPromise = null;
    });
    return this._initializingPromise;
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
    if (logs.length === 0) return;
    if (logs.length === 1) {
      await this.save(logs[0]);
      return;
    }
    await this.initialize();
    const operations = logs.map((log) => {
      const record = normalizeSlowQueryLogEntry(log);
      return {
        updateOne: {
          filter: {
            queryHash: record.queryHash,
            database: record.database,
            collection: record.collection,
            operation: record.operation
          },
          update: {
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
          upsert: true
        }
      };
    });
    await this.collectionRef.bulkWrite(operations, { ordered: false });
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

// src/capabilities/slow-query-log/slow-query-log-manager.ts
var SlowQueryLogManager = class {
  constructor(userConfig, businessClient = null, businessType = "mongodb", logger = null, options = {}) {
    this.initialized = false;
    this._initializingPromise = null;
    this.logger = logger;
    this.config = SlowQueryLogConfigManager.mergeConfig(userConfig, businessType);
    SlowQueryLogConfigManager.validate(this.config, businessType);
    this.storage = options.storage ?? (this.config.storage.type === "memory" ? new SlowQueryLogMemoryStorage() : new MongoDBSlowQueryLogStorage(this.config.storage, businessClient, logger));
    this.queue = this.config.batch.enabled ? new BatchQueue(this.storage, this.config.batch, logger) : null;
  }
  async initialize() {
    if (this.initialized || !this.config.enabled) {
      return;
    }
    if (this._initializingPromise) {
      return this._initializingPromise;
    }
    this._initializingPromise = this.storage.initialize().then(() => {
      this.initialized = true;
    }).finally(() => {
      this._initializingPromise = null;
    });
    return this._initializingPromise;
  }
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
      handleSlowQueryLogError(this.logger, this.config.advanced.errorHandling, error);
    }
  }
  async query(filter = {}, options = {}) {
    await this.initialize();
    return this.storage.query(filter, options);
  }
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

// src/entry/runtime-capability-factories.ts
function getOrCreateTransactionManager(config) {
  if (!config.client) {
    throw createError(ErrorCodes.NOT_CONNECTED, "MonSQLize is not connected yet.");
  }
  if (config.current) {
    return config.current;
  }
  return new TransactionManager({
    client: config.client,
    cache: config.cache,
    logger: config.logger,
    lockManager: config.lockManager
  });
}
function getOrCreateLockManager(current, logger) {
  return current ?? new LockManager({ logger });
}
async function initializeRuntimeSyncManager(config) {
  if (!config.enabled || !config.defaultDb) {
    return null;
  }
  if (config.current) {
    return config.current;
  }
  const manager = new ChangeStreamSyncManager({
    db: config.defaultDb.raw(),
    poolManager: config.poolManager,
    config: config.sync,
    logger: config.logger
  });
  try {
    await manager.start();
  } catch (error) {
    config.onStartFailure(error);
  }
  return manager;
}
function initializeRuntimeSlowQueryLogManager(config) {
  if (!config.slowQueryLog || !config.client) {
    return null;
  }
  if (config.current) {
    return config.current;
  }
  let slowQueryLogConfig = config.slowQueryLog;
  if (config.slowQueryMs !== void 0 && typeof slowQueryLogConfig === "object" && slowQueryLogConfig !== null) {
    const partialConfig = slowQueryLogConfig;
    if (!partialConfig.filter?.minExecutionTimeMs) {
      slowQueryLogConfig = {
        ...partialConfig,
        filter: {
          ...partialConfig.filter,
          minExecutionTimeMs: config.slowQueryMs
        }
      };
    }
  }
  return new SlowQueryLogManager(
    slowQueryLogConfig,
    config.client,
    "mongodb",
    config.logger
  );
}
function ensureRuntimeSlowQueryLogManager(manager) {
  if (!manager) {
    throw createError(ErrorCodes.INVALID_CONFIG, "MonSQLize slow query log is not enabled for this runtime.");
  }
  return manager;
}
function getOrCreateSagaOrchestrator(current, logger) {
  return current ?? new SagaOrchestrator({ logger });
}
function requireRuntimePoolManager(poolManager) {
  if (!poolManager) {
    throw createError(ErrorCodes.INVALID_CONFIG, "MonSQLize pool() requires options.pools configuration.");
  }
  return poolManager;
}

// src/entry/runtime-scoped-collection.ts
function resolveScopedCollection(config) {
  const poolName = config.connection.pool;
  const defaultDbName = config.self["databaseName"] ?? config.options["database"] ?? config.options.databaseName ?? "default";
  const databaseName = config.connection.database || defaultDbName;
  if (poolName) {
    const poolManagerRecord = config.self["_poolManager"];
    if (!poolManagerRecord) {
      throw createError(ErrorCodes.NO_POOL_MANAGER, `Model '${config.collectionName}' requires pool '${poolName}' but no pools are configured. Add 'pools' to MonSQLize constructor options.`);
    }
    const client = resolvePoolClientFromRecord(poolManagerRecord, poolName);
    if (!client) {
      const getNames = poolManagerRecord["getPoolNames"];
      const available = typeof getNames === "function" ? getNames.call(poolManagerRecord) : [];
      const error = createError(ErrorCodes.POOL_NOT_FOUND, `Pool '${poolName}' not found. Available pools: [${available.join(", ")}]`);
      error["available"] = available;
      throw error;
    }
    const adapter = config.self["_adapter"];
    if (adapter && typeof adapter["collectionFromClient"] === "function") {
      return adapter["collectionFromClient"](
        client,
        databaseName,
        config.collectionName
      );
    }
    if (config.poolManager) {
      const selected = config.poolManager.selectPool("read", { pool: poolName, databaseName });
      return new MongoCollectionAccessor(
        databaseName,
        config.collectionName,
        selected.collection(databaseName, config.collectionName),
        { cache: config.cache, logger: config.logger, defaults: config.runtimeDefaults }
      );
    }
    return null;
  }
  if (config.client) {
    return config.db(databaseName).collection(config.collectionName);
  }
  const dbInstance = config.self["dbInstance"];
  if (!dbInstance) {
    throw createError(ErrorCodes.NOT_CONNECTED, "Database is not connected. Call connect() first.");
  }
  return dbInstance.db(databaseName).collection(config.collectionName);
}

// src/entry/runtime-cache-normalizer.ts
function isCacheLike(value) {
  if (!value || typeof value !== "object") return false;
  const v = value;
  return typeof v["get"] === "function" && typeof v["set"] === "function" && typeof v["del"] === "function";
}
function toOptionalNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function toOptionalBoolean(value) {
  return typeof value === "boolean" ? value : void 0;
}
function normalizeRuntimeCache(cache) {
  if (cache instanceof MemoryCache) return cache;
  if (isCacheLike(cache)) return cache;
  const input = cache ?? {};
  if (input.multiLevel === true || input.local !== void 0 && typeof input.local === "object") {
    const localOpts = input.local ?? {};
    const local = new MemoryCache({
      maxEntries: toOptionalNumber(localOpts.maxEntries ?? localOpts.maxSize),
      maxMemory: toOptionalNumber(localOpts.maxMemory),
      defaultTtl: toOptionalNumber(localOpts.defaultTtl ?? localOpts.ttl),
      enableStats: toOptionalBoolean(localOpts.enableStats),
      enableTags: toOptionalBoolean(localOpts.enableTags),
      cleanupInterval: toOptionalNumber(localOpts.cleanupInterval),
      enabled: toOptionalBoolean(localOpts.enabled)
    });
    const remoteInput = input.remote;
    const remote = isCacheLike(remoteInput) ? remoteInput : remoteInput ? new MemoryCache({
      maxEntries: toOptionalNumber(remoteInput.maxEntries ?? remoteInput.maxSize),
      maxMemory: toOptionalNumber(remoteInput.maxMemory),
      defaultTtl: toOptionalNumber(remoteInput.defaultTtl ?? remoteInput.ttl),
      enableStats: toOptionalBoolean(remoteInput.enableStats),
      enableTags: toOptionalBoolean(remoteInput.enableTags),
      cleanupInterval: toOptionalNumber(remoteInput.cleanupInterval),
      enabled: toOptionalBoolean(remoteInput.enabled)
    }) : void 0;
    const policy = input.policy ?? {};
    return new MultiLevelCache({
      local,
      remote,
      writePolicy: policy.writePolicy ?? "both",
      backfillOnRemoteHit: policy.backfillLocalOnRemoteHit ?? true,
      remoteTimeoutMs: remoteInput && !isCacheLike(remoteInput) ? toOptionalNumber(remoteInput.timeoutMs) : void 0,
      publish: input.publish
    });
  }
  return new MemoryCache({
    maxEntries: toOptionalNumber(input.maxEntries ?? input.maxSize),
    maxMemory: toOptionalNumber(input.maxMemory),
    defaultTtl: toOptionalNumber(input.defaultTtl ?? input.ttl),
    enableStats: toOptionalBoolean(input.enableStats),
    enableTags: toOptionalBoolean(input.enableTags),
    cleanupInterval: toOptionalNumber(input.cleanupInterval),
    enabled: toOptionalBoolean(input.enabled)
  });
}

// src/capabilities/function-cache/index.ts
import { withCache as hubWithCache, FunctionCache as HubFunctionCache } from "cache-hub/function-cache";
var FunctionCache = class extends HubFunctionCache {
  constructor(cacheOrDb, options) {
    let normalizedOptions = options;
    if (options?.defaultTTL !== void 0 && options.ttl === void 0) {
      const { defaultTTL, ...rest } = options;
      normalizedOptions = { ...rest, ttl: defaultTTL };
    }
    super(cacheOrDb, normalizedOptions);
  }
};
function withCache(fn, options) {
  const wrapped = hubWithCache(fn, options);
  wrapped.getCacheStats = () => wrapped.stats();
  return wrapped;
}

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
    this._modelInstances = new MemoryCache({
      maxEntries: 1e5,
      enableStats: false
    });
    this._connectionPromise = null;
    this._sshTunnel = null;
    this._distributedInvalidator = null;
    const type = options.type;
    if (type !== "mongodb") {
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
    const rawCacheInput = options.cache;
    const hasDistributedCfg = rawCacheInput != null && typeof rawCacheInput === "object" && !(rawCacheInput instanceof MemoryCache) && typeof rawCacheInput["get"] !== "function" && typeof rawCacheInput["distributed"] === "object" && rawCacheInput["distributed"] !== null;
    const cacheInput = hasDistributedCfg ? {
      ...rawCacheInput,
      publish: (msg) => {
        void this._distributedInvalidator?.invalidate(msg.pattern);
      }
    } : rawCacheInput;
    this._cache = normalizeRuntimeCache(cacheInput);
    this._logger = Logger.create(options.logger ?? null);
    this._cacheLockManager = new CacheLockManager({ logger: options.logger ?? null });
    this._cache.setLockManager?.(this._cacheLockManager);
    this._runtimeDefaults = buildRuntimeDefaults(options);
    this._adapterCacheOverride = void 0;
    this._adapterBridge = createRuntimeAdapterBridge(this.createAdapterBridgeHost());
    this.defaults = buildPublicDefaults(options);
    this.autoConvertConfig = initAutoConvertConfig(options.autoConvertObjectId, options.type);
  }
  /** v1 compat: expose logger as a public accessor (tests may monkey-patch `.warn/.info`). */
  get logger() {
    return this._logger;
  }
  async connect() {
    if (this._connected) {
      return this.createAccessors();
    }
    if (this._connectionPromise) {
      return this._connectionPromise;
    }
    this._connectionPromise = (async () => {
      const databaseName = resolveDatabaseName(this.options);
      let connectConfig = this.options.config;
      const sshCfg = connectConfig?.["ssh"];
      if (sshCfg && typeof sshCfg === "object") {
        const cfg = sshCfg;
        const rawCfg = connectConfig;
        const remoteHost = String(cfg["dstHost"] ?? rawCfg["remoteHost"] ?? parseHostFromUri(String(connectConfig?.uri ?? "")));
        const remotePort = Number(cfg["dstPort"] ?? rawCfg["remotePort"] ?? parsePortFromUri(String(connectConfig?.uri ?? "")));
        const tunnel = new SSHTunnelSSH2(sshCfg, remoteHost, remotePort, { name: databaseName });
        this._logger.info?.(`[SSH] Establishing tunnel to ${remoteHost}:${remotePort} via ${String(cfg["host"])}`);
        await tunnel.connect();
        this._sshTunnel = tunnel;
        this._logger.info?.(`[SSH] Tunnel ready \u2014 local address: ${tunnel.getLocalAddress()}`);
        if (connectConfig?.uri) {
          connectConfig = { ...connectConfig, uri: tunnel.getTunnelUri("mongodb", connectConfig.uri) };
        }
      }
      const { client } = await connectMongo({
        databaseName,
        config: connectConfig,
        logger: this._logger
      });
      this._client = client;
      this._defaultDb = this.createDbFacade(databaseName);
      if (!this._poolManager) {
        this._poolManager = await createAndStartPoolManager(this.options);
      }
      this.initializeSagaOrchestrator();
      this.initializeSlowQueryLogManager();
      await this.initializeSyncManager();
      if (!this._distributedInvalidator) {
        this._distributedInvalidator = await initializeDistributedCacheInvalidator(
          this.options,
          this._cache,
          this._logger
        );
        if (this._distributedInvalidator && this._cache instanceof MemoryCache) {
          this._logger.warn?.(
            "[Cache] distributed invalidator created but cache has no publish hook \u2014 broadcast path disabled. Use cache: { local, remote, distributed } for full cross-instance sync."
          );
        }
      }
      this._connected = true;
      await this._loadModels();
      this.emit("connected", {
        type: this.options.type,
        db: databaseName
      });
      return this.createAccessors();
    })();
    try {
      return await this._connectionPromise;
    } catch (error) {
      if (!this._connected) {
        const clientToClose = this._client;
        const poolToClose = this._poolManager;
        const tunnelToClose = this._sshTunnel;
        const invalidatorToClose = this._distributedInvalidator;
        this._client = null;
        this._defaultDb = null;
        this._poolManager = null;
        this._sshTunnel = null;
        this._distributedInvalidator = null;
        clientToClose?.close().catch(() => {
        });
        poolToClose?.close().catch(() => {
        });
        tunnelToClose?.close().catch(() => {
        });
        invalidatorToClose?.close().catch(() => {
        });
      }
      this.emit("error", {
        type: this.options.type,
        db: resolveDatabaseName(this.options),
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      this._connectionPromise = null;
    }
  }
  getCache() {
    return this._cache;
  }
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
  async close() {
    const results = await Promise.allSettled([
      this._syncManager?.stop(),
      this._slowQueryLogManager?.close(),
      this._transactionManager?.abortAll(),
      this._poolManager?.close(),
      this._distributedInvalidator?.close()
    ]);
    for (const result of results) {
      if (result.status === "rejected") {
        this._logger.warn("[MonSQLizeRuntime] cleanup error during close", result.reason);
      }
    }
    this._cacheLockManager.stop();
    this._lockManager?.close();
    await closeMongo(this._client, this._logger);
    if (this._sshTunnel) {
      await this._sshTunnel.close().catch((err) => {
        this._logger.warn("[SSH] Error closing SSH tunnel", err);
      });
    }
    this._client = null;
    this._defaultDb = null;
    this._connected = false;
    this._poolManager = null;
    this._syncManager = null;
    this._slowQueryLogManager = null;
    this._transactionManager = null;
    this._lockManager = null;
    this._sagaOrchestrator = null;
    this._iidCache = null;
    this._sshTunnel = null;
    this._distributedInvalidator = null;
    this._modelInstances.clear();
    this.emit("closed", {
      type: this.options.type,
      db: resolveDatabaseName(this.options)
    });
  }
  async health() {
    return {
      status: this._connected ? "up" : "down",
      connected: this._connected,
      driver: { connected: this._connected },
      defaults: this.getDefaults(),
      cache: {
        enabled: true,
        pools: this._poolManager?.getHealthStatus()
      }
    };
  }
  // v1 exposes cache / _adapter / dbInstance / _connecting directly; keep same-name bridges here.
  get cache() {
    return this._cache;
  }
  get _adapter() {
    if (this._client === null) return null;
    return this._adapterBridge;
  }
  get dbInstance() {
    if (this._client === null) return null;
    return {
      collection: (name) => this.collection(name),
      db: (name) => this.db(name),
      withLock: (key, callback, options) => this.withLock(key, callback, options),
      acquireLock: (key, options) => this.acquireLock(key, options),
      tryAcquireLock: (key, options) => this.tryAcquireLock(key, options),
      getLockStats: () => this.getLockStats()
    };
  }
  get _connecting() {
    return this._connectionPromise;
  }
  // Root accessors ----------------------------------------------------------
  collection(name) {
    if (!name || typeof name !== "string" || !name.trim()) {
      const err = new Error("Collection name must be a non-empty string");
      err.code = "INVALID_COLLECTION_NAME";
      throw err;
    }
    const dbInstance = requireCompatDbInstance(this);
    if (this._client) {
      return this.db().collection(name);
    }
    return dbInstance.collection(name);
  }
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
    const databaseName = name ?? resolveDatabaseName(this.options);
    if (databaseName === resolveDatabaseName(this.options) && this._defaultDb) {
      return this._defaultDb;
    }
    return this.createDbFacade(databaseName);
  }
  resolveAdapterCache() {
    return this._adapterCacheOverride === void 0 ? this._cache : this._adapterCacheOverride;
  }
  setAdapterCache(value) {
    this._adapterCacheOverride = value;
  }
  use(name) {
    requireCompatDbInstance(this);
    return {
      collection: (collectionName) => this.scopedCollection(collectionName, { database: name }),
      model: (modelName) => this.scopedModel(modelName, { database: name })
    };
  }
  pool(poolName) {
    requireCompatDbInstance(this);
    const poolManager = requireCompatPoolManagerRecord(this);
    assertCompatPoolExists(poolManager, poolName);
    return createPoolScope(this, poolName);
  }
  scopedCollection(name, options = {}) {
    requireCompatDbInstance(this);
    const { pool, database } = options;
    if (!pool && !database) {
      return this.collection(name);
    }
    return this._resolveModelCollection(name, { pool, database });
  }
  _resolveModelCollection(collectionName, connection) {
    return resolveScopedCollection({
      collectionName,
      connection,
      options: this.options,
      self: asRuntimeCompatRecord(this),
      client: this._client,
      poolManager: this._poolManager,
      cache: this._cache,
      logger: this._logger,
      runtimeDefaults: this._runtimeDefaults,
      db: (name) => this.db(name)
    });
  }
  // Model accessors ---------------------------------------------------------
  scopedModel(name, options = {}) {
    const dbInstance = requireCompatDbInstance(this);
    if (this._client) {
      return this.createModelInstance(name, options);
    }
    const registered = Model.get(name);
    if (!registered) {
      throw createError(ErrorCodes.MODEL_NOT_DEFINED, `Model '${name}' is not defined. Call Model.define() first.`);
    }
    const { actualCollectionName, connection } = getRegisteredModelMetadata(registered);
    const merged = { ...connection ?? {}, ...options };
    const { pool, database } = merged;
    const collection = pool || database ? this._resolveModelCollection(actualCollectionName, { pool, database }) : dbInstance.collection(actualCollectionName);
    return createCompatModelInstance({
      collection,
      runtime: this,
      collectionName: actualCollectionName,
      dbName: database ?? getRuntimeDatabaseName(this),
      poolName: pool,
      definition: registered.definition
    });
  }
  model(name) {
    if (this._client) {
      this.ensureConnected();
      return this.createModelInstance(name, {
        database: resolveDatabaseName(this.options)
      });
    }
    const dbInstance = requireCompatDbInstance(this);
    const cache = getCompatModelInstanceCache(this);
    if (cache.has(name)) {
      if (!Model._redefinedNames.has(name)) {
        return cache.get(name);
      }
      cache.del(name);
      Model._redefinedNames.delete(name);
    }
    const registered = Model.get(name);
    if (!registered) {
      throw createError(ErrorCodes.MODEL_NOT_DEFINED, `Model '${name}' is not defined.`);
    }
    const { actualCollectionName, connection } = getRegisteredModelMetadata(registered);
    const collection = connection && (connection.pool || connection.database) ? this._resolveModelCollection(actualCollectionName, connection) : dbInstance.collection(actualCollectionName);
    const instance = createCompatModelInstance({
      collection,
      runtime: this,
      collectionName: actualCollectionName,
      dbName: getRuntimeDatabaseName(this),
      definition: registered.definition
    });
    cache.set(name, instance);
    return instance;
  }
  // Capability delegation ----------------------------------------------------
  async startSession(options = {}) {
    this.ensureConnected();
    return this.getTransactionManager().startSession(options);
  }
  async withTransaction(callback, options = {}) {
    this.ensureConnected();
    return this.getTransactionManager().withTransaction(callback, options);
  }
  async withLock(key, callback, options = {}) {
    this.ensureConnected();
    return this.getLockManager().withLock(key, callback, options);
  }
  async acquireLock(key, options = {}) {
    this.ensureConnected();
    return this.getLockManager().acquireLock(key, options);
  }
  async tryAcquireLock(key, options = {}) {
    this.ensureConnected();
    return this.getLockManager().tryAcquireLock(key, options);
  }
  getSyncManager() {
    return this._syncManager;
  }
  getSlowQueryLogManager() {
    return this._slowQueryLogManager;
  }
  getSagaOrchestrator() {
    return this.initializeSagaOrchestrator();
  }
  saga() {
    return this.getSagaOrchestrator();
  }
  async recordSlowQuery(log) {
    this.ensureConnected();
    const manager = this.ensureSlowQueryLogManager();
    await manager.save(log);
    this.emit("slow-query", log);
    this.emit("query", log);
  }
  async getSlowQueryLogs(filter = {}, options = {}) {
    this.ensureConnected();
    const manager = this.ensureSlowQueryLogManager();
    return manager.query(filter, options);
  }
  defineSaga(definition) {
    this.initializeSagaOrchestrator().define(definition);
  }
  async executeSaga(name, data) {
    return this.initializeSagaOrchestrator().execute(name, data);
  }
  async listSagas() {
    return this.initializeSagaOrchestrator().listSagas();
  }
  getSagaStats() {
    return this.initializeSagaOrchestrator().getStats();
  }
  async startSync() {
    this.ensureConnected();
    const manager = await this.initializeSyncManager();
    if (!manager) {
      throw createError(ErrorCodes.INVALID_CONFIG, "MonSQLize sync is not enabled for this runtime.");
    }
    await manager.start();
  }
  async stopSync() {
    await this._syncManager?.stop();
  }
  getSyncStats() {
    return this._syncManager?.getStats() ?? null;
  }
  on(event, handler) {
    this._events.on(event, handler);
  }
  once(event, handler) {
    this._events.once(event, handler);
  }
  off(event, handler) {
    this._events.off(event, handler);
  }
  emit(event, payload) {
    if (event === "error" && this._events.listenerCount("error") === 0) {
      this._logger.error("[MonSQLizeRuntime] error event", payload);
      return;
    }
    this._events.emit(event, payload);
  }
  async addPool(config) {
    await this.requirePoolManager().addPool(config);
  }
  async removePool(name) {
    await this.requirePoolManager().removePool(name);
  }
  getPoolNames() {
    return this.requirePoolManager().getPoolNames();
  }
  getPoolStats() {
    return this.requirePoolManager().getPoolStats();
  }
  getPoolHealth() {
    return this.requirePoolManager().getHealthStatus();
  }
  getLockStats() {
    return this._lockManager?.getStats() ?? null;
  }
  async listDatabases(options = {}) {
    this.ensureConnected();
    return this.db().listDatabases(options);
  }
  async dropDatabase(options = { confirm: false }) {
    this.ensureConnected();
    return this.db().dropDatabase(options);
  }
  async listCollections(filter = {}, options = {}) {
    this.ensureConnected();
    return this.db().listCollections(filter, options);
  }
  async runCommand(command, options = {}) {
    this.ensureConnected();
    return this.db().runCommand(command, options);
  }
  ensureConnected() {
    if (!this._connected) {
      throw createError(ErrorCodes.NOT_CONNECTED, "Database is not connected. Please call connect() first.");
    }
  }
  createAccessors() {
    return createRuntimeAccessors({
      defaultDb: this._defaultDb,
      runtime: this,
      db: (name) => this.db(name),
      use: (name) => this.use(name),
      getIidCache: () => this._iidCache,
      setIidCache: (value) => {
        this._iidCache = value;
      }
    });
  }
  createDbFacade(databaseName) {
    return createRuntimeDbFacade(this.createDbFacadeHost(), databaseName);
  }
  getTransactionManager() {
    this._transactionManager = getOrCreateTransactionManager({
      current: this._transactionManager,
      client: this._client,
      cache: this._cache,
      logger: this.options.logger ?? null,
      lockManager: this._cacheLockManager
    });
    return this._transactionManager;
  }
  getLockManager() {
    this._lockManager = getOrCreateLockManager(this._lockManager, this.options.logger ?? null);
    return this._lockManager;
  }
  async _loadModels(opts = {}) {
    await loadModelFiles(this.options, this._logger, opts);
  }
  async initializeSyncManager() {
    this._syncManager = await initializeRuntimeSyncManager({
      enabled: !!this.options.sync?.enabled,
      defaultDb: this._defaultDb,
      current: this._syncManager,
      poolManager: this._poolManager,
      sync: this.options.sync,
      logger: this.options.logger ?? null,
      onStartFailure: (error) => {
        this._logger.warn("[Sync] failed to start automatically", error);
        this.emit("error", {
          type: this.options.type,
          db: resolveDatabaseName(this.options),
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });
    return this._syncManager;
  }
  initializeSlowQueryLogManager() {
    this._slowQueryLogManager = initializeRuntimeSlowQueryLogManager({
      current: this._slowQueryLogManager,
      slowQueryLog: this.options.slowQueryLog,
      slowQueryMs: this.options.slowQueryMs,
      client: this._client,
      logger: this.options.logger ?? null
    });
    return this._slowQueryLogManager;
  }
  ensureSlowQueryLogManager() {
    return ensureRuntimeSlowQueryLogManager(this.initializeSlowQueryLogManager());
  }
  initializeSagaOrchestrator() {
    this._sagaOrchestrator = getOrCreateSagaOrchestrator(this._sagaOrchestrator, this.options.logger ?? null);
    return this._sagaOrchestrator;
  }
  requirePoolManager() {
    return requireRuntimePoolManager(this._poolManager);
  }
  createModelInstance(name, scope) {
    return createRuntimeModelInstance(this.createModelHost(), name, scope);
  }
  createAdapterBridgeHost() {
    const self = this;
    return {
      options: self.options,
      get _defaultDb() {
        return self._defaultDb;
      },
      get _client() {
        return self._client;
      },
      get _iidCache() {
        return self._iidCache;
      },
      _runtimeDefaults: self._runtimeDefaults,
      get _slowQueryLogManager() {
        return self._slowQueryLogManager;
      },
      resolveAdapterCache: () => self.resolveAdapterCache(),
      setAdapterCache: (value) => self.setAdapterCache(value),
      initializeSlowQueryLogManager: () => self.initializeSlowQueryLogManager(),
      ensureConnected: () => self.ensureConnected(),
      db: (name) => self.db(name),
      emit: (event, payload) => self.emit(event, payload)
    };
  }
  createDbFacadeHost() {
    if (!this._client) {
      throw createError(ErrorCodes.NOT_CONNECTED, "MonSQLize is not connected yet.");
    }
    return {
      options: this.options,
      _client: this._client,
      _logger: this._logger,
      _runtimeDefaults: this._runtimeDefaults,
      resolveAdapterCache: () => this.resolveAdapterCache()
    };
  }
  createModelHost() {
    return createRuntimeModelHost({
      options: this.options,
      modelInstances: this._modelInstances,
      runtime: this,
      scopedCollection: (name, options) => this.scopedCollection(name, options)
    });
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
