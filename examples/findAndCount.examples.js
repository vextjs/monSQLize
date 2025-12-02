/**
 * findAndCount 方法示例
 * 演示如何使用 findAndCount 同时获取数据和总数
 */

const MonSQLize = require('../lib/index');

async function main() {
    // 初始化连接
    const db = new MonSQLize({
        type: 'mongodb',
        config: {
            uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/findAndCount_examples'
        },
        cache: { enabled: true }
    });

    await db.connect();
    const { collection } = await db.connect();
    const products = collection('products');

    console.log('=== findAndCount 方法示例 ===\n');

    // 清空并准备测试数据
    await products.deleteMany({});
    const testData = [];
    for (let i = 1; i <= 100; i++) {
        testData.push({
            name: `Product ${i}`,
            category: i <= 50 ? 'electronics' : 'books',
            price: Math.floor(Math.random() * 1000) + 100,
            stock: Math.floor(Math.random() * 100),
            status: i % 3 === 0 ? 'inactive' : 'active',
            createdAt: new Date(Date.now() - i * 86400000)
        });
    }
    await products.insertMany(testData);
    console.log('✓ 已插入 100 条测试数据\n');

    // ============================================
    // 1. 基础用法：分页查询
    // ============================================
    console.log('1. 基础分页查询');
    const page = 1;
    const pageSize = 10;
    const { data: page1Data, total: page1Total } = await products.findAndCount(
        { status: 'active' },
        {
            limit: pageSize,
            skip: (page - 1) * pageSize,
            sort: { createdAt: -1 }
        }
    );
    console.log(`   第 ${page} 页，每页 ${pageSize} 条`);
    console.log(`   返回: ${page1Data.length} 条`);
    console.log(`   总计: ${page1Total} 条`);
    console.log(`   总页数: ${Math.ceil(page1Total / pageSize)} 页\n`);

    // ============================================
    // 2. 带条件过滤
    // ============================================
    console.log('2. 带条件过滤');
    const { data: electronicsData, total: electronicsTotal } = await products.findAndCount(
        { category: 'electronics', status: 'active' },
        { limit: 5 }
    );
    console.log(`   电子产品（活跃）: ${electronicsTotal} 条`);
    console.log(`   当前返回: ${electronicsData.length} 条`);
    console.log(`   示例: ${electronicsData[0]?.name}\n`);

    // ============================================
    // 3. 带投影（只返回需要的字段）
    // ============================================
    console.log('3. 带投影查询');
    const { data: projectionData, total: projectionTotal } = await products.findAndCount(
        { category: 'books' },
        {
            projection: { name: 1, price: 1, stock: 1 },
            limit: 3
        }
    );
    console.log(`   书籍总数: ${projectionTotal} 条`);
    console.log(`   返回字段: name, price, stock`);
    console.log(`   示例数据:`, projectionData[0]);
    console.log();

    // ============================================
    // 4. 排序查询
    // ============================================
    console.log('4. 排序查询');
    const { data: sortedData, total: sortedTotal } = await products.findAndCount(
        { status: 'active' },
        {
            sort: { price: -1 },  // 按价格降序
            limit: 5
        }
    );
    console.log(`   活跃商品总数: ${sortedTotal} 条`);
    console.log(`   最贵的 5 个商品:`);
    sortedData.forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.name} - ¥${p.price}`);
    });
    console.log();

    // ============================================
    // 5. 缓存查询
    // ============================================
    console.log('5. 缓存查询');
    const query = { category: 'electronics', price: { $gte: 500 } };

    // 第一次查询（无缓存）
    const start1 = Date.now();
    const { data: cache1Data, total: cache1Total } = await products.findAndCount(
        query,
        { limit: 10, cache: 60000 }
    );
    const duration1 = Date.now() - start1;
    console.log(`   第一次查询: ${cache1Total} 条, 耗时 ${duration1}ms`);

    // 第二次查询（有缓存）
    const start2 = Date.now();
    const { data: cache2Data, total: cache2Total } = await products.findAndCount(
        query,
        { limit: 10, cache: 60000 }
    );
    const duration2 = Date.now() - start2;
    console.log(`   第二次查询: ${cache2Total} 条, 耗时 ${duration2}ms`);
    console.log(`   缓存提升: ${((duration1 - duration2) / duration1 * 100).toFixed(1)}%\n`);

    // ============================================
    // 6. 完整分页示例
    // ============================================
    console.log('6. 完整分页示例');
    const currentPage = 2;
    const itemsPerPage = 15;
    const category = 'electronics';

    const { data: pageData, total: pageTotal } = await products.findAndCount(
        { category },
        {
            limit: itemsPerPage,
            skip: (currentPage - 1) * itemsPerPage,
            sort: { createdAt: -1 },
            projection: { name: 1, price: 1, createdAt: 1 }
        }
    );

    const totalPages = Math.ceil(pageTotal / itemsPerPage);
    const hasNextPage = currentPage < totalPages;
    const hasPrevPage = currentPage > 1;

    console.log(`   类别: ${category}`);
    console.log(`   当前页: ${currentPage}/${totalPages}`);
    console.log(`   每页数量: ${itemsPerPage}`);
    console.log(`   本页数量: ${pageData.length}`);
    console.log(`   总记录数: ${pageTotal}`);
    console.log(`   有上一页: ${hasPrevPage}`);
    console.log(`   有下一页: ${hasNextPage}\n`);

    // ============================================
    // 7. 处理空结果
    // ============================================
    console.log('7. 处理空结果');
    const { data: emptyData, total: emptyTotal } = await products.findAndCount(
        { category: 'nonexistent' },
        { limit: 10 }
    );
    console.log(`   查询不存在的类别`);
    console.log(`   返回: ${emptyData.length} 条`);
    console.log(`   总计: ${emptyTotal} 条`);
    console.log(`   是否为空: ${emptyData.length === 0}\n`);

    // ============================================
    // 8. 不限制数量（返回所有）
    // ============================================
    console.log('8. 查询所有（不限制数量）');
    const { data: allData, total: allTotal } = await products.findAndCount(
        { status: 'inactive' }
        // 注意：没有指定 limit
    );
    console.log(`   查询所有非活跃商品`);
    console.log(`   返回: ${allData.length} 条`);
    console.log(`   总计: ${allTotal} 条`);
    console.log(`   全部返回: ${allData.length === allTotal}\n`);

    // ============================================
    // 9. 复杂查询条件
    // ============================================
    console.log('9. 复杂查询条件');
    const { data: complexData, total: complexTotal } = await products.findAndCount(
        {
            $and: [
                { category: 'electronics' },
                { price: { $gte: 300, $lte: 700 } },
                { stock: { $gt: 0 } },
                { status: 'active' }
            ]
        },
        {
            limit: 10,
            sort: { price: 1 }
        }
    );
    console.log(`   条件: 电子产品 && 价格300-700 && 有库存 && 活跃`);
    console.log(`   符合条件: ${complexTotal} 条`);
    console.log(`   返回: ${complexData.length} 条\n`);

    // ============================================
    // 10. 与传统方法对比
    // ============================================
    console.log('10. 性能对比：findAndCount vs 传统方法');

    // 传统方法（串行）
    const start3 = Date.now();
    const traditionalData = await products.find({ status: 'active' }, { limit: 20 });
    const traditionalTotal = await products.count({ status: 'active' });
    const duration3 = Date.now() - start3;
    console.log(`   传统方法（串行）: ${duration3}ms`);

    // findAndCount（并行）
    const start4 = Date.now();
    const { data: modernData, total: modernTotal } = await products.findAndCount(
        { status: 'active' },
        { limit: 20 }
    );
    const duration4 = Date.now() - start4;
    console.log(`   findAndCount（并行）: ${duration4}ms`);
    console.log(`   性能提升: ${((duration3 - duration4) / duration3 * 100).toFixed(1)}%\n`);

    // 清理
    await products.deleteMany({});
    await db.close();
    console.log('✓ 示例完成');
}

// 运行示例
main().catch(console.error);

