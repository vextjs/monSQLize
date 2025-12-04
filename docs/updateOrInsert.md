# updateOrInsert 扩展方法

> **版本**: v1.2.0+  
> **类型**: 扩展方法  
> **优先级**: P1

---

## 📋 概述

`updateOrInsert` 是一个强大的扩展方法，用于更新或插入文档，支持深度合并策略。特别适合配置管理场景，可以只更新指定字段，保留所有未修改的字段。

---

## 🎯 核心特性

| 特性 | 说明 |
|------|------|
| **深度合并** | 递归合并嵌套对象，保留未修改字段 |
| **3 种策略** | replace（完全替换）、shallow（浅合并）、deep（深度合并）|
| **代码减少** | 6-8 行原生代码 → 1-2 行扩展方法（减少 70%）|
| **配置管理** | 完美支持用户配置、系统配置等场景 |
| **精确控制** | 只更新指定字段，保留其他所有字段 |

---

## 📖 API 签名

```typescript
updateOrInsert(
  query: Object,
  update: Object,
  options?: UpdateOrInsertOptions
): Promise<UpdateOrInsertResult>

interface UpdateOrInsertOptions {
  mergeStrategy?: 'replace' | 'shallow' | 'deep';  // 合并策略（默认: 'replace'）
  projection?: Object;                             // 字段投影
  maxTimeMS?: number;                              // 查询超时时间
  comment?: string;                                // 查询注释
  session?: ClientSession;                         // MongoDB 会话（事务支持）
}

interface UpdateOrInsertResult {
  doc: Object;                                     // 文档对象
  upserted: boolean;                               // 是否新插入（true: 新插入, false: 已更新）
  modified: boolean;                               // 是否有修改（仅 upserted: false 时有意义）
}
```

---

## 🚀 使用场景

### 场景 1: 用户配置管理

**业务需求**: 用户修改主题和邮件通知，但要保留语言、字体大小、快捷键等其他 5 个配置项。

#### ❌ 原生实现（6-8 行，容易出错）

```javascript
// 原生 API 需要 6-8 行代码
const userId = 100;

// 1. 查询现有配置
let config = await UserConfig.findOne({ userId });

if (!config) {
  // 2. 不存在则创建
  config = await UserConfig.insertOne({
    userId,
    preferences: {
      theme: 'dark',
      notifications: { email: false }
    }
  });
} else {
  // 3. 存在则更新（需要手动合并）
  config = await UserConfig.updateOne(
    { userId },
    {
      $set: {
        'preferences.theme': 'dark',
        'preferences.notifications.email': false
      }
    }
  );
}

// 问题：
// 1. 代码冗长（6-8 行）
// 2. 使用 $set 语法复杂（'preferences.theme'）
// 3. 容易遗漏字段
// 4. 嵌套深度大时难以维护
```

#### ✅ updateOrInsert（深度合并，1 行）

```javascript
const result = await UserConfig.updateOrInsert(
  { userId: 100 },
  {
    preferences: {
      theme: 'dark',
      notifications: {
        email: false  // 只更新这一项
      }
    }
  },
  { mergeStrategy: 'deep' }
);

// 结果：
// {
//   doc: {
//     userId: 100,
//     preferences: {
//       theme: 'dark',          // ✅ 已更新
//       language: 'en',         // ✅ 保留
//       fontSize: 14,           // ✅ 保留
//       notifications: {
//         email: false,         // ✅ 已更新
//         push: true,           // ✅ 保留
//         sms: false            // ✅ 保留
//       },
//       shortcuts: {            // ✅ 完整保留
//         save: 'Ctrl+S',
//         copy: 'Ctrl+C'
//       }
//     }
//   },
//   upserted: false,
//   modified: true
// }

// 优势：
// ✅ 1 行代码（减少 80%）
// ✅ 只更新 2 个字段，保留 5 个字段
// ✅ 简洁易懂
// ✅ 自动处理嵌套对象
```

---

### 场景 2: 系统功能开关

**业务需求**: 启用 AI 功能，但保留其他功能状态和系统配置。

#### ✅ updateOrInsert（深度合并）

```javascript
const result = await SystemConfig.updateOrInsert(
  { key: 'features' },
  {
    settings: {
      features: {
        ai: true  // 只启用 AI
      }
    }
  },
  { mergeStrategy: 'deep' }
);

// 结果：
// {
//   key: 'features',
//   settings: {
//     maintenance: false,      // ✅ 保留
//     maxUploadSize: 10,       // ✅ 保留
//     features: {
//       chat: true,            // ✅ 保留
//       ai: true,              // ✅ 已启用
//       video: true,           // ✅ 保留
//       analytics: false       // ✅ 保留
//     }
//   }
// }

console.log('只启用了 AI，其他 5 个配置全部保留');
```

---

### 场景 3: 月度统计部分更新

**业务需求**: 只更新用户统计，保留订单和营收统计。

#### ✅ updateOrInsert（深度合并）

```javascript
const result = await MonthlyStats.updateOrInsert(
  { month: '2024-12' },
  {
    stats: {
      users: { total: 1050, active: 850, new: 50 }  // 只更新用户数据
    }
  },
  { mergeStrategy: 'deep' }
);

// 结果：
// {
//   month: '2024-12',
//   stats: {
//     users: {                  // ✅ 已更新
//       total: 1050,
//       active: 850,
//       new: 50
//     },
//     orders: {                 // ✅ 完整保留
//       total: 500,
//       amount: 100000
//     },
//     revenue: {                // ✅ 完整保留
//       total: 100000,
//       refund: 5000
//     }
//   }
// }

console.log('只更新了用户统计，订单和营收数据完全保留');
```

---

## ⚙️ 合并策略详解

### 1. replace（完全替换）- 默认策略

**行为**: 完全替换整个文档（保留 _id）

```javascript
// 现有数据
{
  userId: 1,
  config: { theme: 'light', language: 'en' }
}

// updateOrInsert（replace 策略）
await UserConfig.updateOrInsert(
  { userId: 1 },
  {
    config: { theme: 'dark' }  // 只有 theme
  },
  { mergeStrategy: 'replace' }
);

// 结果
{
  userId: 1,
  config: { theme: 'dark' }  // ❌ language 丢失
}
```

**适用场景**: 需要完全重置配置时

---

### 2. shallow（浅合并）

**行为**: 只合并第一层属性

```javascript
// 现有数据
{
  userId: 1,
  config: {
    theme: 'light',
    notifications: { email: true, push: false }
  }
}

// updateOrInsert（shallow 策略）
await UserConfig.updateOrInsert(
  { userId: 1 },
  {
    config: {
      theme: 'dark'  // config 会被完全替换
    }
  },
  { mergeStrategy: 'shallow' }
);

// 结果
{
  userId: 1,
  config: {
    theme: 'dark'  // ✅ 更新
    // ❌ notifications 丢失（因为 config 被整体替换）
  }
}
```

**适用场景**: 简单的一层对象更新

---

### 3. deep（深度合并）- 推荐策略 ⭐

**行为**: 递归合并所有嵌套对象

```javascript
// 现有数据
{
  userId: 1,
  config: {
    theme: 'light',
    language: 'en',
    notifications: {
      email: true,
      push: false,
      sms: false
    }
  }
}

// updateOrInsert（deep 策略）
await UserConfig.updateOrInsert(
  { userId: 1 },
  {
    config: {
      theme: 'dark',
      notifications: {
        email: false  // 只更新这一项
      }
    }
  },
  { mergeStrategy: 'deep' }
);

// 结果
{
  userId: 1,
  config: {
    theme: 'dark',          // ✅ 更新
    language: 'en',         // ✅ 保留
    notifications: {
      email: false,         // ✅ 更新
      push: false,          // ✅ 保留
      sms: false            // ✅ 保留
    }
  }
}
```

**适用场景**: 配置管理、系统设置等（推荐）

---

## 🔍 深度合并的特殊处理

### 1. 数组（直接替换，不合并）

```javascript
// 现有数据
{
  userId: 1,
  tags: ['tag1', 'tag2', 'tag3']
}

// updateOrInsert（deep 策略）
await UserConfig.updateOrInsert(
  { userId: 1 },
  {
    tags: ['tag4', 'tag5']  // 数组直接替换
  },
  { mergeStrategy: 'deep' }
);

// 结果
{
  userId: 1,
  tags: ['tag4', 'tag5']  // ✅ 直接替换，不合并
}
```

**原因**: 数组合并逻辑复杂且不明确，直接替换更清晰

---

### 2. Date 对象（直接替换）

```javascript
// 现有数据
{
  userId: 1,
  createdAt: ISODate('2024-01-01'),
  updatedAt: ISODate('2024-11-01')
}

// updateOrInsert（deep 策略）
await UserConfig.updateOrInsert(
  { userId: 1 },
  {
    updatedAt: new Date('2024-12-01')
  },
  { mergeStrategy: 'deep' }
);

// 结果
{
  userId: 1,
  createdAt: ISODate('2024-01-01'),  // ✅ 保留
  updatedAt: ISODate('2024-12-01')   // ✅ 替换
}
```

---

### 3. ObjectId（直接替换）

```javascript
// 现有数据
{
  userId: ObjectId('...'),
  groupId: ObjectId('group1')
}

// updateOrInsert（deep 策略）
await User.updateOrInsert(
  { userId: ObjectId('...') },
  {
    groupId: ObjectId('group2')
  },
  { mergeStrategy: 'deep' }
);

// 结果
{
  userId: ObjectId('...'),
  groupId: ObjectId('group2')  // ✅ 直接替换
}
```

---

## 🔄 与其他方法对比

| 方法 | 行为 | 深度合并 | 适用场景 |
|------|------|---------|---------|
| **updateOrInsert** | 存在 → 更新<br>不存在 → 插入 | ✅ 支持 3 种策略 | 配置管理、部分更新 |
| **upsertOne** | 存在 → 更新<br>不存在 → 插入 | ❌ 使用 $set | 简单 upsert |
| **findOneOrCreate** | 存在 → 返回<br>不存在 → 插入 | ❌ 不更新 | OAuth 登录、标签创建 |
| **updateOne** | 存在 → 更新 | ❌ 使用 $set | 必须存在的更新 |

**核心区别**:
- `updateOrInsert`: **深度合并**，完美支持配置管理
- `upsertOne`: 使用 `$set`，需要手动指定字段路径

---

## 📊 性能建议

### 1. 查询条件建议建立索引

```javascript
// 确保查询字段有索引
await UserConfig.createIndex({ userId: 1 }, { unique: true });

// 高效查询
await UserConfig.updateOrInsert(
  { userId: 100 },
  { /* update data */ },
  { mergeStrategy: 'deep' }
);
```

---

### 2. 大对象合并性能

```javascript
// ❌ 避免：对非常大的对象使用深度合并
const hugeConfig = { /* 10000+ 字段 */ };
await SystemConfig.updateOrInsert(
  { key: 'system' },
  hugeConfig,
  { mergeStrategy: 'deep' }  // 性能较差
);

// ✅ 推荐：拆分为多个小配置
await SystemConfig.updateOrInsert(
  { key: 'ui_settings' },
  { theme: 'dark', language: 'en' },
  { mergeStrategy: 'deep' }
);
```

---

## ⚠️ 注意事项

### 1. replace 策略会丢失字段

```javascript
// ⚠️ 使用 replace 策略时要小心
await UserConfig.updateOrInsert(
  { userId: 1 },
  {
    config: { theme: 'dark' }
  },
  { mergeStrategy: 'replace' }  // 默认策略
);

// ❌ 现有的 config.language、config.notifications 等会丢失
```

**建议**: 除非确实需要完全替换，否则使用 `deep` 策略

---

### 2. 数组不会合并

```javascript
// 现有数据
{
  userId: 1,
  roles: ['user', 'editor']
}

// updateOrInsert（deep 策略）
await User.updateOrInsert(
  { userId: 1 },
  {
    roles: ['admin']  // 数组直接替换
  },
  { mergeStrategy: 'deep' }
);

// 结果
{
  userId: 1,
  roles: ['admin']  // ❌ ['user', 'editor'] 丢失
}

// ✅ 如果需要添加角色，使用 updateOne + $addToSet
await User.updateOne(
  { userId: 1 },
  { $addToSet: { roles: { $each: ['admin'] } } }
);
// 结果: roles: ['user', 'editor', 'admin']
```

---

### 3. 文档不存在时插入完整数据

```javascript
// updateOrInsert
await UserConfig.updateOrInsert(
  { userId: 999 },  // 不存在
  {
    config: { theme: 'dark' }  // 只提供 theme
  }
);

// 结果（新插入）
{
  userId: 999,
  config: { theme: 'dark' }  // ✅ 只有 theme
}

// ⚠️ 如果需要默认值，应该在 update 中提供
await UserConfig.updateOrInsert(
  { userId: 999 },
  {
    config: {
      theme: 'dark',
      language: 'en',      // 默认值
      fontSize: 14         // 默认值
    }
  }
);
```

---

## 📝 完整示例

### 示例 1: 用户偏好设置系统

```javascript
class UserPreferences {
  /**
   * 更新用户偏好（只更新指定字段）
   */
  static async updatePreferences(userId, updates) {
    const result = await UserConfig.updateOrInsert(
      { userId },
      { preferences: updates },
      { mergeStrategy: 'deep' }
    );

    return {
      success: true,
      preferences: result.doc.preferences,
      isNew: result.upserted
    };
  }

  /**
   * 获取用户偏好（带默认值）
   */
  static async getPreferences(userId) {
    const config = await UserConfig.findOne({ userId });
    
    if (!config) {
      // 创建默认配置
      const result = await this.updatePreferences(userId, {
        theme: 'light',
        language: 'en',
        fontSize: 14,
        notifications: {
          email: true,
          push: true,
          sms: false
        }
      });
      return result.preferences;
    }
    
    return config.preferences;
  }
}

// 使用
// 1. 获取配置（自动创建默认值）
const prefs = await UserPreferences.getPreferences(100);

// 2. 只更新主题
await UserPreferences.updatePreferences(100, {
  theme: 'dark'  // 只改这一项，其他全部保留
});

// 3. 只关闭邮件通知
await UserPreferences.updatePreferences(100, {
  notifications: {
    email: false  // 只改这一项，push 和 sms 保留
  }
});
```

---

### 示例 2: 应用配置管理

```javascript
class AppConfig {
  /**
   * 更新应用配置（深度合并）
   */
  static async update(updates) {
    const result = await SystemConfig.updateOrInsert(
      { key: 'app_config' },
      updates,
      { mergeStrategy: 'deep' }
    );

    // 通知配置变更
    await this.notifyConfigChange(updates);

    return result.doc;
  }

  /**
   * 启用/禁用功能
   */
  static async toggleFeature(featureName, enabled) {
    return await this.update({
      features: {
        [featureName]: enabled
      }
    });
  }

  /**
   * 更新系统限制
   */
  static async updateLimits(limits) {
    return await this.update({
      limits
    });
  }
}

// 使用
// 1. 启用 AI 功能
await AppConfig.toggleFeature('ai', true);

// 2. 更新上传限制
await AppConfig.updateLimits({
  maxUploadSize: 20,  // MB
  maxFileCount: 10
});

// 3. 批量更新配置
await AppConfig.update({
  features: {
    ai: true,
    video: true
  },
  limits: {
    maxUploadSize: 20
  },
  maintenance: false
});
```

---

## 🐛 错误处理

### 常见错误

```javascript
// 1. 参数错误
try {
  await UserConfig.updateOrInsert('invalid', {});
} catch (err) {
  console.error(err.message);  // "query 必须是对象"
}

// 2. 无效的合并策略
try {
  await UserConfig.updateOrInsert(
    { userId: 1 },
    { config: {} },
    { mergeStrategy: 'invalid' }
  );
} catch (err) {
  console.error(err.message);  // "mergeStrategy 必须是 replace、shallow 或 deep"
}

// 3. update 参数错误
try {
  await UserConfig.updateOrInsert({ userId: 1 }, null);
} catch (err) {
  console.error(err.message);  // "update 必须是对象"
}
```

---

## 📚 相关文档

- [upsertOne](./upsertOne.md) - 简单的 upsert 操作
- [findOneOrCreate](./findOneOrCreate.md) - 查询或创建（不更新）
- [updateOne](./updateOne.md) - 更新文档

---

> **文档版本**: v1.2.0  
> **最后更新**: 2024-12-04  
> **维护者**: monSQLize Team

