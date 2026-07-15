'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const typePath = path.join(root, 'types', 'data-tasks.d.ts');
const typeSource = fs.readFileSync(typePath, 'utf8');
const union = typeSource.match(/export type DataTaskJobErrorCode\s*=([\s\S]*?);/);

if (!union) throw new Error('Unable to locate DataTaskJobErrorCode in types/data-tasks.d.ts.');

const codes = [...union[1].matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]);
if (codes.length === 0) throw new Error('DataTaskJobErrorCode does not contain any literal codes.');

const failures = [];
for (const relativePath of ['docs/en/error-codes.md', 'docs/zh/error-codes.md']) {
    const content = fs.readFileSync(path.join(root, relativePath), 'utf8');
    for (const marker of ['DataTaskJobError', 'ErrorCodes', ...codes]) {
        if (!content.includes(marker)) failures.push(`${relativePath}: missing ${marker}`);
    }
}

if (failures.length > 0) {
    console.error('Error contract documentation is incomplete:');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
} else {
    console.log(`Error contract verified: ${codes.length} DataTaskJobError codes are documented in both languages.`);
}
