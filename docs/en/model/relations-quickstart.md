# relations Quick Start Guide (5 minutes)

**Prerequisite knowledge**: Understand the basics of MongoDB (collections, fields, foreign keys)

---

## ⚡ 1 minute to understand relations

**What are relations? **
- Define relationships between collections
- Use `populate()` to automatically fill in associated data
- Avoid manually writing multiple queries and splicing codes

**Core Concepts** (only 3):
1. **from**: associated collection name (such as `'profiles'`)
2. **localField**: local foreign key field (such as `'profileId'`)
3. **foreignField**: foreign primary key field (usually `'_id'`)

**Relationship with MongoDB $lookup**:
- relations configuration = simplified version of MongoDB `$lookup`
- No need to learn new concepts, just understand MongoDB

---

## ⚡ 2 minutes to complete first example


## Step 1: Define the relationship (30 seconds)

```javascript
import { Model } from 'monsqlize';

//Define User Model
Model.define('User', {
  schema: (s) => s({
    username: 'string!',
    email: 'email!',
    profileId: 'objectId'    //foreign key
  }),

  relations: {
    profile: {
      from: 'profiles',      //Association profiles collection
      localField: 'profileId', // User.profileId
      foreignField: '_id',   // Profile._id
      single: true           //Returns a single document (not an array)
    }
  }
});

//Define Profile Model (optional, you can populate even if you don’t define it)
Model.define('Profile', {
  schema: (s) => s({
    bio: 'string',
    avatar: 'url'
  })
});
```


## Step 2: Use populate (30 seconds)

```javascript
const User = msq.model('User');

//Query users and automatically populate profiles
const user = await User.findOne({ username: 'john' })
  .populate('profile');

console.log(user);
// {
//   _id: ObjectId('...'),
//   username: 'john',
//   email: 'john@example.com',
//   profileId: ObjectId('...'),
//profile: { // ← autocomplete
//     _id: ObjectId('...'),
//     bio: 'Software Engineer',
//     avatar: 'https://...'
//   }
// }
```


## Step 3: Done!

It's that simple, no need to write it manually:
```javascript
//❌ No need to write this manually
const user = await User.findOne({ username: 'john' });
const profile = await Profile.findOne({ _id: user.profileId });
user.profile = profile;
```

---

## ⚡ 2 minutes to master common scenarios


## Scenario 1: one-to-one

**Example**: A user has a profile

```javascript
//Configuration
relations: {
  profile: {
    from: 'profiles',
    localField: 'profileId',
    foreignField: '_id',
    single: true           //← Return to a single document
  }
}

//use
const user = await User.findOne({ _id }).populate('profile');
console.log(user.profile); // { bio: '...', avatar: '...' }
```


## Scenario 2: one-to-many (one-to-many - reverse)

**Example**: A user has multiple articles (via reverse query)

```javascript
//Configuration
relations: {
  posts: {
    from: 'posts',
    localField: '_id',         // User._id
    foreignField: 'authorId',  //Post.authorId points to User._id
    single: false              //← Return array (default)
  }
}

//use
const user = await User.findOne({ _id }).populate('posts');
console.log(user.posts); // [{ title: 'Post 1' }, { title: 'Post 2' }]
```


## Scenario 3: Multiple relationships

```javascript
//Configure multiple relationships
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

//Chain call populate
const user = await User.findOne({ _id })
  .populate('profile')
  .populate('posts');

console.log(user.profile); //single document
console.log(user.posts);   //array
```

---

## 🎯 Configuration field quick check

| Field | Type | Required | Default value | Description |
|------|------|------|--------|------|
| `from` | String | ✅ | - | The associated collection name (plural form, such as `'users'`) |
| `localField` | String | ✅ | - | Local field name (foreign key, such as `'userId'`) |
| `foreignField` | String | ✅ | - | External field name (usually `'_id'`) |
| `single` | Boolean | ❌ | `false` | `true`=returns a single document, `false`=returns an array |

---

## 💡 Quick decision-making


## Q: Should I use `single: true` or `single: false`?

**Decision Tree**:

```text
What is your relationship?
├─ One-to-one (one user, one profile)
│  → single: true
│
├─ One-to-many (one user has multiple articles)
│  → single: false
│
└─ Not sure?
→ Use single: false (default, returns array)
```


## Q: What should I write in `from`?

**Rule**: Write the collection name (plural form)

```javascript
//✅ Correct
from: 'users'      //Collection name
from: 'profiles'
from: 'posts'

//❌ Error
from: 'User'       //Model name (not collection name)
from: 'Profile'
```

---

## ⚠️ 3 common mistakes


## Mistake 1: Use Model name instead of collection name

```javascript
//❌ Error
relations: {
  profile: {
    from: 'Profile',  //Model name
    // ...
  }
}

//✅ Correct
relations: {
  profile: {
    from: 'profiles',  //Collection name (plural)
    // ...
  }
}
```


## Mistake 2: Forgot to create an index

```javascript
//⚠️Performance issue: foreign keys are not indexed
relations: {
  profile: {
    from: 'profiles',
    localField: 'profileId',  //← This field needs to be indexed!
    foreignField: '_id'
  }
}

//✅ Solution: Create index
Model.define('User', {
  schema: (s) => s({ profileId: 'objectId' }),
  indexes: [
    { key: { profileId: 1 } }  //← Create indexes for foreign keys
  ],
  relations: { /* ... */ }
});
```


## Error 3: `single` is used backwards

```javascript
//❌ Expected to return a single document, but used single: false
relations: {
  profile: {
    from: 'profiles',
    localField: 'profileId',
    foreignField: '_id',
    single: false  //← Returns an array [profile], not a single document!
  }
}

//✅ Correct
single: true  //Return single document { bio: '...' }
```

---

## 🚀 Next step


## Have you mastered the basic functions? View advanced topics

- **Select Field**: `.populate('profile', { select: 'bio avatar' })`
- **Sort and Limitations**: `.populate('posts', { sort: { createdAt: -1 }, limit: 10 })`
- **Nested populate**: populate related data with related data
- **Performance Optimization**: Enable $lookup aggregation optimization
- **Cache Integration**: Related data can also be cached


## View full document

- Complete API reference - all configuration items and options
- Implementation plan - technical details (developer)
- Best Practices - Performance Optimization Suggestions

---

## 📚 Sample Code Library


## Complete example: Blog system

```javascript
const msq = require('monsqlize');
const { Model } = msq;

// 1. Profile Model
Model.define('Profile', {
  schema: (s) => s({
    bio: 'string:0-500',
    avatar: 'url',
    location: 'string'
  })
});

// 2. Post Model
Model.define('Post', {
  schema: (s) => s({
    title: 'string:1-200!',
    content: 'string!',
    authorId: 'objectId!',
    status: 'string',
    createdAt: 'date'
  }),
  indexes: [
    { key: { authorId: 1 } }  //foreign key index
  ]
});

//3. User Model (including relations)
Model.define('User', {
  schema: (s) => s({
    username: 'string:3-32!',
    email: 'email!',
    profileId: 'objectId'
  }),
  indexes: [
    { key: { profileId: 1 } }  //foreign key index
  ],
  relations: {
    // one-to-one
    profile: {
      from: 'profiles',
      localField: 'profileId',
      foreignField: '_id',
      single: true
    },
    //one-to-many (reverse)
    posts: {
      from: 'posts',
      localField: '_id',
      foreignField: 'authorId',
      single: false
    }
  }
});

//4. Usage examples
async function example() {
  const User = msq.model('User');

  //Query user + profile + posts
  const user = await User.findOne({ username: 'john' })
    .populate('profile')
    .populate('posts');

  console.log(`User: ${user.username}`);
  console.log(`Profile: ${user.profile?.bio || 'No profile'}`);
  console.log(`Number of posts: ${user.posts.length}`);

  //Output:
  //User: john
  //Introduction: Full-stack Developer
  //Number of articles: 5
}

example();
```

**Complete sample file**: [populate relations runnable example](https://github.com/vextjs/monSQLize/blob/main/examples/docs/populate-relations.ts)

---

## 💬 FAQ


## Q: Will populate affect performance?

**A**:
- Populate batches related IDs and avoids the common N+1 query pattern.
- Direct MongoDB `$lookup` is still the right tool when you need a fully custom aggregation pipeline.
- Recommendation: Create indexes for foreign keys + enable caching


## Q: Can I associate a collection with undefined Model?

**A**:
- ✅ Yes! `from` directly specifies the collection name and does not rely on the Model definition.
- This is more flexible than Mongoose (Mongoose has to define the Model first)


## Q: How to deal with circular references?

**A**:
- The system automatically detects circular references and prevents infinite recursion
- Nested populate supports depth control; keep relationship graphs shallow and set explicit limits for deep branches.


## Q: What is the difference with MongoDB $lookup?

**A**:
- relations is a simplified version of $lookup
- populate can batch related IDs and avoid the common N+1 query pattern
- use MongoDB `$lookup` directly when you need a fully custom aggregation pipeline

---

##  Congratulations! You have mastered the basics of relations

**5 minutes to learn**:
- ✅ Understand the core concepts of relations (3 fields)
- ✅ Complete the first example (one-to-one)
- ✅ Master common scenarios (one-to-many)
- ✅ Avoid 3 common mistakes

**Now you can**:
- Use relations in your projects
- Simplify related query code
- Improve development efficiency by 5-10 times

**Need help? **
- 📖 View API full reference
- 💬 Submit Issue: https://github.com/vextjs/monSQLize/issues
- ⭐ If it was helpful, please give the project a star

---
