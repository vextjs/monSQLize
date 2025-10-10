/**
 * monSQLize 聚合查询完整示例
 *
 * 本示例展示如何使用 aggregate 方法进行各种复杂查询：
 * - 基础聚合操作（$match、$group、$sort、$limit）
 * - 联表查询（$lookup）
 * - 数据转换（$project、$addFields）
 * - 分组统计（$group、$sum、$avg、$max、$min）
 * - 数组操作（$unwind、$push）
 * - 条件聚合（$cond、$switch）
 * - 日期处理（$dateToString、$dateTrunc）
 * - 缓存与性能优化
 */

const MonSQLize = require('../../lib');

// 配置数据库连接
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'example',
    config: { uri: 'mongodb://localhost:27017' },
    maxTimeMS: 5000,
    slowQueryMs: 1000,
});

async function main() {
    const { collection } = await msq.connect();

    console.log('🚀 monSQLize 聚合查询示例\n');

    // ============================================================
    // 示例 1: 基础聚合 - 统计订单总额
    // ============================================================
    console.log('📊 示例 1: 统计各状态订单的总金额和数量');
    try {
        const result1 = await collection('orders').aggregate([
            {
                $match: {
                    createdAt: { $gte: new Date('2024-01-01') }
                }
            },
            {
                $group: {
                    _id: '$status',
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 },
                    avgAmount: { $avg: '$amount' },
                    maxAmount: { $max: '$amount' },
                    minAmount: { $min: '$amount' }
                }
            },
            {
                $sort: { totalAmount: -1 }
            }
        ], {
            cache: 3000,  // 缓存 3 秒
            meta: true    // 返回耗时信息
        });

        console.log('结果:', result1.data);
        console.log('耗时:', result1.meta.durationMs, 'ms');
        console.log('缓存:', result1.meta.fromCache ? '命中' : '未命中');
    } catch (error) {
        console.error('错误:', error.message);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // ============================================================
    // 示例 2: 联表查询 - 订单关联用户信息
    // ============================================================
    console.log('🔗 示例 2: 订单关联用户信息（$lookup）');
    try {
        const result2 = await collection('orders').aggregate([
            {
                $match: { status: 'paid' }
            },
            {
                $lookup: {
                    from: 'users',
                    let: { userId: { $toObjectId: '$userId' } },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$_id', '$$userId'] } } },
                        { $project: { name: 1, email: 1, level: 1 } }
                    ],
                    as: 'userInfo'
                }
            },
            {
                $unwind: {
                    path: '$userInfo',
                    preserveNullAndEmptyArrays: true  // 保留没有匹配用户的订单
                }
            },
            {
                $project: {
                    orderId: '$_id',
                    amount: 1,
                    status: 1,
                    userName: '$userInfo.name',
                    userEmail: '$userInfo.email',
                    userLevel: '$userInfo.level',
                    createdAt: 1
                }
            },
            {
                $sort: { createdAt: -1 }
            },
            {
                $limit: 10
            }
        ], {
            allowDiskUse: true,  // 允许使用磁盘（大数据量时）
            maxTimeMS: 5000,
            cache: 2000
        });

        console.log('前 10 条订单:', result2);
        console.log('数量:', result2.length);
    } catch (error) {
        console.error('错误:', error.message);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // ============================================================
    // 示例 3: 多表关联 - 订单、用户、产品三表关联
    // ============================================================
    console.log('🔗 示例 3: 订单关联用户和产品信息（多表 $lookup）');
    try {
        const result3 = await collection('orders').aggregate([
            {
                $match: {
                    status: { $in: ['paid', 'shipped'] },
                    createdAt: { $gte: new Date('2024-01-01') }
                }
            },
            // 关联用户表
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            {
                $unwind: '$user'
            },
            // 关联产品表
            {
                $lookup: {
                    from: 'products',
                    localField: 'productId',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            {
                $unwind: '$product'
            },
            {
                $project: {
                    orderNo: 1,
                    amount: 1,
                    status: 1,
                    userName: '$user.name',
                    userEmail: '$user.email',
                    productName: '$product.name',
                    productPrice: '$product.price',
                    quantity: 1,
                    createdAt: 1
                }
            },
            {
                $sort: { createdAt: -1 }
            },
            {
                $limit: 20
            }
        ], {
            allowDiskUse: true,
            hint: { status: 1, createdAt: -1 },  // 指定使用的索引
            comment: '订单用户产品三表关联查询'
        });

        console.log('关联结果数量:', result3.length);
        if (result3.length > 0) {
            console.log('示例数据:', result3[0]);
        }
    } catch (error) {
        console.error('错误:', error.message);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // ============================================================
    // 示例 4: 分组统计 - 按日期统计每日订单
    // ============================================================
    console.log('📈 示例 4: 按日期分组统计每日订单');
    try {
        const result4 = await collection('orders').aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: new Date('2024-01-01'),
                        $lt: new Date('2024-02-01')
                    }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$createdAt'
                        }
                    },
                    totalOrders: { $sum: 1 },
                    totalAmount: { $sum: '$amount' },
                    avgAmount: { $avg: '$amount' },
                    paidOrders: {
                        $sum: {
                            $cond: [{ $eq: ['$status', 'paid'] }, 1, 0]
                        }
                    },
                    cancelledOrders: {
                        $sum: {
                            $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0]
                        }
                    }
                }
            },
            {
                $addFields: {
                    date: '$_id',
                    paidRate: {
                        $multiply: [
                            { $divide: ['$paidOrders', '$totalOrders'] },
                            100
                        ]
                    }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ], {
            cache: 5000,
            meta: true
        });

        console.log('每日统计:', result4.data);
        console.log('查询耗时:', result4.meta.durationMs, 'ms');
    } catch (error) {
        console.error('错误:', error.message);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // ============================================================
    // 示例 5: 复杂条件聚合 - 用户等级分析
    // ============================================================
    console.log('🎯 示例 5: 用户等级与消费分析');
    try {
        const result5 = await collection('users').aggregate([
            {
                $lookup: {
                    from: 'orders',
                    let: { userId: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ['$userId', '$$userId'] },
                                status: 'paid'
                            }
                        }
                    ],
                    as: 'orders'
                }
            },
            {
                $addFields: {
                    orderCount: { $size: '$orders' },
                    totalSpent: { $sum: '$orders.amount' },
                    avgOrderAmount: { $avg: '$orders.amount' }
                }
            },
            {
                $addFields: {
                    userLevel: {
                        $switch: {
                            branches: [
                                { case: { $gte: ['$totalSpent', 10000] }, then: 'VIP' },
                                { case: { $gte: ['$totalSpent', 5000] }, then: 'Gold' },
                                { case: { $gte: ['$totalSpent', 1000] }, then: 'Silver' }
                            ],
                            default: 'Bronze'
                        }
                    }
                }
            },
            {
                $group: {
                    _id: '$userLevel',
                    userCount: { $sum: 1 },
                    totalRevenue: { $sum: '$totalSpent' },
                    avgRevenue: { $avg: '$totalSpent' },
                    avgOrders: { $avg: '$orderCount' }
                }
            },
            {
                $sort: { totalRevenue: -1 }
            }
        ], {
            allowDiskUse: true,
            maxTimeMS: 10000,
            cache: 10000  // 缓存 10 秒
        });

        console.log('用户等级分析:', result5);
    } catch (error) {
        console.error('错误:', error.message);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // ============================================================
    // 示例 6: 数组操作 - 订单商品明细展开
    // ============================================================
    console.log('📦 示例 6: 展开订单商品明细（$unwind）');
    try {
        const result6 = await collection('orders').aggregate([
            {
                $match: { status: 'paid' }
            },
            {
                $unwind: '$items'  // 展开商品数组
            },
            {
                $group: {
                    _id: '$items.productId',
                    productName: { $first: '$items.productName' },
                    totalQuantity: { $sum: '$items.quantity' },
                    totalSales: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
                    orderCount: { $sum: 1 }
                }
            },
            {
                $sort: { totalSales: -1 }
            },
            {
                $limit: 10  // 前 10 名热销商品
            }
        ], {
            cache: 3000
        });

        console.log('热销商品 TOP 10:', result6);
    } catch (error) {
        console.error('错误:', error.message);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // ============================================================
    // 示例 7: 时间序列分析 - 每小时订单趋势
    // ============================================================
    console.log('⏰ 示例 7: 每小时订单趋势分析');
    try {
        const result7 = await collection('orders').aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: new Date(Date.now() - 24 * 60 * 60 * 1000)  // 最近 24 小时
                    }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m-%d %H:00',
                            date: '$createdAt'
                        }
                    },
                    orderCount: { $sum: 1 },
                    totalAmount: { $sum: '$amount' },
                    statuses: { $push: '$status' }
                }
            },
            {
                $addFields: {
                    hour: '$_id',
                    avgAmount: { $divide: ['$totalAmount', '$orderCount'] }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ], {
            cache: 60000,  // 缓存 1 分钟
            meta: true
        });

        console.log('24小时订单趋势:', result7.data);
        console.log('查询耗时:', result7.meta.durationMs, 'ms');
    } catch (error) {
        console.error('错误:', error.message);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // ============================================================
    // 示例 8: 漏斗分析 - 订单转化率
    // ============================================================
    console.log('🎯 示例 8: 订单转化漏斗分析');
    try {
        const result8 = await collection('orders').aggregate([
            {
                $facet: {
                    created: [
                        { $match: { status: { $exists: true } } },
                        { $count: 'count' }
                    ],
                    paid: [
                        { $match: { status: 'paid' } },
                        { $count: 'count' }
                    ],
                    shipped: [
                        { $match: { status: 'shipped' } },
                        { $count: 'count' }
                    ],
                    completed: [
                        { $match: { status: 'completed' } },
                        { $count: 'count' }
                    ],
                    cancelled: [
                        { $match: { status: 'cancelled' } },
                        { $count: 'count' }
                    ]
                }
            },
            {
                $project: {
                    created: { $arrayElemAt: ['$created.count', 0] },
                    paid: { $arrayElemAt: ['$paid.count', 0] },
                    shipped: { $arrayElemAt: ['$shipped.count', 0] },
                    completed: { $arrayElemAt: ['$completed.count', 0] },
                    cancelled: { $arrayElemAt: ['$cancelled.count', 0] }
                }
            },
            {
                $addFields: {
                    paidRate: {
                        $multiply: [
                            { $divide: ['$paid', '$created'] },
                            100
                        ]
                    },
                    completionRate: {
                        $multiply: [
                            { $divide: ['$completed', '$paid'] },
                            100
                        ]
                    },
                    cancelRate: {
                        $multiply: [
                            { $divide: ['$cancelled', '$created'] },
                            100
                        ]
                    }
                }
            }
        ], {
            cache: 5000,
            allowDiskUse: true
        });

        console.log('订单转化漏斗:', result8[0]);
    } catch (error) {
        console.error('错误:', error.message);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // ============================================================
    // 示例 9: 地理位置聚合（如果有地理数据）
    // ============================================================
    console.log('🗺️ 示例 9: 按地区统计订单');
    try {
        const result9 = await collection('orders').aggregate([
            {
                $match: { status: 'paid' }
            },
            {
                $group: {
                    _id: {
                        province: '$shippingAddress.province',
                        city: '$shippingAddress.city'
                    },
                    orderCount: { $sum: 1 },
                    totalAmount: { $sum: '$amount' },
                    avgAmount: { $avg: '$amount' }
                }
            },
            {
                $sort: { totalAmount: -1 }
            },
            {
                $limit: 20
            },
            {
                $project: {
                    _id: 0,
                    province: '$_id.province',
                    city: '$_id.city',
                    orderCount: 1,
                    totalAmount: 1,
                    avgAmount: { $round: ['$avgAmount', 2] }
                }
            }
        ], {
            cache: 10000
        });

        console.log('地区销售 TOP 20:', result9);
    } catch (error) {
        console.error('错误:', error.message);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // ============================================================
    // 示例 10: 缓存失效演示
    // ============================================================
    console.log('🔄 示例 10: 缓存失效演示');
    try {
        // 第一次查询（写入缓存）
        const query = [
            { $match: { status: 'paid' } },
            { $count: 'total' }
        ];

        console.log('第一次查询...');
        const first = await collection('orders').aggregate(query, {
            cache: 60000,
            meta: true
        });
        console.log('结果:', first.data);
        console.log('是否来自缓存:', first.meta.fromCache);

        // 第二次查询（应该命中缓存）
        console.log('\n第二次查询（相同参数）...');
        const second = await collection('orders').aggregate(query, {
            cache: 60000,
            meta: true
        });
        console.log('结果:', second.data);
        console.log('是否来自缓存:', second.meta.fromCache);

        // 失效缓存
        console.log('\n失效 aggregate 缓存...');
        const deleted = await collection('orders').invalidate('aggregate');
        console.log('删除的缓存键数量:', deleted);

        // 第三次查询（缓存已失效）
        console.log('\n第三次查询（缓存已失效）...');
        const third = await collection('orders').aggregate(query, {
            cache: 60000,
            meta: true
        });
        console.log('结果:', third.data);
        console.log('是否来自缓存:', third.meta.fromCache);

    } catch (error) {
        console.error('错误:', error.message);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // ============================================================
    // 查看缓存统计
    // ============================================================
    console.log('📊 缓存统计信息');
    const cache = msq.getCache();
    const stats = cache.getStats && cache.getStats();
    if (stats) {
        console.log('命中率:', (stats.hitRate * 100).toFixed(2) + '%');
        console.log('命中次数:', stats.hits);
        console.log('未命中次数:', stats.misses);
        console.log('缓存大小:', stats.size);
        console.log('内存使用:', (stats.memoryUsage / 1024 / 1024).toFixed(2), 'MB');
    }

    // 关闭连接
    await msq.close();
    console.log('\n✅ 示例运行完成');
}

// 错误处理
main().catch(error => {
    console.error('❌ 程序执行出错:', error);
    process.exit(1);
});

