/**
 * PoolConfig - 连接池配置验证器
 *
 * 验证连接池配置的有效性
 *
 * @module lib/infrastructure/PoolConfig
 * @since v1.0.8
 */

/**
 * 验证连接池配置
 *
 * @param {Object} config - 连接池配置
 * @throws {Error} 如果配置无效
 */
function validatePoolConfig(config) {
    if (!config || typeof config !== 'object') {
        throw new Error('Pool config must be an object');
    }

    // 必需字段
    if (!config.name || typeof config.name !== 'string') {
        throw new Error('Pool config.name is required and must be a string');
    }

    if (!config.uri || typeof config.uri !== 'string') {
        throw new Error('Pool config.uri is required and must be a string');
    }

    // 验证 URI 格式
    if (!config.uri.startsWith('mongodb://') && !config.uri.startsWith('mongodb+srv://')) {
        throw new Error('Pool config.uri must start with mongodb:// or mongodb+srv://');
    }

    // 验证 role
    if (config.role) {
        const validRoles = ['primary', 'secondary', 'analytics', 'custom'];
        if (!validRoles.includes(config.role)) {
            throw new Error(`Pool config.role must be one of: ${validRoles.join(', ')}`);
        }
    }

    // 验证 weight
    if (config.weight !== undefined) {
        if (typeof config.weight !== 'number' || config.weight < 0) {
            throw new Error('Pool config.weight must be a non-negative number');
        }
    }

    // 验证 options
    if (config.options) {
        if (typeof config.options !== 'object') {
            throw new Error('Pool config.options must be an object');
        }

        // 验证数值选项
        const numericOptions = [
            'maxPoolSize',
            'minPoolSize',
            'maxIdleTimeMS',
            'waitQueueTimeoutMS',
            'connectTimeoutMS',
            'serverSelectionTimeoutMS'
        ];

        for (const key of numericOptions) {
            if (config.options[key] !== undefined) {
                if (typeof config.options[key] !== 'number' || config.options[key] < 0) {
                    throw new Error(`Pool config.options.${key} must be a non-negative number`);
                }
            }
        }
    }

    // 验证 healthCheck
    if (config.healthCheck) {
        if (typeof config.healthCheck !== 'object') {
            throw new Error('Pool config.healthCheck must be an object');
        }

        if (config.healthCheck.enabled !== undefined && typeof config.healthCheck.enabled !== 'boolean') {
            throw new Error('Pool config.healthCheck.enabled must be a boolean');
        }

        const numericHealthOptions = ['interval', 'timeout', 'retries'];
        for (const key of numericHealthOptions) {
            if (config.healthCheck[key] !== undefined) {
                if (typeof config.healthCheck[key] !== 'number' || config.healthCheck[key] < 0) {
                    throw new Error(`Pool config.healthCheck.${key} must be a non-negative number`);
                }
            }
        }
    }

    // 验证 tags
    if (config.tags) {
        if (!Array.isArray(config.tags)) {
            throw new Error('Pool config.tags must be an array');
        }

        for (const tag of config.tags) {
            if (typeof tag !== 'string') {
                throw new Error('Pool config.tags must be an array of strings');
            }
        }
    }
}

/**
 * 验证连接池配置（返回错误数组）
 *
 * @param {Object} config - 连接池配置
 * @returns {Array<string>} 错误消息数组，空数组表示验证通过
 */
function validate(config) {
    const errors = [];

    if (!config || typeof config !== 'object') {
        errors.push('Pool config must be an object');
        return errors;
    }

    // 必需字段
    if (!config.name || typeof config.name !== 'string') {
        errors.push('Pool config.name is required and must be a string');
    }

    if (!config.uri || typeof config.uri !== 'string') {
        errors.push('Pool config.uri is required and must be a string');
    } else {
        // 验证 URI 格式
        if (!config.uri.startsWith('mongodb://') && !config.uri.startsWith('mongodb+srv://')) {
            errors.push('Pool config.uri must start with mongodb:// or mongodb+srv://');
        }
    }

    // 验证 role
    if (config.role) {
        const validRoles = ['primary', 'secondary', 'analytics', 'custom'];
        if (!validRoles.includes(config.role)) {
            errors.push(`Pool config.role must be one of: ${validRoles.join(', ')}`);
        }
    }

    // 验证 weight
    if (config.weight !== undefined) {
        if (typeof config.weight !== 'number' || config.weight < 0) {
            errors.push('Pool config.weight must be a non-negative number');
        }
    }

    // 验证 options
    if (config.options && typeof config.options !== 'object') {
        errors.push('Pool config.options must be an object');
    }

    // 验证 healthCheck
    if (config.healthCheck) {
        if (typeof config.healthCheck !== 'object') {
            errors.push('Pool config.healthCheck must be an object');
        } else {
            if (config.healthCheck.enabled !== undefined && typeof config.healthCheck.enabled !== 'boolean') {
                errors.push('Pool config.healthCheck.enabled must be a boolean');
            }

            const numericHealthOptions = ['interval', 'timeout', 'retries'];
            for (const key of numericHealthOptions) {
                if (config.healthCheck[key] !== undefined) {
                    if (typeof config.healthCheck[key] !== 'number' || config.healthCheck[key] < 0) {
                        errors.push(`Pool config.healthCheck.${key} must be a non-negative number`);
                    }
                }
            }
        }
    }

    // 验证 tags
    if (config.tags) {
        if (!Array.isArray(config.tags)) {
            errors.push('Pool config.tags must be an array');
        } else {
            for (const tag of config.tags) {
                if (typeof tag !== 'string') {
                    errors.push('Pool config.tags must be an array of strings');
                    break;
                }
            }
        }
    }

    return errors;
}

module.exports = {
    validatePoolConfig,
    validate
};

