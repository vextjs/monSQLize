# Hooks API - life cycle hooks

**Version**: v1.0.6+
**Function**: Model layer life cycle hook, execute custom logic before and after data operation

---

## 📖 Overview

Hooks provides a life cycle hook mechanism, allowing you to execute custom logic before and after database operations to implement functions such as password encryption, audit logs, data verification, and cache invalidation.


## Core Features

- ✅ **4 types of hooks** - insert/update/delete/find
- ✅ **before/after** - Supported before and after operation
- ✅ **Data Modification** - Input parameters and return results can be modified
- ✅ **Async Support** - Full support for async/await
- ✅ **ERROR HANDLING** - Errors thrown in hooks block operations
- ✅ **Context Delivery** - Provides rich contextual information

---

## 🚀 Quick Start


## Basic definition

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
                //Before inserting: encrypt password
                if (docs.password) {
                    docs.password = await bcrypt.hash(docs.password, 10);
                }
                return docs;
            },
            after: async (ctx, result) => {
                //After insert: log
                console.log(`New user registration: ${docs.username}`);
            }
        }
    })
});
```

---

## 📚Supported hooks


## insert hooks (insert hook)

Triggered when `insertOne` / `insertMany` / `insertBatch`.

```javascript
hooks: (model) => ({
    insert: {
        //Execute before inserting
        before: async (ctx, docs) => {
            //ctx: Hook context
            //docs: Documents to insert (single object or array)

            //Documents can be modified
            if (Array.isArray(docs)) {
                docs.forEach(doc => {
                    doc.createdBy = ctx.userId;
                });
            } else {
                docs.createdBy = ctx.userId;
            }

            //Return modified document (optional)
            return docs;
        },

        //Execute after inserting
        after: async (ctx, result) => {
            //ctx: Hook context
            //result: return result of insertOne/insertMany

            //Can perform subsequent actions (such as sending notifications)
            await notifyService.sendWelcomeEmail(result.insertedId);

            //Return results can be modified (optional)
            return result;
        }
    }
})
```


## update hooks (update hooks)

Triggered when `updateOne` / `updateMany` / `updateBatch` / `findOneAndUpdate`.

```javascript
hooks: (model) => ({
    update: {
        //Execute before update
        before: async (ctx, filter, update) => {
            //ctx: Hook context
            //filter: query conditions
            //update: update operation

            //Update operations can be modified
            if (!update.$set) update.$set = {};
            update.$set.updatedAt = new Date();

            //Return modified parameters (optional)
            return [filter, update];
        },

        //Execute after update
        after: async (ctx, result) => {
            //ctx: Hook context
            //result: the return result of the update operation

            //clear cache
            await cache.invalidate('users', filter);

            return result;
        }
    }
})
```


## delete hooks (delete hooks)

Triggered when `deleteOne` / `deleteMany` / `deleteBatch` / `findOneAndDelete`.

```javascript
hooks: (model) => ({
    delete: {
        //Execute before deletion
        before: async (ctx, filter) => {
            //ctx: Hook context
            //filter: query conditions

            //Can prevent deletion
            const user = await model.findOne(filter);
            if (user.role === 'admin') {
                throw new Error('Cannot delete administrator account');
            }

            //Filter can be modified (optional)
            return filter;
        },

        //Execute after deletion
        after: async (ctx, result) => {
            //ctx: Hook context
            //result: the return result of delete operation

            //Cascade delete
            await Post.deleteMany({ userId: filter._id });

            return result;
        }
    }
})
```


## find hooks (query hook)

Triggered when all query methods (`find` / `findOne` / `findByIds` / `findPage`, etc.).

```javascript
hooks: (model) => ({
    find: {
        //Execute before query
        before: async (ctx, filter) => {
            //ctx: Hook context
            //filter: query conditions

            //Query conditions can be modified (such as adding tenant filtering)
            if (!filter.tenantId && ctx.tenantId) {
                filter.tenantId = ctx.tenantId;
            }

            return filter;
        },

        //Execute after query
        after: async (ctx, result) => {
            //ctx: Hook context
            //result: query result (may be an array or a single object)

            //Results can be modified (e.g. data desensitization)
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

## 🎯 Hook context (HookContext)

Each hook receives a context object:

```typescript
interface HookContext {
    operation: 'insert' | 'update' | 'delete' | 'find';
    method: string;           // 'insertOne', 'updateMany', 'find', etc.
    collectionName: string;   //Collection name
    startTime: number;        //Operation start timestamp
    [key: string]: any;       //Other custom data
}
```

**Usage Example**:

```javascript
hooks: (model) => ({
    insert: {
        before: async (ctx, docs) => {
            console.log(`Operation type: ${ctx.operation}`);  // 'insert'
            console.log(`Method name: ${ctx.method}`);        // 'insertOne'
            console.log(`Collection: ${ctx.collectionName}`);  // 'users'
        }
    }
})
```

---

## 💡 Usage scenarios


## Scenario 1: Password encryption

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
                //Encrypt password before inserting
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
                //Also encrypt when updating password
                if (update.$set && update.$set.password) {
                    update.$set.password = await bcrypt.hash(update.$set.password, 10);
                }
                return [filter, update];
            }
        }
    })
});

//use
await User.insertOne({
    username: 'john',
    email: 'john@example.com',
    password: 'secret123'  //will be automatically encrypted
});
```


## Scenario 2: Audit log

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


## Scenario 3: Data verification

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
                //Business verification
                const doc = Array.isArray(docs) ? docs[0] : docs;

                if (doc.amount <= 0) {
                    throw new Error('Order amount must be greater than 0');
                }

                //Check user balance
                const user = await User.findOneById(doc.userId);
                if (user.balance < doc.amount) {
                    throw new Error('Insufficient user balance');
                }

                return docs;
            }
        },
        update: {
            before: async (ctx, filter, update) => {
                //Modification of completed orders is prohibited
                const order = await model.findOne(filter);
                if (order.status === 'completed') {
                    throw new Error('Completed orders cannot be modified');
                }

                return [filter, update];
            }
        }
    })
});
```


## Scenario 4: Cache invalidation

```javascript
Model.define('products', {
    schema: (dsl) => dsl({ name: 'string!', price: 'number!' }),
    hooks: (model) => ({
        update: {
            after: async (ctx, result) => {
                //Clear cache after update
                await cache.del('products:list');
                await cache.del(`products:${filter._id}`);
            }
        },
        delete: {
            after: async (ctx, result) => {
                //Clear cache after deletion
                await cache.del('products:list');
            }
        }
    })
});
```


## Scenario 5: Cascade deletion

```javascript
Model.define('users', {
    schema: (dsl) => dsl({ username: 'string!' }),
    hooks: (model) => ({
        delete: {
            before: async (ctx, filter) => {
                //Check before deletion
                const user = await model.findOne(filter);
                if (!user) {
                    throw new Error('User does not exist');
                }
            },
            after: async (ctx, result) => {
                //Cascade deletion of associated data after deletion
                await Post.deleteMany({ userId: filter._id });
                await Comment.deleteMany({ userId: filter._id });
                await Profile.deleteOne({ userId: filter._id });

                console.log(`User ${filter._id} and its associated data were deleted`);
            }
        }
    })
});
```


## Scenario 6: Autofill fields

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
                //Automatically generate slugs
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

## 🎨 Modify data


## before hook modify input

**insert before**:
```javascript
before: async (ctx, docs) => {
    //Modify a single document
    if (!Array.isArray(docs)) {
        docs.status = 'active';
        return docs;  //Return the modified document
    }

    //Modify document array
    docs.forEach(doc => {
        doc.status = 'active';
    });
    return docs;  //Return the modified array
}
```

**update before**:
```javascript
before: async (ctx, filter, update) => {
    //Modify filter
    filter.deletedAt = null;

    //Modify update
    if (!update.$set) update.$set = {};
    update.$set.updatedAt = new Date();

    //Return the modified parameters
    return [filter, update];
}
```

**delete/find before**:
```javascript
before: async (ctx, filter) => {
    //Modify query conditions
    filter.tenantId = ctx.tenantId;

    return filter;  //Return the modified filter
}
```


## after hook Modify output

```javascript
after: async (ctx, result) => {
    //Modify return results
    if (Array.isArray(result)) {
        result.forEach(doc => {
            doc.computed = doc.field1 + doc.field2;
        });
    } else if (result) {
        result.computed = result.field1 + result.field2;
    }

    return result;  //Return modified results
}
```

---

## ⚡ Asynchronous support

All hooks fully support async/await:

```javascript
hooks: (model) => ({
    insert: {
        before: async (ctx, docs) => {
            //✅ You can use await
            const user = await UserService.validate(docs);

            //✅ Multiple asynchronous operations can be executed in parallel
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

## 🚨 Error handling


## Block operation

Throwing an error in a before hook will prevent the operation from executing:

```javascript
hooks: (model) => ({
    delete: {
        before: async (ctx, filter) => {
            const user = await model.findOne(filter);

            //Throw an error, preventing deletion
            if (user.role === 'admin') {
                throw new Error('Cannot delete administrator account');
            }

            //If no error is thrown, proceed with the delete
        }
    }
})
```


## Error propagation

```javascript
hooks: (model) => ({
    insert: {
        before: async (ctx, docs) => {
            try {
                await validateUser(docs);
            } catch (err) {
                //rethrow error
                throw new Error(`User authentication failed: ${err.message}`);
            }
        },
        after: async (ctx, result) => {
            try {
                await notifyService.send(result.insertedId);
            } catch (err) {
                //Errors in after hook will not roll back the operation
                //but will be recorded
                console.error('Notification delivery failed:', err);
            }
        }
    }
})
```

---

## 🔄 Execution order


## Execution order of single hook

```text
1. before hook execution
   ↓
2. Database operation execution
   ↓
3. after hook execution
```


## Execution order with Timestamps

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
        timestamps: true  //Automatically add createdAt/updatedAt
    }
});

//Execution order:
// 1. before hook
//2. timestamps processing (add createdAt/updatedAt)
//3. Database insert operation
// 4. after hook
```


## Sequence of multiple operations

```javascript
//When insertMany, hooks will be executed for each document
const result = await User.insertMany([
    { username: 'user1' },
    { username: 'user2' }
]);

//Execution order:
//1. before hook (process the entire array)
//2. insertMany operation
// 3. after hook
```

---

## 📊 Performance considerations


## 1. Avoid executing slow queries in hooks

```javascript
//❌ Bad: Executing complex queries in hooks
hooks: (model) => ({
    insert: {
        before: async (ctx, docs) => {
            //Execute complex query for every insert
            const relatedData = await ComplexModel.aggregate([...]);
            // ...
        }
    }
})

//✅ Good: Use caching or simplify queries
hooks: (model) => ({
    insert: {
        before: async (ctx, docs) => {
            //Use caching
            const relatedData = await cache.get('key') || await fetchData();
            // ...
        }
    }
})
```


## 2. Optimize hooks during batch operations

```javascript
//✅ Good: Batch processing
hooks: (model) => ({
    insert: {
        before: async (ctx, docs) => {
            if (Array.isArray(docs)) {
                //Process in batches, not loops
                const userIds = docs.map(d => d.userId);
                const users = await User.findByIds(userIds);
                // ...
            }
        }
    }
})
```


## 3. after hook does not affect response speed

```javascript
//✅ Good: Slow operations in after hook do not affect user response
hooks: (model) => ({
    insert: {
        after: async (ctx, result) => {
            //Send email (asynchronous, non-blocking)
            sendEmail(result.insertedId).catch(err => {
                console.error('Email sending failed:', err);
            });
        }
    }
})
```

---

## 🆚Comparison with Mongoose


## API comparison

| Features | Mongoose | monSQLize | Description |
|------|----------|-----------|------|
| **Hook type** | pre/post | before/after | clearer semantics |
| **Operation type** | save/remove/find | insert/update/delete/find | More fine-grained |
| **Modify data** | ✅ | ✅ | Equal support |
| **Asynchronous support** | ✅ | ✅ | Equal support |
| **Error Handling** | ✅ | ✅ | Equal Support |
| **Context Passing** | ⚠️ Limited | ✅ Rich | monSQLize is stronger |


## Code comparison

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

## ❓ FAQ


## Q1: Can hooks prevent operations?

**A**: ✅ Yes, just throw an error in the before hook.

```javascript
before: async (ctx, filter) => {
    if (someCondition) {
        throw new Error('Operation denied');
    }
}
```


## Q2: Can hook modify the result?

**A**: ✅ Yes, the modified results will be returned.

```javascript
after: async (ctx, result) => {
    result.computed = result.a + result.b;
    return result;
}
```


## Q3: Will hooks affect performance?

**A**: Depends on hook implementation.

- ✅ **before hook**: will block operations and needs to be optimized
- ✅ **after hook**: The operation has been completed and does not affect the response speed
- ⚠️ **Complex Query**: Avoid executing slow queries in hooks


## Q4: Will insert/update/delete trigger find hook?

**A**: ❌ No. Hooks only trigger corresponding operation types.

```javascript
await User.insertOne({ ... });  //Only trigger insert hooks
await User.updateOne({ ... });  //Only trigger update hooks
await User.deleteOne({ ... });  //Only trigger delete hooks
await User.find({ ... });       //Only trigger find hooks
```


## Q5: If the document is modified by before hook, can the original document still be accessed?

**A**: ❌ No, the document will be modified. To keep the original data:

```javascript
before: async (ctx, docs) => {
    ctx.original = JSON.parse(JSON.stringify(docs));  //Save a copy
    docs.modified = true;
    return docs;
}
```


## Q6: Can the method of the same Model be called in a hook?

**A**: ✅ Yes, but be careful to avoid infinite loops.

```javascript
hooks: (model) => ({
    insert: {
        after: async (ctx, result) => {
            //✅ Other methods can be called
            await model.updateOne(
                { _id: result.insertedId },
                { $set: { initialized: true } }
            );  //Will trigger update hook
        }
    }
})
```

---

## 📝 Complete example


## Blog System Hooks

```javascript
const bcrypt = require('bcrypt');
import { Model } from 'monsqlize';

//User Model
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
                //Password encryption
                if (docs.password) {
                    docs.password = await bcrypt.hash(docs.password, 10);
                }

                //Set default role
                if (!docs.role) {
                    docs.role = 'user';
                }

                //Check for duplicate usernames
                const existing = await model.findOne({ username: docs.username });
                if (existing) {
                    throw new Error('Username already exists');
                }

                return docs;
            },
            after: async (ctx, result) => {
                //Create user profile
                await Profile.insertOne({
                    userId: result.insertedId,
                    createdAt: new Date()
                });

                //Send welcome email
                await sendWelcomeEmail(docs.email);

                //Audit log
                console.log(`New user registration: ${docs.username}`);
            }
        },
        update: {
            before: async (ctx, filter, update) => {
                //If password is updated, encrypt
                if (update.$set && update.$set.password) {
                    update.$set.password = await bcrypt.hash(update.$set.password, 10);
                }

                //Add update time
                if (!update.$set) update.$set = {};
                update.$set.lastModified = new Date();

                return [filter, update];
            },
            after: async (ctx, result) => {
                //clear cache
                await cache.del('users:list');

                console.log(`User information has been updated: ${result.modifiedCount} items`);
            }
        },
        delete: {
            before: async (ctx, filter) => {
                //Disable deletion of administrators
                const user = await model.findOne(filter);
                if (user.role === 'admin') {
                    throw new Error('Cannot delete administrator account');
                }
            },
            after: async (ctx, result) => {
                //Cascade delete
                await Post.deleteMany({ userId: filter._id });
                await Comment.deleteMany({ userId: filter._id });
                await Profile.deleteOne({ userId: filter._id });

                console.log(`User and associated data deleted: ${filter._id}`);
            }
        },
        find: {
            after: async (ctx, result) => {
                //Data desensitization
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

//Article Model
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
                //Set default state
                if (!docs.status) {
                    docs.status = 'draft';
                }

                //Generate slug
                if (!docs.slug && docs.title) {
                    docs.slug = docs.title
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-');
                }

                return docs;
            },
            after: async (ctx, result) => {
                //Increase user article count
                await User.updateOne(
                    { _id: docs.authorId },
                    { $inc: { postCount: 1 } }
                );
            }
        },
        update: {
            before: async (ctx, filter, update) => {
                //If publishing an article, set the publishing time
                if (update.$set && update.$set.status === 'published') {
                    if (!update.$set.publishedAt) {
                        update.$set.publishedAt = new Date();
                    }
                }

                return [filter, update];
            },
            after: async (ctx, result) => {
                //clear cache
                await cache.del('posts:list');
            }
        },
        delete: {
            after: async (ctx, result) => {
                //Delete associated comments
                await Comment.deleteMany({ postId: filter._id });

                //Reduce user post count
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

## 🔗 Related documents

- [Model API](./model.md) - Model layer complete documentation
- [Validation API](./validation.md) - Schema validation
- [Populate API](./populate.md) - Related query

---

## 📌 Best Practices


## 1. Hook has single responsibility

```javascript
//❌ Bad: One hook does too many things
before: async (ctx, docs) => {
    await validateUser(docs);
    await checkDuplicate(docs);
    docs.password = await encrypt(docs.password);
    await sendNotification(docs);
    await updateStats(docs);
    //...too many responsibilities
}

//✅ Good: Split into multiple independent functions
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


## 2. Avoid side effects

```javascript
//❌ Bad: Modify global state
let globalCounter = 0;
before: async (ctx, docs) => {
    globalCounter++;  //side effects
}

//✅ Good: Use database or cache
before: async (ctx, docs) => {
    await Counter.incrementOne({ name: 'users' }, 'count');
}
```


## 3. Improve error handling

```javascript
//✅ Good: perfect error handling
before: async (ctx, docs) => {
    try {
        await validate(docs);
    } catch (err) {
        throw new Error(`Authentication failed: ${err.message}`);
    }
},
after: async (ctx, result) => {
    try {
        await sendEmail(result.insertedId);
    } catch (err) {
        //Errors in after hook should not affect operation
        console.error('Email sending failed:', err);
    }
}
```

---

**Document version**: v1.0.6
**Last updated**: 2026-01-08
**Maintainer**: monSQLize Team

