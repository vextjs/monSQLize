# Schema 验证 API

集合级别的文档验证功能，确保数据质量。

---

## 目录

- [setValidator()](#setvalidator) - 设置验证规则
- [setValidationLevel()](#setvalidationlevel) - 设置验证级别
- [setValidationAction()](#setvalidationaction) - 设置验证行为
- [getValidator()](#getvalidator) - 获取验证配置

---

## setValidator()

设置集合的 Schema 验证规则。

### 语法

```javascript
await collection.setValidator(validator, [options]);
```

### 参数

- **validator** (Object, 必需): 验证规则
- **options** (Object, 可选):
  - `validationLevel` (string): 验证级别
  - `validationAction` (string): 验证行为

### 验证规则格式

#### 1. JSON Schema（推荐）

```javascript
await collection.setValidator({
    $jsonSchema: {
        bsonType: 'object',
        required: ['name', 'email'],
        properties: {
            name: {
                bsonType: 'string',
                description: 'must be a string'
            },
            email: {
                bsonType: 'string',
                pattern: '^.+@.+$',
                description: 'must be a valid email'
            },
            age: {
                bsonType: 'int',
                minimum: 0,
                maximum: 120
            }
        }
    }
});
```

#### 2. 查询表达式

```javascript
await collection.setValidator({
    $and: [
        { name: { $type: 'string' } },
        { email: { $regex: /@/ } },
        { age: { $gte: 0, $lte: 120 } }
    ]
});
```

### 示例

```javascript
const { collection } = await db.connect();
const users = collection('users');

// 设置验证规则
await users.setValidator({
    $jsonSchema: {
        bsonType: 'object',
        required: ['username', 'email'],
        properties: {
            username: {
                bsonType: 'string',
                minLength: 3,
                maxLength: 30
            },
            email: {
                bsonType: 'string',
                pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
            },
            age: {
                bsonType: 'int',
                minimum: 18
            },
            role: {
                enum: ['user', 'admin', 'moderator']
            }
        }
    }
}, {
    validationLevel: 'strict',
    validationAction: 'error'
});

// 测试验证
try {
    await users.insertOne({ username: 'ab' }); // 太短，失败
} catch (error) {
    console.error('验证失败:', error.message);
}

await users.insertOne({
    username: 'alice',
    email: 'alice@example.com',
    age: 25,
    role: 'user'
}); // 成功
```

---

## setValidationLevel()

设置验证级别。

### 验证级别

- **`strict`**: 对所有插入和更新进行验证（默认）
- **`moderate`**: 只验证有效文档的更新，不验证现有无效文档
- **`off`**: 禁用验证

### 语法

```javascript
await collection.setValidationLevel(level);
```

### 示例

```javascript
// 严格验证（所有文档）
await collection.setValidationLevel('strict');

// 适度验证（只验证有效文档）
await collection.setValidationLevel('moderate');

// 禁用验证
await collection.setValidationLevel('off');
```

---

## setValidationAction()

设置验证失败时的行为。

### 验证行为

- **`error`**: 拒绝不符合规则的文档（默认）
- **`warn`**: 允许写入但记录警告

### 语法

```javascript
await collection.setValidationAction(action);
```

### 示例

```javascript
// 拒绝无效文档
await collection.setValidationAction('error');

// 允许但警告
await collection.setValidationAction('warn');
```

---

## getValidator()

获取当前的验证配置。

### 语法

```javascript
const validation = await collection.getValidator();
```

### 返回值

- **类型**: `Promise<Object>`
- **属性**:
  - `validator` (Object|null): 验证规则
  - `validationLevel` (string): 验证级别
  - `validationAction` (string): 验证行为

### 示例

```javascript
const validation = await collection.getValidator();

console.log('验证规则:', validation.validator);
console.log('验证级别:', validation.validationLevel); // 'strict'
console.log('验证行为:', validation.validationAction); // 'error'
```

---

## 完整示例

```javascript
const MonSQLize = require('monsqlize');

async function setupValidation() {
    const db = new MonSQLize({
        type: 'mongodb',
        config: { uri: 'mongodb://localhost:27017/mydb' }
    });
    
    await db.connect();
    const { collection } = await db.connect();
    const users = collection('users');
    
    // 1. 设置验证规则
    await users.setValidator({
        $jsonSchema: {
            bsonType: 'object',
            required: ['name', 'email', 'age'],
            properties: {
                name: {
                    bsonType: 'string',
                    minLength: 2,
                    maxLength: 50
                },
                email: {
                    bsonType: 'string',
                    pattern: '^.+@.+\\..+$'
                },
                age: {
                    bsonType: 'int',
                    minimum: 0,
                    maximum: 120
                },
                status: {
                    enum: ['active', 'inactive', 'suspended']
                }
            }
        }
    });
    
    // 2. 设置验证级别为严格
    await users.setValidationLevel('strict');
    
    // 3. 设置验证失败时抛出错误
    await users.setValidationAction('error');
    
    // 4. 验证配置
    const validation = await users.getValidator();
    console.log('✅ 验证配置已生效');
    
    // 5. 测试插入有效数据
    const result = await users.insertOne({
        name: 'Alice',
        email: 'alice@example.com',
        age: 30,
        status: 'active'
    });
    console.log('✅ 有效数据插入成功:', result.insertedId);
    
    // 6. 测试插入无效数据
    try {
        await users.insertOne({
            name: 'A', // 太短
            email: 'invalid-email', // 格式错误
            age: 150 // 超出范围
        });
    } catch (error) {
        console.log('❌ 无效数据被拒绝:', error.message);
    }
    
    await db.close();
}

setupValidation().catch(console.error);
```

---

## 相关文档

- [集合管理](./collection-mgmt.md) - collMod, stats
- [示例代码](../examples/admin.examples.js)

---

**最后更新**: 2025-12-02  
**版本**: v0.3.0

