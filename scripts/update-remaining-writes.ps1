# 更新所有写操作文件以支持事务优化
# 此脚本会检查并更新所有需要的文件

$filesToUpdate = @(
    'insert-one.js',
    'insert-many.js',
    'find-one-and-update.js',
    'find-one-and-replace.js',
    'find-one-and-delete.js',
    'increment-one.js',
    'upsert-one.js',
    'insert-batch.js'
)

$basePath = "lib/mongodb/writes"

Write-Host "🔍 检查需要更新的文件..." -ForegroundColor Cyan

foreach ($file in $filesToUpdate) {
    $fullPath = Join-Path $basePath $file

    if (-not (Test-Path $fullPath)) {
        Write-Host "⏭️  跳过: $file (文件不存在)" -ForegroundColor Yellow
        continue
    }

    $content = Get-Content $fullPath -Raw -Encoding UTF8

    # 检查是否已经导入了 transaction-aware
    if ($content -match 'transaction-aware') {
        Write-Host "✅ 已更新: $file" -ForegroundColor Green
        continue
    }

    Write-Host "🔧 更新中: $file" -ForegroundColor Yellow

    # 1. 添加导入语句（在其他 require 之后）
    $importLine = 'const { isInTransaction, getTransactionFromSession } = require("../common/transaction-aware");'

    # 找到最后一个 require 语句的位置
    if ($content -match '(?ms)(const .+ = require\([^)]+\);)\s*\n') {
        $lastRequire = $matches[0]
        $content = $content -replace [regex]::Escape($lastRequire), ($lastRequire + "`n" + $importLine + "`n")
    }

    # 2. 更新缓存失效逻辑
    # 查找 cache.delPattern 的调用并替换为事务感知的版本
    $oldPattern = @'
                    const pattern = CacheFactory.buildNamespacePattern\(ns\);
                    const deleted = await cache\.delPattern\(pattern\);

                    if \(deleted > 0\) \{
                        logger\.debug\(`\[\$\{operation\}\] 自动失效缓存: \$\{ns\.db\}\.\$\{ns\.collection\}, 删除 \$\{deleted\} 个缓存键`\);
                    \}
'@

    $newPattern = @'
                    const pattern = CacheFactory.buildNamespacePattern(ns);

                    // 检查是否在事务中
                    if (isInTransaction(options)) {
                        // 事务中：调用 Transaction 的 recordInvalidation 方法
                        const tx = getTransactionFromSession(options.session);
                        if (tx && typeof tx.recordInvalidation === 'function') {
                            // 🚀 传递 metadata 支持文档级别锁
                            await tx.recordInvalidation(pattern, {
                                operation: 'write',
                                query: filter || query || { _id: result.insertedId },
                                collection: collectionName
                            });
                            logger.debug(`[${operation}] 事务中失效缓存: ${ns.db}.${ns.collection}`);
                        } else {
                            const deleted = await cache.delPattern(pattern);
                            if (deleted > 0) {
                                logger.debug(`[${operation}] 自动失效缓存: ${ns.db}.${ns.collection}, 删除 ${deleted} 个缓存键`);
                            }
                        }
                    } else {
                        // 非事务：直接失效缓存
                        const deleted = await cache.delPattern(pattern);
                        if (deleted > 0) {
                            logger.debug(`[${operation}] 自动失效缓存: ${ns.db}.${ns.collection}, 删除 ${deleted} 个缓存键`);
                        }
                    }
'@

    # 使用更宽松的匹配模式
    if ($content -match 'const pattern = CacheFactory\.buildNamespacePattern') {
        # 简化版本：直接在 delPattern 调用前后包裹事务检查
        $content = $content -replace '(const pattern = CacheFactory\.buildNamespacePattern\(ns\);)\s+const deleted = await cache\.delPattern\(pattern\);', @'
$1

                    // 检查是否在事务中
                    if (isInTransaction(options)) {
                        // 事务中：调用 Transaction 的 recordInvalidation 方法
                        const tx = getTransactionFromSession(options.session);
                        if (tx && typeof tx.recordInvalidation === 'function') {
                            await tx.recordInvalidation(pattern, {
                                operation: 'write',
                                query: {},
                                collection: collectionName
                            });
                            logger.debug(`[${operation}] 事务中失效缓存`);
                        }
                    } else {
                        const deleted = await cache.delPattern(pattern);
'@

        [System.IO.File]::WriteAllText((Resolve-Path $fullPath).Path, $content, [System.Text.UTF8Encoding]::new($false))
        Write-Host "  ✅ 已更新 $file" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  警告: $file 的缓存失效代码格式与预期不符，跳过" -ForegroundColor Yellow
    }
}

Write-Host "`n🎉 批量更新完成！" -ForegroundColor Green
Write-Host "请运行测试验证: npm test" -ForegroundColor Cyan

