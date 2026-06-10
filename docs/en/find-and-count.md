# findAndCount

## 📑 Table of Contents

- [Basic Usage](#basic-usage)
- [Parameters](#parameters)
- [Return Value](#return-value)
- [Examples](#examples)
- [Performance Benefits](#performance-benefits)
- [Notes](#notes)
- [Comparison with the Traditional Approach](#comparison-with-the-traditional-approach)
- [Related Methods](#related-methods)
- [Test Coverage](#test-coverage)

---

A convenience method that returns query results and the total count at the same time. It runs `find()` and `countDocuments()` in parallel and is well suited for pagination scenarios.

## Basic Usage

```javascript
const { data, total } = await collection.findAndCount(
    { status: 'active' },
    { limit: 20, skip: 0 }
);

console.log(`Total: ${total}, current page: ${data.length}`);
```

## Parameters

### query (Object)
Query criteria, identical to `find()`.

### options (Object)
Query options:

- `projection` (Object) - field projection
- `sort` (Object) - sort rules
- `limit` (Number) - maximum number of returned documents (`undefined` means no limit)
- `skip` (Number) - number of documents to skip
- `cache` (Number) - cache duration in milliseconds
- `maxTimeMS` (Number) - query timeout
- `comment` (String) - query comment

## Return Value

Returns a Promise that resolves to an object with the following fields:

- `data` (Array) - query result array
- `total` (Number) - total number of documents that match the criteria

## Examples

### Paginated Query

```javascript
const page = 2;
const pageSize = 20;

const { data, total } = await collection.findAndCount(
    { category: 'electronics' },
    { 
        limit: pageSize, 
        skip: (page - 1) * pageSize,
        sort: { createdAt: -1 }
    }
);

const totalPages = Math.ceil(total / pageSize);
console.log(`Page ${page}/${totalPages}, ${total} records in total`);
```

### With Projection and Sorting

```javascript
const { data, total } = await collection.findAndCount(
    { status: 'published' },
    {
        projection: { title: 1, author: 1, publishedAt: 1 },
        sort: { publishedAt: -1 },
        limit: 10
    }
);
```

### Enable Cache

```javascript
const { data, total } = await collection.findAndCount(
    { category: 'news' },
    { 
        limit: 20,
        cache: 60000  // cache for 60 seconds
    }
);
```

## Performance Benefits

- ✅ Runs `find()` and `countDocuments()` in parallel, which is faster than serial execution
- ✅ Supports automatic caching, making repeated queries faster
- ✅ Reduces boilerplate by completing the operation with one call

## Notes

1. **`limit` is `undefined`** - does not limit the number of returned documents and queries all matches
2. **`limit` is `0`** - means no limit in MongoDB and returns all data
3. **Cache key** - includes query, projection, sort, limit, and skip
4. **Best-fit scenarios** - paginated queries and list views

## Comparison with the Traditional Approach

### ❌ Traditional Approach (Two Calls)

```javascript
const data = await collection.find({ status: 'active' }, { limit: 20 });
const total = await collection.countDocuments({ status: 'active' });
```

### ✅ findAndCount (One Call, Parallel Execution)

```javascript
const { data, total } = await collection.findAndCount(
    { status: 'active' },
    { limit: 20 }
);
```

## Related Methods

- [find](./find.md) - query documents
- [findOne](./findOne.md) - query a single document
- [findPage](./findPage.md) - cursor pagination query
- [count](./count.md) - count documents

## Test Coverage

- ✅ Basic functionality: 6 tests
- ✅ Pagination scenarios: 4 tests
- ✅ Edge cases: 4 tests
- ✅ Cache functionality: 1 test
- ✅ Parameter validation: 2 tests
- ✅ Performance test: 1 test

**Test coverage**: 100%

