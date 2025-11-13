#!/usr/bin/env pwsh
# 测试套件失败定位脚本
# 用于逐个运行测试套件并记录失败的套件

$ErrorActionPreference = "Continue"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  monSQLize Test Suite Failure Locator" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# 所有测试套件列表
$suites = @(
    'connection',
    'find',
    'findPage',
    'findOne',
    'count',
    'aggregate',
    'distinct',
    'explain',
    'chaining',
    'bookmarks',
    'invalidate',
    'insertOne',
    'insertMany',
    'insertBatch',
    'utils',
    'infrastructure'
)

$passed = @()
$failed = @()
$total = $suites.Count
$current = 0

foreach ($suite in $suites) {
    $current++
    Write-Host "[$current/$total] Testing: $suite" -ForegroundColor Yellow -NoNewline

    # Run test suite
    $result = & node test/run-tests.js $suite 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host " PASSED" -ForegroundColor Green
        $passed += $suite
    } else {
        Write-Host " FAILED" -ForegroundColor Red
        $failed += $suite

        # Save failure log
        $failureLog = "test-failure-$suite.log"
        $result | Out-File -FilePath $failureLog -Encoding UTF8
        Write-Host "   Failure log saved: $failureLog" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Test Results Summary" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Passed: $($passed.Count)/$total" -ForegroundColor Green
Write-Host "Failed: $($failed.Count)/$total" -ForegroundColor Red

if ($failed.Count -gt 0) {
    Write-Host ""
    Write-Host "Failed Test Suites:" -ForegroundColor Red
    foreach ($suite in $failed) {
        Write-Host "  X $suite" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan

