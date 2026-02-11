/**
 * Model 乐观锁版本控制功能
 *
 * 功能：
 * 1. 插入时自动初始化 version: 0
 * 2. 更新时自动递增版本号
 * 3. 支持并发冲突检测
 * 4. 支持自定义字段名
 *
 * 使用示例：
 * ```javascript
 * Model.define('users', {
 *     options: {
 *         version: true  // 或 { enabled: true, field: '__v' }
 *     }
 * });
 *
 * // 插入时自动初始化
 * await User.insertOne({ username: 'john' });
 * // { _id, username: 'john', version: 0 }
 *
 * // 更新时自动递增
 * await User.updateOne({ _id, version: 0 }, { $set: { status: 'active' } });
 * // 实际执行：{ $set: { status: 'active' }, $inc: { version: 1 } }
 *
 * // 并发冲突检测
 * const result = await User.updateOne({ _id, version: 0 }, { $set: { status: 'inactive' } });
 * // result.modifiedCount === 0（版本号不匹配，更新失败）
 * ```
 *
 * @module lib/model/features/version
 */

/**
 * 解析版本控制配置
 *
 * @param {boolean|object} versionConfig - 版本控制配置
 * @returns {object|null} 解析后的配置对象
 */
function parseVersionConfig(versionConfig) {
    if (!versionConfig) {
        return null;
    }

    // 简单模式：version: true
    if (versionConfig === true) {
        return {
            enabled: true,
            field: 'version'
        };
    }

    // 完整配置模式
    if (typeof versionConfig === 'object') {
        return {
            enabled: versionConfig.enabled !== false,
            field: versionConfig.field || 'version'
        };
    }

    return null;
}

/**
 * 为 Model 实例设置版本控制功能
 *
 * @param {object} modelInstance - Model 实例
 * @param {boolean|object} versionConfig - 版本控制配置
 */
function setupVersion(modelInstance, versionConfig) {
    // 解析配置
    const config = parseVersionConfig(versionConfig);

    if (!config || !config.enabled) {
        return;  // 未启用，直接返回
    }

    const { field } = config;

    // 保存配置到 Model 实例（供测试验证）
    modelInstance._versionConfig = config;

    // ========== 功能1: 插入时初始化版本号 ==========

    // 保存原始方法
    const originalInsertOne = modelInstance.collection.insertOne.bind(modelInstance.collection);
    const originalInsertMany = modelInstance.collection.insertMany.bind(modelInstance.collection);

    // 覆盖 insertOne
    modelInstance.collection.insertOne = async function(doc, options) {
        // 只在用户未手动设置时添加版本号
        if (doc && typeof doc === 'object' && doc[field] === undefined) {
            doc[field] = 0;
        }
        return await originalInsertOne(doc, options);
    };

    // 覆盖 insertMany
    modelInstance.collection.insertMany = async function(docs, options) {
        if (Array.isArray(docs)) {
            docs.forEach(doc => {
                if (doc && typeof doc === 'object' && doc[field] === undefined) {
                    doc[field] = 0;
                }
            });
        }
        return await originalInsertMany(docs, options);
    };

    // ========== 功能2: 更新时自动递增版本号 ==========

    // 保存原始方法
    const originalUpdateOne = modelInstance.collection.updateOne.bind(modelInstance.collection);
    const originalUpdateMany = modelInstance.collection.updateMany.bind(modelInstance.collection);

    // 覆盖 updateOne
    modelInstance.collection.updateOne = async function(filter, update, options) {
        // 检查 update 是否为空
        if (update && typeof update === 'object') {
            // 检查用户是否已手动设置 $inc.version
            if (!update.$inc || update.$inc[field] === undefined) {
                // 自动添加 $inc
                if (!update.$inc) {
                    update.$inc = {};
                }
                update.$inc[field] = 1;
            }
        }
        return await originalUpdateOne(filter, update, options);
    };

    // 覆盖 updateMany
    modelInstance.collection.updateMany = async function(filter, update, options) {
        // 检查 update 是否为空
        if (update && typeof update === 'object') {
            // 检查用户是否已手动设置 $inc.version
            if (!update.$inc || update.$inc[field] === undefined) {
                // 自动添加 $inc
                if (!update.$inc) {
                    update.$inc = {};
                }
                update.$inc[field] = 1;
            }
        }
        return await originalUpdateMany(filter, update, options);
    };

    // 注意：并发冲突检测通过 filter 中的版本号自然实现
    // 用户提供 { _id, version: 0 } 时，如果版本号不匹配，matchedCount 为 0
}

module.exports = {
    setupVersion,
    parseVersionConfig  // 导出供测试使用
};


