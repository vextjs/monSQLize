/**
 * Model 定义示例模板
 *
 * 使用说明：
 * 1. enums - 枚举配置可被外部代码直接访问
 *    例如：UserModel.enums.role
 *
 * 2. schema - 由 schema-dsl 包提供验证能力
 *    使用 function 定义时，this 自动绑定到当前模型定义对象
 *    例如：UserModel.schema(dsl) 时，this === UserModel
 *
 * 3. methods/hooks - 接收 model 实例作为参数
 *    可以调用 model 的所有查询方法
 *
 * 注意：这是 API 设计示例，展示：
 *   - schema 中 this.enums 引用同一对象内的枚举配置
 *   - methods 通过参数接收 model 实例
 *   - hooks 通过 ctx 上下文传递状态（如事务）
 */

module.exports = {

    // 枚举配置（可被外部代码直接访问）
    enums: {
        role: 'admin|user',
        status: 'active|inactive|banned'
    },

    // 定义 schema（使用 function 时，this 自动绑定到当前对象）
    schema: function(dsl) {
        return dsl({
            username: 'string:3-32!',
            password: 'string!'.pattern(/^[a-zA-Z0-9]{6,30}$/),
            age: 'number:0-18!',
            role: this.enums.role.default('user'),  // this 指向 module.exports
        })
    },

    // 自定义方法
    //
    // 说明：
    //   - methods 接收 model 参数（ModelInstance 实例）
    //   - 返回对象必须包含 instance 和/或 static 两个固定分组
    //   - instance: 实例方法，注入到查询结果文档对象（this 指向文档）
    //   - static: 静态方法，挂载到 Model 实例（通过 model 参数操作）
    //
    // 设计原因：
    //   - 明确区分方法类型，避免混淆
    //   - 实例方法：操作具体文档数据（需要 this）
    //   - 静态方法：执行查询操作（不需要 this）
    //
    // 可选配置：
    //   - 只需要 instance：只写 instance 分组
    //   - 只需要 static：只写 static 分组
    //   - 都不需要：整个 methods 配置项可省略
    //
    methods: (model)=>{
        return {
            // 实例方法（注入到文档对象）
            // 用法：const user = await User.findOne(...); user.checkPassword('123');
            instance: {
                checkPassword(password) {
                    return this.password === password;  // this 指向文档对象
                },
                async getPosts(_id) {
                    return await model.find({ userId: _id });  // 可以调用 model 查询
                }
            },

            // 静态方法（挂载到 Model 实例）
            // 用法：const User = msq.model('users'); await User.findByName('test');
            static: {
                findByName(name) {
                    return model.find({ username: name });  // 使用 model 参数
                }
            }
        };
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
        };
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

    // 模型选项配置（核心功能）
    options: {
        // 1️⃣ 时间戳自动维护
        // 默认值：{ enabled: false, createdAt: 'createdAt', updatedAt: 'updatedAt' }
        timestamps: {
            enabled: true,      // 启用时间戳
            createdAt: 'createdAt',  // 创建时间字段名
            updatedAt: 'updatedAt'   // 更新时间字段名
        },
        // 简化配置方式：
        //   timestamps: true       // 使用默认字段名（createdAt, updatedAt）
        //   timestamps: false      // 禁用时间戳

        // 2️⃣ 软删除配置
        // 默认值：{ enabled: false, field: 'deletedAt', type: 'timestamp', ttl: null, index: true }
        softDelete: {
            enabled: true,      // 启用软删除
            field: 'deletedAt', // 软删除字段名
            type: 'timestamp',  // 类型：timestamp | boolean
            ttl: 30 * 24 * 60 * 60 * 1000,  // 30天后物理删除（null=永久保留）
            index: true,        // 自动创建索引
        },
        // 简化配置方式：
        //   softDelete: true       // 使用默认值
        //   softDelete: false      // 禁用软删除（{ enabled: false }）

        // 3️⃣ 乐观锁版本控制（防止并发冲突）
        // 默认值：{ enabled: false, field: 'version', strategy: 'increment' }
        version: {
            enabled: true,      // 启用版本号
            field: 'version',   // 版本字段名
            strategy: 'increment'  // 策略：increment | timestamp
        },
        // 简化配置方式：
        //   version: true          // 使用默认值
        //   version: false         // 禁用版本控制（{ enabled: false }）

        // 4️⃣ 索引自动同步
        // 默认值：{ enabled: false, mode: 'safe', background: true }
        sync: {
            enabled: true,      // 启用索引自动同步
            mode: 'safe',       // 模式：safe | force
            background: true,   // 后台创建索引
        },
        // 简化配置方式：
        //   sync: true             // 使用默认值（safe 模式）
        //   sync: false            // 禁用同步（{ enabled: false }）
    },

    // ========================================
    // 📝 默认配置值速查表
    // ========================================
    // timestamps:  { enabled: false, createdAt: 'createdAt', updatedAt: 'updatedAt' }
    // softDelete:  { enabled: false, field: 'deletedAt', type: 'timestamp', ttl: null, index: true }
    // version:     { enabled: false, field: 'version', strategy: 'increment' }
    // sync:        { enabled: false, mode: 'safe', background: true }
    //
    // 说明：
    //   - 默认所有功能都禁用（enabled: false），用户需要主动启用
    //   - ttl: null = 软删除数据永久保留
    //   - ttl: 数字 = 指定天数后物理删除
    //   - mode: 'safe' = 只创建缺失的索引（生产环境推荐）
    //   - mode: 'force' = 创建+删除索引，完全同步（开发环境）
    //
    // ========================================
    // 📝 配置方式说明（三层递进）
    // ========================================
    //
    // 【第1层】完全默认（什么都不改）
    //   options: {}  // 所有功能禁用
    //
    // 【第2层】简化配置（快速启用功能）
    //   options: {
    //     timestamps: true,
    //     softDelete: true,
    //     version: true,
    //     sync: true
    //   }
    //
    // 【第3层】详细配置（精细控制）
    //   options: {
    //     timestamps: { enabled: true, createdAt: 'createdAt', updatedAt: 'updatedAt' },
    //     softDelete: { enabled: true, field: 'deletedAt', type: 'timestamp', ttl: ..., index: true },
    //     version: { enabled: true, field: 'version', strategy: 'increment' },
    //     sync: { enabled: true, mode: 'safe', background: true }
    //   }
    //
    // ========================================
    // 📝 日常开发场景最佳实践
    // ========================================
    //
    // 场景1: 用户/订单表（需要完整功能）
    //   options: {
    //     timestamps: true,
    //     softDelete: true,      // 删除后保留30天便于恢复
    //     version: true,         // 防止并发冲突
    //     sync: true
    //   }
    //
    // 场景2: 会话/缓存表（最小化配置）
    //   options: {
    //     timestamps: false,     // 不需要时间戳
    //     softDelete: false,     // 不需要软删除，过期自动删除
    //     version: false,        // 不需要版本控制
    //     sync: true             // 需要同步 TTL 索引
    //   }
    //   indexes: [
    //     { key: { expireAt: 1 }, expireAfterSeconds: 0 }  // TTL 索引
    //   ]
    //
    // 场景3: 中间表（极简配置）
    //   options: {
    //     timestamps: false,
    //     softDelete: false,
    //     version: false,
    //     sync: true             // 需要同步唯一索引
    //   }
    //
    // 场景4: 日志/事件表（无删除需求）
    //   options: {
    //     timestamps: true,      // 记录事件时间
    //     softDelete: false,     // 日志不删除
    //     version: false,        // 日志不并发更新
    //     sync: true
    //   }
    //
    // 场景5: 商品/内容表（高频并发）
    //   options: {
    //     timestamps: true,
    //     softDelete: true,      // 下架商品保留
    //     version: true,         // 防止秒杀并发冲突
    //     sync: {                // 生产环境用 safe，开发用 force
    //       enabled: true,
    //       mode: 'safe',        // 生产环境
    //       background: true
    //     }
    //   }
    //
    // ========================================
    // 📝 全局配置已包含：
    //    - 缓存系统（MemoryCache）
    //    - 日志系统（Logger）
    //    - 慢查询日志（SlowQueryLogManager）
    //    - 默认值（defaultLimit, maxLimit, validation等）
    //
    // 📝 Model options 只配置模型特异的功能：
    //    - timestamps: 某些表不需要（如中间表）
    //    - softDelete: 某些表不需要（如会话表）
    //    - version: 高并发表才需要
    //    - sync: 模型特异的索引定义
    //
    // 📝 数据生命周期处理方式：
    //    - 在 schema 中定义 expireAt 字段
    //    - 在 indexes 中定义 TTL 索引
    //    - 不需要单独的 lifecycle 配置项
    //
    // 📝 自动注入的方法（仅当 softDelete.enabled = true）：
    //    - model.restore(id) - 恢复软删除数据
    //    - model.forceDelete(id) - 强制物理删除
    //    - model.findWithDeleted() - 查询包含软删除数据
    //    - model.findOnlyDeleted() - 只查询软删除数据
    //
    // 📝 开发建议：
    //    1. 开发阶段：使用简化配置快速迭代（timestamps: true, ...）
    //    2. 优化阶段：根据实际需求调整（可禁用不需要的功能）
    //    3. 生产部署：确认 sync.mode 为 'safe'（避免误删索引）
    //    4. 高并发表：必须启用 version，防止并发冲突
    //    5. 敏感数据：启用 softDelete，避免误删无法恢复
};
