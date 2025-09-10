

module.exports = {

    // 定义model
    schema:(sc)=>{
        return {
            username: sc.string().min(3).max(30).required(),
            password: sc.string().pattern(/^[a-zA-Z0-9]{6,30}$/).required(),
            age: sc.number().integer().min(0).default(18),   // 默认值
            role: sc.string().valid('admin', 'user').default('user'),
        }
    },

    // 自定义方法
    methods: (model)=>{
        return {
            // 实例方法
            instance: {
                checkPassword(password) {
                    return this.password === password;
                },
                async getPosts() {
                    // return await model.find({ userId: this._id });
                }
            },
            // 静态方法
            static: {
                findByName(name) {
                    return this.find({ username: name });
                }
            }
        }
    },

    // 支持操作前、后处理
    hooks:(model)=>{
        return {
            find: {
                before:(ctx,options)=>{},
                after:(ctx,docs,result)=>{},
            },
            insert:{
                before:async (ctx,docs)=>{
                    // ctx.session = await model.startTransaction(); // ctx 里传递事务对象
                    // return ctx.data;
                },
                after:async (ctx,docs,result)=>{
                    // await ctx.session.commitTransaction();
                },
            },
            update:{
                before:(ctx,options)=>{},
                after:(ctx,result)=>{},
            },
            delete:{
                before:(ctx,options)=>{},
                after:(ctx,result)=>{},
            }
        }
    },

    // 创建索引
    indexes: [
        { key: { username: 1 }, unique: true },     // 唯一索引
        { key: { age: -1 } },                       // 普通索引，降序
    ],

    // 关系
    relations: {
        posts: {
            type: 'hasMany',      // 一对多
            target: 'Post',       // 目标模型
            foreignKey: 'userId', // 外键字段（存在哪张表里）
            localKey: '_id',      // 本表对应字段
            as: 'posts',          // 实例访问属性 user.posts
            cascade: false        // 是否级联删除/更新
        },
        profile: {
            type: 'hasOne',       // 一对一
            target: 'Profile',
            foreignKey: 'userId',
            localKey: '_id',
            as: 'profile',        // 实例访问属性 user.profile
            cascade: true,        // 删除用户时级联删除 profile
            required: false       // 是否必须关联
        },
        roles: {                  // 多对多
            type: 'manyToMany',
            target: 'Role',
            through: 'UserRole',  // 中间表
            foreignKey: 'userId',
            otherKey: 'roleId',
            as: 'roles'
        }
    },

    // 选项
    options: {
        timestamps: true,   // 自动维护 createdAt / updatedAt
        softDelete: true,   // 启用 deletedAt 替代物理删除，deletedAt = null → 正常数据，deletedAt = Date → 已删除
        sync: true          // 启用 index 索引自动同步
    }
}