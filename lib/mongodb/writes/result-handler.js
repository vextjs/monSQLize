/**
 * findOneAnd* 操作返回值处理工具
 * 统一处理 MongoDB 驱动返回值的各种边界情况
 *
 * **重要说明 - MongoDB 驱动版本兼容性**
 *
 * 本模块专门处理 MongoDB Node.js 驱动在不同版本间的 API 差异：
 *
 * - **MongoDB 驱动 6.x** (当前支持):
 *   - `findOneAnd*` 方法默认直接返回文档对象
 *   - 需要显式传递 `includeResultMetadata: true` 才返回完整元数据
 *
 * - **MongoDB 驱动 5.x 及更早版本**:
 *   - `findOneAnd*` 方法默认返回 `{ value, ok, lastErrorObject }` 格式
 *
 * **兼容性保证**:
 * - 本模块会自动检测和处理驱动返回值格式的差异
 * - monSQLize 的公共 API 行为保持一致，用户无需关心驱动版本
 * - 如果未来驱动版本再次变更，仅需修改本模块即可
 *
 * **维护建议**:
 * - 升级 MongoDB 驱动前，务必运行完整测试套件
 * - 关注 MongoDB 驱动的 CHANGELOG，特别是 `findOneAnd*` 方法的变更
 * - 如有疑问，参考技术分析报告：`analysis-reports/2025-11-17-mongodb-driver-6x-compatibility-FINAL.md`
 *
 * @module result-handler
 * @since 2025-11-17
 */

// MongoDB 驱动版本检测（用于诊断和警告）
let _driverVersionChecked = false;
let _detectedDriverMajorVersion = null;

/**
 * 检测 MongoDB 驱动版本（仅在第一次调用时执行）
 * @private
 * @returns {number|null} 驱动主版本号，如果无法检测则返回 null
 */
function detectDriverVersion() {
    if (_driverVersionChecked) {
        return _detectedDriverMajorVersion;
    }

    _driverVersionChecked = true;

    try {
        const mongodb = require("mongodb");
        const versionString = mongodb.version || require("mongodb/package.json").version;
        const match = versionString.match(/^(\d+)\./);
        if (match) {
            _detectedDriverMajorVersion = parseInt(match[1], 10);
            return _detectedDriverMajorVersion;
        }
    } catch (error) {
        // 无法检测版本，静默失败
    }

    return null;
}

/**
 * 记录驱动版本警告（仅在检测到不支持的版本时）
 * @private
 * @param {Object} logger - 日志实例
 */
function warnUnsupportedDriverVersion(logger) {
    const version = detectDriverVersion();

    if (version === null) {
        // 无法检测版本，不输出警告（避免误报）
        return;
    }

    if (version < 6) {
        // 驱动版本小于 6.x，可能不兼容
        if (logger && logger.warn) {
            logger.warn("[result-handler] ⚠️ 检测到 MongoDB 驱动版本过旧", {
                detectedVersion: version,
                supportedVersion: "6.x",
                message: "monSQLize 专为 MongoDB 驱动 6.x 设计，旧版本可能存在兼容性问题",
                recommendation: "建议升级到 MongoDB Node.js 驱动 ^6.0.0"
            });
        }
    } else if (version > 6) {
        // 驱动版本大于 6.x，未经测试
        if (logger && logger.warn) {
            logger.warn("[result-handler] ⚠️ 检测到 MongoDB 驱动版本未经测试", {
                detectedVersion: version,
                testedVersion: "6.x",
                message: "monSQLize 已针对 MongoDB 驱动 6.x 测试，新版本可能存在未知问题",
                recommendation: "如遇问题，请查看技术分析报告或回退到驱动 6.x"
            });
        }
    }
    // 版本 === 6，无需警告
}

/**
 * 处理 findOneAnd* 操作的返回值
 * 统一处理各种边界情况，确保返回值格式的一致性
 *
 * @param {Object|null} result - MongoDB 驱动返回的结果
 * @param {Object} options - 操作选项
 * @param {boolean} [options.includeResultMetadata=false] - 是否返回完整元数据
 * @param {Object} [logger] - 日志实例（可选，用于诊断）
 * @returns {Object|null} 处理后的结果
 *
 * @example
 * // 正常情况（找到文档）
 * const result = { value: { name: "Alice" }, ok: 1, lastErrorObject: { n: 1, updatedExisting: true } };
 * handleFindOneAndResult(result, {});  // 返回: { name: "Alice" }
 *
 * @example
 * // 未找到文档
 * const result = { value: null, ok: 1, lastErrorObject: { n: 0 } };
 * handleFindOneAndResult(result, {});  // 返回: null
 *
 * @example
 * // result 为 null（驱动异常情况）
 * handleFindOneAndResult(null, {});  // 返回: null
 *
 * @example
 * // 返回完整元数据
 * handleFindOneAndResult(null, { includeResultMetadata: true });
 * // 返回: { value: null, ok: 1, lastErrorObject: { n: 0 } }
 */
function handleFindOneAndResult(result, options = {}, logger = null) {
    // 首次调用时检测驱动版本并输出警告（如果需要）
    if (!_driverVersionChecked && logger) {
        warnUnsupportedDriverVersion(logger);
    }

    // 情况 1：result 为 null 或 undefined（驱动在某些边界情况下可能返回 null）
    if (!result || result === null) {
        if (logger && logger.debug) {
            logger.debug("[result-handler] Result is null/undefined, returning empty result", {
                includeMetadata: options.includeResultMetadata
            });
        }

        if (options.includeResultMetadata) {
            // 返回标准的空结果元数据
            return {
                value: null,
                ok: 1,
                lastErrorObject: { n: 0 }
            };
        } else {
            // 仅返回 null
            return null;
        }
    }

    // 情况 2：result 是对象但缺少 lastErrorObject（驱动版本差异或异常情况）
    if (typeof result === "object" && !result.lastErrorObject) {
        if (logger && logger.warn) {
            logger.warn("[result-handler] ⚠️ Result missing lastErrorObject, possible driver version issue", {
                hasValue: result.value !== undefined,
                hasOk: result.ok !== undefined,
                resultKeys: Object.keys(result),
                driverVersion: detectDriverVersion(),
                recommendation: "这可能表明 MongoDB 驱动返回了非预期的格式，请检查驱动版本"
            });
        }

        const hasValue = result.value !== null && result.value !== undefined;
        // 补充缺失的 lastErrorObject
        result.lastErrorObject = {
            n: hasValue ? 1 : 0
        };
        // 如果有值，假设是更新/替换操作成功
        if (hasValue) {
            result.lastErrorObject.updatedExisting = true;
        }
    }

    // 情况 3：result 是对象且包含 lastErrorObject（正常情况）
    if (options.includeResultMetadata) {
        // 返回完整元数据：{ value, ok, lastErrorObject }
        return result;
    } else {
        // 仅返回文档（可能为 null）
        return result.value !== undefined ? result.value : null;
    }
}

/**
 * 判断操作是否修改了文档（用于缓存失效逻辑）
 * 安全地检查 MongoDB 操作是否成功修改了文档
 *
 * @param {Object|null} result - MongoDB 驱动返回的结果
 * @returns {boolean} 是否修改/删除了文档
 *
 * @example
 * // 更新成功
 * const result = { value: {...}, lastErrorObject: { updatedExisting: true } };
 * wasDocumentModified(result);  // 返回: true
 *
 * @example
 * // Upsert 插入
 * const result = { value: {...}, lastErrorObject: { upserted: ObjectId(...) } };
 * wasDocumentModified(result);  // 返回: true
 *
 * @example
 * // 未找到文档
 * const result = { value: null, lastErrorObject: { n: 0 } };
 * wasDocumentModified(result);  // 返回: false
 *
 * @example
 * // 删除成功（有返回值）
 * const result = { value: {...}, lastErrorObject: { n: 1 } };
 * wasDocumentModified(result);  // 返回: true
 */
function wasDocumentModified(result) {
    // 安全检查：result 或 lastErrorObject 不存在
    if (!result || !result.lastErrorObject) {
        return false;
    }

    // 检查修改标志
    return !!(
        // 更新/替换操作：文档已存在并被修改
        result.lastErrorObject.updatedExisting ||
        // Upsert 操作：插入了新文档
        result.lastErrorObject.upserted ||
        // 删除操作：有文档被删除（通过 n > 0 或 value 不为 null 判断）
        (result.lastErrorObject.n > 0) ||
        (result.value !== null && result.value !== undefined)
    );
}

module.exports = {
    handleFindOneAndResult,
    wasDocumentModified
};

