/**
 * Role Model 定义（在子目录中）
 *
 * 演示递归扫描功能
 */

module.exports = {
    name: 'roles',

    schema: (dsl) => dsl({
        name: 'string:1-50!',
        permissions: 'array',
        description: 'string?'
    }),

    indexes: [
        { key: { name: 1 }, unique: true }
    ]
};

