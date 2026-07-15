'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const claimDocuments = [
    'docs/en/insert-many.md',
    'docs/zh/insert-many.md',
    'docs/en/write-operations.md',
    'docs/zh/write-operations.md',
    'docs/en/populate.md',
    'docs/zh/populate.md',
    'docs/en/slow-query-log.md',
    'docs/zh/slow-query-log.md',
    'docs/en/ssh-tunnel.md',
    'docs/zh/ssh-tunnel.md',
    'docs/en/cache.md',
    'docs/zh/cache.md',
    'docs/en/mongodb-native-vs-extensions.md',
    'docs/zh/mongodb-native-vs-extensions.md',
];

const forbiddenClaims = [
    { name: 'fixed speedup multiplier', pattern: /\b\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?x\b/i },
    { name: 'fixed speedup in Chinese', pattern: /\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?\s*倍(?:性能)?(?:提升|加速|更快)/ },
    { name: 'fixed performance percentage', pattern: /(?:overhead|开销|提升|improvement)[^\n]{0,40}(?:<|under|below|less than|低于)?\s*\d+(?:\.\d+)?\s*%/i },
    { name: 'unqualified approximate latency', pattern: /(?:takes?|latency|耗时|延迟|性能)[^\n]{0,30}~\s*\d+(?:\.\d+)?\s*(?:ms|s)\b/i },
];

const failures = [];
for (const relativePath of claimDocuments) {
    const content = fs.readFileSync(path.join(root, relativePath), 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
        for (const rule of forbiddenClaims) {
            if (rule.pattern.test(line)) failures.push(`${relativePath}:${index + 1}: ${rule.name}: ${line.trim()}`);
        }
    });
}

const evidenceContracts = [
    {
        file: 'docs/en/performance-evidence.md',
        required: ['Workload', 'Environment', 'Dataset', 'Command', 'Artifact', 'Budget'],
    },
    {
        file: 'docs/zh/performance-evidence.md',
        required: ['负载', '环境', '数据集', '命令', '产物', '预算'],
    },
];

for (const contract of evidenceContracts) {
    const content = fs.readFileSync(path.join(root, contract.file), 'utf8');
    for (const marker of contract.required) {
        if (!content.includes(marker)) failures.push(`${contract.file}: missing evidence marker ${marker}`);
    }
}

if (failures.length > 0) {
    console.error('Documentation claim policy failed:');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
} else {
    console.log(`Documentation claim policy verified for ${claimDocuments.length} current performance documents.`);
}
