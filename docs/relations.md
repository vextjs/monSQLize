# Relations API - 关系定义

**版本**: v1.0.6+  
**功能**: Model 层关系定义，支持 hasOne/hasMany/belongsTo

---

## 📖 概述

Relations 用于定义 Model 之间的关系，为 Populate 关联查询提供基础配置。

### 核心特性

- ✅ **hasOne** - 一对一关系（用户-资料）
- ✅ **hasMany** - 一对多关系（用户-文章）
- ✅ **belongsTo** - 多对一关系（文章-作者）
- ✅ **多对多** - 通过中间表实现
- ✅ **自引用** - 支持自关联（树形结构）
- ✅ **灵活配置** - 自定义字段映射

---

## 🚀 快速开始

### 基础定义

```javascript
const { Model } = require('monsqlize');

Model.define('users', {
    schema: (dsl) => dsl({ username: 'string!' }),
    relations: {
        // 关系名: 配置
        posts: {
            from: 'posts',          // 关联的集合
            localField: '_id',      // 本地字段
            foreignField: 'userId', // 外键字段
            single: false           // false = hasMany, true = hasOne
        }
    }
});
```

---

## 📚 关系类型

### hasOne (一对一)

一个文档对应另一个集合的**一个**文档。

**示例**: 用户-资料

```javascript
// User hasOne Profile
Model.define('users', {
    schema: (dsl) => dsl({ username: 'string!' }),
    relations: {
        profile: {
            from: 'profiles',
            localField: '_id',
            foreignField: 'userId',
            single: true  // 一对一
        }
    }
});

// 使用
const user = await User.findOne({ username: 'john' })
    .populate('profile');

console.log(user.profile);  // { userId: '...', bio: '...', avatar: '...' }
```

**数据结构**:
```
users collection:
{ _id: '1', username: 'john' }

profiles collection:
{ _id: 'p1', userId: '1', bio: 'Hello', avatar: 'avatar.jpg' }

populate 后:
{
  _id: '1',
  username: 'john',
  profile: { _id: 'p1', userId: '1', bio: 'Hello', avatar: 'avatar.jpg' }
}
```

### hasMany (一对多)

一个文档对应另一个集合的**多个**文档。

**示例**: 用户-文章

```javascript
// User hasMany Posts
Model.define('users', {
    schema: (dsl) => dsl({ username: 'string!' }),
    relations: {
        posts: {
            from: 'posts',
            localField: '_id',
            foreignField: 'userId',
            single: false  // 一对多
        }
    }
});

// 使用
const user = await User.findOne({ username: 'john' })
    .populate('posts');

console.log(user.posts);  // [{ title: '...', userId: '1' }, ...]
```

**数据结构**:
```
users collection:
{ _id: '1', username: 'john' }

posts collection:
{ _id: 'post1', userId: '1', title: 'Post 1' }
{ _id: 'post2', userId: '1', title: 'Post 2' }

populate 后:
{
  _id: '1',
  username: 'john',
  posts: [
    { _id: 'post1', userId: '1', title: 'Post 1' },
    { _id: 'post2', userId: '1', title: 'Post 2' }
  ]
}
```

### belongsTo (多对一)

多个文档对应另一个集合的**一个**文档（hasOne 的反向）。

**示例**: 文章-作者

```javascript
// Post belongsTo User
Model.define('posts', {
    schema: (dsl) => dsl({ title: 'string!' }),
    relations: {
        author: {
            from: 'users',
            localField: 'userId',  // 本地存储的外键
            foreignField: '_id',    // 关联集合的主键
            single: true            // belongsTo 本质也是 hasOne
        }
    }
});

// 使用
const post = await Post.findOne({ title: 'Hello World' })
    .populate('author');

console.log(post.author);  // { _id: '1', username: 'john' }
```

**数据结构**:
```
posts collection:
{ _id: 'post1', userId: '1', title: 'Hello World' }

users collection:
{ _id: '1', username: 'john' }

populate 后:
{
  _id: 'post1',
  userId: '1',
  title: 'Hello World',
  author: { _id: '1', username: 'john' }
}
```

---

## 🎯 配置选项

### RelationDefinition

| 选项 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `from` | String | ✅ | 关联的集合名称 |
| `localField` | String | ✅ | 本地字段（通常是 _id） |
| `foreignField` | String | ✅ | 外键字段 |
| `single` | Boolean | ✅ | true=hasOne, false=hasMany |
| `as` | String | ❌ | 关联结果的字段名（默认使用关系名） |

### 完整配置示例

```javascript
Model.define('users', {
    schema: (dsl) => dsl({ username: 'string!' }),
    relations: {
        // 完整配置
        posts: {
            from: 'posts',          // 必需：关联集合
            localField: '_id',      // 必需：本地字段
            foreignField: 'userId', // 必需：外键字段
            single: false,          // 必需：是否单条
            as: 'articles'          // 可选：结果字段名（默认'posts'）
        },
        
        // 最小配置
        profile: {
            from: 'profiles',
            localField: '_id',
            foreignField: 'userId',
            single: true
        }
    }
});

// 使用 as 选项
const user = await User.findOne().populate('posts');
console.log(user.articles);  // 使用 as 指定的名称
```

---

## 💡 使用场景

### 场景1: 用户-资料 (hasOne)

**需求**: 一个用户只有一份资料

```javascript
Model.define('users', {
    schema: (dsl) => dsl({
        username: 'string!',
        email: 'email!'
    }),
    relations: {
        profile: {
            from: 'profiles',
            localField: '_id',
            foreignField: 'userId',
            single: true
        }
    }
});

Model.define('profiles', {
    schema: (dsl) => dsl({
        userId: 'objectId!',
        bio: 'string',
        avatar: 'url',
        website: 'url'
    })
});

// 使用
const user = await User.findOne({ email: 'john@example.com' })
    .populate('profile');

console.log(`${user.username}: ${user.profile.bio}`);
```

### 场景2: 用户-文章 (hasMany)

**需求**: 一个用户可以发布多篇文章

```javascript
Model.define('users', {
    schema: (dsl) => dsl({ username: 'string!' }),
    relations: {
        posts: {
            from: 'posts',
            localField: '_id',
            foreignField: 'authorId',
            single: false
        }
    }
});

Model.define('posts', {
    schema: (dsl) => dsl({
        title: 'string!',
        content: 'string!',
        authorId: 'objectId!'
    })
});

// 使用
const users = await User.find()
    .populate('posts', { limit: 5 });

users.forEach(user => {
    console.log(`${user.username} 发布了 ${user.posts.length} 篇文章`);
});
```

### 场景3: 文章-作者 (belongsTo)

**需求**: 一篇文章属于一个作者

```javascript
Model.define('posts', {
    schema: (dsl) => dsl({ title: 'string!' }),
    relations: {
        author: {
            from: 'users',
            localField: 'authorId',
            foreignField: '_id',
            single: true
        }
    }
});

// 使用
const posts = await Post.find({ status: 'published' })
    .populate('author', { select: ['username', 'avatar'] });

posts.forEach(post => {
    console.log(`${post.title} - by ${post.author.username}`);
});
```

### 场景4: 多对多（学生-课程）

**需求**: 学生可以选修多门课程，课程也有多个学生

**方案**: 使用中间表

```javascript
// 1. 定义学生
Model.define('students', {
    schema: (dsl) => dsl({
        name: 'string!',
        studentNo: 'string!'
    }),
    relations: {
        enrollments: {
            from: 'student_course',
            localField: '_id',
            foreignField: 'studentId',
            single: false
        }
    }
});

// 2. 定义课程
Model.define('courses', {
    schema: (dsl) => dsl({
        name: 'string!',
        code: 'string!'
    }),
    relations: {
        enrollments: {
            from: 'student_course',
            localField: '_id',
            foreignField: 'courseId',
            single: false
        }
    }
});

// 3. 定义中间表
Model.define('student_course', {
    schema: (dsl) => dsl({
        studentId: 'objectId!',
        courseId: 'objectId!',
        enrolledAt: 'date'
    }),
    relations: {
        student: {
            from: 'students',
            localField: 'studentId',
            foreignField: '_id',
            single: true
        },
        course: {
            from: 'courses',
            localField: 'courseId',
            foreignField: '_id',
            single: true
        }
    }
});

// 使用
const students = await Student.find()
    .populate('enrollments');

for (const student of students) {
    console.log(`${student.name} 选修了 ${student.enrollments.length} 门课程:`);
    
    // 获取课程详情
    const courseIds = student.enrollments.map(e => e.courseId);
    const courses = await Course.findByIds(courseIds);
    
    courses.forEach(course => {
        console.log(`  - ${course.name}`);
    });
}

// 注：嵌套 populate 将在 v1.2.0 支持
// const students = await Student.find()
//     .populate('enrollments.course');
```

### 场景5: 自引用（树形结构）

**需求**: 评论回复评论（父子关系）

```javascript
Model.define('comments', {
    schema: (dsl) => dsl({
        content: 'string!',
        parentId: 'objectId'  // 父评论ID（null 表示顶级评论）
    }),
    relations: {
        // 子评论（回复）
        replies: {
            from: 'comments',
            localField: '_id',
            foreignField: 'parentId',
            single: false
        },
        // 父评论
        parent: {
            from: 'comments',
            localField: 'parentId',
            foreignField: '_id',
            single: true
        }
    }
});

// 使用
const topComments = await Comment.find({ parentId: null })
    .populate('replies', { limit: 10 });

topComments.forEach(comment => {
    console.log(`评论: ${comment.content}`);
    comment.replies.forEach(reply => {
        console.log(`  └─ 回复: ${reply.content}`);
    });
});
```

---

## 🎨 最佳实践

### 1. 关系命名

```javascript
// ✅ 好：使用复数表示 hasMany
relations: {
    posts: { ... },      // hasMany
    comments: { ... }    // hasMany
}

// ✅ 好：使用单数表示 hasOne/belongsTo
relations: {
    profile: { ... },    // hasOne
    author: { ... }      // belongsTo
}

// ❌ 不好：命名不清晰
relations: {
    postList: { ... },   // 应该用 posts
    userProfile: { ... } // 应该用 profile
}
```

### 2. 外键设计

```javascript
// ✅ 好：使用标准命名
{
    userId: ObjectId,     // 指向 users._id
    authorId: ObjectId,   // 指向 users._id
    postId: ObjectId      // 指向 posts._id
}

// ❌ 不好：命名不一致
{
    user: ObjectId,       // 应该用 userId
    author_id: ObjectId,  // 应该用 authorId
    post: ObjectId        // 应该用 postId
}
```

### 3. 性能考虑

```javascript
// ❌ 不好：过度 populate
const users = await User.find()
    .populate('posts')
    .populate('comments')
    .populate('likes')
    .populate('followers');  // 可能返回大量数据

// ✅ 好：按需 populate + 限制数量
const users = await User.find()
    .populate('posts', { limit: 5 });  // 只 populate 需要的
```

### 4. 索引优化

```javascript
// ✅ 好：为外键添加索引
Model.define('posts', {
    schema: (dsl) => dsl({
        title: 'string!',
        userId: 'objectId!'
    }),
    indexes: [
        { key: { userId: 1 } }  // 为外键添加索引，加速 populate
    ],
    relations: {
        author: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            single: true
        }
    }
});
```

---

## 🆚 与 SQL 对比

### SQL JOIN vs Populate

| 特性 | SQL JOIN | monSQLize Populate |
|------|----------|-------------------|
| **查询次数** | 1次（JOIN） | 2次（批量查询） |
| **性能** | 复杂JOIN慢 | 简单查询快 |
| **缓存** | 难缓存 | ✅ 易缓存 |
| **灵活性** | 受限于JOIN | ✅ 灵活 |
| **N+1问题** | 无 | ✅ 自动解决 |

### 示例对比

**SQL**:
```sql
-- 用户和文章
SELECT u.*, p.*
FROM users u
LEFT JOIN posts p ON u.id = p.user_id;

-- 复杂，难以缓存
```

**monSQLize**:
```javascript
// 用户和文章
const users = await User.find()
    .populate('posts');

// 简单，易缓存
// 第1次：SELECT * FROM users
// 第2次：SELECT * FROM posts WHERE userId IN [...]
```

---

## ❓ 常见问题

### Q1: 能不能多对多？

**A**: ✅ 可以，通过中间表实现。

```javascript
// 学生-课程多对多
Student → student_course ← Course
```

参见 [场景4: 多对多](#场景4-多对多学生-课程)

### Q2: 能不能自引用？

**A**: ✅ 可以，支持自关联。

```javascript
Model.define('comments', {
    relations: {
        replies: {
            from: 'comments',  // 指向自己
            localField: '_id',
            foreignField: 'parentId',
            single: false
        }
    }
});
```

参见 [场景5: 自引用](#场景5-自引用树形结构)

### Q3: 能不能条件过滤？

**A**: v1.0.6 不支持，v1.2.0 计划支持。

```javascript
// 当前方式（v1.0.6）
const users = await User.find().populate('posts');
users.forEach(user => {
    user.posts = user.posts.filter(p => p.status === 'published');
});

// 计划支持（v1.2.0）
const users = await User.find().populate('posts', {
    match: { status: 'published' }
});
```

### Q4: 能不能双向关系？

**A**: ✅ 可以，双向定义关系。

```javascript
// User hasMany Posts
Model.define('users', {
    relations: {
        posts: { from: 'posts', localField: '_id', foreignField: 'userId', single: false }
    }
});

// Post belongsTo User
Model.define('posts', {
    relations: {
        author: { from: 'users', localField: 'userId', foreignField: '_id', single: true }
    }
});

// 双向使用
const user = await User.findOne().populate('posts');
const post = await Post.findOne().populate('author');
```

### Q5: localField 和 foreignField 怎么确定？

**A**: 看箭头方向。

```javascript
// User (localField: _id) → Posts (foreignField: userId)
// 从 User 的 _id 指向 Posts 的 userId

Model.define('users', {
    relations: {
        posts: {
            from: 'posts',
            localField: '_id',      // User 的哪个字段
            foreignField: 'userId', // 对应 Posts 的哪个字段
            single: false
        }
    }
});
```

**记忆方法**:
- **localField**: 本地（自己集合）的字段
- **foreignField**: 外部（关联集合）的字段

### Q6: 能不能多个关系指向同一个集合？

**A**: ✅ 可以，使用不同的关系名。

```javascript
Model.define('posts', {
    schema: (dsl) => dsl({
        authorId: 'objectId!',
        reviewerId: 'objectId'
    }),
    relations: {
        author: {
            from: 'users',
            localField: 'authorId',
            foreignField: '_id',
            single: true
        },
        reviewer: {
            from: 'users',
            localField: 'reviewerId',
            foreignField: '_id',
            single: true
        }
    }
});

// 使用
const post = await Post.findOne()
    .populate('author')
    .populate('reviewer');

console.log(`作者: ${post.author.username}`);
console.log(`审核人: ${post.reviewer.username}`);
```

---

## 📝 完整示例

### 电商系统示例

```javascript
const { Model } = require('monsqlize');

// 1. 用户
Model.define('users', {
    schema: (dsl) => dsl({
        username: 'string!',
        email: 'email!'
    }),
    relations: {
        orders: {
            from: 'orders',
            localField: '_id',
            foreignField: 'userId',
            single: false
        },
        cart: {
            from: 'carts',
            localField: '_id',
            foreignField: 'userId',
            single: true
        }
    }
});

// 2. 商品
Model.define('products', {
    schema: (dsl) => dsl({
        name: 'string!',
        price: 'number!',
        categoryId: 'objectId!'
    }),
    relations: {
        category: {
            from: 'categories',
            localField: 'categoryId',
            foreignField: '_id',
            single: true
        },
        reviews: {
            from: 'reviews',
            localField: '_id',
            foreignField: 'productId',
            single: false
        }
    }
});

// 3. 订单
Model.define('orders', {
    schema: (dsl) => dsl({
        orderNo: 'string!',
        userId: 'objectId!',
        status: 'string!'
    }),
    relations: {
        user: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            single: true
        },
        items: {
            from: 'order_items',
            localField: '_id',
            foreignField: 'orderId',
            single: false
        }
    }
});

// 4. 订单项
Model.define('order_items', {
    schema: (dsl) => dsl({
        orderId: 'objectId!',
        productId: 'objectId!',
        quantity: 'number!',
        price: 'number!'
    }),
    relations: {
        product: {
            from: 'products',
            localField: 'productId',
            foreignField: '_id',
            single: true
        }
    }
});

// 5. 分类
Model.define('categories', {
    schema: (dsl) => dsl({
        name: 'string!',
        parentId: 'objectId'
    }),
    relations: {
        products: {
            from: 'products',
            localField: '_id',
            foreignField: 'categoryId',
            single: false
        },
        // 自引用：子分类
        children: {
            from: 'categories',
            localField: '_id',
            foreignField: 'parentId',
            single: false
        },
        // 自引用：父分类
        parent: {
            from: 'categories',
            localField: 'parentId',
            foreignField: '_id',
            single: true
        }
    }
});

// 使用示例

// 场景1: 获取用户订单详情
const user = await User.findOne({ username: 'john' })
    .populate('orders');

for (const order of user.orders) {
    const orderDetail = await Order.findOneById(order._id)
        .populate('items');
    
    console.log(`订单 ${orderDetail.orderNo}:`);
    for (const item of orderDetail.items) {
        const itemWithProduct = await OrderItem.findOneById(item._id)
            .populate('product');
        console.log(`  - ${itemWithProduct.product.name} x ${item.quantity}`);
    }
}

// 场景2: 获取商品及分类
const products = await Product.find({ cache: 60000 })
    .populate('category')
    .populate('reviews', { limit: 5 });

products.forEach(product => {
    console.log(`${product.name} - ${product.category.name}`);
    console.log(`  评价数: ${product.reviews.length}`);
});

// 场景3: 获取分类及其子分类
const category = await Category.findOne({ name: '电子产品' })
    .populate('children')
    .populate('products', { limit: 10 });

console.log(`${category.name}:`);
console.log(`  子分类: ${category.children.map(c => c.name).join(', ')}`);
console.log(`  商品数: ${category.products.length}`);
```

---

## 🔗 相关文档

- [Populate API](./populate.md) - 关联查询详解
- [Model API](./model.md) - Model 层完整文档
- [Schema API](./model.md#schema) - Schema 定义

---

## 📌 设计原则

### 1. 单向vs双向关系

```javascript
// 单向：只定义一侧
Model.define('users', {
    relations: { posts: { ... } }
});

// 双向：两侧都定义
Model.define('users', {
    relations: { posts: { ... } }
});
Model.define('posts', {
    relations: { author: { ... } }
});
```

**建议**: 按需定义，不是所有关系都需要双向。

### 2. 外键存储位置

```javascript
// ✅ 好：在"多"的一侧存储外键
// User hasMany Posts → Post 存储 userId
posts collection: { userId, title, content }

// ✅ 好：在"属于"的一侧存储外键
// Post belongsTo User → Post 存储 userId
posts collection: { userId, title, content }
```

### 3. 关系vs嵌入

| 场景 | 使用关系 | 使用嵌入 |
|------|---------|---------|
| 数据独立更新 | ✅ | ❌ |
| 数据共享使用 | ✅ | ❌ |
| 数据固定不变 | ❌ | ✅ |
| 数据量小 | ❌ | ✅ |

**示例**:
```javascript
// ✅ 使用关系：用户和文章（独立管理）
User → Posts

// ✅ 使用嵌入：订单和订单项（不单独查询）
Order { items: [ { productId, quantity }, ... ] }
```

---

**文档版本**: v1.0.6  
**最后更新**: 2026-01-08  
**维护者**: monSQLize Team


