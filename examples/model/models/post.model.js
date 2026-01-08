/**
 * Post Model 定义
 */

module.exports = {
    name: 'posts',

    schema: (dsl) => dsl({
        title: 'string:1-200!',
        content: 'string!',
        userId: 'string!',
        published: 'boolean'
    }),

    indexes: [
        { key: { userId: 1 } },
        { key: { createdAt: -1 } }
    ]
};

