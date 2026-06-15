# ES Module (`import`) Support

**Version**: 1.0  
**Last updated**: 2026-06-10

---

## Table of Contents

- [Overview](#overview)
- [Supported Import Styles](#supported-import-styles)
- [Package.json Configuration](#packagejson-configuration)
- [Usage Examples](#usage-examples)
- [Import Style Comparison](#import-style-comparison)
- [Available Exports](#available-exports)
- [Testing ES Module Support](#testing-es-module-support)
- [Best Practices](#best-practices)
- [Migration Guide](#migration-guide)
- [Notes](#notes)
- [Compatibility Matrix](#compatibility-matrix)
- [Summary](#summary)

---

## Overview

monSQLize supports both **ES Module (`import`)** and **CommonJS (`require`)** consumption paths.

---

## Supported Import Styles

### Style 1: CommonJS (`require`)

```javascript
// Traditional CommonJS style.
const MonSQLize = require('monsqlize');

const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017/mydb' }
});

await msq.connect();
```

### Style 2: ES Module (`import`)

```javascript
// Modern ES Module style.
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017/mydb' }
});

await msq.connect();
```

---

## Package.json Configuration

monSQLize exposes CJS, ESM, and TypeScript declaration entries through package exports:

```json
{
  "name": "monsqlize",
  "main": "dist/cjs/index.cjs",
  "module": "dist/esm/index.mjs",
  "type": "commonjs",
  "exports": {
    ".": {
      "require": "./dist/cjs/index.cjs",
      "import": "./dist/esm/index.mjs",
      "types": "./dist/types/index.d.ts"
    }
  }
}
```

---

## Usage Examples

### CommonJS Project

**File**: `app.cjs`

```javascript
const MonSQLize = require('monsqlize');

async function main() {
  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'myapp',
    config: {
      uri: 'mongodb://localhost:27017'
    }
  });

  await msq.connect();

  const users = msq.collection('users');
  const user = await users.findOne({ name: 'Alice' });

  console.log(user);

  await msq.close();
}

main().catch(console.error);
```

Run:

```bash
node app.cjs
```

---

### ES Module Project

**File**: `app.mjs`, or `app.js` when package.json contains `"type": "module"`

```javascript
import MonSQLize from 'monsqlize';

async function main() {
  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'myapp',
    config: {
      uri: 'mongodb://localhost:27017'
    }
  });

  await msq.connect();

  const users = msq.collection('users');
  const user = await users.findOne({ name: 'Alice' });

  console.log(user);

  await msq.close();
}

main().catch(console.error);
```

Run:

```bash
node app.mjs
# or
node app.js  # when package.json has "type": "module"
```

---

## Import Style Comparison

### Default Export

```javascript
// CommonJS
const MonSQLize = require('monsqlize');

// ES Module
import MonSQLize from 'monsqlize';
```

### Named Exports

```javascript
// CommonJS
const { Logger, MemoryCache } = require('monsqlize');

// ES Module
import { Logger, MemoryCache } from 'monsqlize';
```

### Mixed Usage

```javascript
// CommonJS
const MonSQLize = require('monsqlize');
const Logger = MonSQLize.Logger;

// ES Module
import MonSQLize, { Logger, MemoryCache } from 'monsqlize';
```

---

## Available Exports

### Default Export

- `MonSQLize` (main class)

### Named Exports

- `MonSQLize` (main class)
- `Logger`
- `MemoryCache`
- `createRedisCacheAdapter`
- `TransactionManager`
- `CacheLockManager`
- `DistributedCacheInvalidator`

---

## Testing ES Module Support

### Run Runtime Import Tests

```bash
# Run root-entry CJS / ESM import tests.
npm run test:runtime
```

### Covered Checks

1. Default export (`import MonSQLize`)
2. Named exports (`import { Logger }`)
3. Instance creation
4. Connection and basic operations

---

## Best Practices

### 1. Choose the Right Import Style

Use CommonJS when:

- Your project is a traditional CommonJS Node.js project.
- Your surrounding code still uses `require()`.
- The rest of your dependency graph is mostly CommonJS.

Use ES Module when:

- You are starting a modern JavaScript project.
- You want native `import` syntax.
- You use TypeScript or a modern frontend/build-tool pipeline.

### 2. TypeScript Support

monSQLize provides TypeScript declarations:

```typescript
// CommonJS.
import MonSQLize from 'monsqlize';

// ES Module.
import type { Collection } from 'monsqlize';

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'myapp',
  config: { uri: '...' }
});

const users: Collection = msq.collection('users');
```

### 3. Declare the Module Type in package.json

For ES Module projects:

```json
{
  "type": "module"
}
```

For CommonJS projects:

```json
{
  "type": "commonjs"
}
```

---

## Migration Guide

### Migrating from CommonJS to ES Module

**Step 1**: Update package.json

```json
{
  "type": "module"
}
```

**Step 2**: Update file extensions when needed

- Keep `.js` if package.json uses `"type": "module"`.
- Or rename files to `.mjs`.

**Step 3**: Update imports

```javascript
// Before (CommonJS)
const MonSQLize = require('monsqlize');

// After (ES Module)
import MonSQLize from 'monsqlize';
```

**Step 4**: Update exports

```javascript
// Before (CommonJS)
module.exports = myFunction;

// After (ES Module)
export default myFunction;
```

**Step 5**: Use top-level await when it fits

```javascript
// ES Module supports top-level await.
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({ /* ... */ });
await msq.connect();
```

---

## Notes

### 1. File Extensions

- **ES Module**: use `.mjs`, or `.js` when package.json sets `"type": "module"`.
- **CommonJS**: use `.cjs`, or `.js` when package.json sets `"type": "commonjs"` or omits `"type"`.

### 2. `__dirname` and `__filename`

`__dirname` and `__filename` are not available in ES Module files. Use this replacement:

```javascript
// CommonJS provides __dirname and __filename directly.
// ES Module replacement for __dirname and __filename.
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

### 3. `require()` Is Not Available in ES Module Files

```javascript
// Not available in ES Module files
const fs = require('node:fs');

// Correct
import fs from 'node:fs';
```

### 4. Dynamic Import

```javascript
// CommonJS
const moduleValue = require('./module');

// ES Module - static import
import moduleValue from './module.js';

// ES Module - dynamic import
const moduleValue = await import('./module.js');
```

---

## Compatibility Matrix

| Node.js version | CommonJS | ES Module |
|-----------------|----------|-----------|
| 18.x | ✅ Supported | ✅ Supported |
| 20.x | ✅ Supported | ✅ Supported |
| 22.x | ✅ Supported | ✅ Supported |

---

## Summary

### monSQLize supports

1. **CommonJS (`require`)** - traditional Node.js consumption.
2. **ES Module (`import`)** - modern JavaScript consumption.

### Features

- Dual-mode package exports.
- Correct package.json export mapping.
- Runtime import tests.
- TypeScript declaration output.
- Practical migration guidance.

### No Changes Required for Existing Users

- Existing CommonJS projects can continue using `require()`.
- New projects can use ES Module imports directly.
- Both consumption styles expose the same public API surface.

---

**Version requirement**: Node.js >= 18.0.0  
**Recommended versions**: Node.js 20.x or 22.x LTS
