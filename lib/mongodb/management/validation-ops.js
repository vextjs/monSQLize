/**
 * 集合验证相关操作方法工厂函数
 * 提供 Schema 验证规则管理
 * @module mongodb/management/validation-ops
 */

const { createValidationError } = require('../../errors');

/**
 * 创建验证操作方法
 * @param {Object} context - 上下文对象
 * @param {Object} context.db - MongoDB 数据库实例
 * @param {Object} context.collection - MongoDB 集合实例
 * @param {Object} context.logger - 日志记录器
 * @returns {Object} 验证操作方法集合
 */
function createValidationOps(context) {
    const { db, collection, logger } = context;

    return {
        /**
         * 设置集合的验证规则
         * @param {Object} validator - 验证规则（JSON Schema 或查询表达式）
         * @param {Object} [options] - 选项
         * @param {string} [options.validationLevel] - 验证级别
         * @param {string} [options.validationAction] - 验证失败时的行为
         * @returns {Promise<Object>} 设置结果
         *
         * @example
         * // 使用 JSON Schema 验证
         * await collection.setValidator({
         *   $jsonSchema: {
         *     bsonType: 'object',
         *     required: ['name', 'email'],
         *     properties: {
         *       name: {
         *         bsonType: 'string',
         *         description: 'must be a string and is required'
         *       },
         *       email: {
         *         bsonType: 'string',
         *         pattern: '^.+@.+$',
         *         description: 'must be a valid email'
         *       },
         *       age: {
         *         bsonType: 'int',
         *         minimum: 0,
         *         maximum: 120,
         *         description: 'must be an integer between 0 and 120'
         *       }
         *     }
         *   }
         * });
         *
         * // 使用查询表达式验证
         * await collection.setValidator({
         *   $and: [
         *     { name: { $type: 'string' } },
         *     { email: { $regex: /@/ } }
         *   ]
         * });
         *
         * // 同时设置验证级别和行为
         * await collection.setValidator({
         *   $jsonSchema: { /* ... * / }
         * }, {
         *   validationLevel: 'moderate',
         *   validationAction: 'warn'
         * });
         */
        async setValidator(validator, options = {}) {
            try {
                if (!validator || typeof validator !== 'object') {
                    throw createValidationError(
                        'Validator must be an object',
                        'INVALID_VALIDATOR'
                    );
                }

                const command = {
                    collMod: collection.collectionName,
                    validator
                };

                if (options.validationLevel) {
                    command.validationLevel = options.validationLevel;
                }

                if (options.validationAction) {
                    command.validationAction = options.validationAction;
                }

                const result = await db.command(command);

                logger.info('Validator set', {
                    collection: collection.collectionName,
                    validationLevel: options.validationLevel,
                    validationAction: options.validationAction
                });

                return {
                    ok: result.ok,
                    collection: collection.collectionName,
                    validator: 'set'
                };
            } catch (error) {
                logger.error('setValidator failed', { error: error.message });
                throw createValidationError(
                    `Failed to set validator: ${error.message}`,
                    'SET_VALIDATOR_ERROR'
                );
            }
        },

        /**
         * 设置验证级别
         *
         * 验证级别：
         * - 'off': 禁用验证
         * - 'strict': 对所有插入和更新进行验证（默认）
         * - 'moderate': 只验证有效文档的更新，不验证现有无效文档
         *
         * @param {string} level - 验证级别（'off'/'strict'/'moderate'）
         * @returns {Promise<Object>} 设置结果
         *
         * @example
         * // 严格验证（所有文档）
         * await collection.setValidationLevel('strict');
         *
         * // 适度验证（只验证有效文档）
         * await collection.setValidationLevel('moderate');
         *
         * // 禁用验证
         * await collection.setValidationLevel('off');
         */
        async setValidationLevel(level) {
            try {
                const validLevels = ['off', 'strict', 'moderate'];
                if (!validLevels.includes(level)) {
                    throw createValidationError(
                        `Invalid validation level. Must be one of: ${validLevels.join(', ')}`,
                        'INVALID_VALIDATION_LEVEL'
                    );
                }

                const result = await db.command({
                    collMod: collection.collectionName,
                    validationLevel: level
                });

                logger.info('Validation level set', {
                    collection: collection.collectionName,
                    level
                });

                return {
                    ok: result.ok,
                    collection: collection.collectionName,
                    validationLevel: level
                };
            } catch (error) {
                logger.error('setValidationLevel failed', { error: error.message });
                throw createValidationError(
                    `Failed to set validation level: ${error.message}`,
                    'SET_VALIDATION_LEVEL_ERROR'
                );
            }
        },

        /**
         * 设置验证失败时的行为
         *
         * 验证行为：
         * - 'error': 拒绝不符合规则的文档（默认）
         * - 'warn': 允许写入但记录警告
         *
         * @param {string} action - 验证行为（'error'/'warn'）
         * @returns {Promise<Object>} 设置结果
         *
         * @example
         * // 拒绝无效文档
         * await collection.setValidationAction('error');
         *
         * // 允许但警告
         * await collection.setValidationAction('warn');
         */
        async setValidationAction(action) {
            try {
                const validActions = ['error', 'warn'];
                if (!validActions.includes(action)) {
                    throw createValidationError(
                        `Invalid validation action. Must be one of: ${validActions.join(', ')}`,
                        'INVALID_VALIDATION_ACTION'
                    );
                }

                const result = await db.command({
                    collMod: collection.collectionName,
                    validationAction: action
                });

                logger.info('Validation action set', {
                    collection: collection.collectionName,
                    action
                });

                return {
                    ok: result.ok,
                    collection: collection.collectionName,
                    validationAction: action
                };
            } catch (error) {
                logger.error('setValidationAction failed', { error: error.message });
                throw createValidationError(
                    `Failed to set validation action: ${error.message}`,
                    'SET_VALIDATION_ACTION_ERROR'
                );
            }
        },

        /**
         * 获取集合的验证规则
         * @returns {Promise<Object>} 验证规则信息
         * @property {Object} validator - 验证规则
         * @property {string} validationLevel - 验证级别
         * @property {string} validationAction - 验证行为
         *
         * @example
         * const validation = await collection.getValidator();
         * console.log('Validator:', validation.validator);
         * console.log('Level:', validation.validationLevel);
         * console.log('Action:', validation.validationAction);
         */
        async getValidator() {
            try {
                const collections = await db.listCollections({
                    name: collection.collectionName
                }).toArray();

                if (collections.length === 0) {
                    throw createValidationError(
                        `Collection '${collection.collectionName}' not found`,
                        'COLLECTION_NOT_FOUND'
                    );
                }

                const collInfo = collections[0];
                const options = collInfo.options || {};

                return {
                    validator: options.validator || null,
                    validationLevel: options.validationLevel || 'strict',
                    validationAction: options.validationAction || 'error'
                };
            } catch (error) {
                logger.error('getValidator failed', { error: error.message });
                throw createValidationError(
                    `Failed to get validator: ${error.message}`,
                    'GET_VALIDATOR_ERROR'
                );
            }
        }
    };
}

module.exports = { createValidationOps };

