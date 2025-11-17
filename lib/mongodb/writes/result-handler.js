/**
 * findOneAnd* 操作返回值处理工具
 * 统一处理 MongoDB 驱动返回值的各种边界情况
 */

/**
 * 处理 findOneAnd* 操作的返回值
 * 统一处理各种边界情况，确保返回值格式的一致性
 *
 * @param {Object|null} result - MongoDB 驱动返回的结果
 * @param {Object} options - 操作选项
 * @param {boolean} [options.includeResultMetadata=false] - 是否返回完整元数据
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
function handleFindOneAndResult(result, options = {}) {
    // 情况 1：result 为 null 或 undefined（驱动在某些边界情况下可能返回 null）
    if (!result || result === null) {
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

