# findOneById method detailed documentation

## 📑 Table of Contents

- [Overview](#overview)
- [Why do you need findOneById?](#why-do-you-need-findonebyid)
- [Method signature](#method-signature)
- [Usage example](#usage-example)
- [Real scene example](#real-scene-example)
- [Error handling](#error-handling)
- [Performance Notes](#performance-notes)
- [Compare with other methods](#compare-with-other-methods)
- [Best Practices](#best-practices)
- [FAQ](#faq)
- [Related documents](#related-documents)

---

## Overview

`findOneById` is a convenience method provided by monSQLize for quickly querying a single document via `_id`. It automatically handles string to ObjectId conversion, simplifying the most common query scenarios.

## Why do you need findOneById?

### Problem: Too much boilerplate code

```javascript
// ❌ Traditional method: ObjectId conversion needs to be handled manually
const { ObjectId } = require('mongodb');
const userId = '507f1f77bcf86cd799439011';  // from request parameters
const user = await collection('users').findOne({ 
  _id: new ObjectId(userId)  // Manual conversion
});
```

### Solution: findOneById

```javascript
// ✅ Use findOneById: automatic conversion, concise and clear
const userId = '507f1f77bcf86cd799439011';
const user = await collection('users').findOneById(userId);  // Automatic conversion ✨
```

**income**:
- ✅ Reduce boilerplate code by 80%
- ✅ Automatic type conversion (String → ObjectId)
- ✅ Clearer semantics (explicitly query by ID)
- ✅ Complete parameter validation and error handling

---

## Method signature

```javascript
async findOneById(id, options = {})
```

### Parameters

| Parameters | Type | Required | Description |
|------|------|------|------|
| `id` | String \| ObjectId | is | the `_id` of the document, the string will be automatically converted to ObjectId |
| `options` | Object | No | Query option, same as `findOne` option |

### options object properties

| Parameters | Type | Required | Default value | Description |
|------|------|------|--------|------|
| `projection` / `project` | Object/Array | No | - | Field projection configuration. `project` is an alias for `projection`; `projection` wins when both are provided. |
| `cache` | Number | No | `0` | Cache TTL (milliseconds) |
| `maxTimeMS` | Number | No | Global configuration | Query timeout (milliseconds) |
| `comment` | String | No | - | Query comments (for log tracking) |

### Return value

```typescript
Promise<Object|null>
```

- **Success**: Return the queried document object
- **Does not exist**: Returns `null`
- **ERROR**: Exception thrown

---

## Usage example

### 1. Basic usage

#### 1.1 String ID (most commonly used)

```javascript
// Get string ID from request parameter
const userId = req.params.id;  // "507f1f77bcf86cd799439011"

// Automatically convert to ObjectId and query
const user = await collection('users').findOneById(userId);

if (user) {
  console.log('username:', user.name);
} else {
  console.log('User does not exist');
}
```

#### 1.2 ObjectId (direct use)

```javascript
const { ObjectId } = require('mongodb');

// If it is already an ObjectId, pass it in directly
const userId = new ObjectId('507f1f77bcf86cd799439011');
const user = await collection('users').findOneById(userId);
```

### 2. Field projection

#### 2.1 Object format projection

```javascript
// Only return required fields
const user = await collection('users').findOneById(userId, {
  projection: { name: 1, email: 1, avatar: 1 }
});

// Result: { _id: ..., name: "Alice", email: "alice@example.com", avatar: "..." }
// Does not include: password, createdAt, updatedAt, etc.
```

#### 2.2 Array format projection

```javascript
// Array format is more concise
const user = await collection('users').findOneById(userId, {
  projection: ['name', 'email', 'avatar']
});

// Equivalent to: { name: 1, email: 1, avatar: 1 }
```

#### 2.3 Exclude sensitive fields

```javascript
// Exclude password field (security)
const user = await collection('users').findOneById(userId, {
  projection: { password: 0, salt: 0 }
});
```

### 3. Cache usage

#### 3.1 Enable cache

```javascript
// Caching for 5 seconds (reduces database pressure)
const user = await collection('users').findOneById(userId, {
  cache: 5000
});

// Time 1: Query the database (10-50ms)
// Time 2: Return from cache (0.001ms) ⚡
```

#### 3.2 Combination of caching and projection

```javascript
// Cache basic user information
const user = await collection('users').findOneById(userId, {
  projection: ['name', 'email', 'avatar'],
  cache: 10000  // Cache for 10 seconds
});
```

### 4. Timeout control

```javascript
// Set query timeout (to prevent slow queries)
const user = await collection('users').findOneById(userId, {
  maxTimeMS: 3000  // up to 3 seconds
});
```

### 5. Query comments (production environment monitoring)

```javascript
// Add comments for log tracking
const user = await collection('users').findOneById(userId, {
  comment: 'UserAPI:getProfile:session_abc123'
});

// This comment will be displayed in the MongoDB log to facilitate locating slow queries.
```

---

## Real scene example

### Scenario 1: RESTful API - Get user details

```javascript
// GET /api/users/:id
app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await collection('users').findOneById(req.params.id, {
      projection: { password: 0, salt: 0 },  // Exclude sensitive fields
      cache: 5000,                           // Cache for 5 seconds
      maxTimeMS: 3000                        // Timeout 3 seconds
    });

    if (!user) {
      return res.status(404).json({ error: 'User does not exist' });
    }

    res.json({ data: user });
  } catch (error) {
    if (error.message.includes('Invalid ObjectId')) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    throw error;
  }
});
```

### Scenario 2: Permission verification

```javascript
// Middleware: Verify that the user has permission to access the resource
async function checkOwnership(req, res, next) {
  const { id } = req.params;
  const currentUserId = req.user.id;

  try {
    const resource = await collection('articles').findOneById(id, {
      projection: ['authorId'],  // Only authorId is required
      cache: 5000
    });

    if (!resource) {
      return res.status(404).json({ error: 'Resource does not exist' });
    }

    if (resource.authorId !== currentUserId) {
      return res.status(403).json({ error: 'No access' });
    }

    next();
  } catch (error) {
    next(error);
  }
}
```

### Scenario 3: Related data query

```javascript
// Query orders and user information
async function getOrderWithUser(orderId) {
  // 1. Query order
  const order = await collection('orders').findOneById(orderId);
  
  if (!order) {
    throw new Error('Order does not exist');
  }

  // 2. Query user information
  const user = await collection('users').findOneById(order.userId, {
    projection: ['name', 'email', 'phone'],
    cache: 10000  // User information cached for 10 seconds
  });

  return {
    ...order,
    user  // Embed user information
  };
}
```

### Scenario 4: Batch query optimization

```javascript
// Query multiple users by ID in a single request.
async function getUsersByIds(userIds) {
  return collection('users').findByIds(userIds, {
    projection: { name: 1, email: 1, avatar: 1 },
    cache: 5000,
    preserveOrder: true
  });
}

// Tip: use findOneById() for one document and findByIds() for batch ID lookup.
```

### Scenario 5: Cache invalidation processing

```javascript
// After updating the user, the cache automatically expires.
async function updateUser(userId, updates) {
  // 1. Update user
  await collection('users').updateOne(
    { _id: new ObjectId(userId) },
    { $set: updates }
  );
  // ✅ Cache automatically expires

  // 2. Query the latest data (obtained from the database)
  const user = await collection('users').findOneById(userId, {
    projection: { password: 0 }
  });

  return user;
}
```

---

## Error handling

### Common mistakes

#### 1. Invalid ID format

```javascript
try {
  const user = await collection('users').findOneById('invalid-id');
} catch (error) {
  console.error(error.message);
  // "Invalid ObjectId format: "invalid-id""
}
```

#### 2. Empty ID

```javascript
try {
  const user = await collection('users').findOneById(null);
} catch (error) {
  console.error(error.message);
  // "The id parameter is required"
}
```

#### 3. Wrong parameter type

```javascript
try {
  const user = await collection('users').findOneById(12345);  // number
} catch (error) {
  console.error(error.message);
  // "id must be a string or an ObjectId instance"
}
```

### Error handling best practices

```javascript
async function getUserById(userId) {
  try {
    const user = await collection('users').findOneById(userId, {
      projection: { password: 0 },
      cache: 5000,
      maxTimeMS: 3000
    });

    if (!user) {
      return {
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'User does not exist'
      };
    }

    return {
      success: true,
      data: user
    };
  } catch (error) {
    if (error.message.includes('Invalid ObjectId')) {
      return {
        success: false,
        error: 'INVALID_ID',
        message: 'Invalid user ID'
      };
    }

    // Rethrow other errors
    throw error;
  }
}
```

---

## Performance Notes

### Performance comparison

| Method | Query time (no cache) | Query time (cache hit) | Code complexity |
|------|------------------|---------------------|-----------|
| `findOne({ _id })` | 10-50ms | Not supported | ⭐⭐⭐ |
| `findOneById` | 10-50ms | 0.001ms | ⭐ |

**in conclusion**:
- Comparable performance without cache
- `findOneById` is faster with cache (supports caching)
- Code simplicity `findOneById` wins

### Performance optimization suggestions

#### 1. Proper use of cache

```javascript
// ✅ Recommendation: Cache basic user information for 10 seconds
const user = await collection('users').findOneById(userId, {
  projection: ['name', 'email', 'avatar'],
  cache: 10000
});

// ❌ Not recommended: Do not cache data with high real-time requirements
const balance = await collection('accounts').findOneById(accountId, {
  projection: ['balance'],
  cache: 0  // Don't cache balances
});
```

#### 2. Use field projection

```javascript
// ✅ Recommendation: Only query the required fields
const user = await collection('users').findOneById(userId, {
  projection: ['name', 'email']  // Only 2 fields are returned
});

// ❌ Not recommended: return all fields (including large fields)
const user = await collection('users').findOneById(userId);
// May include avatar (large picture), history (large array), etc.
```

#### 3. Set a reasonable timeout

```javascript
// ✅ Recommended: Set timeout to prevent slow queries
const user = await collection('users').findOneById(userId, {
  maxTimeMS: 3000  // 3 seconds timeout
});
```

---

## Compare with other methods

### vs findOne

| dimensions | findOne | findOneById |
|------|---------|-------------|
| **Query method** | `findOne({ _id: ... })` | `findOneById(id)` |
| **Automatic conversion** | ❌ Manual conversion required | ✅ Automatic conversion |
| **Code length** | 3 lines | 1 line |
| **Semantic clarity** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Flexibility** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

**Usage Suggestions**:
- Query via `_id` → Use `findOneById` ✅
- Complex query conditions → Use `findOne` ✅

### Code comparison

```javascript
// ❌ Using findOne (traditional way)
const { ObjectId } = require('mongodb');
const userId = req.params.id;

const user = await collection('users').findOne(
  { _id: new ObjectId(userId) },  // Manual conversion
  { projection: { password: 0 } }
);

// ✅ Use findOneById (recommended method)
const userId = req.params.id;

const user = await collection('users').findOneById(userId, {
  projection: { password: 0 }
});

// The code is reduced by 30% and the semantics are clearer
```

---

## Best Practices

### 1. Use findOneById uniformly

```javascript
// ✅ Recommendation: uniformly use findOneById for ID query
const user = await collection('users').findOneById(userId);
const order = await collection('orders').findOneById(orderId);
const product = await collection('products').findOneById(productId);

// ❌ Not recommended: mix the two methods
const user = await collection('users').findOne({ _id: new ObjectId(userId) });
const order = await collection('orders').findOneById(orderId);
```

### 2. Exclude sensitive fields

```javascript
// ✅ Recommended: Always exclude sensitive fields
const user = await collection('users').findOneById(userId, {
  projection: { password: 0, salt: 0, token: 0 }
});
```

### 3. Add query comments (production environment)

```javascript
// ✅ Recommendation: Add comments for production environment
const user = await collection('users').findOneById(userId, {
  comment: `${req.service}:getUser:${req.traceId}`
});
```

### 4. Set up cache appropriately

```javascript
// ✅ Recommendation: Set cache according to data characteristics
const user = await collection('users').findOneById(userId, {
  projection: ['name', 'avatar'],
  cache: 10000  // Basic information cache for 10 seconds
});

const balance = await collection('accounts').findOneById(accountId, {
  projection: ['balance'],
  cache: 0  // Balances are not cached (high real-time requirements)
});
```

---

## FAQ

### Q1: What is the difference between findOneById and findOne({ _id })?

**A**: Functionally the same, but `findOneById` is more concise:

1. **Automatic type conversion**: Automatically convert string to ObjectId
2. **Clearer semantics**: Explicitly express query by ID
3. **Less boilerplate code**: 30% reduction in code size

### Q2: Can other fields be queried?

**A**: No, `findOneById` is specifically used for queries via `_id`. If you need to query other fields, use `findOne`.

```javascript
// ❌ Error: findOneById can only query _id
// There is no such method as findOneByUserId

// ✅ Correct: Use findOne to query other fields
const user = await collection('users').findOne({ userId: 'USER-001' });
```

### Q3: Does chain call support?

**A**: Not supported. `findOneById` returns Promise directly and does not support chain calls. If chained calls are required, use `findOne`.

```javascript
// ❌ Not supported
const user = await collection('users')
  .findOneById(userId)
  .project({ name: 1 });  // mistake!

// ✅ Use options object
const user = await collection('users').findOneById(userId, {
  projection: { name: 1 }
});
```

### Q4: How to handle the situation where the ID does not exist?

**A**: Returns `null`, requires manual inspection.

```javascript
const user = await collection('users').findOneById(userId);

if (!user) {
  // Handle non-existent situations
  throw new Error('User does not exist');
}

// Continue processing
```

### Q5: How is the performance?

**A**: Comparable performance to `findOne({ _id })`, both use `_id` index, very fast (usually <10ms). If caching is enabled, the second query takes only 0.001ms.

---

## Related documents

- [findOne method document](./findOne.md)
- [find method document](./find.md)
- [Cache System Documentation](./cache.md)
- [Field Projection Document](./find.md#projection-configuration)

---

**Last updated**: 2025-11-18
