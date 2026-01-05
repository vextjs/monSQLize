# Model API 文档

Model 层提供 Schema 验证、自定义方法和生命周期钩子，让你像使用 ORM 一样使用 monSQLize。

**特性**：Schema 验证 · 自定义方法 · 生命周期钩子 · 自动索引

---

## 快速开始

```javascript
const MonSQLize = require('monsqlize');
const { Model } = MonSQLize;

// 1. 定义 Model
Model.define('users', {
    schema: (dsl) => dsl({
        username: 'string:3-32!',
        email: 'email!',
        password: 'string!',
        age: 'number:0-120'
    }),
    methods: (model) => ({
        instance: {
            checkPassword(password) {
                return this.password === password;
            }
        },
        static: {
            async findByUsername(username) {
                return await model.findOne({ username });
            }
        }
    })
});

// 2. 使用 Model
const msq = new MonSQLize({ ... });
await msq.connect();
const User = msq.model('users');

// 插入
await User.insertOne({
    username: 'test',
    email: 'test@example.com',
    password: 'secret123',
    age: 25
});

// 查询并使用方法
const user = await User.findByUsername('test');
if (user.checkPassword('secret123')) {
    console.log('登录成功');
}
```

---

## API 参考

### Model.define(collectionName, definition)

注册 Model 定义。

**参数**：
- `collectionName` - 集合名称
- `definition` - Model 定义
  - `schema` (必需) - Schema 定义
  - `enums` - 枚举配置
  - `methods` - 自定义方法
  - `hooks` - 生命周期钩子
  - `indexes` - 索引定义

```javascript
Model.define('users', {
    enums: {
        role: 'admin|user|guest'
    },
    schema: function(dsl) {
        return dsl({
            username: 'string:3-32!',
            email: 'email!',
            password: 'string!',
            role: this.enums.role.default('user')
        });
    },
    methods: (model) => ({
        instance: {
            checkPassword(password) {
                return this.password === password;
            }
        },
        static: {
            async findByUsername(username) {
                return await model.findOne({ username });
            }
        }
    }),
    hooks: (model) => ({
        insert: {
            before: async (ctx, docs) => {
                return { ...docs, createdAt: new Date() };
            }
        }
    }),
    indexes: [
        { key: { username: 1 }, unique: true }
    ]
});
```

---

### msq.model(collectionName)

获取 Model 实例。

```javascript
const User = msq.model('users');

// 继承所有 collection 方法
const users = await User.find({ status: 'active' });
const user = await User.findOne({ username: 'test' });

// 使用自定义静态方法
const admin = await User.findByUsername('admin');
```

---

### validate(data, options)

验证数据。

```javascript
const result = User.validate({
    username: 'test',
    email: 'test@example.com'
});

if (!result.valid) {
    console.error('验证失败:', result.errors);
}
```

---

## 配置说明

### 1. schema - 数据验证

定义字段验证规则。

```javascript
// 推荐：使用 function 可引用 enums
schema: function(dsl) {
    return dsl({
        username: 'string:3-32!',
        email: 'email!',
        age: 'number:0-120',
        role: this.enums.role.default('user')  // 引用 enums
    });
}

// 或直接使用 object
schema: (dsl) => dsl({
    username: 'string:3-32!',
    email: 'email!'
})
```

**常用规则**：
- `string!` - 必填字符串
- `string:3-32` - 长度 3-32
- `number:0-120` - 数字范围
- `email!` - 邮箱格式
- `.default('value')` - 默认值
- `.pattern(/regex/)` - 正则验证

---

### 2. methods - 自定义方法

#### instance 方法

注入到查询返回的文档对象。

```javascript
methods: (model) => ({
    instance: {
        checkPassword(password) {
            return this.password === password;  // this = 文档对象
        },
        isAdmin() {
            return this.role === 'admin';
        }
    }
})

// 使用
const user = await User.findOne({ username: 'test' });
user.checkPassword('secret123');  // ✅
user.isAdmin();                   // ✅
```

**注意**：
- ⚠️ 必须使用普通函数，不能用箭头函数
- ⚠️ 方法名避免与字段名冲突，使用动词前缀：`is*`, `check*`, `get*`
- ⚠️ 修改 `this` 不会自动保存到数据库

#### static 方法

挂载到 Model 实例。

```javascript
methods: (model) => ({
    static: {
        async findByUsername(username) {
            return await model.findOne({ username });
        },
        async findAdmins() {
            return await model.find({ role: 'admin' });
        }
    }
})

// 使用
const User = msq.model('users');
const user = await User.findByUsername('test');  // ✅
const admins = await User.findAdmins();          // ✅
```

---

### 3. hooks - 生命周期钩子

在操作前后执行自定义逻辑。

```javascript
hooks: (model) => ({
    insert: {
        before: async (ctx, docs) => {
            // 自动添加时间戳
            return { ...docs, createdAt: new Date() };
        },
        after: async (ctx, result) => {
            console.log('插入完成');
        }
    },
    update: {
        before: async (ctx, filter, update) => {
            if (!update.$set) update.$set = {};
            update.$set.updatedAt = new Date();
            return [filter, update];
        }
    }
})
```

**支持的操作**：`find`, `insert`, `update`, `delete`

**ctx 上下文**：用于在 before 和 after 之间传递数据

```javascript
before: async (ctx, docs) => {
    ctx.timestamp = Date.now();
},
after: async (ctx, result) => {
    console.log('耗时:', Date.now() - ctx.timestamp);
}
```

---

### 4. indexes - 自动创建索引

```javascript
indexes: [
    { key: { username: 1 }, unique: true },      // 唯一索引
    { key: { status: 1, createdAt: -1 } },       // 复合索引
    { key: { expireAt: 1 }, expireAfterSeconds: 0 }  // TTL 索引
]
```

---

### 5. enums - 枚举配置

```javascript
enums: {
    role: 'admin|user|guest',
    status: 'active|inactive'
}

// schema 中引用
schema: function(dsl) {
    return dsl({
        role: this.enums.role.default('user')
    });
}
```

---

## 完整示例

```javascript
const MonSQLize = require('monsqlize');
const { Model } = MonSQLize;

// 定义 User Model
Model.define('users', {
    enums: {
        role: 'admin|user|guest',
        status: 'active|inactive|banned'
    },
    schema: function(dsl) {
        return dsl({
            username: 'string:3-32!',
            email: 'email!',
            password: 'string!'.pattern(/^[a-zA-Z0-9]{6,30}$/),
            role: this.enums.role.default('user'),
            status: this.enums.status.default('active'),
            loginCount: 'number'.default(0),
            lastLoginAt: 'date',
            createdAt: 'date!',
            updatedAt: 'date!'
        });
    },
    methods: (model) => ({
        instance: {
            checkPassword(password) {
                return this.password === password;
            },
            isAdmin() {
                return this.role === 'admin';
            },
            async incrementLogin() {
                return await model.updateOne(
                    { _id: this._id },
                    { 
                        $inc: { loginCount: 1 },
                        $set: { lastLoginAt: new Date() }
                    }
                );
            }
        },
        static: {
            async findByUsername(username) {
                return await model.findOne({ username });
            },
            async findActive() {
                return await model.find({ status: 'active' });
            },
            async countAdmins() {
                return await model.count({ role: 'admin' });
            }
        }
    }),
    hooks: (model) => ({
        insert: {
            before: async (ctx, docs) => {
                const now = new Date();
                return {
                    ...docs,
                    createdAt: now,
                    updatedAt: now
                };
            }
        },
        update: {
            before: async (ctx, filter, update) => {
                if (!update.$set) update.$set = {};
                update.$set.updatedAt = new Date();
                return [filter, update];
            }
        }
    }),
    indexes: [
        { key: { username: 1 }, unique: true },
        { key: { email: 1 }, unique: true },
        { key: { status: 1, createdAt: -1 } }
    ]
});

// 使用
const msq = new MonSQLize({
    type: 'mongodb',
    config: { uri: 'mongodb://localhost:27017/mydb' }
});
await msq.connect();

const User = msq.model('users');

// 创建用户
const result = User.validate({
    username: 'admin',
    email: 'admin@example.com',
    password: 'secret123',
    role: 'admin'
});

if (result.valid) {
    await User.insertOne(result.data);
}

// 登录验证
const user = await User.findByUsername('admin');
if (user && user.checkPassword('secret123')) {
    if (user.isAdmin()) {
        console.log('管理员登录');
    }
    await user.incrementLogin();
}

// 查询活跃用户
const activeUsers = await User.findActive();

// 统计管理员数量
const adminCount = await User.countAdmins();
```

---

## 注意事项

### ⚠️ 方法命名避免冲突

方法名不要与字段名相同，使用动词前缀。

```javascript
// ❌ 错误
methods: { instance: { status() {} } }

// ✅ 正确
methods: { 
    instance: { 
        isActive() {},      // is* 判断
        checkStatus() {},   // check* 验证
        getFullName() {}    // get* 获取
    } 
}
```

### ⚠️ 必须使用普通函数

不能使用箭头函数，否则 `this` 指向错误。

```javascript
// ❌ 错误
checkPassword: (password) => this.password === password

// ✅ 正确
checkPassword(password) { return this.password === password; }
```

### ⚠️ 修改不会自动保存

方法内修改 `this` 只改内存，不会保存到数据库。

```javascript
// ❌ 错误：只改内存
updatePassword(pwd) { this.password = pwd; }

// ✅ 正确：调用更新方法
async changePassword(pwd) {
    return await model.updateOne(
        { _id: this._id },
        { $set: { password: pwd } }
    );
}
```

---

## 自动时间戳（v1.0.3+）

自动管理 `createdAt` 和 `updatedAt` 字段。

### 基本用法

```javascript
Model.define('users', {
    schema: (dsl) => dsl({ username: 'string!' }),
    options: {
        timestamps: true  // 启用自动时间戳
    }
});

// 插入时自动添加
await User.insertOne({ username: 'john' });
// => { _id, username: 'john', createdAt: Date, updatedAt: Date }

// 更新时自动更新 updatedAt
await User.updateOne({ username: 'john' }, { $set: { status: 'active' } });
// => updatedAt 自动更新为当前时间
```

### 自定义字段名

```javascript
Model.define('users', {
    options: {
        timestamps: {
            createdAt: 'created_time',  // 自定义创建时间字段名
            updatedAt: 'updated_time'   // 自定义更新时间字段名
        }
    }
});
```

### 部分启用

```javascript
// 只启用 createdAt
Model.define('users', {
    options: {
        timestamps: {
            createdAt: true,
            updatedAt: false
        }
    }
});

// 只启用 updatedAt
Model.define('users', {
    options: {
        timestamps: {
            createdAt: false,
            updatedAt: true
        }
    }
});
```

### 支持的操作

| 操作 | createdAt | updatedAt | 说明 |
|------|-----------|-----------|------|
| insertOne | ✅ | ✅ | 同时添加两个字段 |
| insertMany | ✅ | ✅ | 每个文档都添加 |
| updateOne | ❌ | ✅ | 只更新 updatedAt |
| updateMany | ❌ | ✅ | 所有匹配文档更新 |
| replaceOne | ❌ | ✅ | 替换时更新 |
| upsertOne | ✅/❌ | ✅ | 插入时添加 createdAt，更新时不添加 |
| findOneAndUpdate | ❌ | ✅ | 只更新 updatedAt |
| findOneAndReplace | ❌ | ✅ | 替换时更新 |
| incrementOne | ❌ | ❌ | ⚠️ 暂不支持 |

### 注意事项

#### ⚠️ 用户手动设置会被覆盖

```javascript
await User.insertOne({
    username: 'john',
    createdAt: new Date('2020-01-01')  // 会被覆盖
});
// => createdAt 会是当前时间，不是 2020-01-01
```

如需保留用户设置的值，请暂时禁用 timestamps 或在 before hook 中处理。

#### ⚠️ incrementOne 暂不支持

```javascript
// incrementOne 不会自动更新 updatedAt
await User.incrementOne({ _id }, { score: 10 });
```

**临时方案**：手动添加 updatedAt

```javascript
await User.updateOne(
    { _id },
    { 
        $inc: { score: 10 },
        $set: { updatedAt: new Date() }
    }
);
```

#### ✅ 与 schema 验证配合

timestamps 自动添加的字段会通过 schema 验证（如果 schema 中有定义）。

```javascript
Model.define('users', {
    schema: (dsl) => dsl({
        username: 'string!',
        createdAt: 'date',    // 可选：定义验证规则
        updatedAt: 'date'
    }),
    options: {
        timestamps: true       // 自动添加的值会通过验证
    }
});
```

#### ✅ 与 hooks 配合

timestamps 在用户 hooks 之后执行，不会影响用户的 before hook。

```javascript
Model.define('users', {
    options: { timestamps: true },
    hooks: (model) => ({
        insert: {
            before: (ctx, docs) => {
                // 用户 hook 先执行
                return { ...docs, customField: 'value' };
            }
        }
    })
});

// 执行顺序：用户 before hook → timestamps → 数据库操作 → 用户 after hook
```

---

## 软删除（softDelete）

**版本**: v1.0.3+

软删除标记文档为已删除，而非物理删除，支持数据恢复和审计。

### 启用软删除

```javascript
// 简单模式
Model.define('users', {
    schema: (dsl) => dsl({ username: 'string!' }),
    options: {
        softDelete: true  // 使用默认配置
    }
});

// 完整配置
Model.define('posts', {
    schema: (dsl) => dsl({ title: 'string!' }),
    options: {
        softDelete: {
            enabled: true,           // 启用软删除
            field: 'deletedAt',      // 字段名（可自定义）
            type: 'timestamp',       // 'timestamp' | 'boolean'
            ttl: 86400 * 30          // TTL 索引（30天后自动清理）
        }
    }
});
```

### 配置项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | true | 启用软删除 |
| `field` | string | 'deletedAt' | 删除标记字段名 |
| `type` | string | 'timestamp' | 删除标记类型（'timestamp' 或 'boolean'） |
| `ttl` | number | null | TTL 索引（秒），自动清理已删除数据 |

### 软删除操作

启用软删除后，`deleteOne` 和 `deleteMany` 会自动转换为更新操作：

```javascript
const User = msq.model('users');

// 软删除（标记为已删除）
await User.deleteOne({ _id });
// 实际执行：updateOne({ _id }, { $set: { deletedAt: new Date() } })

// 批量软删除
await User.deleteMany({ status: 'inactive' });
// 实际执行：updateMany({ status: 'inactive' }, { $set: { deletedAt: new Date() } })
```

### 查询自动过滤

启用软删除后，查询操作自动过滤已删除的文档：

```javascript
// 默认查询不返回已删除数据
const users = await User.find({});
// 实际执行：find({ deletedAt: null })

const user = await User.findOne({ username: 'john' });
// 实际执行：findOne({ username: 'john', deletedAt: null })

const count = await User.count({ status: 'active' });
// 实际执行：count({ status: 'active', deletedAt: null })
```

### 查询已删除数据

使用专门的方法查询包含或只查询已删除的数据：

```javascript
// 查询包含已删除的所有数据
const allUsers = await User.findWithDeleted({});
const john = await User.findOneWithDeleted({ username: 'john' });
const totalCount = await User.countWithDeleted({});

// 只查询已删除的数据
const deletedUsers = await User.findOnlyDeleted({});
const deletedJohn = await User.findOneOnlyDeleted({ username: 'john' });
const deletedCount = await User.countOnlyDeleted({});
```

### 新增方法

| 方法 | 说明 |
|------|------|
| `findWithDeleted(filter, options)` | 查询包含已删除的文档 |
| `findOneWithDeleted(filter, options)` | 查询单个文档（包含已删除） |
| `countWithDeleted(filter, options)` | 统计文档数（包含已删除） |
| `findOnlyDeleted(filter, options)` | 只查询已删除的文档 |
| `findOneOnlyDeleted(filter, options)` | 查询单个已删除文档 |
| `countOnlyDeleted(filter, options)` | 统计已删除的文档数 |
| `restore(filter, options)` | 恢复已删除的文档 |
| `restoreMany(filter, options)` | 批量恢复已删除的文档 |
| `forceDelete(filter, options)` | 强制物理删除（不可恢复） |
| `forceDeleteMany(filter, options)` | 批量强制物理删除 |

### 恢复已删除数据

```javascript
// 恢复单个文档
const result = await User.restore({ _id });
// 实际执行：updateOne({ _id, deletedAt: { $ne: null } }, { $unset: { deletedAt: 1 } })

// 批量恢复
const result = await User.restoreMany({ status: 'active' });
// 实际执行：updateMany({ status: 'active', deletedAt: { $ne: null } }, { $unset: { deletedAt: 1 } })
```

### 强制物理删除

绕过软删除机制，执行真正的物理删除（不可恢复）：

```javascript
// 强制物理删除单个文档
await User.forceDelete({ _id });
// 实际执行：真正的 deleteOne（数据永久删除）

// 批量强制删除
await User.forceDeleteMany({ deletedAt: { $lt: thirtyDaysAgo } });
// 实际执行：真正的 deleteMany（批量永久删除）
```

### 删除类型

#### timestamp 类型（默认）

```javascript
Model.define('users', {
    options: {
        softDelete: { type: 'timestamp' }  // 默认
    }
});

// 删除时记录删除时间
{ _id, username: 'john', deletedAt: new Date('2026-01-05T10:30:00Z') }

// 优点：记录删除时间，支持审计
// 缺点：占用存储空间
```

#### boolean 类型

```javascript
Model.define('posts', {
    options: {
        softDelete: { type: 'boolean' }
    }
});

// 删除时标记为 true
{ _id, title: 'Hello', deletedAt: true }

// 优点：节省存储空间
// 缺点：不记录删除时间
```

### 自定义字段名

```javascript
Model.define('comments', {
    options: {
        softDelete: {
            enabled: true,
            field: 'removed_at'  // 自定义字段名
        }
    }
});

// 删除时使用 removed_at 字段
await Comment.deleteOne({ _id });
// { _id, content: 'Nice!', removed_at: new Date() }
```

### TTL 索引自动清理

配置 TTL 索引，MongoDB 会自动删除过期的已删除数据：

```javascript
Model.define('logs', {
    options: {
        softDelete: {
            enabled: true,
            ttl: 86400 * 30  // 30天后自动清理
        }
    }
});

// 自动创建索引：
// db.logs.createIndex({ deletedAt: 1 }, { expireAfterSeconds: 2592000 })

// MongoDB 会自动删除 deletedAt 超过 30 天的文档
```

### 与 timestamps 协同

软删除和时间戳可以同时启用：

```javascript
Model.define('products', {
    schema: (dsl) => dsl({ name: 'string!' }),
    options: {
        timestamps: true,   // 自动管理 createdAt/updatedAt
        softDelete: true    // 软删除
    }
});

// 插入时自动添加时间戳
await Product.insertOne({ name: 'iPhone' });
// { _id, name: 'iPhone', createdAt: Date, updatedAt: Date }

// 软删除时自动更新 updatedAt
await Product.deleteOne({ _id });
// { _id, name: 'iPhone', createdAt: Date, updatedAt: Date(更新), deletedAt: Date }
```

### 唯一索引处理

⚠️ **注意**：软删除后，唯一索引可能失效。

```javascript
// 问题：用户 john 被软删除后
{ username: 'john', deletedAt: new Date() }

// 创建新用户 john 会失败（唯一索引冲突）
await User.insertOne({ username: 'john' });  // ❌ 冲突
```

**解决方案**：使用复合唯一索引

```javascript
Model.define('users', {
    schema: (dsl) => dsl({ username: 'string!' }),
    options: {
        softDelete: true
    },
    indexes: [
        {
            key: { username: 1, deletedAt: 1 },  // 复合索引
            unique: true
        }
    ]
});

// 现在可以创建同名用户（因为 deletedAt 不同）
```

---

## 乐观锁版本控制（Version）

### 什么是乐观锁？

乐观锁是一种并发控制机制，通过版本号检测数据冲突：
- 每次更新时自动递增版本号
- 更新时验证版本号是否匹配
- 版本号不匹配说明数据已被其他请求修改（并发冲突）

**使用场景**：
- 多用户同时编辑同一数据
- 防止脏写（Lost Update）
- 需要并发安全保证的场景

### 基础配置

```javascript
Model.define('users', {
    schema: (dsl) => dsl({
        username: 'string!',
        email: 'string!',
        status: 'string'
    }),
    options: {
        version: true  // 启用版本控制（默认字段名 version）
    }
});
```

### 完整配置

```javascript
Model.define('users', {
    schema: (dsl) => dsl({
        username: 'string!',
        email: 'string!'
    }),
    options: {
        version: {
            enabled: true,      // 是否启用
            field: '__v'        // 自定义字段名（默认 'version'）
        }
    }
});
```

### 插入时自动初始化

```javascript
// 插入文档
const result = await User.insertOne({
    username: 'john',
    email: 'john@example.com'
});

// 查询文档
const user = await User.findOne({ _id: result.insertedId });
console.log(user);
// { _id: '...', username: 'john', email: 'john@example.com', version: 0 }
```

### 更新时自动递增

```javascript
// 第一次更新
await User.updateOne({ _id }, { $set: { status: 'active' } });
// 实际执行：{ $set: { status: 'active' }, $inc: { version: 1 } }

const user = await User.findOne({ _id });
console.log(user.version);  // 1

// 第二次更新
await User.updateOne({ _id }, { $set: { status: 'inactive' } });
console.log(user.version);  // 2
```

### 并发冲突检测

```javascript
// 用户 A 读取数据
const userA = await User.findOne({ _id });
console.log(userA.version);  // 0

// 用户 B 读取数据
const userB = await User.findOne({ _id });
console.log(userB.version);  // 0

// 用户 A 先更新成功
const resultA = await User.updateOne(
    { _id, version: userA.version },
    { $set: { status: 'active' } }
);
console.log(resultA.modifiedCount);  // 1

// 用户 B 更新失败
const resultB = await User.updateOne(
    { _id, version: userB.version },  // 版本号已过期
    { $set: { status: 'inactive' } }
);
console.log(resultB.modifiedCount);  // 0（版本号不匹配）
```

### 与其他功能协同

```javascript
Model.define('users', {
    options: {
        timestamps: true,  // 自动时间戳
        softDelete: true,  // 软删除
        version: true      // 版本控制
    }
});

// 所有功能协同工作
await User.insertOne({ username: 'john' });
// { _id, username, version: 0, createdAt, updatedAt }

await User.deleteOne({ _id, version: 0 });
// 软删除时版本号递增
```

### 最佳实践

```javascript
// 并发更新场景
async function updateUserStatus(userId, newStatus) {
    let maxRetries = 3;
    
    for (let i = 0; i < maxRetries; i++) {
        const user = await User.findOne({ _id: userId });
        if (!user) throw new Error('User not found');
        
        const result = await User.updateOne(
            { _id: userId, version: user.version },
            { $set: { status: newStatus } }
        );
        
        if (result.modifiedCount > 0) return { success: true };
        
        console.log(`Retry ${i + 1}/${maxRetries} (version conflict)`);
    }
    
    throw new Error('Update failed due to concurrent modification');
}
```

---

### 完整示例

```javascript
const MonSQLize = require('monsqlize');
const { Model } = MonSQLize;

// 定义 Model（启用软删除和时间戳）
Model.define('articles', {
    schema: (dsl) => dsl({
        title: 'string!',
        content: 'string!',
        author: 'string!'
    }),
    options: {
        timestamps: true,
        softDelete: {
            enabled: true,
            type: 'timestamp',
            ttl: 86400 * 30  // 30天后自动清理
        }
    },
    indexes: [
        { key: { author: 1 } },
        { key: { title: 1, deletedAt: 1 }, unique: true }  // 复合唯一索引
    ]
});

async function example() {
    const msq = new MonSQLize({ type: 'mongodb', databaseName: 'blog' });
    await msq.connect();
    
    const Article = msq.model('articles');
    
    // 1. 插入文章
    const article = await Article.insertOne({
        title: 'Hello World',
        content: 'This is my first post',
        author: 'john'
    });
    console.log('Created:', article);
    // { _id, title, content, author, createdAt, updatedAt }
    
    // 2. 软删除文章
    await Article.deleteOne({ _id: article._id });
    console.log('Article soft deleted');
    
    // 3. 查询（自动过滤已删除）
    const articles = await Article.find({ author: 'john' });
    console.log('Active articles:', articles.length);  // 0
    
    // 4. 查询包含已删除
    const allArticles = await Article.findWithDeleted({ author: 'john' });
    console.log('All articles:', allArticles.length);  // 1
    
    // 5. 恢复文章
    await Article.restore({ _id: article._id });
    console.log('Article restored');
    
    // 6. 查询（恢复后可以查到）
    const restoredArticle = await Article.findOne({ _id: article._id });
    console.log('Restored:', restoredArticle.title);  // 'Hello World'
    
    // 7. 强制物理删除
    await Article.forceDelete({ _id: article._id });
    console.log('Article permanently deleted');
    
    await msq.close();
}

example().catch(console.error);
```

---

## 常见问题

**Q: `this.password` 从哪来？**  
A: 来自数据库查询结果，不是 schema。schema 只定义验证规则。

**Q: 如何引用 enums？**  
A: 使用 function 定义 schema：`schema: function(dsl) { return dsl({ role: this.enums.role }) }`

**Q: instance 和 static 的区别？**  
A: instance 注入到文档对象，static 挂载到 Model 实例。

---

## 更多示例

查看 `examples/model/` 目录：
- `basic.js` - 基础使用
- `advanced.js` - 高级功能

