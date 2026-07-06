# Collection management

## Overview

monSQLize provides the basic functions of MongoDB collection management, including creating collections, deleting collections, and creating view collections. These methods are used to dynamically manage database structures.

## Core Features

- ✅ **Create Collection**: Supports standard collections and collections with options
- ✅ **DELETE COLLECTION**: Quickly delete a collection and all its data
- ✅ **Create View**: Create a view collection based on the aggregation pipeline
- ✅ **Error Handling**: Complete error prompts and logging

---

## API methods


## createCollection()

Creates a new collection or a collection with specified options.


### Method signature

```javascript
await collection('collectionName').createCollection(name?, options?)
```


### Parameter description

| Parameters | Type | Required | Default | Description |
|------|------|------|--------|------|
| `name` | string | ❌ | Current collection name | Collection name to be created |
| `options` | object | ❌ | `{}` | MongoDB createCollection options |


### options options

| Options | Type | Description |
|------|------|------|
| `capped` | boolean | Whether to create a fixed size collection |
| `size` | number | The maximum number of bytes in a fixed collection |
| `max` | number | The maximum number of documents in a fixed collection |
| `validationLevel` | string | Authentication level: 'off'/'strict'/'moderate' |
| `validationAction` | string | Action when verification fails: 'error'/'warn' |
| `validator` | object | Document validation rules (JSON Schema) |


### Return value

```javascript
Promise<boolean>  //Returns true if created successfully
```

---

## Usage example


## Basic usage


### 1. Create a standard collection

```javascript
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' }
});

const { collection } = await msq.connect();

//Create new collection
await collection('products').createCollection('newCollection');

console.log('✅ Collection created successfully');
```

---


### 2. Create the currently bound collection

```javascript
//If the name parameter is not passed, the currently bound collection will be created.
await collection('orders').createCollection();

//Equivalent to
await collection('orders').createCollection('orders');
```

---


### 3. Create a fixed-size collection (Capped Collection)

Fixed-size collections are suitable for logging, caching and other scenarios. When the size limit is reached, the oldest documents will be automatically deleted.

```javascript
//Create a fixed collection of 100MB
await collection('logs').createCollection('logs', {
  capped: true,
  size: 100 * 1024 * 1024,  // 100MB
  max: 10000                 //Up to 10,000 documents
});

console.log('✅ Fixed collection created successfully');
```

---


### 4. Create a collection with validation rules

Use JSON Schema to verify the document structure:

```javascript
//Create an authenticated user collection
await collection('users').createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'email', 'age'],
      properties: {
        name: {
          bsonType: 'string',
          description: 'Username must be a string'
        },
        email: {
          bsonType: 'string',
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
          description: 'Must be a valid email address'
        },
        age: {
          bsonType: 'int',
          minimum: 0,
          maximum: 120,
          description: 'Age must be between 0-120'
        }
      }
    }
  },
  validationLevel: 'strict',     //Strict verification
  validationAction: 'error'      //If verification fails, an error will be reported
});

console.log('✅ The collection with verification rules was created successfully');
```

---


## dropCollection()

Delete the collection and all its data.


### Method signature (dropCollection())

```javascript
await collection('collectionName').dropCollection()
```


### Parameter description (dropCollection())

No parameters. Delete the currently bound collection.


### Return value (dropCollection())

```javascript
Promise<boolean>  //Returns true if deletion is successful
```


### Usage example (dropCollection())

```javascript
const { collection } = await msq.connect();

//Delete collection
await collection('oldCollection').dropCollection();

console.log('✅ Collection deleted');
```

---


### ⚠️ Notes

1. **Irreversible operation**: Deleting a collection will permanently delete all data and cannot be restored.
2. **Indexes will also be deleted**: All indexes in the collection will be deleted together.
3. **Permission requirements**: `dropCollection` permission of the database is required

---


## createView()

Create a collection of views (read-only views based on the aggregation pipeline).


### Method signature (createView())

```javascript
await collection('collectionName').createView(viewName, sourceCollection, pipeline)
```


### Parameter description (createView())

| Parameters | Type | Required | Description |
|------|------|------|------|
| `viewName` | string | ✅ | View name |
| `sourceCollection` | string | ✅ | Source collection name |
| `pipeline` | array | ❌ | aggregation pipeline (default `[]`) |


### Return value (createView())

```javascript
Promise<boolean>  //Returns true if created successfully
```

---

## View collection example


## 1. Create a base view

```javascript
const { collection } = await msq.connect();

//Create active user view
await collection('users').createView(
  'activeUsers',        //view name
  'users',              //source collection
  [
    { $match: { status: 'active' } },
    { $project: { password: 0 } }  //Exclude password field
  ]
);

console.log('✅ View created successfully');

//Query view (use like a normal collection)
const activeUsers = await collection('activeUsers').find(
  {},
  { limit: 10 }
);

console.log('Active users:', activeUsers);
```

---


## 2. Create statistical view

```javascript
//Create order statistics view
await collection('orders').createView(
  'orderStats',         //view name
  'orders',             //source collection
  [
    {
      $group: {
        _id: '$category',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
        avgAmount: { $avg: '$amount' }
      }
    },
    {
      $sort: { totalAmount: -1 }
    }
  ]
);

//Query statistical view
const stats = await collection('orderStats').find(
  {},
  { limit: 10 }
);

console.log('Order statistics:', stats);
```

---


## 3. Create a connection view ($lookup)

```javascript
//Create an order details view (containing user information)
await collection('orders').createView(
  'orderDetails',
  'orders',
  [
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'userInfo'
      }
    },
    {
      $unwind: '$userInfo'
    },
    {
      $project: {
        orderId: 1,
        amount: 1,
        status: 1,
        userName: '$userInfo.name',
        userEmail: '$userInfo.email'
      }
    }
  ]
);

//Query order details view
const orderDetails = await collection('orderDetails').find(
  { status: 'completed' },
  { limit: 20 }
);

console.log('Order details:', orderDetails);
```

---


## 4. Create a time series view

```javascript
//Create a daily sales statistics view
await collection('sales').createView(
  'dailySales',
  'sales',
  [
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        },
        totalSales: { $sum: '$amount' },
        orderCount: { $sum: 1 }
      }
    },
    {
      $sort: {
        '_id.year': -1,
        '_id.month': -1,
        '_id.day': -1
      }
    },
    {
      $project: {
        date: {
          $dateFromParts: {
            year: '$_id.year',
            month: '$_id.month',
            day: '$_id.day'
          }
        },
        totalSales: 1,
        orderCount: 1,
        avgOrderAmount: {
          $divide: ['$totalSales', '$orderCount']
        }
      }
    }
  ]
);

//Query daily sales statistics
const dailyStats = await collection('dailySales').find(
  {},
  {
    limit: 30,
    sort: { date: -1 }
  }
);

console.log('Daily sales statistics:', dailyStats);
```

---

## Best Practices


## 1. Collection naming convention

```javascript
//✅ Good naming (use plurals, lowercase, underscores)
await collection('products').createCollection('user_profiles');
await collection('products').createCollection('order_items');

//❌ Naming to avoid
await collection('products').createCollection('UserProfile');  //avoid hump
await collection('products').createCollection('user-profile'); //avoid hyphens
```

---


## 2. Use of verification rules

```javascript
//✅ Recommendation: Use validation rules in production environment
await collection('users').createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['email'],
      properties: {
        email: {
          bsonType: 'string',
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
        }
      }
    }
  },
  validationLevel: 'moderate',  //Medium validation (only for new documents)
  validationAction: 'warn'      //Warn when validation fails (does not block inserts)
});
```

---


## 3. Performance considerations of views

```javascript
//✅ Good practice: Create an index on the source collection
const { collection } = await msq.connect();

//1. Create an index first
await collection('orders').createIndex({ status: 1, createdAt: -1 });

//2. Create the view again
await collection('orders').createView(
  'completedOrders',
  'orders',
  [
    { $match: { status: 'completed' } },  //The index will be used
    { $sort: { createdAt: -1 } }
  ]
);

//Note: The view is dynamic and the aggregation pipeline is executed for each query
//Therefore the index of the source collection is critical to view performance
```

---


## 4. Usage scenarios of fixed collections

```javascript
//✅ Suitable for fixed collection scenarios
const scenarios = [
  'logging',
  'Real-time monitoring data',
  'cache data',
  'session data',
  'message queue'
];

//Create a log fixed collection
await collection('logs').createCollection('appLogs', {
  capped: true,
  size: 50 * 1024 * 1024,  // 50MB
  max: 50000                //Up to 50,000
});

//❌ Not suitable for fixed collection scenarios
const notSuitable = [
  'User data (needs to be updated)',
  'Order data (needs long-term storage)',
  'Configuration data (requires precise query)'
];
```

---

## FAQ


## Q1: How to check if a collection already exists?

**A**: You can use MongoDB’s `listCollections` method:

```javascript
const { db } = await msq.connect();

//Get database instance
const database = db();

//list all collections
const collections = await database.listCollections();
const collectionNames = collections.map(c => c.name);

if (collectionNames.includes('myCollection')) {
  console.log('Collection already exists');
} else {
  await collection('myCollection').createCollection();
  console.log('Collection created');
}
```

---


## Q2: How to avoid accidental deletion when deleting a collection?

**A**: It is recommended to confirm and back up before deleting:

```javascript
//1. First check whether the collection exists
const collections = await db().listCollections({ name: 'oldCollection' });

if (collections.length === 0) {
  console.log('Collection does not exist');
  return;
}

//2. Get the number of documents
const count = await collection('oldCollection').count({ query: {} });
console.log(`Collection contains ${count} documents`);

//3. Optional: Back up data
const backup = await collection('oldCollection').find({});
//... save to file or other collection

//4. Delete after confirmation
await collection('oldCollection').dropCollection();
console.log('✅ Collection deleted');
```

---


## Q3: Can views be modified?

**A**: Views are read-only, but can be deleted and recreated:

```javascript
//1. Delete old views
await collection('oldView').dropCollection();

//2. Create a new view
await collection('users').createView(
  'oldView',
  'users',
  [
    { $match: { status: 'active' } },
    { $project: { name: 1, email: 1, age: 1 } }  //new projection
  ]
);

console.log('✅ View updated');
```

---


## Q4: What are the restrictions on fixed collections?

**A**: Main limitations of fixed collections:

1. **Document deletion is not supported**: only the entire collection can be deleted
2. **Document growth caused by updates is not supported**: The updated document size cannot exceed the original size.
3. **Sharding is not supported**: fixed collections cannot be sharded
4. **Fixed insertion order**: Documents are stored in insertion order and cannot be changed.

```javascript
//✅ Operations supported by fixed collections
await collection('logs').find({});     //Query
await collection('logs').insertOne({ ... });      //Insert

//❌ Operations not supported by fixed collections
//await collection('logs').deleteOne({ ... }); // Deleting a single document is not supported
//await collection('logs').updateOne({ ... }); // Increasing the document is not supported
```

---


## Q5: How to create collections in batches?

**A**: You can use a loop or Promise.all:

```javascript
const collectionsToCreate = [
  { name: 'users', options: {} },
  { name: 'orders', options: {} },
  { name: 'products', options: {} },
  { name: 'logs', options: { capped: true, size: 10 * 1024 * 1024 } }
];

//Method 1: Create sequentially
for (const { name, options } of collectionsToCreate) {
  await collection(name).createCollection(name, options);
  console.log(`✅ ${name} was created successfully`);
}

//Method 2: Parallel creation (faster)
await Promise.all(
  collectionsToCreate.map(({ name, options }) =>
    collection(name).createCollection(name, options)
  )
);

console.log('✅ All collections created');
```

---

## References

- [MongoDB createCollection documentation](https://www.mongodb.com/docs/manual/reference/method/db.createCollection/)
- [MongoDB Fixed Collection Document](https://www.mongodb.com/docs/manual/core/capped-collections/)
- [MongoDB View Document](https://www.mongodb.com/docs/manual/core/views/)
- [JSON Schema Validation Document](https://www.mongodb.com/docs/manual/core/schema-validation/)
- [Connection Management](./connection.md)
- [Caching Policy](./cache.md)
