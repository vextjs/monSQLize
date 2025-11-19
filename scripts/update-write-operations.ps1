# 批量更新写操作文件以支持文档级别锁
# 使用方法：在 PowerShell 中运行此脚本

$files = @(
    'lib/mongodb/writes/insert-one.js',
    'lib/mongodb/writes/insert-many.js',
    'lib/mongodb/writes/delete-one.js',
    'lib/mongodb/writes/delete-many.js',
    'lib/mongodb/writes/find-one-and-update.js',
    'lib/mongodb/writes/find-one-and-replace.js',
    'lib/mongodb/writes/find-one-and-delete.js'
)

$oldPattern = 'await tx.recordInvalidation(pattern);'
$newPattern = @'
// 🚀 传递 metadata 支持文档级别锁
                            await tx.recordInvalidation(pattern, {
                                operation: 'write',
                                query: filter || {},
                                collection: collectionName
                            });
'@

foreach ($file in $files) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw -Encoding UTF8
        if ($content -match [regex]::Escape($oldPattern)) {
            $newContent = $content -replace [regex]::Escape($oldPattern), $newPattern
            [System.IO.File]::WriteAllText((Resolve-Path $file).Path, $newContent, [System.Text.UTF8Encoding]::new($false))
            Write-Host "✅ Updated: $file"
        } else {
            Write-Host "⏭️  Skipped: $file (pattern not found)"
        }
    } else {
        Write-Host "❌ Not found: $file"
    }
}

Write-Host "`n🎉 Batch update completed!"

