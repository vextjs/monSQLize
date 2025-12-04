/**
 * 兼容性报告生成器
 * @module test/utils/compatibility-reporter
 */

const fs = require('fs');
const path = require('path');

/**
 * 兼容性报告生成器类
 */
class CompatibilityReporter {
    constructor() {
        this.results = {
            metadata: {
                timestamp: new Date().toISOString(),
                environment: {
                    node: process.version,
                    platform: process.platform,
                    arch: process.arch,
                },
            },
            tests: [],
        };
    }

    /**
   * 添加测试结果
   * @param {Object} testResult - 测试结果对象
   */
    addTestResult(testResult) {
        this.results.tests.push({
            ...testResult,
            timestamp: new Date().toISOString(),
        });
    }

    /**
   * 生成 Markdown 格式的兼容性矩阵
   * @returns {string} Markdown 内容
   */
    generateMarkdownReport() {
        const lines = [];

        // 标题
        lines.push('# monSQLize 兼容性测试报告');
        lines.push('');
        lines.push(`**生成时间**: ${this.results.metadata.timestamp}`);
        lines.push(`**测试环境**: Node.js ${this.results.metadata.environment.node} (${this.results.metadata.environment.platform})`);
        lines.push('');
        lines.push('---');
        lines.push('');

        // 按类别分组
        const categories = this._groupByCategory();

        // Node.js 版本测试
        if (categories.node.length > 0) {
            lines.push('## Node.js 版本兼容性');
            lines.push('');
            lines.push('| Node.js 版本 | 测试状态 | 通过/总数 | 耗时 | 备注 |');
            lines.push('|-------------|---------|---------|------|------|');

            categories.node.forEach(test => {
                const status = test.passed ? '✅ 通过' : '❌ 失败';
                const ratio = `${test.passedCount}/${test.totalCount}`;
                const duration = `${test.duration}ms`;
                const notes = test.notes || '-';
                lines.push(`| ${test.version} | ${status} | ${ratio} | ${duration} | ${notes} |`);
            });

            lines.push('');
        }

        // MongoDB Driver 版本测试
        if (categories.driver.length > 0) {
            lines.push('## MongoDB Driver 版本兼容性');
            lines.push('');
            lines.push('| Driver 版本 | 测试状态 | 通过/总数 | 耗时 | 已知问题 |');
            lines.push('|------------|---------|---------|------|---------|');

            categories.driver.forEach(test => {
                const status = test.passed ? '✅ 通过' : '❌ 失败';
                const ratio = `${test.passedCount}/${test.totalCount}`;
                const duration = `${test.duration}ms`;
                const issues = test.knownIssues?.join(', ') || '-';
                lines.push(`| ${test.version} | ${status} | ${ratio} | ${duration} | ${issues} |`);
            });

            lines.push('');
        }

        // MongoDB Server 版本测试
        if (categories.server.length > 0) {
            lines.push('## MongoDB Server 版本兼容性');
            lines.push('');
            lines.push('| Server 版本 | 测试状态 | 通过/总数 | 耗时 | 特性限制 |');
            lines.push('|------------|---------|---------|------|---------|');

            categories.server.forEach(test => {
                const status = test.passed ? '✅ 通过' : '❌ 失败';
                const ratio = `${test.passedCount}/${test.totalCount}`;
                const duration = `${test.duration}ms`;
                const limitations = test.limitations?.join(', ') || '-';
                lines.push(`| ${test.version} | ${status} | ${ratio} | ${duration} | ${limitations} |`);
            });

            lines.push('');
        }

        // 失败的测试详情
        const failures = this.results.tests.filter(t => !t.passed);
        if (failures.length > 0) {
            lines.push('---');
            lines.push('');
            lines.push('## ❌ 失败的测试详情');
            lines.push('');

            failures.forEach((test, index) => {
                lines.push(`### ${index + 1}. ${test.category} - ${test.version}`);
                lines.push('');
                lines.push(`**失败原因**: ${test.errorMessage || '未知'}`);
                lines.push('');
                if (test.errorStack) {
                    lines.push('```');
                    lines.push(test.errorStack);
                    lines.push('```');
                    lines.push('');
                }
            });
        }

        // 总结
        lines.push('---');
        lines.push('');
        lines.push('## 📊 测试总结');
        lines.push('');
        const totalTests = this.results.tests.length;
        const passedTests = this.results.tests.filter(t => t.passed).length;
        const failedTests = totalTests - passedTests;
        const passRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(2) : 0;

        lines.push(`- **总测试数**: ${totalTests}`);
        lines.push(`- **通过**: ${passedTests} (${passRate}%)`);
        lines.push(`- **失败**: ${failedTests}`);
        lines.push('');

        return lines.join('\n');
    }

    /**
   * 生成 JSON 格式报告
   * @returns {string} JSON 内容
   */
    generateJSONReport() {
        return JSON.stringify(this.results, null, 2);
    }

    /**
   * 按类别分组测试结果
   * @private
   * @returns {Object} 分组后的测试结果
   */
    _groupByCategory() {
        return {
            node: this.results.tests.filter(t => t.category === 'node'),
            driver: this.results.tests.filter(t => t.category === 'driver'),
            server: this.results.tests.filter(t => t.category === 'server'),
        };
    }

    /**
   * 保存报告到文件
   * @param {string} outputDir - 输出目录
   * @returns {Object} 保存的文件路径
   */
    saveReports(outputDir) {
    // 确保输出目录存在
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const markdownPath = path.join(outputDir, `compatibility-report-${timestamp}.md`);
        const jsonPath = path.join(outputDir, `compatibility-report-${timestamp}.json`);

        // 保存 Markdown 报告
        fs.writeFileSync(markdownPath, this.generateMarkdownReport(), 'utf8');

        // 保存 JSON 报告
        fs.writeFileSync(jsonPath, this.generateJSONReport(), 'utf8');

        return {
            markdown: markdownPath,
            json: jsonPath,
        };
    }

    /**
   * 生成 GitHub Actions Summary
   * @returns {string} GitHub Actions 格式的摘要
   */
    generateGitHubActionsSummary() {
        const lines = [];

        lines.push('## 🧪 兼容性测试结果');
        lines.push('');

        const totalTests = this.results.tests.length;
        const passedTests = this.results.tests.filter(t => t.passed).length;
        const failedTests = totalTests - passedTests;

        if (failedTests === 0) {
            lines.push('✅ **所有测试通过**');
        } else {
            lines.push(`⚠️ **${failedTests}/${totalTests} 测试失败**`);
        }

        lines.push('');
        lines.push(this.generateMarkdownReport());

        return lines.join('\n');
    }
}

module.exports = CompatibilityReporter;

