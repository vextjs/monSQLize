# Hooks API - 生命周期钩子

**版本**: v1.0.6+  
**功能**: Model 层生命周期钩子，在数据操作前后执行自定义逻辑

---

## 📖 概述

Hooks 提供生命周期钩子机制，让你可以在数据库操作前后执行自定义逻辑，实现密码加密、审计日志、数据验证、缓存失效等功能。

### 核心特性

- ✅ **4类钩子** - insert/update/delete/find
- ✅ **before/after** - 操作前后都支持
- ✅ **数据修改** - 可以修改输入参数和返回结果
- ✅ **异步支持** - 完全支持 async/await
- ✅ **错误处理** - 钩子中抛出错误会阻止操作
- ✅ **上下文传递** - 提供丰富的上下文信息

> 兼容说明：monSQLize 同时支持两种 hook 形态。旧版 v1 `hooks: (model) => ({ insert/update/delete/find })` factory 在兼容层可通过返回值传递修改后的参数或结果；标准 object 形态（`hooks: { beforeCreate, beforeUpdate, ... }`）以观察和原对象就地修改为主，TypeScript 契约返回 `void`，返回值会被忽略。

---

## 🚀 快速开始

### 基础定义

```javascript
import { Model } from 'monsqlize';

Model.define('users', {
    schema: (dsl) => dsl({
        username: 'string!',
        password: 'string!'
    }),
    hooks: (model) => ({
        insert: {
            before: async (ctx, docs) => {
                // 插入前：加密密码
                if (docs.password) {
                    docs.password = await bcrypt.hash(docs.password, 10);
                }
                return docs;
            },
            after: async (ctx, result) => {
                // 插入后：记录日志
                console.log(`新用户注册: ${docs.username}`);
            }
        }
    })
});
```

---

## 📚 支持的钩子

### insert hooks (插入钩子)

在 `insertOne` / `insertMany` / `insertBatch` 时触发。

```javascript
hooks: (model) => ({
    insert: {
        // 插入前执行
        before: async (ctx, docs) => {
            // ctx: Hook上下文
            // docs: 要插入的文档（单个对象或数组）
            
            // 可以修改文档
            if (Array.isArray(docs)) {
                docs.forEach(doc => {
                    doc.createdBy = ctx.userId;
                });
            } else {
                docs.createdBy = ctx.userId;
            }
            
            // 返回修改后的文档（可选）
            return docs;
        },
        
        // 插入后执行
        after: async (ctx, result) => {
            // ctx: Hook上下文
            // result: insertOne/insertMany的返回结果
            
            // 可以执行后续操作（如发送通知）
            await notifyService.sendWelcomeEmail(result.insertedId);
            
            // 可以修改返回结果（可选）
            return result;
        }
    }
})
```

### update hooks (更新钩子)

在 `updateOne` / `updateMany` / `updateBatch` / `findOneAndUpdate` 时触发。

```javascript
hooks: (model) => ({
    update: {
        // 更新前执行
        before: async (ctx, filter, update) => {
            // ctx: Hook上下文
            // filter: 查询条件
            // update: 更新操作
            
            // 可以修改更新操作
            if (!update.$set) update.$set = {};
            update.$set.updatedAt = new Date();
            
            // 返回修改后的参数（可选）
            return [filter, update];
        },
        
        // 更新后执行
        after: async (ctx, result) => {
            // ctx: Hook上下文
            // result: update操作的返回结果
            
            // 清除缓存
            await cache.invalidate('users', filter);
            
            return result;
        }
    }
})
```

### delete hooks (删除钩子)

在 `deleteOne` / `deleteMany` / `deleteBatch` / `findOneAndDelete` 时触发。

```javascript
hooks: (model) => ({
    delete: {
        // 删除前执行
        before: async (ctx, filter) => {
            // ctx: Hook上下文
            // filter: 查询条件
            
            // 可以阻止删除
            const user = await model.findOne(filter);
            if (user.role === 'admin') {
                throw new Error('不能删除管理员账户');
            }
            
            // 可以修改 filter（可选）
            return filter;
        },
        
        // 删除后执行
        after: async (ctx, result) => {
            // ctx: Hook上下文
            // result: delete操作的返回结果
            
            // 级联删除
            await Post.deleteMany({ userId: filter._id });
            
            return result;
        }
    }
})
```

### find hooks (查询钩子)

在所有查询方法时触发（`find` / `findOne` / `findByIds` / `findPage` 等）。

```javascript
hooks: (model) => ({
    find: {
        // 查询前执行
        before: async (ctx, filter) => {
            // ctx: Hook上下文
            // filter: 查询条件
            
            // 可以修改查询条件（如添加租户过滤）
            if (!filter.tenantId && ctx.tenantId) {
                filter.tenantId = ctx.tenantId;
            }
            
            return filter;
        },
        
        // 查询后执行
        after: async (ctx, result) => {
            // ctx: Hook上下文
            // result: 查询结果（可能是数组或单个对象）
            
            // 可以修改结果（如数据脱敏）
            if (Array.isArray(result)) {
                result.forEach(doc => {
                    if (doc.password) delete doc.password;
                });
            } else if (result) {
                if (result.password) delete result.password;
            }
            
            return result;
        }
    }
})
```

---

## 🎯 Hook 上下文 (HookContext)

每个 hook 都会收到一个上下文对象：

```typescript
interface HookContext {
    operation: 'insert' | 'update' | 'delete' | 'find';
    method: string;           // 'insertOne', 'updateMany', 'find', etc.
    collectionName: string;   // 集合名称
    startTime: number;        // 操作开始时间戳
    [key: string]: any;       // 其他自定义数据
}
```

**使用示例**:

```javascript
hooks: (model) => ({
    insert: {
        before: async (ctx, docs) => {
            console.log(`操作类型: ${ctx.operation}`);  // 'insert'
            console.log(`方法名: ${ctx.method}`);        // 'insertOne'
            console.log(`集合: ${ctx.collectionName}`);  // 'users'
        }
    }
})
```

---

## 💡 使用场景

### 场景1: 密码加密

```javascript
const bcrypt = require('bcrypt');

Model.define('users', {
    schema: (dsl) => dsl({
        username: 'string!',
        email: 'email!',
        password: 'string!'
    }),
    hooks: (model) => ({
        insert: {
            before: async (ctx, docs) => {
                // 插入前加密密码
                const encryptPassword = async (doc) => {
                    if (doc.password) {
                        doc.password = await bcrypt.hash(doc.password, 10);
                    }
                };
                
                if (Array.isArray(docs)) {
                    for (const doc of docs) {
                        await encryptPassword(doc);
                    }
                } else {
                    await encryptPassword(docs);
                }
                
                return docs;
            }
        },
        update: {
            before: async (ctx, filter, update) => {
                // 更新密码时也加密
                if (update.$set && update.$set.password) {
                    update.$set.password = await bcrypt.hash(update.$set.password, 10);
                }
                return [filter, update];
            }
        }
    })
});

// 使用
await User.insertOne({
    username: 'john',
    email: 'john@example.com',
    password: 'secret123'  // 会被自动加密
});
```

### 场景2: 审计日志

```javascript
Model.define('users', {
    schema: (dsl) => dsl({ username: 'string!' }),
    hooks: (model) => ({
        insert: {
            after: async (ctx, result) => {
                await AuditLog.insertOne({
                    operation: 'insert',
                    collection: 'users',
                    documentId: result.insertedId,
                    timestamp: new Date(),
                    user: ctx.currentUser
                });
            }
        },
        update: {
            after: async (ctx, result) => {
                await AuditLog.insertOne({
                    operation: 'update',
                    collection: 'users',
                    affectedCount: result.modifiedCount,
                    timestamp: new Date(),
                    user: ctx.currentUser
                });
            }
        },
        delete: {
            after: async (ctx, result) => {
                await AuditLog.insertOne({
                    operation: 'delete',
                    collection: 'users',
                    affectedCount: result.deletedCount,
                    timestamp: new Date(),
                    user: ctx.currentUser
                });
            }
        }
    })
});
```

### 场景3: 数据验证

```javascript
Model.define('orders', {
    schema: (dsl) => dsl({
        userId: 'objectId!',
        amount: 'number!',
        status: 'string!'
    }),
    hooks: (model) => ({
        insert: {
            before: async (ctx, docs) => {
                // 业务验证
                const doc = Array.isArray(docs) ? docs[0] : docs;
                
                if (doc.amount <= 0) {
                    throw new Error('订单金额必须大于0');
                }
                
                // 检查用户余额
                const user = await User.findOneById(doc.userId);
                if (user.balance < doc.amount) {
                    throw new Error('用户余额不足');
                }
                
                return docs;
            }
        },
        update: {
            before: async (ctx, filter, update) => {
                // 禁止修改已完成的订单
                const order = await model.findOne(filter);
                if (order.status === 'completed') {
                    throw new Error('已完成的订单不能修改');
                }
                
                return [filter, update];
            }
        }
    })
});
```

### 场景4: 缓存失效

```javascript
Model.define('products', {
    schema: (dsl) => dsl({ name: 'string!', price: 'number!' }),
    hooks: (model) => ({
        update: {
            after: async (ctx, result) => {
                // 更新后清除缓存
                await cache.del('products:list');
                await cache.del(`products:${filter._id}`);
            }
        },
        delete: {
            after: async (ctx, result) => {
                // 删除后清除缓存
                await cache.del('products:list');
            }
        }
    })
});
```

### 场景5: 级联删除

```javascript
Model.define('users', {
    schema: (dsl) => dsl({ username: 'string!' }),
    hooks: (model) => ({
        delete: {
            before: async (ctx, filter) => {
                // 删除前检查
                const user = await model.findOne(filter);
                if (!user) {
                    throw new Error('用户不存在');
                }
            },
            after: async (ctx, result) => {
                // 删除后级联删除关联数据
                await Post.deleteMany({ userId: filter._id });
                await Comment.deleteMany({ userId: filter._id });
                await Profile.deleteOne({ userId: filter._id });
                
                console.log(`用户 ${filter._id} 及其关联数据已删除`);
            }
        }
    })
});
```

### 场景6: 自动填充字段

```javascript
Model.define('posts', {
    schema: (dsl) => dsl({
        title: 'string!',
        content: 'string!',
        slug: 'string'
    }),
    hooks: (model) => ({
        insert: {
            before: async (ctx, docs) => {
                // 自动生成 slug
                const generateSlug = (doc) => {
                    if (!doc.slug && doc.title) {
                        doc.slug = doc.title
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, '-')
                            .replace(/^-|-$/g, '');
                    }
                };
                
                if (Array.isArray(docs)) {
                    docs.forEach(generateSlug);
                } else {
                    generateSlug(docs);
                }
                
                return docs;
            }
        }
    })
});
```

---

## 🎨 修改数据

### before hook 修改输入

**insert before**:
```javascript
before: async (ctx, docs) => {
    // 修改单个文档
    if (!Array.isArray(docs)) {
        docs.status = 'active';
        return docs;  // 返回修改后的文档
    }
    
    // 修改文档数组
    docs.forEach(doc => {
        doc.status = 'active';
    });
    return docs;  // 返回修改后的数组
}
```

**update before**:
```javascript
before: async (ctx, filter, update) => {
    // 修改 filter
    filter.deletedAt = null;
    
    // 修改 update
    if (!update.$set) update.$set = {};
    update.$set.updatedAt = new Date();
    
    // 返回修改后的参数
    return [filter, update];
}
```

**delete/find before**:
```javascript
before: async (ctx, filter) => {
    // 修改查询条件
    filter.tenantId = ctx.tenantId;
    
    return filter;  // 返回修改后的 filter
}
```

### after hook 修改输出

```javascript
after: async (ctx, result) => {
    // 修改返回结果
    if (Array.isArray(result)) {
        result.forEach(doc => {
            doc.computed = doc.field1 + doc.field2;
        });
    } else if (result) {
        result.computed = result.field1 + result.field2;
    }
    
    return result;  // 返回修改后的结果
}
```

---

## ⚡ 异步支持

所有 hooks 完全支持 async/await：

```javascript
hooks: (model) => ({
    insert: {
        before: async (ctx, docs) => {
            // ✅ 可以使用 await
            const user = await UserService.validate(docs);
            
            // ✅ 可以并行执行多个异步操作
            await Promise.all([
                checkDuplicate(docs.email),
                validateUsername(docs.username),
                sendNotification(docs)
            ]);
            
            return docs;
        }
    }
})
```

---

## 🚨 错误处理

### 阻止操作

在 before hook 中抛出错误会**阻止操作执行**：

```javascript
hooks: (model) => ({
    delete: {
        before: async (ctx, filter) => {
            const user = await model.findOne(filter);
            
            // 抛出错误，阻止删除
            if (user.role === 'admin') {
                throw new Error('不能删除管理员账户');
            }
            
            // 如果没有抛出错误，继续执行删除
        }
    }
})
```

### 错误传播

```javascript
hooks: (model) => ({
    insert: {
        before: async (ctx, docs) => {
            try {
                await validateUser(docs);
            } catch (err) {
                // 重新抛出错误
                throw new Error(`用户验证失败: ${err.message}`);
            }
        },
        after: async (ctx, result) => {
            try {
                await notifyService.send(result.insertedId);
            } catch (err) {
                // after hook 的错误不会回滚操作
                // 但会被记录
                console.error('通知发送失败:', err);
            }
        }
    }
})
```

---

## 🔄 执行顺序

### 单个 hook 的执行顺序

```text
1. before hook 执行
   ↓
2. 数据库操作执行
   ↓
3. after hook 执行
```

### 与 Timestamps 的执行顺序

```javascript
Model.define('users', {
    schema: (dsl) => dsl({ username: 'string!' }),
    hooks: (model) => ({
        insert: {
            before: async (ctx, docs) => {
                console.log('1. before hook');
                return docs;
            },
            after: async (ctx, result) => {
                console.log('3. after hook');
            }
        }
    }),
    options: {
        timestamps: true  // 自动添加 createdAt/updatedAt
    }
});

// 执行顺序：
// 1. before hook
// 2. timestamps 处理（添加 createdAt/updatedAt）
// 3. 数据库 insert 操作
// 4. after hook
```

### 多个操作的顺序

```javascript
// insertMany 时，hooks 对每个文档都会执行
const result = await User.insertMany([
    { username: 'user1' },
    { username: 'user2' }
]);

// 执行顺序：
// 1. before hook (处理整个数组)
// 2. insertMany 操作
// 3. after hook
```

---

## 📊 性能考虑

### 1. 避免在 hook 中执行慢查询

```javascript
// ❌ 不好：在 hook 中执行复杂查询
hooks: (model) => ({
    insert: {
        before: async (ctx, docs) => {
            // 每次插入都执行复杂查询
            const relatedData = await ComplexModel.aggregate([...]);
            // ...
        }
    }
})

// ✅ 好：使用缓存或简化查询
hooks: (model) => ({
    insert: {
        before: async (ctx, docs) => {
            // 使用缓存
            const relatedData = await cache.get('key') || await fetchData();
            // ...
        }
    }
})
```

### 2. 批量操作时优化 hook

```javascript
// ✅ 好：批量处理
hooks: (model) => ({
    insert: {
        before: async (ctx, docs) => {
            if (Array.isArray(docs)) {
                // 批量处理，而不是循环
                const userIds = docs.map(d => d.userId);
                const users = await User.findByIds(userIds);
                // ...
            }
        }
    }
})
```

### 3. after hook 不影响响应速度

```javascript
// ✅ 好：after hook 中的慢操作不影响用户响应
hooks: (model) => ({
    insert: {
        after: async (ctx, result) => {
            // 发送邮件（异步，不阻塞）
            sendEmail(result.insertedId).catch(err => {
                console.error('邮件发送失败:', err);
            });
        }
    }
})
```

---

## 🆚 与 Mongoose 对比

### API 对比

| 特性 | Mongoose | monSQLize | 说明 |
|------|----------|-----------|------|
| **Hook类型** | pre/post | before/after | 语义更清晰 |
| **操作类型** | save/remove/find | insert/update/delete/find | 更细粒度 |
| **修改数据** | ✅ | ✅ | 同等支持 |
| **异步支持** | ✅ | ✅ | 同等支持 |
| **错误处理** | ✅ | ✅ | 同等支持 |
| **上下文传递** | ⚠️ 有限 | ✅ 丰富 | monSQLize更强 |

### 代码对比

**Mongoose**:
```javascript
userSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    next();
});

userSchema.post('save', async function(doc) {
    await sendWelcomeEmail(doc._id);
});
```

**monSQLize**:
```javascript
Model.define('users', {
    hooks: (model) => ({
        insert: {
            before: async (ctx, docs) => {
                if (docs.password) {
                    docs.password = await bcrypt.hash(docs.password, 10);
                }
                return docs;
            },
            after: async (ctx, result) => {
                await sendWelcomeEmail(result.insertedId);
            }
        }
    })
});
```

---

## ❓ 常见问题

### Q1: hook 能不能阻止操作？

**A**: ✅ 可以，在 before hook 中抛出错误即可。

```javascript
before: async (ctx, filter) => {
    if (someCondition) {
        throw new Error('操作被拒绝');
    }
}
```

### Q2: hook 能不能修改结果？

**A**: ✅ 可以，返回修改后的结果。

```javascript
after: async (ctx, result) => {
    result.computed = result.a + result.b;
    return result;
}
```

### Q3: hook 会不会影响性能？

**A**: 取决于 hook 的实现。

- ✅ **before hook**: 会阻塞操作，需要优化
- ✅ **after hook**: 操作已完成，不影响响应速度
- ⚠️ **复杂查询**: 避免在 hook 中执行慢查询

### Q4: insert/update/delete 会触发 find hook 吗？

**A**: ❌ 不会。hooks 只触发对应的操作类型。

```javascript
await User.insertOne({ ... });  // 只触发 insert hooks
await User.updateOne({ ... });  // 只触发 update hooks
await User.deleteOne({ ... });  // 只触发 delete hooks
await User.find({ ... });       // 只触发 find hooks
```

### Q5: before hook 修改了文档，原始文档还能访问吗？

**A**: ❌ 不能，文档会被修改。如需保留原始数据：

```javascript
before: async (ctx, docs) => {
    ctx.original = JSON.parse(JSON.stringify(docs));  // 保存副本
    docs.modified = true;
    return docs;
}
```

### Q6: 能不能在 hook 中调用同一个 Model 的方法？

**A**: ✅ 可以，但要注意避免无限循环。

```javascript
hooks: (model) => ({
    insert: {
        after: async (ctx, result) => {
            // ✅ 可以调用其他方法
            await model.updateOne(
                { _id: result.insertedId },
                { $set: { initialized: true } }
            );  // 会触发 update hook
        }
    }
})
```

---

## 📝 完整示例

### 博客系统 Hooks

```javascript
const bcrypt = require('bcrypt');
import { Model } from 'monsqlize';

// 用户 Model
Model.define('users', {
    schema: (dsl) => dsl({
        username: 'string:3-32!',
        email: 'email!',
        password: 'string!',
        role: 'string'
    }),
    hooks: (model) => ({
        insert: {
            before: async (ctx, docs) => {
                // 密码加密
                if (docs.password) {
                    docs.password = await bcrypt.hash(docs.password, 10);
                }
                
                // 设置默认角色
                if (!docs.role) {
                    docs.role = 'user';
                }
                
                // 检查用户名重复
                const existing = await model.findOne({ username: docs.username });
                if (existing) {
                    throw new Error('用户名已存在');
                }
                
                return docs;
            },
            after: async (ctx, result) => {
                // 创建用户资料
                await Profile.insertOne({
                    userId: result.insertedId,
                    createdAt: new Date()
                });
                
                // 发送欢迎邮件
                await sendWelcomeEmail(docs.email);
                
                // 审计日志
                console.log(`新用户注册: ${docs.username}`);
            }
        },
        update: {
            before: async (ctx, filter, update) => {
                // 如果更新密码，加密
                if (update.$set && update.$set.password) {
                    update.$set.password = await bcrypt.hash(update.$set.password, 10);
                }
                
                // 添加更新时间
                if (!update.$set) update.$set = {};
                update.$set.lastModified = new Date();
                
                return [filter, update];
            },
            after: async (ctx, result) => {
                // 清除缓存
                await cache.del('users:list');
                
                console.log(`用户信息已更新: ${result.modifiedCount} 条`);
            }
        },
        delete: {
            before: async (ctx, filter) => {
                // 禁止删除管理员
                const user = await model.findOne(filter);
                if (user.role === 'admin') {
                    throw new Error('不能删除管理员账户');
                }
            },
            after: async (ctx, result) => {
                // 级联删除
                await Post.deleteMany({ userId: filter._id });
                await Comment.deleteMany({ userId: filter._id });
                await Profile.deleteOne({ userId: filter._id });
                
                console.log(`用户及关联数据已删除: ${filter._id}`);
            }
        },
        find: {
            after: async (ctx, result) => {
                // 数据脱敏
                const mask = (doc) => {
                    if (doc.password) delete doc.password;
                    if (doc.email) doc.email = doc.email.replace(/(.{3}).*(@.*)/, '$1****$2');
                };
                
                if (Array.isArray(result)) {
                    result.forEach(mask);
                } else if (result) {
                    mask(result);
                }
                
                return result;
            }
        }
    })
});

// 文章 Model
Model.define('posts', {
    schema: (dsl) => dsl({
        title: 'string!',
        content: 'string!',
        authorId: 'objectId!',
        status: 'string'
    }),
    hooks: (model) => ({
        insert: {
            before: async (ctx, docs) => {
                // 设置默认状态
                if (!docs.status) {
                    docs.status = 'draft';
                }
                
                // 生成 slug
                if (!docs.slug && docs.title) {
                    docs.slug = docs.title
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-');
                }
                
                return docs;
            },
            after: async (ctx, result) => {
                // 增加用户文章计数
                await User.updateOne(
                    { _id: docs.authorId },
                    { $inc: { postCount: 1 } }
                );
            }
        },
        update: {
            before: async (ctx, filter, update) => {
                // 如果发布文章，设置发布时间
                if (update.$set && update.$set.status === 'published') {
                    if (!update.$set.publishedAt) {
                        update.$set.publishedAt = new Date();
                    }
                }
                
                return [filter, update];
            },
            after: async (ctx, result) => {
                // 清除缓存
                await cache.del('posts:list');
            }
        },
        delete: {
            after: async (ctx, result) => {
                // 删除关联评论
                await Comment.deleteMany({ postId: filter._id });
                
                // 减少用户文章计数
                const post = await model.findOne(filter);
                if (post) {
                    await User.updateOne(
                        { _id: post.authorId },
                        { $inc: { postCount: -1 } }
                    );
                }
            }
        }
    })
});
```

---

## 🔗 相关文档

- [Model API](./model.md) - Model 层完整文档
- [Validation API](./validation.md) - Schema 验证
- [Populate API](./populate.md) - 关联查询

---

## 📌 最佳实践

### 1. Hook 职责单一

```javascript
// ❌ 不好：一个 hook 做太多事
before: async (ctx, docs) => {
    await validateUser(docs);
    await checkDuplicate(docs);
    docs.password = await encrypt(docs.password);
    await sendNotification(docs);
    await updateStats(docs);
    // ...太多职责
}

// ✅ 好：拆分成多个独立函数
before: async (ctx, docs) => {
    await validate(docs);
    await encryptPassword(docs);
    return docs;
},
after: async (ctx, result) => {
    await sendNotification(result);
    await updateStats(result);
}
```

### 2. 避免副作用

```javascript
// ❌ 不好：修改全局状态
let globalCounter = 0;
before: async (ctx, docs) => {
    globalCounter++;  // 副作用
}

// ✅ 好：使用数据库或缓存
before: async (ctx, docs) => {
    await Counter.incrementOne({ name: 'users' }, 'count');
}
```

### 3. 完善错误处理

```javascript
// ✅ 好：完善的错误处理
before: async (ctx, docs) => {
    try {
        await validate(docs);
    } catch (err) {
        throw new Error(`验证失败: ${err.message}`);
    }
},
after: async (ctx, result) => {
    try {
        await sendEmail(result.insertedId);
    } catch (err) {
        // after hook 的错误不应该影响操作
        console.error('邮件发送失败:', err);
    }
}
```

---

**文档版本**: v1.0.6  
**最后更新**: 2026-01-08  
**维护者**: monSQLize Team


