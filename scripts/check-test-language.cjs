const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TEST_ROOT = path.join(ROOT, 'test');
const SOURCE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts', '.cts', '.mts']);
const EXCLUDED_PARTS = new Set(['validation']);
const CJK_PATTERN = /[\u3400-\u9fff\uf900-\ufaff]/;

function walk(directory, files = []) {
    if (!fs.existsSync(directory)) {
        return files;
    }

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            walk(fullPath, files);
            continue;
        }
        if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
            files.push(fullPath);
        }
    }
    return files;
}

function shouldCheck(filePath) {
    const relativePath = path.relative(TEST_ROOT, filePath);
    const parts = relativePath.split(path.sep);
    return !parts.some((part) => EXCLUDED_PARTS.has(part));
}

const findings = [];

for (const filePath of walk(TEST_ROOT).filter(shouldCheck)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
        if (CJK_PATTERN.test(line)) {
            findings.push({
                file: path.relative(ROOT, filePath).replace(/\\/g, '/'),
                line: index + 1,
                text: line.trim(),
            });
        }
    });
}

if (findings.length > 0) {
    console.error(`Test language check failed: ${findings.length} CJK line(s) found.`);
    for (const finding of findings.slice(0, 80)) {
        console.error(`${finding.file}:${finding.line}: ${finding.text}`);
    }
    if (findings.length > 80) {
        console.error(`... ${findings.length - 80} more finding(s) omitted.`);
    }
    process.exit(1);
}

console.log('Test language check passed: executable test sources contain no CJK text.');
