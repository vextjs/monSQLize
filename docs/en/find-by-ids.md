# findByIds() - Query multiple documents by _id in batches

## 📑 Table of Contents

- [Method overview](#method-overview)
- [Method signature](#method-signature)
- [Basic example](#basic-example)
- [Real scene example](#real-scene-example)
- [Detailed explanation of option parameters](#detailed-explanation-of-option-parameters)
- [Performance Notes](#performance-notes)
- [Error handling](#error-handling)
- [Best Practices](#best-practices)
- [Compare with other methods](#compare-with-other-methods)
- [FAQ](#faq)
- [See also](#see-also)

---

## Method overview

`findByIds` is a convenience method for batch querying multiple documents through the `_id` array, simplifying the use of `find({ _id: { $in: ids } })`.

### Why do you need findByIds?

**Traditional way** (using `find`):
```javascript
// ❌ $in query needs to be constructed manually and ObjectId needs to be converted
const { ObjectId } = require('mongodb');
const users = await collection('users').find({
  _id: { $in: userIds.map(id => new ObjectId(id)) }
}).toArray();
```

**Using findByIds**:
```javascript
// ✅ Automatically convert ObjectId, automatically remove duplicates, and the code is concise
const users = await collection('users').findByIds(userIds);
```

### Core Advantages

| Advantages | Description |
|------|------|
| **Automatic type conversion** | String ID is automatically converted to ObjectId |
| **Automatic deduplication** | Duplicate IDs are only queried once |
| **Performance Optimization** | 1 query instead of N queries |
| **Code Simplification** | Reduce boilerplate code by 75% |

---

## Method signature

```typescript
async findByIds(
  ids: Array<string | ObjectId>,
  options?: {
    projection?: Object,
    sort?: Object,
    cache?: number,
    maxTimeMS?: number,
    comment?: string,
    preserveOrder?: boolean
  }
): Promise<Array<Document>>
```

### Parameter description

| Parameters | Type | Required | Description |
|------|------|------|------|
| `ids` | Array<string \| ObjectId> | ✅ | _id array (supports mixed string and ObjectId) |
| `options` | Object | ❌ | Query Options |
| `options.projection` / `options.project` | Object | ❌ | Field projection (same as find). `project` is an alias for `projection`; `projection` wins when both are provided. |
| `options.sort` | Object | ❌ | Sort by |
| `options.cache` | number | ❌ | cache time (milliseconds) |
| `options.maxTimeMS` | number | ❌ | Query timeout (milliseconds) |
| `options.comment` | string | ❌ | Query comments |
| `options.preserveOrder` | boolean | ❌ | Whether to maintain the order of the ids array (default false) |

### Return value description

Returns an array of documents. No results will be returned for non-existent IDs.

---

## Basic example

### Example 1: Batch query documents (string ID)

```javascript
const userIds = [
  '507f1f77bcf86cd799439011',
  '507f1f77bcf86cd799439012',
  '507f1f77bcf86cd799439013'
];

const users = await collection('users').findByIds(userIds);
console.log(`turn up${users.length} users`);
```

### Example 2: Batch query documents (ObjectId)

```javascript
const { ObjectId } = require('mongodb');
const userIds = [
  new ObjectId('507f1f77bcf86cd799439011'),
  new ObjectId('507f1f77bcf86cd799439012')
];

const users = await collection('users').findByIds(userIds);
```

### Example 3: Mixed types (String + ObjectId)

```javascript
const userIds = [
  '507f1f77bcf86cd799439011',  // string
  new ObjectId('507f1f77bcf86cd799439012'),  // ObjectId
  '507f1f77bcf86cd799439013'   // string
];

const users = await collection('users').findByIds(userIds);
```

### Example 4: Using projection (return only specific fields)

```javascript
const users = await collection('users').findByIds(userIds, {
  projection: { name: 1, email: 1, role: 1 }
});

// The result only contains _id, name, email, role
```

### Example 5: Using sort (sorting results)

```javascript
const users = await collection('users').findByIds(userIds, {
  sort: { name: 1 }  // Sort by name ascending
});
```

### Example 6: Keep original order

```javascript
const orderedIds = ['id3', 'id1', 'id2'];
const users = await collection('users').findByIds(orderedIds, {
  preserveOrder: true  // The result order is consistent with orderedIds
});
```

---

## Real scene example

### Scenario 1: Batch query of user information (associated query)

Extract user IDs from the comment list and query user information in batches.

```javascript
// Comment list
const comments = [
  { _id: 1, userId: '507f...011', content: 'Great!' },
  { _id: 2, userId: '507f...012', content: 'Nice!' },
  { _id: 3, userId: '507f...011', content: 'Thanks!' }  // repeat
];

// Extract unique user ID
const userIds = [...new Set(comments.map(c => c.userId))];

// Query users in batches
const users = await collection('users').findByIds(userIds, {
  projection: { name: 1, avatar: 1 }
});

// Build user mapping
const userMap = new Map(users.map(u => [u._id.toString(), u]));

// Populate user information for comments
const commentsWithUser = comments.map(comment => ({
  ...comment,
  user: userMap.get(comment.userId)
}));

console.log(commentsWithUser);
```

### Scenario 2: Batch permission verification

Check if multiple users have specific permissions.

```javascript
async function checkUsersPermission(userIds, requiredPermission) {
  const users = await collection('users').findByIds(userIds, {
    projection: { permissions: 1, role: 1 }
  });

  const authorized = users.filter(user => 
    user.role === 'admin' || 
    user.permissions?.includes(requiredPermission)
  );

  return {
    total: userIds.length,
    authorized: authorized.length,
    authorizedIds: authorized.map(u => u._id.toString())
  };
}

// use
const result = await checkUsersPermission(
  ['user1', 'user2', 'user3'],
  'edit_content'
);
console.log(`${result.authorized}/${result.total} User has permission`);
```

### Scenario 3: Batch data export (maintain order)

Export user data in the specified order.

```javascript
async function exportUsers(orderedUserIds) {
  const users = await collection('users').findByIds(orderedUserIds, {
    projection: { password: 0, internalNotes: 0 },  // Exclude sensitive fields
    preserveOrder: true  // Keep export order
  });

  // Convert to CSV format
  const csv = users.map(user => 
    `${user._id},${user.name},${user.email},${user.role}`
  ).join('\n');

  return csv;
}

// use
const csvData = await exportUsers(['id1', 'id2', 'id3']);
```

### Scenario 4: Batch data preloading (caching)

Preload popular user data into cache.

```javascript
async function preloadPopularUsers() {
  // Get popular user IDs
  const popularUserIds = await collection('stats')
    .aggregate([
      { $sort: { views: -1 } },
      { $limit: 100 },
      { $project: { userId: 1 } }
    ]);

  const ids = popularUserIds.map(s => s.userId);

  // Batch query and cache (1 hour)
  const users = await collection('users').findByIds(ids, {
    cache: 60 * 60 * 1000  // 1 hour
  });

  console.log(`Preloaded${users.length} popular users`);
  return users;
}
```

### Scenario 5: Batch friend information query

Query all the user's friend information.

```javascript
async function getUserFriends(userId) {
  // Get the user's friends list
  const user = await collection('users').findOne(
    { _id: new ObjectId(userId) },
    { projection: { friends: 1 } }
  );

  if (!user || !user.friends || user.friends.length === 0) {
    return [];
  }

  // Query friend information in batches
  const friends = await collection('users').findByIds(user.friends, {
    projection: { name: 1, avatar: 1, status: 1 }
  });

  return friends;
}

// use
const friends = await getUserFriends('507f1f77bcf86cd799439011');
console.log(`This user has${friends.length} friends`);
```

### Scenario 6: Batch notification sending

Send notifications in batches based on a list of user IDs.

```javascript
async function sendBatchNotifications(userIds, notification) {
  // Query users in batches (only notification settings and contact information required)
  const users = await collection('users').findByIds(userIds, {
    projection: { 
      email: 1, 
      phone: 1, 
      notificationSettings: 1 
    }
  });

  const results = {
    email: 0,
    sms: 0,
    skipped: 0
  };

  for (const user of users) {
    // Send notifications based on user preferences
    if (user.notificationSettings?.email) {
      await sendEmail(user.email, notification);
      results.email++;
    }
    
    if (user.notificationSettings?.sms) {
      await sendSMS(user.phone, notification);
      results.sms++;
    }
    
    if (!user.notificationSettings?.email && !user.notificationSettings?.sms) {
      results.skipped++;
    }
  }

  return results;
}
```

---

## Detailed explanation of option parameters

### projection - field projection

Only the required fields are returned to reduce the amount of data transmission.

```javascript
// Only return name and email
const users = await collection('users').findByIds(userIds, {
  projection: { name: 1, email: 1 }
});

// Exclude sensitive fields
const users = await collection('users').findByIds(userIds, {
  projection: { password: 0, secretKey: 0 }
});
```

### sort - Sort

Sort the results.

```javascript
// Sort by name ascending
const users = await collection('users').findByIds(userIds, {
  sort: { name: 1 }
});

// Descending order by creation time
const users = await collection('users').findByIds(userIds, {
  sort: { createdAt: -1 }
});
```

### cache - cache

Cache query results to speed up repeated queries.

```javascript
// Cache for 5 minutes
const users = await collection('users').findByIds(userIds, {
  cache: 5 * 60 * 1000
});
```

### maxTimeMS - query timeout

Limit the maximum query execution time.

```javascript
const users = await collection('users').findByIds(userIds, {
  maxTimeMS: 5000  // up to 5 seconds
});
```

### comment - Query comments

Used for log tracing and performance analysis.

```javascript
const users = await collection('users').findByIds(userIds, {
  comment: 'CommentAPI:loadUsers:v1.2'
});
```

### preserveOrder - preserve order

The result order is consistent with the input ids array.

```javascript
const orderedIds = ['id3', 'id1', 'id2'];
const users = await collection('users').findByIds(orderedIds, {
  preserveOrder: true
});

// users[0]._id === 'id3'
// users[1]._id === 'id1'
// users[2]._id === 'id2'
```

---

## Performance Notes

### Performance comparison

| Method | Number of queries | Average time taken | Recommended scenarios |
|------|---------|---------|---------|
| **findByIds(100)** | 1 time | 10-20ms | ✅ Batch query |
| **find({ _id: { $in }})** | 1 time | 10-20ms | ⚠️ Needs manual processing |
| **findOneById x100** | 100 times | 1000-2000ms | ❌ Not recommended |

### Performance optimization suggestions

1. **Use projection to reduce the amount of data**
   ```javascript
   // ✅ Recommendation: Only query the required fields
   const users = await collection('users').findByIds(ids, {
     projection: { name: 1, email: 1 }
   });
   ```

2. **Enable caching to speed up repeated queries**
   ```javascript
   // ✅ Recommended: cache popular data
   const users = await collection('users').findByIds(hotUserIds, {
     cache: 60000  // 1 minute
   });
   ```

3. **Avoid overly large ID arrays**
   ```javascript
   // ❌ Avoid: Query more than 1000 at one time
   const users = await collection('users').findByIds(tenThousandIds);

   // ✅ Recommendation: Query in batches
   const batchSize = 100;
   const results = [];
   for (let i = 0; i < ids.length; i += batchSize) {
     const batch = await collection('users').findByIds(
       ids.slice(i, i + batchSize)
     );
     results.push(...batch);
   }
   ```

---

## Error handling

### Error type

| Error type | Error code | Trigger condition |
|---------|--------|---------|
| **Parameter error** | `INVALID_ARGUMENT` | ids is not an array or contains an invalid ID |
| **Timeout Error** | `QUERY_TIMEOUT` | maxTimeMS exceeded |

### Error handling example

```javascript
try {
  const users = await collection('users').findByIds(userIds);
  
  // Check for missing users
  const foundIds = new Set(users.map(u => u._id.toString()));
  const missingIds = userIds.filter(id => !foundIds.has(id));
  
  if (missingIds.length > 0) {
    console.warn(`not found${missingIds.length} users:`, missingIds);
  }
} catch (error) {
  if (error.code === 'INVALID_ARGUMENT') {
    console.error('Parameter error:', error.message);
  } else if (error.code === 'QUERY_TIMEOUT') {
    console.error('Query timeout');
  } else {
    console.error('unknown error:', error);
  }
}
```

---

## Best Practices

### ✅ Recommended practices

1. **Use findByIds instead of loop query**
   ```javascript
   // ✅ Recommended: 1 query
   const users = await collection('users').findByIds(userIds);
   
   // ❌ Avoid: N queries
   const users = await Promise.all(
     userIds.map(id => collection('users').findOneById(id))
   );
   ```

2. **Automatic deduplication, no manual processing required**
   ```javascript
   // ✅ Recommended: Automatically remove duplicates
   const users = await collection('users').findByIds(userIds);
   
   // ❌ No need to manually remove duplicates
   const uniqueIds = [...new Set(userIds)];
   const users = await collection('users').findByIds(uniqueIds);
   ```

3. **Check for missing IDs**
   ```javascript
   // ✅ Recommended: Check missing
   const users = await collection('users').findByIds(userIds);
   if (users.length < userIds.length) {
     console.warn('Some users do not exist');
   }
   ```

### ❌ Things to avoid

1. **Avoid overly large ID arrays**
   ```javascript
   // ❌ Avoid: Querying 10,000+ items at once
   const users = await collection('users').findByIds(hugeIdArray);
   
   // ✅ Recommendation: Query in batches
   const users = await batchQuery(hugeIdArray, 100);
   ```

2. **Avoid duplicate queries**
   ```javascript
   // ❌ Avoid: Query every time
   for (const comment of comments) {
     const user = await collection('users').findOneById(comment.userId);
   }
   
   // ✅ Recommendation: Batch query
   const userIds = [...new Set(comments.map(c => c.userId))];
   const users = await collection('users').findByIds(userIds);
   ```

---

## Compare with other methods

### vs findOneById

| dimensions | findByIds | findOneById |
|------|-----------|-------------|
| **Query quantity** | Batch (N) | Single |
| **Number of queries** | 1 times | N times |
| **Performance** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Usage scenarios** | Batch related query | Single document query |

### vs find({ _id: { $in }})

| dimensions | findByIds | find({ _id: { $in }}) |
|------|-----------|-----------------------|
| **Lines of code** | 1 line | 3-5 lines |
| **Automatically convert ObjectId** | ✅ | ❌ |
| **Automatic removal** | ✅ | ❌ |
| **Code Readability** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

---

## FAQ

### Q1: What is the difference between findByIds and find?

**A**: `findByIds` is a convenience method of `find({ _id: { $in: ids } })`:
- ✅ Automatically convert ObjectId (String → ObjectId)
- ✅ Automatic deduplication (duplicate IDs are only queried once)
- ✅ Simpler API

### Q2: How to deal with non-existent IDs?

**A**: `findByIds` only returns existing documents, and no results will be returned for non-existing IDs.

```javascript
const users = await collection('users').findByIds([
  'existingId1',
  'nonExistentId',  // does not exist
  'existingId2'
]);
// users.length === 2 (only returns existing ones)
```

### Q3: How many IDs are supported?

**A**: Theoretically no limit, but it is recommended:
- Single query ≤ 1000 IDs (optimal performance)
- More than 1000 suggestions batch query

### Q4: Does the preserveOrder option have any performance impact?

**A**: Has a slight impact (requires reordering), but can usually be ignored:
- None preserveOrder: O(n)
- With preserveOrder: O(n log n)

### Q5: Will it automatically remove duplicates?

**A**: ✅ Yes! Duplicate IDs will only be queried once.

```javascript
const users = await collection('users').findByIds([
  'id1', 'id1', 'id2', 'id2', 'id2'  // repeat
]);
// Actually only query ['id1', 'id2'] (automatic deduplication)
```

### Q6: Does it support caching?

**A**: ✅ Support! Use the `cache` option.

```javascript
const users = await collection('users').findByIds(ids, {
  cache: 60000  // Cache for 1 minute
});
```

### Q7: How is the performance?

**A**: Excellent performance:
- With index: 10-20ms (query 100 items)
- No index: 50-100ms (full table scan)

**Optimization Suggestion**: The `_id` field has an index by default and no additional creation is required.

---

## See also

- [findOneById()](./find-one-by-id.md) - Query a single document by _id
- [find()](./find.md) - Basic query method
- [findOne()](./findOne.md) - Query a single document
- [MongoDB official documentation: $in operator](https://www.mongodb.com/docs/manual/reference/operator/query/in/)
