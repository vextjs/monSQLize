# ObjectId conversion log configuration instructions

## 📋Default behavior

**v1.1.1 is completely silent by default** - does not output any ObjectId conversion log ✅

```javascript
//Default configuration
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017' }
});

await msq.collection('users').insertOne(dataWithObjectIds);
//✅ No log output (completely silent)
```

## 🎯 Why is it silent by default?

1. **The log has no practical effect**: ObjectId conversion is automatic and users do not need to care.
2. **Avoid log pollution**: Too many logs will be generated when a large amount of data is available
3. **Production environment friendly**: Reduce log storage and performance overhead
4. **Transparent conversion**: User-free, automatically handles compatibility issues

## 🔧 Configuration options

If you need to debug or understand conversion details, you can enable logging:


## Option 1: Enable summary logging (recommended for debugging)

Only one summary is output for each operation:

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017' },
  autoConvertObjectId: {
    silent: false  //Turn off quiesce, enable summary logging
  }
});

await msq.collection('users').insertOne(dataWithObjectIds);
//Output: [DEBUG] [ObjectId Converter] Converted 15 cross-version ObjectIds
```


## Option 2: Enable verbose logging (only for in-depth debugging)

Output conversion details for each ObjectId:

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017' },
  autoConvertObjectId: {
    silent: false,   //Turn off silence
    verbose: true    //Enable verbose logging
  }
});

await msq.collection('users').insertOne(dataWithObjectIds);
//Output: Each ObjectId has a detailed log
```

## 📊 Configuration comparison

| Mode | silent | verbose | Log output | Applicable scenarios |
|------|--------|---------|---------|---------|
| **Silent Mode** (Default)✅ | `true` | - | None | Production environment, daily development |
| **Summary mode** | `false` | `false` | 1 summary | When you need to know the conversion status |
| **Detailed Mode** | `false` | `true` | N details | In-depth debugging and troubleshooting |

## 💡 Complete configuration example


## Simplest configuration (recommended)

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017' }
  //Completely silent by default, no configuration required
});
```


## Debug configuration (temporarily enabled)

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017' },
  autoConvertObjectId: {
    silent: false  //Temporarily enable summary logging
  }
});
```


## Full configuration (all options)

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017' },
  autoConvertObjectId: {
    enabled: true,           //Whether to enable automatic conversion (default true)
    silent: true,            //Silent mode (default true, no logs are output)
    verbose: false,          //Detailed log (default false)
    excludeFields: [],       //exclude fields
    customFieldPatterns: [], //Custom field pattern
    maxDepth: 10            //maximum recursion depth
  }
});
```

## 🎯 Usage suggestions


## Production environment

```javascript
//Just use the default configuration
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017' }
});
```


## Development environment (daily)

```javascript
//In most cases, the default configuration is used
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017' }
});
```


## Debugging scenario

```javascript
//Only enable temporarily if you suspect a problem with ObjectId conversion
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017' },
  autoConvertObjectId: {
    silent: false  //Temporarily enable summary logging
  }
});
```

## ❓ FAQ


## Q: Will there be any problems if the log is not output at all?

A: No. ObjectId conversion is automatic, transparent, and safe. If there is a problem, an exception will be thrown during the actual operation (such as insertOne).


## Q: How to know if conversion has occurred?

A: Normally you don't need to know. If you really need, you can temporarily set `silent: false` to view.


## Q: What happens if the conversion fails?

A: If the conversion fails, a WARN log will be output (not controlled by silent) and the original value will be returned without interrupting the process.


## Q: Can the log be output only when the conversion fails?

A: Yes. The default configuration already implements this:
- `silent: true`: Do not output logs of successful conversions
- Conversion failed: always output WARN log (not controlled by silent)

## 📝 Summary

- ✅ **Completely silent by default**: No logs of successful conversions will be output.
- ✅ **Always prompt on failure**: WARN is always output when conversion fails
- ✅ **Can be enabled on demand**: Logs can be temporarily enabled during debugging
- ✅ **Production Friendly**: Reduce log volume and improve performance

---

**Updated version**: v1.1.1
**Updated date**: 2026-01-27
