# 深度 Populate（嵌套填充）功能文档

## 🎯 功能概述

深度 populate 允许你在填充关联数据时，进一步填充关联数据的关联数据，形成多层嵌套的数据结构。

**版本**: v1.3.0+  
**状态**: ✅ 已实现

---

## 📖 使用方法

### 1. 基本嵌套 populate

填充 `posts` 关联，然后进一步填充 `posts.comments` 关联：

```javascript
const User = msq.model('users');

const result = await User.findOne({ _id: userId })
  .populate({
    path: 'posts',
    populate: 'comments'  // 嵌套 populate
  });

// 结果结构：
// {
//   _id: userId,
//   username: 'john',
//   posts: [
//     {
//       _id: postId,
//       title: 'My Post',
//       comments: [          // ← 嵌套填充的数据
//         { _id: commentId, content: 'Great!' }
//       ]
//     }
//   ]
// }
```

### 2. 嵌套 populate 对象配置

嵌套 populate 也支持完整的配置选项：

```javascript
const result = await User.findOne({ _id: userId })
  .populate({
    path: 'posts',
    populate: {
      path: 'comments',
      select: 'content',  // 只选择特定字段
      sort: { createdAt: -1 },  // 排序
      limit: 10  // 限制数量
    }
  });
```

### 3. 多层嵌套 populate

支持 3 层或更多层的嵌套：

```javascript
// User -> Post -> Comment -> Author
const result = await User.findOne({ _id: userId })
  .populate({
    path: 'posts',
    populate: {
      path: 'comments',
      populate: 'author'  // 第 3 层嵌套
    }
  });

// 结果结构：
// {
//   username: 'john',
//   posts: [
//     {
//       title: 'My Post',
//       comments: [
//         {
//           content: 'Great!',
//           author: {          // ← 第 3 层嵌套填充
//             username: 'jane'
//           }
//         }
//       ]
//     }
//   ]
// }
```

### 4. 嵌套多个 populate

在嵌套层级可以同时填充多个关联：

```javascript
const result = await User.findOne({ _id: userId })
  .populate({
    path: 'posts',
    populate: ['comments', 'likes']  // 同时填充多个
  });

// 结果结构：
// {
//   posts: [
//     {
//       title: 'My Post',
//       comments: [...],  // ← 填充的评论
//       likes: [...]      // ← 填充的点赞
//     }
//   ]
// }
```

### 5. 混合使用链式和嵌套 populate

可以同时使用链式 populate 和嵌套 populate：

```javascript
const result = await User.findOne({ _id: userId })
  .populate('profile')  // 链式 populate
  .populate({
    path: 'posts',
    populate: 'comments'  // 嵌套 populate
  });

// 结果结构：
// {
//   profile: { bio: '...' },  // ← 链式填充
//   posts: [
//     {
//       comments: [...]  // ← 嵌套填充
//     }
//   ]
// }
```

---

## 📋 完整示例

### Model 定义

```javascript
const { Model } = require('monsqlize');

// User Model
Model.define('users', {
  schema: (dsl) => dsl({
    username: 'string!',
    profileId: 'objectId'
  }),
  relations: {
    profile: {
      from: 'profiles',
      localField: 'profileId',
      foreignField: '_id',
      single: true
    },
    posts: {
      from: 'posts',
      localField: '_id',
      foreignField: 'authorId',
      single: false
    }
  }
});

// Post Model
Model.define('posts', {
  schema: (dsl) => dsl({
    title: 'string!',
    authorId: 'objectId'
  }),
  relations: {
    comments: {
      from: 'comments',
      localField: '_id',
      foreignField: 'postId',
      single: false
    },
    likes: {
      from: 'likes',
      localField: '_id',
      foreignField: 'postId',
      single: false
    }
  }
});

// Comment Model
Model.define('comments', {
  schema: (dsl) => dsl({
    content: 'string!',
    postId: 'objectId',
    authorId: 'objectId'
  }),
  relations: {
    author: {
      from: 'users',
      localField: 'authorId',
      foreignField: '_id',
      single: true
    }
  }
});
```

### 查询示例

```javascript
// 示例 1：基本嵌套
const user1 = await User.findOne({ username: 'john' })
  .populate({
    path: 'posts',
    populate: 'comments'
  });

// 示例 2：多层嵌套
const user2 = await User.findOne({ username: 'john' })
  .populate({
    path: 'posts',
    populate: {
      path: 'comments',
      populate: 'author'  // 评论的作者
    }
  });

// 示例 3：嵌套多个关联
const user3 = await User.findOne({ username: 'john' })
  .populate({
    path: 'posts',
    populate: ['comments', 'likes']
  });

// 示例 4：混合使用
const user4 = await User.findOne({ username: 'john' })
  .populate('profile')
  .populate({
    path: 'posts',
    populate: {
      path: 'comments',
      select: 'content',
      sort: { createdAt: -1 },
      limit: 5
    }
  });
```

---

## 🔧 技术实现

### 核心逻辑

1. **嵌套检测**: 在 `_populatePath()` 中检测 `config.populate` 参数
2. **递归填充**: 调用 `_executeNestedPopulate()` 处理嵌套逻辑
3. **Model 查找**: 根据集合名动态获取 Model 定义
4. **临时实例**: 为嵌套层创建临时 ModelInstance
5. **递归执行**: PopulateBuilder 递归调用自身实现多层嵌套

### 关键代码

```javascript
// 在 PopulateBuilder._populatePath() 中
const { populate: nestedPopulate } = config;

if (nestedPopulate && relatedDocs.length > 0) {
  relatedDocs = await this._executeNestedPopulate(
    relatedDocs, 
    nestedPopulate, 
    relation.from
  );
}

// _executeNestedPopulate() 方法
async _executeNestedPopulate(docs, nestedPopulate, collectionName) {
  // 1. 获取 Model 定义
  const Model = require('../../model');
  if (!Model.has(collectionName)) {
    return docs;  // 跳过嵌套
  }

  // 2. 创建临时 ModelInstance
  const modelDef = Model.get(collectionName);
  const collection = this.model.msq.collection(collectionName);
  const { ModelInstance } = require('../index');
  const tempModel = new ModelInstance(collection, modelDef.definition, this.model.msq);

  // 3. 创建新的 PopulateBuilder 并执行
  const nestedBuilder = new PopulateBuilder(tempModel, collection);
  nestedBuilder.populate(nestedPopulate);
  return await nestedBuilder.execute(docs);
}
```

---

## ⚠️ 注意事项

### 1. Model 必须定义

嵌套 populate 要求被填充的集合必须有对应的 Model 定义。如果没有定义，嵌套 populate 将被跳过：

```javascript
// ❌ comments 集合没有定义 Model
Model.define('posts', {
  relations: {
    comments: { from: 'comments', ... }
  }
});

// populate 会跳过嵌套，但不会报错
await User.findOne().populate({
  path: 'posts',
  populate: 'comments'  // 被跳过
});
```

### 2. 性能考虑

深度 populate 会执行多次数据库查询，注意性能影响：

```javascript
// 性能分析：
// User.find() → 1 次查询（10 个用户）
// .populate('posts') → 1 次查询（查询所有用户的 posts）
// .populate({ path: 'posts', populate: 'comments' })
//   → 再 1 次查询（查询所有 posts 的 comments）
// 总计：3 次查询
```

**优化建议**：
- 使用 `select` 只选择必要字段
- 使用 `limit` 限制关联数据数量
- 避免过深的嵌套（建议不超过 3 层）

### 3. 循环引用

避免循环引用导致无限递归：

```javascript
// ❌ 危险：User -> Post -> Author(User) -> Post -> ...
Model.define('users', {
  relations: {
    posts: { from: 'posts', ... }
  }
});

Model.define('posts', {
  relations: {
    author: { from: 'users', ... }
  }
});

// 这样会导致循环：
await User.find().populate({
  path: 'posts',
  populate: {
    path: 'author',
    populate: 'posts'  // ← 循环回 posts
  }
});
```

**解决方案**：谨慎设计数据模型，避免双向嵌套。

---

## 📊 兼容性

| 功能 | 支持情况 |
|------|---------|
| 字符串形式嵌套 | ✅ |
| 对象形式嵌套 | ✅ |
| 数组形式嵌套 | ✅ |
| 多层嵌套（3+层）| ✅ |
| 嵌套 + 选项（select/sort/limit）| ✅ |
| 链式 + 嵌套混合 | ✅ |
| findOne 嵌套 | ✅ |
| find 嵌套 | ✅ |
| findAndCount 嵌套 | ✅ |
| findPage 嵌套 | ✅ |

---

## 🧪 测试用例

完整测试用例请参考：
- `test/unit/model/model-nested-populate.test.js`

测试覆盖：
- ✅ 基本嵌套 populate
- ✅ 嵌套 populate 对象配置
- ✅ 3 层嵌套
- ✅ 嵌套多个 populate
- ✅ 混合链式和嵌套

---

## 📚 相关文档

- [Populate 基础文档](./populate.md)
- [Relations 关系定义](./relations.md)
- [Model API 参考](./model.md)

---

**更新日期**: 2026-01-07  
**版本**: v1.3.0+  
**状态**: ✅ 已实现并测试

