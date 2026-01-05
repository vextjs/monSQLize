/**
 * Model 软删除（softDelete）功能示例
 *
 * 演示：
 * - 软删除配置
 * - 软删除操作
 * - 查询自动过滤
 * - 查询已删除数据
 * - 恢复已删除数据
 * - 强制物理删除
 * - 与 timestamps 协同
 */

const MonSQLize = require('../../lib/index');
const { Model } = MonSQLize;

// ========== 1. 定义 Model（启用软删除） ==========
Model.define('articles', {
    schema: (dsl) => dsl({
        title: 'string!',
        content: 'string!',
        author: 'string!',
        status: 'string'.default('published')
    }),
    options: {
        timestamps: true,      // 自动管理 createdAt/updatedAt
        softDelete: {
            enabled: true,
            type: 'timestamp',  // 'timestamp' | 'boolean'
            ttl: 86400 * 30     // 30天后自动清理
        }
    },
    indexes: [
        { key: { author: 1 } },
        { key: { title: 1, deletedAt: 1 }, unique: true }  // 复合唯一索引
    ]
});

// ========== 2. 定义使用 boolean 类型的 Model ==========
Model.define('comments', {
    schema: (dsl) => dsl({
        content: 'string!',
        articleId: 'string!',
        author: 'string!'
    }),
    options: {
        softDelete: {
            enabled: true,
            type: 'boolean',  // 使用 boolean 类型（节省空间）
            field: 'removed'  // 自定义字段名
        }
    }
});

async function main() {
    // 连接数据库
    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test',
        config: { useMemoryServer: true }
    });
    await msq.connect();
    console.log('✅ 数据库已连接\n');

    const Article = msq.model('articles');
    const Comment = msq.model('comments');

    try {
        // ========== 示例 1: 基础软删除操作 ==========
        console.log('【示例 1】基础软删除操作');
        console.log('─────────────────────────────────');

        // 插入文章
        const insertResult1 = await Article.insertOne({
            title: 'Hello World',
            content: 'This is my first post',
            author: 'john'
        });
        const articleId1 = insertResult1.insertedId;
        console.log('✅ 插入文章:', articleId1);

        // 软删除文章
        await Article.deleteOne({ _id: articleId1 });
        console.log('✅ 软删除文章:', articleId1);

        // 尝试查询（查询不到，因为自动过滤已删除）
        const found = await Article.findOne({ _id: articleId1 });
        console.log('❌ 查询结果:', found);  // null

        // 使用 findWithDeleted 查询（可以查到）
        const foundWithDeleted = await Article.findOneWithDeleted({ _id: articleId1 });
        console.log('✅ findWithDeleted 结果:', {
            _id: foundWithDeleted._id,
            title: foundWithDeleted.title,
            deletedAt: foundWithDeleted.deletedAt
        });

        console.log('');

        // ========== 示例 2: 批量软删除 ==========
        console.log('【示例 2】批量软删除');
        console.log('─────────────────────────────────');

        // 插入多篇文章
        await Article.insertMany([
            { title: 'Article 2', content: 'Content 2', author: 'jane', status: 'draft' },
            { title: 'Article 3', content: 'Content 3', author: 'jane', status: 'draft' },
            { title: 'Article 4', content: 'Content 4', author: 'jane', status: 'published' }
        ]);
        console.log('✅ 插入3篇文章');

        // 批量软删除草稿
        const deleteResult = await Article.deleteMany({ status: 'draft' });
        console.log('✅ 软删除草稿数:', deleteResult.deletedCount);

        // 统计活跃文章
        const activeCount = await Article.count({});
        console.log('📊 活跃文章数:', activeCount);

        // 统计包含已删除的总数
        const totalCount = await Article.countWithDeleted({});
        console.log('📊 总文章数（含已删除）:', totalCount);

        // 统计已删除的文章数
        const deletedCount = await Article.countOnlyDeleted({});
        console.log('📊 已删除文章数:', deletedCount);

        console.log('');

        // ========== 示例 3: 查询已删除数据 ==========
        console.log('【示例 3】查询已删除数据');
        console.log('─────────────────────────────────');

        // 只查询已删除的文章
        const deletedArticles = await Article.findOnlyDeleted({});
        console.log('📋 已删除文章列表:');
        deletedArticles.forEach(article => {
            console.log(`  - ${article.title} (deletedAt: ${article.deletedAt})`);
        });

        console.log('');

        // ========== 示例 4: 恢复已删除数据 ==========
        console.log('【示例 4】恢复已删除数据');
        console.log('─────────────────────────────────');

        // 恢复单个文章
        const restoreResult = await Article.restore({ _id: articleId1 });
        console.log('✅ 恢复文章数:', restoreResult.modifiedCount);

        // 验证恢复成功
        const restored = await Article.findOne({ _id: articleId1 });
        console.log('✅ 恢复后可查询:', restored ? restored.title : null);

        // 批量恢复草稿
        const restoreManyResult = await Article.restoreMany({ status: 'draft' });
        console.log('✅ 批量恢复草稿数:', restoreManyResult.modifiedCount);

        // 验证统计
        const afterRestoreCount = await Article.count({});
        console.log('📊 恢复后活跃文章数:', afterRestoreCount);

        console.log('');

        // ========== 示例 5: 强制物理删除 ==========
        console.log('【示例 5】强制物理删除');
        console.log('─────────────────────────────────');

        // 插入一篇临时文章
        const tempResult = await Article.insertOne({
            title: 'Temp Article',
            content: 'Will be permanently deleted',
            author: 'test'
        });
        const tempId = tempResult.insertedId;
        console.log('✅ 插入临时文章:', tempId);

        // 强制物理删除
        const forceDeleteResult = await Article.forceDelete({ _id: tempId });
        console.log('✅ 强制删除结果:', forceDeleteResult.deletedCount);

        // 验证彻底删除（即使 findWithDeleted 也查不到）
        const permanentlyDeleted = await Article.findOneWithDeleted({ _id: tempId });
        console.log('❌ 永久删除后查询结果:', permanentlyDeleted);  // null

        console.log('');

        // ========== 示例 6: boolean 类型软删除 ==========
        console.log('【示例 6】boolean 类型软删除');
        console.log('─────────────────────────────────');

        // 插入评论
        const commentResult = await Comment.insertOne({
            content: 'Nice article!',
            articleId: String(articleId1),
            author: 'bob'
        });
        const commentId = commentResult.insertedId;
        console.log('✅ 插入评论:', commentId);

        // 软删除评论
        await Comment.deleteOne({ _id: commentId });
        console.log('✅ 软删除评论');

        // 查看删除标记（使用自定义字段 removed）
        const deletedComment = await Comment.findOneWithDeleted({ _id: commentId });
        console.log('✅ 删除标记:', {
            _id: deletedComment._id,
            removed: deletedComment.removed  // boolean 类型
        });

        console.log('');

        // ========== 示例 7: 与 timestamps 协同 ==========
        console.log('【示例 7】与 timestamps 协同');
        console.log('─────────────────────────────────');

        // 插入文章（带时间戳）
        const result2 = await Article.insertOne({
            title: 'Article with Timestamps',
            content: 'Testing timestamps',
            author: 'alice'
        });
        const articleId2 = result2.insertedId;

        // 查询插入的文章（获取时间戳）
        const article2 = await Article.findOne({ _id: articleId2 });
        console.log('✅ 插入文章（带时间戳）');
        console.log('  createdAt:', article2.createdAt);
        console.log('  updatedAt:', article2.updatedAt);

        // 等待一会儿，确保时间不同
        await new Promise(resolve => setTimeout(resolve, 10));

        // 软删除（会更新 updatedAt）
        await Article.deleteOne({ _id: articleId2 });
        console.log('✅ 软删除文章');

        // 查看时间戳变化
        const deletedArticle = await Article.findOneWithDeleted({ _id: articleId2 });
        console.log('📅 删除后的时间戳:');
        console.log('  createdAt:', deletedArticle.createdAt);
        console.log('  updatedAt:', deletedArticle.updatedAt, '(已更新)');
        console.log('  deletedAt:', deletedArticle.deletedAt);

        console.log('');

        // ========== 示例 8: 唯一索引处理 ==========
        console.log('【示例 8】唯一索引处理');
        console.log('─────────────────────────────────');

        // 插入文章
        await Article.insertOne({
            title: 'Unique Title',
            content: 'Test unique index',
            author: 'test'
        });
        console.log('✅ 插入文章: Unique Title');

        // 软删除
        await Article.deleteOne({ title: 'Unique Title' });
        console.log('✅ 软删除文章');

        // 再次插入同名文章（因为使用复合唯一索引，可以成功）
        await Article.insertOne({
            title: 'Unique Title',
            content: 'New article with same title',
            author: 'test2'
        });
        console.log('✅ 再次插入同名文章成功（复合唯一索引）');

        // 查询所有同名文章（包含已删除）
        const sameTitle = await Article.findWithDeleted({ title: 'Unique Title' });
        console.log('📋 同名文章数（含已删除）:', sameTitle.length);

        console.log('');

        // ========== 清理 ==========
        console.log('【清理】删除所有测试数据');
        console.log('─────────────────────────────────');
        await Article.forceDeleteMany({});
        await Comment.forceDeleteMany({});
        console.log('✅ 清理完成');

    } catch (err) {
        console.error('❌ 错误:', err.message);
    } finally {
        await msq.close();
        console.log('\n✅ 数据库已关闭');
    }
}

// 运行示例
if (require.main === module) {
    main().catch(console.error);
}

module.exports = main;

