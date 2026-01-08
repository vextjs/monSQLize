/**
 * User Model 定义
 *
 * 演示完整的 Model 定义，包含 Schema 验证、自定义方法、Hooks
 */

module.exports = {
    name: 'users',

    schema: (dsl) => dsl({
        username: 'string:3-32!',
        email: 'email!',
        age: 'number:0-120'
    }),

    methods: (model) => ({
        static: {
            async findByUsername(username) {
                return await model.findOne({ username });
            }
        },
        instance: {
            greet() {
                return `Hello, ${this.username}!`;
            }
        }
    }),

    hooks: (model) => ({
        insert: {
            before: async (ctx, doc) => {
                doc.createdAt = new Date();
                return doc;
            }
        }
    }),

    indexes: [
        { key: { username: 1 }, unique: true },
        { key: { email: 1 }, unique: true }
    ]
};

