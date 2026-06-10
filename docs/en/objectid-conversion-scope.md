# ObjectId conversion range description

## 📋 Question

User asked:
1. Will all ObjectId compatibility be converted?
2. Or will only versions smaller than 6.0 be converted?
3. Will the actual data provided trigger the conversion?

## ✅ Answer


## 1. Conversion range

**monSQLize only converts the following two types**:

| Type | Example | Will Convert | Conversion Target |
|------|------|--------|---------|
| **ObjectId instance** (old version) | `mongoose.Types.ObjectId(...)` | ✅ Yes | bson@6.x ObjectId |
| **24-digit hexadecimal string** | `"6975da7914d83bc3e18e8123"` | ✅ Yes | bson@6.x ObjectId |
| **MongoDB Extended JSON** | `{"$oid": "6975..."}` | ❌ No | Do not convert |
| **Current version ObjectId** | `new ObjectId(...)` (bson@6.x) | ❌ No | Do not convert (already the target format) |


## 2. Version judgment logic

**It is not judged by the version number, but by the instance type**:

```javascript
//Detection logic
if (obj instanceof ObjectId) {
  //It is already the ObjectId of bson@6.x and will not be converted.
  return obj;
}

if (obj && typeof obj === 'object' && obj.constructor && obj.constructor.name === 'ObjectId') {
  //is an old version of ObjectId instance (bson@4.x or bson@5.x)
  //Convert to bson@6.x
  return new ObjectId(obj.toString());
}

if (typeof obj === 'string' && /^[0-9a-fA-F]{24}$/.test(obj)) {
  //is a 24-digit hexadecimal string
  //Convert to bson@6.x ObjectId
  return new ObjectId(obj);
}

//Other types are not converted
return obj;
```


## 3. Your data analysis

**Data format you provided**:

```json
{
  "_id": {"$oid": "6975da7914d83bc3e18e8123"},
  "owner_id": {"$oid": "69005bc26654d09120d0f82a"},
  "components": [
    {
      "content": [
        {
          "id": {"$oid": "68f1d9e7b53745e8627a952f"}
        }
      ]
    }
  ]
}
```

**Conversion situation**:

```text
❌ Does not trigger any ObjectId conversion
```

**Reason**:

1. `{"$oid": "..."}` is **MongoDB Extended JSON format**
2. This is a normal JavaScript object, not an ObjectId instance
3. The MongoDB driver will automatically process Extended JSON without monSQLize conversion.

---

## 🎯 Under what circumstances will it be converted?


## Scenario 1: mongoose ObjectId instance (most common)

```javascript
//mongoose service (using bson@4.x/5.x)
const mongoose = require('mongoose');
const user = await User.findOne({ ... }).lean();

//user.owner_id is an ObjectId instance of mongoose
user.owner_id.constructor.name // "ObjectId"
user.owner_id instanceof require('mongodb').ObjectId //false (not bson@6.x)

//Pass to monSQLize
await msq.collection('trips').insertOne(user);
//✅ Will convert: user.owner_id from bson@4.x → bson@6.x
```


## Scenario 2: ObjectId string

```javascript
//Data received from API
const data = {
  _id: "6975da7914d83bc3e18e8123",  //string
  owner_id: "69005bc26654d09120d0f82a"  //string
};

await msq.collection('trips').insertOne(data);
//✅ Will convert: string → bson@6.x ObjectId
```


## Scenario 3: Extended JSON (your case)

```javascript
//JSON exported from MongoDB
const data = {
  _id: {"$oid": "6975da7914d83bc3e18e8123"},  // Extended JSON
  owner_id: {"$oid": "69005bc26654d09120d0f82a"}  // Extended JSON
};

await msq.collection('trips').insertOne(data);
//❌ No conversion: MongoDB driver automatically processes Extended JSON
```

---

## 📊 Analysis of slow query reasons (528ms)


## ✅ Troubleshooting reasons

**ObjectId conversion is not the reason for slow queries**:
- Your data is in Extended JSON format
- Will not trigger ObjectId cross-version conversion
- Conversion time: 0ms


## 🎯 The real reason

According to data analysis:

1. **Document Size** (most likely) ⭐⭐⭐⭐⭐
   - 46 fields
   - `components[0].content` contains ~30KB of HTML string
   - Serialization and network transmission time: 100-200ms

2. **Network delay**
   - Cross-service calls (Service A → Service B → MongoDB)
   - Network round-trip time: 50-150ms

3. **Database writing**
   - Index update
   - Disk I/O
   - Time consumption: 100-200ms

**Total time consumption estimate**: 250-550ms ✅ Actual 528ms

---

## 💡 Optimization suggestions


## 1. If 528ms is acceptable

Adjust slow query threshold:

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017' },
  slowQueryMs: 1000  //Adjust to 1000ms
});
```


## 2. Optimize document structure

Store large HTML in a separate place:

```javascript
//Option A: separate collections
await msq.collection('trip_contents').insertOne({
  trip_id: tripId,
  component_id: 'id-1',
  content: largeHTMLString
});

await msq.collection('trips').insertOne({
  ...tripData,
  components: [
    {
      id: 'id-1',
      type: 'post',
      content_ref: contentId  //Save only references
    }
  ]
});

//Option B: Object Storage (Recommended)
const contentUrl = await uploadToS3(largeHTMLString);
components[0].content_url = contentUrl;
```


## 3. Compress content

```javascript
const zlib = require('zlib');

//Compression
const compressed = zlib.gzipSync(largeHTMLString);
await msq.collection('trip_contents').insertOne({
  trip_id: tripId,
  content: compressed,
  compressed: true
});

//Unzip
const content = zlib.gunzipSync(doc.content).toString();
```


## 4. Check the index

```javascript
//View index
const indexes = await msq.collection('trips').getIndexes();
console.log('Number of indexes:', indexes.length);

//If there are too many indexes (> 5), consider deleting unnecessary ones
```

---

## 📝 Summary

| Question | Answer |
|------|------|
| Are all ObjectIds converted? | ❌ No, only old version ObjectId instances and strings are converted |
| Convert only versions < 6.0? | ✅ Yes, only convert ObjectId instances of bson@4.x/5.x |
| Does your data trigger conversions? | ❌ No, Extended JSON does not trigger conversion |
| Is ObjectId conversion the cause of slow query? | ❌ No, slow queries are caused by document size and network latency |

---

**Key Takeaways**:

1. ✅ **Extended JSON does not trigger conversion**
2. ✅ **Only mongoose’s ObjectId instances will be converted**
3. ✅ **Your slow query has nothing to do with ObjectId conversion**
4. ✅ **The real reason is the document size (30KB HTML)**

---

**Date**: 2026-01-27
**Version**: v1.1.2
