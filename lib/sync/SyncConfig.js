/**
 * SyncConfig - 同步配置验证
 *
 * 负责验证和规范化 Change Stream 同步配置
 *
 * @module lib/sync/SyncConfig
 * @since v1.0.8
 */

/**
 * 验证同步配置
 *
 * @param {Object} config - 同步配置
 * @param {boolean} config.enabled - 是否启用同步
 * @param {Array} config.targets - 备份目标数组
 * @param {Object} [config.resumeToken] - Resume Token 配置
 * @param {Function} [config.filter] - 过滤函数
 * @param {Function} [config.transform] - 转换函数
 * @throws {Error} 配置无效时抛出错误
 */
function validateSyncConfig(config) {
    if (!config || typeof config !== 'object') {
        throw new Error('[Sync] 配置必须是对象');
    }

    // 验证 enabled
    if (typeof config.enabled !== 'boolean') {
        throw new Error('[Sync] enabled 必须是 boolean 类型');
    }

    // 如果未启用，不需要验证其他配置
    if (!config.enabled) {
        return;
    }

    // 验证 targets
    if (!Array.isArray(config.targets) || config.targets.length === 0) {
        throw new Error('[Sync] targets 必须是非空数组');
    }

    // 验证每个 target
    config.targets.forEach((target, index) => {
        validateTargetConfig(target, index);
    });

    // 验证 resumeToken（可选）
    if (config.resumeToken) {
        validateResumeTokenConfig(config.resumeToken);
    }

    // 验证 filter（可选）
    if (config.filter && typeof config.filter !== 'function') {
        throw new Error('[Sync] filter 必须是函数');
    }

    // 验证 transform（可选）
    if (config.transform && typeof config.transform !== 'function') {
        throw new Error('[Sync] transform 必须是函数');
    }
}

/**
 * 验证备份目标配置
 *
 * @param {Object} target - 目标配置
 * @param {number} index - 索引（用于错误提示）
 */
function validateTargetConfig(target, index) {
    if (!target || typeof target !== 'object') {
        throw new Error(`[Sync] targets[${index}] 必须是对象`);
    }

    // 验证 name
    if (!target.name || typeof target.name !== 'string') {
        throw new Error(`[Sync] targets[${index}].name 必须是非空字符串`);
    }

    // 验证 uri
    if (!target.uri || typeof target.uri !== 'string') {
        throw new Error(`[Sync] targets[${index}].uri 必须是非空字符串`);
    }

    // 验证 collections（可选）
    if (target.collections) {
        if (!Array.isArray(target.collections)) {
            throw new Error(`[Sync] targets[${index}].collections 必须是数组`);
        }
        if (target.collections.length === 0) {
            throw new Error(`[Sync] targets[${index}].collections 不能为空数组`);
        }
    }
}

/**
 * 验证 Resume Token 配置
 *
 * @param {Object} config - Resume Token 配置
 */
function validateResumeTokenConfig(config) {
    if (!config || typeof config !== 'object') {
        throw new Error('[Sync] resumeToken 必须是对象');
    }

    // 验证 storage
    const validStorages = ['file', 'redis'];
    if (config.storage && !validStorages.includes(config.storage)) {
        throw new Error(`[Sync] resumeToken.storage 必须是 ${validStorages.join(' 或 ')}`);
    }

    // 验证 path（文件模式）
    if (config.storage === 'file' && config.path && typeof config.path !== 'string') {
        throw new Error('[Sync] resumeToken.path 必须是字符串');
    }

    // 验证 redis（Redis 模式）
    if (config.storage === 'redis' && config.redis && typeof config.redis !== 'object') {
        throw new Error('[Sync] resumeToken.redis 必须是对象');
    }
}

module.exports = {
    validateSyncConfig,
    validateTargetConfig,
    validateResumeTokenConfig
};


