# Nested Populate

## 🎯 Function Overview

Nested populate lets you populate relations on documents that were already populated, so you can load a multi-level document graph with one chain.

Model schema examples on this page use the runtime-scoped `s` namespace passed by monSQLize. Application code does not need to import the root `schema-dsl` entry for these examples.


---

## 📖 How to use


## 1. Basic nested populate

Populate the `posts` association and then further populate the `posts.comments` association:

```javascript
const User = msq.model('users');

const result = await User.findOne({ _id: userId })
  .populate({
    path: 'posts',
    populate: 'comments'  // nested populate
  });

//Result structure:
// {
//   _id: userId,
//   username: 'john',
//   posts: [
//     {
//       _id: postId,
//       title: 'My Post',
//       comments: [ // nested populated data
//         { _id: commentId, content: 'Great!' }
//       ]
//     }
//   ]
// }
```


## 2. Nested populate object configuration

Nested populate also supports full configuration options:

```javascript
const result = await User.findOne({ _id: userId })
  .populate({
    path: 'posts',
    populate: {
      path: 'comments',
      select: 'content',  // select only specific fields
      sort: { createdAt: -1 },
      limit: 10
    }
  });
```


## 3. Multi-level nested populate

Supports 3 or more levels of nesting:

```javascript
// User -> Post -> Comment -> Author
const result = await User.findOne({ _id: userId })
  .populate({
    path: 'posts',
    populate: {
      path: 'comments',
      populate: 'author'  // third level
    }
  });

//Result structure:
// {
//   username: 'john',
//   posts: [
//     {
//       title: 'My Post',
//       comments: [
//         {
//           content: 'Great!',
//           author: { // third-level populated data
//             username: 'jane'
//           }
//         }
//       ]
//     }
//   ]
// }
```


## 4. Nesting multiple populates

Multiple associations can be populated simultaneously at a nested level:

```javascript
const result = await User.findOne({ _id: userId })
  .populate({
    path: 'posts',
    populate: ['comments', 'likes']  // populate multiple relations
  });

//Result structure:
// {
//   posts: [
//     {
//       title: 'My Post',
//       comments: [...],
//       likes: [...]
//     }
//   ]
// }
```


## 5. Mix chained and nested populates

You can use both chained and nested populates:

```javascript
const result = await User.findOne({ _id: userId })
  .populate('profile')  // chained populate
  .populate({
    path: 'posts',
    populate: 'comments'  // nested populate
  });

//Result structure:
// {
//   profile: { bio: '...' },
//   posts: [
//     {
//       comments: [...]
//     }
//   ]
// }
```

---

## 📋 Complete example


## Model Definition

```javascript
import { Model } from 'monsqlize';

// User Model
Model.define('users', {
  schema: (s) => s({
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
  schema: (s) => s({
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
  schema: (s) => s({
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


## Query example

```javascript
//Example 1: Basic nesting
const user1 = await User.findOne({ username: 'john' })
  .populate({
    path: 'posts',
    populate: 'comments'
  });

//Example 2: Multiple levels of nesting
const user2 = await User.findOne({ username: 'john' })
  .populate({
    path: 'posts',
    populate: {
      path: 'comments',
      populate: 'author'  // comment author
    }
  });

//Example 3: Nesting multiple associations
const user3 = await User.findOne({ username: 'john' })
  .populate({
    path: 'posts',
    populate: ['comments', 'likes']
  });

//Example 4: Mixed use
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

## Runtime behavior

- First-level populate can read from the collection named in `from`.
- If `from` matches a registered Model, monSQLize hydrates the related documents through that Model.
- Nested populate continues only when the related collection has a registered Model, because the next relation set must come from that Model definition.
- The runtime applies `select`, `sort`, `skip`, and `limit` after the related documents are loaded.
- Nested populate has depth and cycle guards. If a nested path is invalid, the query fails with a user-facing argument error.

---

## ⚠️ Notes


## 1. Define Models for nested branches

First-level populate can load plain related documents from a collection. Nested populate needs a Model definition for the related collection, otherwise monSQLize has no relation metadata for the next hop:

```javascript
// comments collection has no defined Model
Model.define('posts', {
  relations: {
    comments: { from: 'comments', ... }
  }
});

// comments are loaded at the first level only; the nested branch has no relation metadata
await User.findOne().populate({
  path: 'posts',
  populate: 'comments'
});
```


## 2. Performance considerations

Nested populate executes multiple database queries. Keep the relation graph shallow and index foreign keys:

```javascript
//Performance analysis:
//User.find() → 1 query (10 users)
//.populate('posts') → 1 query (query all users' posts)
// .populate({ path: 'posts', populate: 'comments' })
//→ Query again (query the comments of all posts)
//Total: 3 queries
```

**Optimization suggestions**:
- Use `select` to select only necessary fields
- Use `limit` to limit the amount of associated data
- Avoid deep relation graphs unless the user path really needs them


## 3. Circular reference

Avoid circular references leading to infinite recursion:

```javascript
// Risk: User -> Post -> Author(User) -> Post -> ...
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

// This creates a loop:
await User.find().populate({
  path: 'posts',
  populate: {
    path: 'author',
    populate: 'posts'  //← Loop back to posts
  }
});
```

**Solution**: design nested paths deliberately, set explicit limits, and avoid bidirectional nested chains.

---

## 📊 Compatibility

| Features | Support |
|------|---------|
| Nesting in string form | ✅ |
| Object form nesting | ✅ |
| Nesting in array form | ✅ |
| Multi-level nesting (3+ levels) | ✅ |
| Nesting + options (select/sort/limit) | ✅ |
| Chained + Nested Mix | ✅ |
| findOne Nesting | ✅ |
| find nesting | ✅ |
| findAndCount nesting | ✅ |
| findPage nesting | ✅ |

---

## 🧪 Test cases

For complete test cases, please refer to:
- `test/integration/model/model-features.test.ts`
- `test/integration/model/model-schema-and-hooks.test.ts`

Coverage includes:
- Basic nested populate
- Nested populate object configuration
- Three-level nesting
- Multiple nested populate paths
- Mixed chained and nested populate

---

## 📚 Related documents

- [Populate basic documentation](../populate.md)
- [Relations relationship definition](./relations.md)
- [Model API Reference](../model.md)

---
