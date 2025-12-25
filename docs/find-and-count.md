# findAndCount

## 📑 目录

- [基本用法](#基本用法)
- [参数](#参数)
- [返回值](#返回值)
- [示例](#示例)
- [性能优势](#性能优势)
- [注意事项](#注意事项)
- [对比传统方法](#对比传统方法)
- [相关方法](#相关方法)
- [测试覆盖](#测试覆盖)

---

同时返回查询数据和总数的便利方法，并行执行 `find()` 和 `countDocuments()`，适合分页场景。

## 基本用法

```javascript
const { data, total } = await collection.findAndCount(
    { status: 'active' },
    { limit: 20, skip: 0 }
);

console.log(`总计: ${total}, 当前页: ${data.length}`);
```

## 参数

### query (Object)
查询条件，与 `find()` 相同。

### options (Object)
查询选项：

- `projection` (Object) - 字段投影
- `sort` (Object) - 排序规则
- `limit` (Number) - 限制返回数量（undefined 表示不限制）
- `skip` (Number) - 跳过数量
- `cache` (Number) - 缓存时间（毫秒）
- `maxTimeMS` (Number) - 查询超时
- `comment` (String) - 查询注释

## 返回值

返回 Promise，resolve 为包含以下字段的对象：

- `data` (Array) - 查询结果数组
- `total` (Number) - 符合条件的文档总数

## 示例

### 分页查询

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
console.log(`第 ${page}/${totalPages} 页，共 ${total} 条记录`);
```

### 带投影和排序

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

### 启用缓存

```javascript
const { data, total } = await collection.findAndCount(
    { category: 'news' },
    { 
        limit: 20,
        cache: 60000  // 缓存 60 秒
    }
);
```

## 性能优势

- ✅ 并行执行 `find()` 和 `countDocuments()`，比串行快
- ✅ 自动缓存支持，第二次查询更快
- ✅ 减少代码量，一次调用完成

## 注意事项

1. **limit 为 undefined** - 不限制返回数量（查询所有）
2. **limit 为 0** - MongoDB 中表示不限制（返回所有数据）
3. **缓存键** - 包含 query, projection, sort, limit, skip
4. **适用场景** - 分页查询、列表展示

## 对比传统方法

### ❌ 传统方法（2 次调用）

```javascript
const data = await collection.find({ status: 'active' }, { limit: 20 });
const total = await collection.countDocuments({ status: 'active' });
```

### ✅ findAndCount（1 次调用，并行执行）

```javascript
const { data, total } = await collection.findAndCount(
    { status: 'active' },
    { limit: 20 }
);
```

## 相关方法

- [find](./find.md) - 查询文档
- [findOne](./findOne.md) - 查询单个文档
- [findPage](./findPage.md) - 游标分页查询
- [count](./count.md) - 统计文档数量

## 测试覆盖

- ✅ 基础功能：6 个测试
- ✅ 分页场景：4 个测试
- ✅ 边界情况：4 个测试
- ✅ 缓存功能：1 个测试
- ✅ 参数验证：2 个测试
- ✅ 性能测试：1 个测试

**测试覆盖率**: 100%

