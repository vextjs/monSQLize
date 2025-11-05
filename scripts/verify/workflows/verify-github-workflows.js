#!/usr/bin/env node
/**
 * GitHub Workflows 验证脚本
 * 验证 .github/workflows/*.yml 配置是否正确
 * 
 * 运行: node scripts/verify/workflows/verify-github-workflows.js
 */

const fs = require('fs');
const path = require('path');

const results = {
    passed: [],
    failed: [],
    warnings: []
};

console.log('\n🔍 开始验证 GitHub Workflows 配置...\n');

// 1. 检查 workflows 目录是否存在
const workflowsDir = path.join(__dirname, '../../../.github/workflows');
if (!fs.existsSync(workflowsDir)) {
    results.failed.push('❌ .github/workflows 目录不存在');
    printResults();
    process.exit(1);
}

// 2. 读取 package.json 中的脚本
const packageJsonPath = path.join(__dirname, '../../../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const availableScripts = Object.keys(packageJson.scripts || {});

console.log('📦 package.json 中的可用脚本:');
availableScripts.forEach(script => {
    console.log(`   ✓ ${script}: ${packageJson.scripts[script]}`);
});
console.log('');

// 3. 读取所有 workflow 文件
const workflowFiles = fs.readdirSync(workflowsDir)
    .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'));

if (workflowFiles.length === 0) {
    results.warnings.push('⚠️  未找到任何 workflow 文件');
}

console.log(`📋 找到 ${workflowFiles.length} 个 workflow 文件:\n`);

// 4. 验证每个 workflow 文件
workflowFiles.forEach(file => {
    const filePath = path.join(workflowsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📄 验证: ${file}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
    // 检查 1: npm run 命令是否存在于 package.json
    const npmRunMatches = content.matchAll(/npm run (\S+)/g);
    for (const match of npmRunMatches) {
        const scriptName = match[1].replace('--if-present', '').trim();
        if (!availableScripts.includes(scriptName)) {
            results.failed.push(`❌ ${file}: 使用了不存在的脚本 'npm run ${scriptName}'`);
            console.log(`   ❌ 脚本不存在: npm run ${scriptName}`);
        } else {
            results.passed.push(`✓ ${file}: npm run ${scriptName} 存在`);
            console.log(`   ✅ 脚本存在: npm run ${scriptName}`);
        }
    }
    
    // 检查 2: npm test 命令
    if (content.includes('npm test')) {
        if (availableScripts.includes('test')) {
            results.passed.push(`✓ ${file}: npm test 存在`);
            console.log(`   ✅ npm test 存在`);
        } else {
            results.failed.push(`❌ ${file}: npm test 不存在`);
            console.log(`   ❌ npm test 不存在`);
        }
    }
    
    // 检查 3: Node.js 版本是否合理
    const nodeVersionMatches = content.matchAll(/node-version:\s*['"]?(\d+)\.x['"]?/g);
    for (const match of nodeVersionMatches) {
        const version = parseInt(match[1]);
        if (version < 18) {
            results.warnings.push(`⚠️  ${file}: Node.js ${version}.x 已过时，建议使用 18.x 或 20.x`);
            console.log(`   ⚠️  Node.js ${version}.x 已过时`);
        } else {
            results.passed.push(`✓ ${file}: Node.js ${version}.x 版本合理`);
            console.log(`   ✅ Node.js ${version}.x 版本合理`);
        }
    }
    
    // 检查 4: 是否使用了 actions/checkout@v4
    if (content.includes('actions/checkout@v3')) {
        results.warnings.push(`⚠️  ${file}: 使用 actions/checkout@v3，建议升级到 v4`);
        console.log(`   ⚠️  使用 actions/checkout@v3，建议升级到 v4`);
    } else if (content.includes('actions/checkout@v4')) {
        results.passed.push(`✓ ${file}: 使用最新的 actions/checkout@v4`);
        console.log(`   ✅ 使用最新的 actions/checkout@v4`);
    }
    
    // 检查 5: 是否使用了 actions/setup-node@v4
    if (content.includes('actions/setup-node@v3')) {
        results.warnings.push(`⚠️  ${file}: 使用 actions/setup-node@v3，建议升级到 v4`);
        console.log(`   ⚠️  使用 actions/setup-node@v3，建议升级到 v4`);
    } else if (content.includes('actions/setup-node@v4')) {
        results.passed.push(`✓ ${file}: 使用最新的 actions/setup-node@v4`);
        console.log(`   ✅ 使用最新的 actions/setup-node@v4`);
    }
    
    // 检查 6: release.yml 特定检查
    if (file === 'release.yml') {
        // 检查是否有 npm pack
        if (content.includes('npm pack')) {
            results.passed.push(`✓ ${file}: 包含 npm pack`);
            console.log(`   ✅ 包含 npm pack`);
        } else {
            results.failed.push(`❌ ${file}: 缺少 npm pack`);
            console.log(`   ❌ 缺少 npm pack`);
        }
        
        // 检查是否配置了 GitHub Release
        if (content.includes('softprops/action-gh-release')) {
            results.passed.push(`✓ ${file}: 配置了 GitHub Release`);
            console.log(`   ✅ 配置了 GitHub Release`);
        } else {
            results.warnings.push(`⚠️  ${file}: 未配置 GitHub Release`);
            console.log(`   ⚠️  未配置 GitHub Release`);
        }
    }
    
    // 检查 7: test.yml 特定检查
    if (file === 'test.yml') {
        // 检查是否有矩阵测试
        if (content.includes('strategy:') && content.includes('matrix:')) {
            results.passed.push(`✓ ${file}: 配置了矩阵测试`);
            console.log(`   ✅ 配置了矩阵测试`);
        } else {
            results.warnings.push(`⚠️  ${file}: 未配置矩阵测试`);
            console.log(`   ⚠️  未配置矩阵测试`);
        }
        
        // 检查是否测试多个 OS
        if (content.includes('ubuntu-latest') && content.includes('windows-latest')) {
            results.passed.push(`✓ ${file}: 测试多个操作系统`);
            console.log(`   ✅ 测试 Windows + Ubuntu`);
        } else if (!content.includes('windows-latest')) {
            results.warnings.push(`⚠️  ${file}: 未测试 Windows 平台`);
            console.log(`   ⚠️  未测试 Windows 平台`);
        }
    }
    
    console.log('');
});

// 5. 检查是否缺少推荐的 workflow
const recommendedWorkflows = ['test.yml', 'release.yml'];
const missingWorkflows = recommendedWorkflows.filter(wf => !workflowFiles.includes(wf));

if (missingWorkflows.length > 0) {
    missingWorkflows.forEach(wf => {
        results.warnings.push(`⚠️  缺少推荐的 workflow: ${wf}`);
    });
}

// 6. 打印结果
printResults();

// 7. 退出码
if (results.failed.length > 0) {
    process.exit(1);
} else {
    process.exit(0);
}

function printResults() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 验证结果汇总');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log(`✅ 通过: ${results.passed.length}`);
    console.log(`❌ 失败: ${results.failed.length}`);
    console.log(`⚠️  警告: ${results.warnings.length}`);
    console.log('');
    
    if (results.failed.length > 0) {
        console.log('❌ 失败项:\n');
        results.failed.forEach(item => console.log(`   ${item}`));
        console.log('');
    }
    
    if (results.warnings.length > 0) {
        console.log('⚠️  警告项:\n');
        results.warnings.forEach(item => console.log(`   ${item}`));
        console.log('');
    }
    
    if (results.failed.length === 0 && results.warnings.length === 0) {
        console.log('🎉 所有检查通过！Workflows 配置正确。\n');
    } else if (results.failed.length === 0) {
        console.log('✅ 核心检查通过，但有一些改进建议。\n');
    } else {
        console.log('❌ 发现问题，请修复后再继续。\n');
    }
}
