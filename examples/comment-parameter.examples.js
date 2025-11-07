/**
 * comment 参数使用示例
 * @description 展示如何在 find/findOne/count 方法中使用 comment 参数进行生产环境日志跟踪
 */

const MonSQLize = require('..');

(async () => {
    console.log('🔍 comment 参数使用示例\n');

    // 创建实例
    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'example_db',
        config: { uri: 'mongodb://localhost:27017' }
    });

    // 连接数据库
    const { collection } = await msq.connect();

    // ============================================
    // 场景 1: find 方法使用 comment
    // ============================================
    console.log('📋 场景 1: find 方法使用 comment');
    console.log('用途: 在 MongoDB 日志中标识查询来源\n');

    const products = await collection('products').find({
        query: { category: 'electronics' },
        limit: 10,
        comment: 'UserAPI:getProductList:user_12345' // 标识：API名称:操作:用户ID
    });

    console.log(`✅ 查询结果: ${products.length} 条记录`);
    console.log('💡 MongoDB 日志中会显示: comment: "UserAPI:getProductList:user_12345"\n');


    // ============================================
    // 场景 2: findOne 方法使用 comment
    // ============================================
    console.log('📋 场景 2: findOne 方法使用 comment');
    console.log('用途: 标识单条记录查询的业务场景\n');

    const product = await collection('products').findOne({
        query: { _id: 'prod_001' },
        comment: 'ProductDetailPage:loadProduct:session_abc123'
    });

    console.log(`✅ 查询结果: ${product ? '找到记录' : '未找到'}`);
    console.log('💡 用于定位慢查询时，可以快速识别业务场景\n');


    // ============================================
    // 场景 3: count 方法使用 comment
    // ============================================
    console.log('📋 场景 3: count 方法使用 comment');
    console.log('用途: 标识统计查询的用途\n');

    const totalCount = await collection('products').count({
        query: { status: 'active' },
        comment: 'AdminDashboard:getTotalActiveProducts:admin_user_5'
    });

    console.log(`✅ 统计结果: ${totalCount} 条记录`);
    console.log('💡 在监控系统中可以按 comment 分组统计查询频率\n');


    // ============================================
    // 场景 4: 结合 traceId 使用（分布式追踪）
    // ============================================
    console.log('📋 场景 4: 结合 traceId 使用（分布式追踪）');
    console.log('用途: 关联前端请求和后端数据库查询\n');

    // 假设从 HTTP 请求头获取 traceId
    const traceId = 'trace_xyz789';

    const orders = await collection('orders').find({
        query: { userId: 'user_12345' },
        limit: 20,
        comment: `OrderService:getUserOrders:traceId=${traceId}` // 包含 traceId
    });

    console.log(`✅ 查询结果: ${orders.length} 条订单`);
    console.log('💡 在 MongoDB 日志中可以通过 traceId 关联整个请求链路\n');


    // ============================================
    // 场景 5: 性能优化分析（标识 A/B 测试）
    // ============================================
    console.log('📋 场景 5: 性能优化分析（标识 A/B 测试）');
    console.log('用途: 对比不同索引策略的性能差异\n');

    // 策略 A: 使用索引 1
    const resultsA = await collection('products').find({
        query: { category: 'electronics', price: { $gt: 100 } },
        hint: { category: 1, price: 1 },
        comment: 'PerformanceTest:Strategy_A:index_category_price'
    });

    // 策略 B: 使用索引 2
    const resultsB = await collection('products').find({
        query: { category: 'electronics', price: { $gt: 100 } },
        hint: { price: 1, category: 1 },
        comment: 'PerformanceTest:Strategy_B:index_price_category'
    });

    console.log(`✅ 策略 A 结果: ${resultsA.length} 条`);
    console.log(`✅ 策略 B 结果: ${resultsB.length} 条`);
    console.log('💡 通过 MongoDB 日志分析两种策略的执行时间差异\n');


    // ============================================
    // 最佳实践建议
    // ============================================
    console.log('📚 最佳实践建议:');
    console.log('1. ✅ 使用统一的命名格式: "服务名:操作:标识符"');
    console.log('2. ✅ 包含用户/会话/traceId 等关键信息');
    console.log('3. ✅ 避免包含敏感数据（如密码、身份证号）');
    console.log('4. ✅ 保持 comment 简洁（建议 <100 字符）');
    console.log('5. ✅ 在生产环境启用 MongoDB 慢查询日志（slowOpThresholdMs）');
    console.log('\n📖 参考文档: https://www.mongodb.com/docs/manual/reference/command/profile/#std-label-database-profiler-specification\n');


    // 关闭连接
    await msq.close();
    console.log('🔌 连接已关闭');
})();
