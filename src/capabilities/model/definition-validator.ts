/**
 * definition-validator.ts
 *
 * Model 定义与关联关系的校验函数。
 *
 * 设计说明：
 * - 所有函数均为纯函数（或仅抛异常），无 I/O、无副作用。
 * - validateDefinition / validateRelationConfig 在 Model.define() 阶段调用。
 * - validateCollectionName 在 ModelInstance 构造器与集合操作入口处调用。
 * - processTimestamps 解析 options.timestamps，写入 _internalHooks。
 * - normalizePopulateConfig 统一化 populate 路径格式。
 */

import { ErrorCodes, createError } from '../../core/errors';
import type { ModelDefinition, RelationConfig, PopulateConfig } from '../../../types/model';
import type { PopulatePath } from './populate-promise';

/**
 * 校验并规范化集合名称。
 * 名称不能为空，且不能包含 `$`、`.`、空白字符或空字节。
 * 符合条件时返回原始名称，否则抛出 INVALID_COLLECTION_NAME 错误。
 */
export function validateCollectionName(collectionName: string): string {
    if (!collectionName || typeof collectionName !== 'string' || collectionName.trim() === '') {
        throw createError(ErrorCodes.INVALID_COLLECTION_NAME, 'Collection name must be a non-empty string.');
    }
    if (/[$.\s\x00]/.test(collectionName)) {
        throw createError(ErrorCodes.INVALID_COLLECTION_NAME, 'Invalid collection name: contains special characters ($, ., space, or null character).');
    }
    return collectionName;
}

/**
 * 解析 options.timestamps 并写入 definition._internalHooks.timestamps。
 *
 * 渐进规则（与 v1 保持一致）：
 *  - true              → { createdAt: 'createdAt', updatedAt: 'updatedAt' }
 *  - false / undefined → _internalHooks.timestamps = undefined
 *  - { createdAt }     → 指定 createdAt 时，updatedAt 默认为 'updatedAt'（非对称）
 *  - { updatedAt }     → 仅指定 updatedAt；createdAt 不提供默认值
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function processTimestamps<TDocument>(definition: ModelDefinition<TDocument>): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tsOpt = (definition as any).options?.timestamps as
        | boolean
        | { createdAt?: string | boolean; updatedAt?: string | boolean }
        | undefined;

    // v1-compat: null 与 false 等效（不添加时间戳）
    if (tsOpt === null) return;
    // 校验类型（与 v1 行为一致）
    if (tsOpt !== undefined && typeof tsOpt !== 'boolean' && typeof tsOpt !== 'object') {
        throw createError(ErrorCodes.INVALID_MODEL_DEFINITION, 'options.timestamps must be boolean or object.');
    }

    if (!tsOpt && tsOpt !== false) {
        return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const defAny = definition as any;
    if (!defAny._internalHooks) defAny._internalHooks = {};

    if (tsOpt === false) {
        defAny._internalHooks.timestamps = undefined;
        return;
    }
    if (tsOpt === true) {
        defAny._internalHooks.timestamps = { createdAt: 'createdAt', updatedAt: 'updatedAt' };
        return;
    }

    const result: { createdAt?: string; updatedAt?: string } = {};
    let createdAtAdded = false;

    const ca = tsOpt.createdAt;
    if (ca === false) {
        // omit
    } else if (ca === true) {
        result.createdAt = 'createdAt';
        createdAtAdded = true;
    } else if (typeof ca === 'string') {
        result.createdAt = ca;
        createdAtAdded = true;
    }

    const ua = tsOpt.updatedAt;
    if (ua === false) {
        // omit
    } else if (ua === true) {
        result.updatedAt = 'updatedAt';
    } else if (typeof ua === 'string') {
        result.updatedAt = ua;
    } else if (ua === undefined && createdAtAdded) {
        // 非对称规则：指定 createdAt 时，updatedAt 默认为 'updatedAt'
        result.updatedAt = 'updatedAt';
    }

    defAny._internalHooks.timestamps = Object.keys(result).length ? result : undefined;
}

/**
 * 校验 ModelDefinition 对象的完整性：
 * - definition 必须是非空对象
 * - schema 字段必须存在，且为函数或对象
 * - connection.pool / connection.database（若提供）必须是非空字符串
 * - 每条 relations 配置调用 validateRelationConfig
 */
export function validateDefinition<TDocument>(definition: ModelDefinition<TDocument> | undefined): void {
    if (!definition || typeof definition !== 'object') {
        throw createError(ErrorCodes.INVALID_MODEL_DEFINITION, 'Model definition must be an object.');
    }
    if (definition.schema === undefined || definition.schema === null) {
        throw createError(ErrorCodes.MISSING_SCHEMA, 'Model definition must include a schema property.');
    }
    if (typeof definition.schema !== 'function' && (typeof definition.schema !== 'object' || definition.schema === null)) {
        throw createError(ErrorCodes.INVALID_SCHEMA_TYPE, 'Schema must be a function or object.');
    }
    if (definition.connection) {
        if (definition.connection.pool !== undefined && (typeof definition.connection.pool !== 'string' || definition.connection.pool.trim() === '')) {
            throw createError(ErrorCodes.INVALID_MODEL_DEFINITION, 'connection.pool must be a non-empty string.');
        }
        if (definition.connection.database !== undefined && (typeof definition.connection.database !== 'string' || definition.connection.database.trim() === '')) {
            throw createError(ErrorCodes.INVALID_MODEL_DEFINITION, 'connection.database must be a non-empty string.');
        }
    }
    for (const [name, config] of Object.entries(definition.relations ?? {})) {
        validateRelationConfig(name, config);
    }
}

/**
 * 校验单条 RelationConfig 配置：
 * - from / localField / foreignField 必须为非空字符串
 * - single（若提供）必须为布尔值
 */
export function validateRelationConfig(name: string, config: RelationConfig): void {
    if (!name || typeof name !== 'string') {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'Relation name must be a non-empty string.');
    }
    if (!config || typeof config !== 'object') {
        throw createError(ErrorCodes.INVALID_ARGUMENT, `Relation '${name}' must be an object.`);
    }
    for (const field of ['from', 'localField', 'foreignField'] as const) {
        const value = config[field];
        if (value === undefined || value === null) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, `relations 配置缺少必需字段: ${field}`);
        }
        if (typeof value !== 'string' || (value as string).trim() === '') {
            throw createError(ErrorCodes.INVALID_ARGUMENT, `relations.${field} 必须是字符串`);
        }
    }
    if (config.single !== undefined && typeof config.single !== 'boolean') {
        throw createError(ErrorCodes.INVALID_ARGUMENT, `relations.single 必须是布尔值`);
    }
}

/**
 * 将 populate 路径规范化为 PopulateConfig 对象。
 * 字符串路径直接包装为 { path: ... }；PopulateConfig 对象原样返回。
 */
export function normalizePopulateConfig(path: PopulatePath): PopulateConfig {
    return typeof path === 'string' ? { path } : path;
}
