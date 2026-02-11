/**
 * 数据库级别操作方法工厂函数
 * 提供数据库列表和删除等方法
 * @module mongodb/management/database-ops
 */

const { createValidationError } = require('../../errors');

/**
 * 创建数据库操作方法
 * @param {Object} context - 上下文对象
 * @param {Object} context.adapter - MongoDB 适配器
 * @param {Object} context.logger - 日志记录器
 * @returns {Object} 数据库操作方法集合
 */
function createDatabaseOps(context) {
    const { adapter, logger } = context;

    return {
        /**
         * 列出所有数据库
         * @param {Object} [options] - 选项
         * @param {boolean} [options.nameOnly=false] - 仅返回数据库名称数组
         * @returns {Promise<Array<Object>|Array<string>>} 数据库列表
         * @property {string} name - 数据库名称
         * @property {number} sizeOnDisk - 磁盘占用大小（字节）
         * @property {boolean} empty - 是否为空数据库
         * @example
         * // 获取详细信息
         * const databases = await monSQLize.listDatabases();
         * console.log(databases);
         * // [
         * //   { name: 'mydb', sizeOnDisk: 83886080, empty: false },
         * //   { name: 'test', sizeOnDisk: 0, empty: true }
         * // ]
         *
         * // 仅获取名称
         * const dbNames = await monSQLize.listDatabases({ nameOnly: true });
         * console.log(dbNames); // ['mydb', 'test', 'admin']
         */
        async listDatabases(options = {}) {
            try {
                const admin = adapter.db.admin();
                const result = await admin.listDatabases();

                if (options.nameOnly) {
                    return result.databases.map(db => db.name);
                }

                return result.databases.map(db => ({
                    name: db.name,
                    sizeOnDisk: db.sizeOnDisk,
                    empty: db.empty
                }));
            } catch (error) {
                logger.error('listDatabases failed', { error: error.message });
                throw createValidationError(
                    `Failed to list databases: ${error.message}`,
                    'LIST_DATABASES_ERROR'
                );
            }
        },

        /**
         * 删除整个数据库（危险操作）
         *
         * ⚠️ 警告：此操作将永久删除数据库中的所有数据，无法恢复！
         *
         * 安全机制：
         * 1. 必须显式传入 { confirm: true } 才能执行
         * 2. 生产环境默认禁止，需要额外传入 { allowProduction: true }
         * 3. 所有删除操作都会记录审计日志
         *
         * @param {string} databaseName - 数据库名称
         * @param {Object} options - 选项
         * @param {boolean} options.confirm - 必须为 true 才能执行
         * @param {boolean} [options.allowProduction=false] - 是否允许在生产环境执行
         * @param {string} [options.user] - 操作用户（用于审计日志）
         * @returns {Promise<Object>} 删除结果
         * @property {boolean} dropped - 是否删除成功
         * @property {string} database - 被删除的数据库名称
         * @throws {ValidationError} 如果未确认或在生产环境禁止执行
         *
         * @example
         * // ❌ 错误：未提供确认
         * try {
         *   await monSQLize.dropDatabase('mydb');
         * } catch (error) {
         *   console.error(error.message);
         *   // "dropDatabase requires explicit confirmation..."
         * }
         *
         * // ✅ 正确：提供确认
         * const result = await monSQLize.dropDatabase('test_db', {
         *   confirm: true,
         *   user: 'admin@example.com'
         * });
         * console.log('Database dropped:', result.database);
         *
         * // ⚠️ 生产环境：需要额外确认
         * const result = await monSQLize.dropDatabase('prod_db', {
         *   confirm: true,
         *   allowProduction: true,
         *   user: 'admin@example.com'
         * });
         */
        async dropDatabase(databaseName, options = {}) {
            // 1. 参数验证
            if (!databaseName || typeof databaseName !== 'string') {
                throw createValidationError(
                    'Database name is required and must be a string',
                    'INVALID_DATABASE_NAME'
                );
            }

            // 2. 强制确认机制
            if (!options.confirm) {
                const error = new Error(
                    'dropDatabase requires explicit confirmation. ' +
                    'Pass { confirm: true } to proceed.\n\n' +
                    '⚠️  WARNING: This will DELETE ALL DATA in the database!\n' +
                    '⚠️  This operation CANNOT BE UNDONE!\n\n' +
                    'Example:\n' +
                    `  await db.dropDatabase('${databaseName}', { confirm: true })`
                );
                error.code = 'CONFIRMATION_REQUIRED';
                throw error;
            }

            // 3. 生产环境保护
            const isProduction = process.env.NODE_ENV === 'production';
            if (isProduction && !options.allowProduction) {
                const error = new Error(
                    'dropDatabase is blocked in production environment.\n\n' +
                    '⚠️  You are in PRODUCTION mode!\n\n' +
                    'If you really want to proceed, pass { allowProduction: true }.\n' +
                    'Make sure you have:\n' +
                    '  1. Created a backup\n' +
                    '  2. Verified this is the correct database\n' +
                    '  3. Obtained necessary approvals\n\n' +
                    'Example:\n' +
                    `  await db.dropDatabase('${databaseName}', {\n` +
                    '    confirm: true,\n' +
                    '    allowProduction: true,\n' +
                    "    user: 'your-email@example.com'\n" +
                    '  })'
                );
                error.code = 'PRODUCTION_BLOCKED';
                throw error;
            }

            // 4. 审计日志（记录所有删除尝试）
            logger.warn('dropDatabase called', {
                event: 'DROP_DATABASE',
                database: databaseName,
                user: options.user || 'unknown',
                timestamp: new Date().toISOString(),
                environment: process.env.NODE_ENV || 'development',
                confirmed: true
            });

            try {
                // 5. 执行删除 - 使用 admin 数据库执行 dropDatabase 命令
                const client = adapter.client;
                const targetDb = client.db(databaseName);
                await targetDb.dropDatabase();

                // 6. 成功日志
                logger.info('dropDatabase successful', {
                    event: 'DROP_DATABASE_SUCCESS',
                    database: databaseName,
                    user: options.user || 'unknown',
                    timestamp: new Date().toISOString()
                });

                return {
                    dropped: true,
                    database: databaseName,
                    timestamp: new Date()
                };
            } catch (error) {
                // 7. 失败日志
                logger.error('dropDatabase failed', {
                    event: 'DROP_DATABASE_FAILED',
                    database: databaseName,
                    user: options.user || 'unknown',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });

                throw createValidationError(
                    `Failed to drop database '${databaseName}': ${error.message}`,
                    'DROP_DATABASE_ERROR'
                );
            }
        }
    };
}

module.exports = { createDatabaseOps };


