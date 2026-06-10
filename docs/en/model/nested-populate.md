# In-depth Populate (nested fill) function documentation

## 🎯 Function Overview

Deep populate allows you to further populate related data of related data when filling related data, forming a multi-layer nested data structure.

**Version**: v1.3.0+
**Status**: ✅ Achieved

---

## 📖 How to use


## 1. Basic nested populate

Populate the `posts` association and then further populate the `posts.comments` association:

```javascript
const User = msq.model('users');

const result = await User.findOne({ _id: userId })
  .populate({
    path: 'posts',
    populate: 'comments'  //Nested populate
  });

//Result structure:
// {
//   _id: userId,
//   username: 'john',
//   posts: [
//     {
//       _id: postId,
//       title: 'My Post',
//comments: [ // ← Nested populated data
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
      select: 'content',  //Select only specific fields
      sort: { createdAt: -1 },  //sort
      limit: 10  //limited quantity
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
      populate: 'author'  //Level 3 nesting
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
//author: { // ← 3rd level nested padding
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
    populate: ['comments', 'likes']  //Fill multiple at the same time
  });

//Result structure:
// {
//   posts: [
//     {
//       title: 'My Post',
//comments: [...], // ← filled comments
//likes: [...] // ← filled likes
//     }
//   ]
// }
```


## 5. Mix chained and nested populates

You can use both chained and nested populates:

```javascript
const result = await User.findOne({ _id: userId })
  .populate('profile')  //chain populate
  .populate({
    path: 'posts',
    populate: 'comments'  //Nested populate
  });

//Result structure:
// {
//profile: { bio: '...' }, // ← chain filling
//   posts: [
//     {
//comments: [...] // ← Nested padding
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
      populate: 'author'  //author of comment
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

## 🔧 Technical implementation


## Core logic

1. **Nested detection**: Detect `config.populate` parameters in `_populatePath()`
2. **Recursive filling**: Call `_executeNestedPopulate()` to process nested logic
3. **Model search**: dynamically obtain the Model definition based on the collection name
4. **Temporary instance**: Create a temporary ModelInstance for the nested layer
5. **Recursive execution**: PopulateBuilder calls itself recursively to implement multi-layer nesting


## Key code

```javascript
//In PopulateBuilder._populatePath()
const { populate: nestedPopulate } = config;

if (nestedPopulate && relatedDocs.length > 0) {
  relatedDocs = await this._executeNestedPopulate(
    relatedDocs,
    nestedPopulate,
    relation.from
  );
}

//_executeNestedPopulate() method
async _executeNestedPopulate(docs, nestedPopulate, collectionName) {
  //1. Get Model definition
  const Model = require('../../model');
  if (!Model.has(collectionName)) {
    return docs;  //Skip nesting
  }

  //2. Create a temporary ModelInstance
  const modelDef = Model.get(collectionName);
  const collection = this.model.msq.collection(collectionName);
  const { ModelInstance } = require('../index');
  const tempModel = new ModelInstance(collection, modelDef.definition, this.model.msq);

  //3. Create a new PopulateBuilder and execute
  const nestedBuilder = new PopulateBuilder(tempModel, collection);
  nestedBuilder.populate(nestedPopulate);
  return await nestedBuilder.execute(docs);
}
```

---

## ⚠️ Notes


## 1. Model must be defined

Nested populate requires that the collection being populated must have a corresponding Model definition. If not defined, nested populate will be skipped:

```javascript
//❌ comments collection has no defined Model
Model.define('posts', {
  relations: {
    comments: { from: 'comments', ... }
  }
});

//populate will skip nesting but will not report an error
await User.findOne().populate({
  path: 'posts',
  populate: 'comments'  //skipped
});
```


## 2. Performance considerations

Deep populate will execute multiple database queries, please pay attention to the performance impact:

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
- Avoid too deep nesting (no more than 3 levels recommended)


## 3. Circular reference

Avoid circular references leading to infinite recursion:

```javascript
//❌ Danger: User -> Post -> Author(User) -> Post -> ...
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

//This results in a loop:
await User.find().populate({
  path: 'posts',
  populate: {
    path: 'author',
    populate: 'posts'  //← Loop back to posts
  }
});
```

**Solution**: Design the data model carefully to avoid bidirectional nesting.

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

## 🧪 Test case

For complete test cases, please refer to:
- `test/integration/model/model-features.test.ts`
- `test/integration/model/model-schema-and-hooks.test.ts`

Test coverage:
- ✅ Basic nested populate
- ✅ Nested populate object configuration
- ✅ 3 levels of nesting
- ✅ Nest multiple populates
- ✅ Mix chaining and nesting

---

## 📚 Related documents

- [Populate basic documentation](../populate.md)
- [Relations relationship definition](./relations.md)
- [Model API Reference](../model.md)

---

**Updated date**: 2026-01-07
**Version**: v1.3.0+
**Status**: ✅ Implemented and tested

