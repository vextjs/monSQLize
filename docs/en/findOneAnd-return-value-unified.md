# Unified description of return value of findOneAnd* method

**Documentation version**: currently main / unreleased
**Last updated**: 2026-06-10
**Applicable version**: monSQLize v2.0.2+

---

## Table of Contents

- [📋 Overview](#overview)
- [❓ Problem background](#problem-background)
- [MongoDB Driver version differences](#mongodb-driver-version-differences)
  - [Driver 4.x return format](#driver-4x-return-format)
  - [Driver 5.x return format](#driver-5x-return-format)
  - [Driver 6.x / 7.x default return format](#driver-6x-7x-default-return-format)
- [Question](#question)
- [✅ monSQLize solution](#monsqlize-solution)
- [Default relies on unified user experience](#default-relies-on-unified-user-experience)
- [🔧 Implementation principle](#implementation-principle)
- [Driver thin package](#driver-thin-package)
- [Validation boundaries](#validation-boundaries)
- [📊Applicable methods](#applicable-methods)
- [1. findOneAndUpdate ✅](#1-findoneandupdate)
- [2. findOneAndReplace ✅](#2-findoneandreplace)
- [3. findOneAndDelete ✅](#3-findoneanddelete)
- [🎯 User experience comparison](#user-experience-comparison)
- [❌ Use native Driver (requires manual processing)](#use-native-driver-requires-manual-processing)
- [✅ Use monSQLize (automatic processing)](#use-monsqlize-automatic-processing)
- [🧪 Test verification](#test-verification)
- [Test coverage](#test-coverage)
- [Run the test](#run-the-test)
- [💡 Best Practices](#best-practices)
- [1. Use monSQLize without modifying the code](#1-use-monsqlize-without-modifying-the-code)
- [2. Avoid overwriting the default Driver in the application](#2-avoid-overwriting-the-default-driver-in-the-application)
- [3. Handle non-existent situations](#3-handle-non-existent-situations)
- [🎉 Summary](#summary)
- [✅ Advantages of monSQLize](#advantages-of-monsqlize)
- [📚 Related documents](#related-documents)

## 📋 Overview

This document details how monSQLize uniformly handles the return value differences of the `findOneAndUpdate`, `findOneAndReplace`, and `findOneAndDelete` methods in different MongoDB Driver versions.

---

## ❓ Problem background


## MongoDB Driver version differences

There are significant differences in the return value format of the `findOneAnd*` method across different versions of the MongoDB Node.js Driver. Currently, monSQLize is installed with `mongodb@6.21.0` by default; Driver 7.2.0 is the extended matrix verification version.


### Driver 4.x return format

```javascript
const result = await collection.findOneAndUpdate(
  { name: 'Alice' },
  { $set: { age: 31 } }
);

console.log(result);
//Output:
{
  value: { _id: ..., name: "Alice", age: 31 },  //Document content
  ok: 1,                                         //operating status
  lastErrorObject: {                             //error object
    n: 1,
    updatedExisting: true,
    upserted: undefined
  }
}

//❌ Need to extract value manually
const user = result.value;
```


### Driver 5.x return format

```javascript
const result = await collection.findOneAndUpdate(
  { name: 'Alice' },
  { $set: { age: 31 } }
);

console.log(result);
//Output:
{
  value: { _id: ..., name: "Alice", age: 31 }  //Return only documents
}

//❌ Still need to extract value
const user = result.value;
```


### Driver 6.x / 7.x default return format

```javascript
const result = await collection.findOneAndUpdate(
  { name: 'Alice' },
  { $set: { age: 31 } }
);

console.log(result);
//Output:
{
  _id: ...,
  name: "Alice",
  age: 31
}

//✅ The default is already the document itself
const user = result;
```


## Question

If you use the MongoDB Driver directly, the user code needs to handle different return values depending on the version:

```javascript
//❌ Users need to manually handle version differences
const result = await collection.findOneAndUpdate(filter, update);

let user;
if (driverVersion === 4) {
  user = result.value;  // Driver 4.x
} else if (driverVersion === 5) {
  user = result.value;  // Driver 5.x
} else if (driverVersion >= 6) {
  user = result;        //Driver 6.x / 7.x default behavior
}
```

---

## ✅ monSQLize solution


## Default relies on unified user experience

monSQLize installs `mongodb@6.21.0` with the package by default, and verifies the Driver 7.2.0 extension matrix. When using the default installation, `findOneAnd*` directly returns the document or `null`, **users do not need to install additionally or select the driver version**.

```javascript
//✅ Use default monSQLize installation
const user = await collection.findOneAndUpdate(
  { name: 'Alice' },
  { $set: { age: 31 } }
);

//✅ Return the document itself directly (not result.value)
console.log(user);
//Output: { _id: ..., name: "Alice", age: 31 }

//✅ No need to judge the version
//✅ No need to extract value
//✅ The code is concise and clear
```

---

## 🔧 Implementation principle


## Driver thin package

monSQLize calls the MongoDB Driver native method in `src/adapters/mongodb/writes/write-basic.ts` and maintains the default return form of the current driver baseline:

```javascript
//monSQLize internal implementation (simplified version)
async findOneAndUpdate(filter, update, options = {}) {
  //1. Call the native Driver
  const result = await this.nativeCollection.findOneAndUpdate(
    filter,
    update,
    options
  );

  //2. Return the document/null form of the current driver baseline
  return result;
}
```


## Validation boundaries

- `mongodb@6.21.0` is the default runtime baseline.
- Driver 7.2.0 passed the compatibility matrix as an extended validation.
- `{ value, ok, lastErrorObject }` of Driver 4.x / 5.x is a historical migration background, and it is not recommended to overwrite the default dependencies in new projects.

---

## 📊Applicable methods

monSQLize unifies the return values ​​for the following 3 methods:


## 1. findOneAndUpdate ✅

```javascript
//✅ All versions return to a unified format
const updatedUser = await collection.findOneAndUpdate(
  { name: 'Alice' },
  { $set: { age: 31 } },
  { returnDocument: 'after' }
);

console.log(updatedUser);  // { _id: ..., name: "Alice", age: 31 }
```


## 2. findOneAndReplace ✅

```javascript
//✅ All versions return to a unified format
const replacedUser = await collection.findOneAndReplace(
  { name: 'Alice' },
  { name: 'Alice', age: 31, status: 'active' },
  { returnDocument: 'after' }
);

console.log(replacedUser);  // { _id: ..., name: "Alice", age: 31, status: "active" }
```


## 3. findOneAndDelete ✅

```javascript
//✅ All versions return to a unified format
const deletedUser = await collection.findOneAndDelete({ name: 'Alice' });

console.log(deletedUser);  // { _id: ..., name: "Alice", age: 31 }
```

---

## 🎯 User experience comparison


## ❌ Use native Driver (requires manual processing)

```javascript
const { MongoClient } = require('mongodb');
const client = await MongoClient.connect('mongodb://localhost:27017');
const collection = client.db('mydb').collection('users');

//❌ Return complex objects
const result = await collection.findOneAndUpdate(
  { name: 'Alice' },
  { $set: { age: 31 } },
  { returnDocument: 'after' }
);

//❌ Need to extract value manually
const user = result.value;

//❌ Need to determine whether it exists
if (!user) {
  console.log('User does not exist');
  return;
}

console.log(user.name);
```


## ✅ Use monSQLize (automatic processing)

```javascript
import MonSQLize from 'monsqlize';
const db = new MonSQLize({ type: 'mongodb', config: { uri: '...' } });
await db.connect();
const collection = db.collection('users');

//✅ Return directly to the document
const user = await collection.findOneAndUpdate(
  { name: 'Alice' },
  { $set: { age: 31 } },
  { returnDocument: 'after' }
);

//✅Use directly
if (!user) {
  console.log('User does not exist');
  return;
}

console.log(user.name);  //concise and clear
```

---

## 🧪 Test verification


## Test coverage

monSQLize verifies the default driver baseline and extended drivers against the current compatibility matrix:

| Driver version | Test status | findOneAndUpdate | findOneAndReplace | findOneAndDelete |
|------------|---------|-----------------|------------------|-----------------|
| 6.21.0 | ✅ Default baseline | ✅ docs/null | ✅ docs/null | ✅ docs/null |
| 7.2.0 | ✅ Extended Validation | ✅ docs/null | ✅ docs/null | ✅ docs/null |
| 4.x / 5.x | ℹ️ Historical background | ⚠️ Native metadata form | ⚠️ Native metadata form | ⚠️ Native metadata form |


## Run the test

```bash
# Run Compatibility Matrix
npm run test:compatibility

# Run MongoDB server matrix
npm run test:server-matrix

# View the currently resolved driver
npm ls mongodb
```

---

## 💡 Best Practices


## 1. Use monSQLize without modifying the code

```javascript
//✅ Recommendation: Use monSQLize
const user = await collection.findOneAndUpdate(filter, update);
//Return the document directly, all versions are consistent
```


## 2. Avoid overwriting the default Driver in the application

```javascript
//✅ Recommendation: Use the default runtime dependency of monSQLize
//Package manager does not require additional declaration of mongodb
//If you must cover the driver, please run the compatibility matrix first
```


## 3. Handle non-existent situations

```javascript
const user = await collection.findOneAndUpdate(filter, update);

if (!user) {
  //Document does not exist
  console.log('No matching document found');
  return;
}

//The document exists and can be used directly.
console.log(user.name);
```

---

## 🎉 Summary


## ✅ Advantages of monSQLize

1. **Default installation means unified experience**
   - Default Driver baseline returns document or `null`
- Users do not need to manually extract `value`
   - Code is more concise and clear

2. **There is a verification entrance for version upgrade**
   - Compatibility matrix covers `mongodb@6.21.0` with Driver 7.2.0
   - User code does not need to add version judgment for default installation
   - Run matrix verification before upgrading to new major version

3. **Full Test Coverage**
   - Test the current default driver and extended driver
   - Validate all `findOneAnd*` methods
   - Verification results are recorded in `test/validation/`

4. **Improve development efficiency**
   - Reduce code size by 30-50%
   - Avoid version judgment logic
   - Focus more on business logic

---

## 📚 Related documents

- 📖[MongoDB Driver Compatibility Guide](./mongodb-driver-compatibility.md)
- 📖[Compatibility Matrix Configuration](../../test/compatibility/matrix.json)
- 📖[Verification Progress](../../test/validation/VERIFICATION-PROGRESS.md)

---

**Conclusion**: When using the default installation of monSQLize, the `findOneAnd*` method returns the document or `null`. Users do not need to install additional drivers or manually handle `result.value`.

