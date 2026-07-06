# findOneById Reference

## Overview

`findOneById(id, options)` is an optional helper for looking up one document by `_id`. It validates and normalizes the id value, then runs the equivalent `_id` lookup through the same query helper path used by the MongoDB adapter.

You do not need this helper for ordinary `_id` queries. The standard query APIs also support ObjectId auto conversion, so the following form remains the main path:

```javascript
const userId = '507f1f77bcf86cd799439011';  // from request parameters
const user = await collection('users').findOne({ _id: userId });
```

Use `findOneById()` when your codebase prefers a dedicated `_id` helper or when you want a compact reference API for id-only lookups:

```javascript
const userId = '507f1f77bcf86cd799439011';
const user = await collection('users').findOneById(userId);
```

## Method signature

```javascript
async findOneById(id, options = {})
```

### Parameters

| Parameters | Type | Required | Description |
|------|------|------|------|
| `id` | String \| ObjectId | Yes | Document `_id`; ObjectId-shaped strings are normalized |
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

// First read queries the database.
// Repeated reads can be served from cache while the cache entry is valid.
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
  // Cache automatically expires.

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

## Usage guidance

### Cache only data that can tolerate staleness

```javascript
const user = await collection('users').findOneById(userId, {
  projection: ['name', 'email', 'avatar'],
  cache: 10000
});

const balance = await collection('accounts').findOneById(accountId, {
  projection: ['balance'],
  cache: 0  // Don't cache balances
});
```

### Use field projection for compact responses

```javascript
const user = await collection('users').findOneById(userId, {
  projection: ['name', 'email']
});
```

### Set a timeout for latency-sensitive paths

```javascript
const user = await collection('users').findOneById(userId, {
  maxTimeMS: 3000  // 3 seconds timeout
});
```

---

## Compare with other methods

### vs findOne

| Dimension | `findOne({ _id })` | `findOneById(id)` |
|------|---------|-------------|
| ObjectId auto conversion | Supported | Supported |
| Query shape | Any filter shape | `_id` only |
| Chain API | Use the normal query APIs | Not chainable; pass options directly |
| Best fit | Main query path | Optional id-only helper/reference |

### Code comparison

```javascript
const userId = req.params.id;

const user = await collection('users').findOne(
  { _id: userId },
  { projection: { password: 0 } }
);

const userId = req.params.id;

const user = await collection('users').findOneById(userId, {
  projection: { password: 0 }
});
```

---

## Best Practices

### 1. Exclude sensitive fields

```javascript
const user = await collection('users').findOneById(userId, {
  projection: { password: 0, salt: 0, token: 0 }
});
```

### 2. Add query comments on paths you need to trace

```javascript
const user = await collection('users').findOneById(userId, {
  comment: `${req.service}:getUser:${req.traceId}`
});
```

### 3. Set cache according to data freshness

```javascript
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

**A**: For `_id` lookups they are functionally equivalent in the current MongoDB adapter. Both use ObjectId auto conversion. `findOneById` is kept as a compact id-only helper, while `findOne({ _id })` remains the main query path and supports normal filter composition.

### Q2: Can other fields be queried?

**A**: No, `findOneById` is specifically used for queries via `_id`. If you need to query other fields, use `findOne`.

```javascript
// There is no such method as findOneByUserId

const user = await collection('users').findOne({ userId: 'USER-001' });
```

### Q3: Does chain call support?

**A**: Not supported. `findOneById` returns Promise directly and does not support chain calls. If chained calls are required, use `findOne`.

```javascript
const user = await collection('users')
  .findOneById(userId)
  .project({ name: 1 });  // mistake!

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

**A**: It uses the same `_id` lookup shape as `findOne({ _id })`. Actual latency depends on deployment, network, driver options, cache configuration, and document size. Use MongoDB profiling or your APM tooling for real numbers.

---

## Related documents

- [findOne method document](./findOne.md)
- [find method document](./find.md)
- [Cache System Documentation](./cache.md)
- [Field Projection Document](./find.md#projection-configuration)
