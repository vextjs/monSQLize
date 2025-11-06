# 重构 index.js - 删除旧的重复方法定义
# 读取文件
$file = "d:\Project\monSQLize\lib\mongodb\index.js"
$content = [System.IO.File]::ReadAllText($file, [System.Text.UTF8Encoding]::new($false))

# 定位需要删除的部分 - 从重复的 findOne 开始到 "// ===== 分页查询" 之前
# 查找第一个重复的 findOne 注释（在模块化代码之后）
$startMarker = "...explainOps,`n            /**`n             * 查询单条记录"
$endMarker = "// ========================================`n            // 分页查询`n            // ========================================"

$startPos = $content.IndexOf($startMarker)
if ($startPos -lt 0) {
    Write-Host "❌ 未找到开始标记" -ForegroundColor Red
    exit 1
}

# 向前找到完整的区域注释结束位置
$startPos = $content.IndexOf("...explainOps,", $startPos)

$endPos = $content.IndexOf($endMarker, $startPos)
if ($endPos -lt 0) {
    Write-Host "❌ 未找到结束标记" -ForegroundColor Red
    exit 1
}

# 删除这段内容
$before = $content.Substring(0, $startPos + "...explainOps,".Length)
$after = $content.Substring($endPos)

# 组合新内容
$newContent = $before + "`n`n            " + $after

# 写回文件
[System.IO.File]::WriteAllText($file, $newContent, [System.Text.UTF8Encoding]::new($false))

Write-Host "✅ 成功删除重复的方法定义" -ForegroundColor Green
Write-Host "原始行数: $($content.Split("`n").Count)"
Write-Host "新行数: $($newContent.Split("`n").Count)"
