#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');
const docsEnRoot = path.join(projectRoot, 'docs', 'en');
const docsZhRoot = path.join(projectRoot, 'docs', 'zh');
const matrixPath = path.join(__dirname, 'doc-example-matrix.json');
const runnerPath = path.join(projectRoot, 'scripts', 'run-examples.cjs');
const examplesReadmePath = path.join(projectRoot, 'examples', 'README.md');
const docsExamplesEnPath = path.join(docsEnRoot, 'examples.md');
const docsExamplesZhPath = path.join(docsZhRoot, 'examples.md');

const allowedKinds = new Set([
    'example',
    'shared-example',
    'doc-check',
    'link-check',
    'api-existence-check',
]);
const allowedStatuses = new Set(['covered', 'planned']);

function walkFiles(directory, extension) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            return walkFiles(entryPath, extension);
        }
        return entry.isFile() && entry.name.endsWith(extension) ? [entryPath] : [];
    });
}

function toPosix(filePath) {
    return filePath.split(path.sep).join('/');
}

function slugFor(filePath, baseDirectory) {
    return toPosix(path.relative(baseDirectory, filePath)).replace(/\.md$/, '');
}

function stripFragment(target) {
    return target.split('#')[0].split('?')[0];
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getDocSlugs(baseDirectory) {
    return walkFiles(baseDirectory, '.md').map(file => slugFor(file, baseDirectory)).sort();
}

function readRunnerTargets() {
    const content = fs.readFileSync(runnerPath, 'utf8');
    return new Set(
        [...content.matchAll(/'\.generated\/examples-dist\/(examples\/[\w/-]+)\.js'/g)]
            .map(match => `${match[1]}.ts`)
    );
}

function collectMarkdownExampleTargets(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const targets = new Set();
    const baseDirectory = path.dirname(filePath);

    for (const match of content.matchAll(/\]\(([^)]+\.ts(?:#[^)]+)?)\)/g)) {
        const rawTarget = stripFragment(match[1]);
        const absoluteTarget = path.resolve(baseDirectory, rawTarget);
        const relativeTarget = toPosix(path.relative(projectRoot, absoluteTarget));
        if (relativeTarget.startsWith('examples/')) {
            targets.add(relativeTarget);
        }
    }

    for (const match of content.matchAll(/`(examples\/[\w/-]+\.ts)`/g)) {
        targets.add(match[1]);
    }

    return targets;
}

function collectVisibleRelativeLinkTextIssues() {
    const issues = [];
    for (const filePath of walkFiles(path.join(projectRoot, 'docs'), '.md')) {
        const relativePath = toPosix(path.relative(projectRoot, filePath));
        const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
        let inFence = false;
        lines.forEach((line, index) => {
            if (/^\s*```/.test(line)) {
                inFence = !inFence;
                return;
            }
            if (inFence) {
                return;
            }
            const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
            let match;
            while ((match = linkPattern.exec(line))) {
                const visibleText = match[1];
                if (visibleText.includes('../') || visibleText.includes('..\\')) {
                    issues.push(`${relativePath}:${index + 1} visible link text "${visibleText}"`);
                }
            }
        });
    }
    return issues;
}

function countBy(entries, key) {
    return entries.reduce((counts, entry) => {
        const value = entry[key];
        counts[value] = (counts[value] || 0) + 1;
        return counts;
    }, {});
}

function diffSet(left, right) {
    return [...left].filter(value => !right.has(value)).sort();
}

function countTargets(entries, kind) {
    return entries
        .filter(entry => entry.kind === kind)
        .reduce((counts, entry) => {
            counts[entry.target] = (counts[entry.target] || 0) + 1;
            return counts;
        }, {});
}

function main() {
    const errors = [];
    const matrix = readJson(matrixPath);
    const entries = Array.isArray(matrix.entries) ? matrix.entries : [];

    const enSlugs = getDocSlugs(docsEnRoot);
    const zhSlugs = getDocSlugs(docsZhRoot);
    const enSlugSet = new Set(enSlugs);
    const zhSlugSet = new Set(zhSlugs);
    const runnerTargets = readRunnerTargets();
    const examplesReadmeTargets = collectMarkdownExampleTargets(examplesReadmePath);
    const docsExamplesEnTargets = collectMarkdownExampleTargets(docsExamplesEnPath);
    const docsExamplesZhTargets = collectMarkdownExampleTargets(docsExamplesZhPath);
    const entryMap = new Map();

    if (matrix.schemaVersion !== 1) {
        errors.push(`Unsupported matrix schemaVersion: ${matrix.schemaVersion}`);
    }

    for (const entry of entries) {
        if (!entry || typeof entry !== 'object') {
            errors.push('Matrix entry must be an object.');
            continue;
        }
        if (typeof entry.doc !== 'string' || !entry.doc) {
            errors.push(`Invalid doc slug in entry: ${JSON.stringify(entry)}`);
            continue;
        }
        if (entryMap.has(entry.doc)) {
            errors.push(`Duplicate matrix entry for doc slug: ${entry.doc}`);
        }
        entryMap.set(entry.doc, entry);

        if (!allowedKinds.has(entry.kind)) {
            errors.push(`Invalid kind for ${entry.doc}: ${entry.kind}`);
        }
        if (!allowedStatuses.has(entry.status)) {
            errors.push(`Invalid status for ${entry.doc}: ${entry.status}`);
        }
        if (typeof entry.target !== 'string' || !entry.target) {
            errors.push(`Missing target for ${entry.doc}`);
            continue;
        }
        if (typeof entry.runner !== 'string' || !entry.runner) {
            errors.push(`Missing runner for ${entry.doc}`);
        }

        const targetPath = stripFragment(entry.target);
        const absoluteTarget = path.resolve(projectRoot, targetPath);
        if (!absoluteTarget.startsWith(projectRoot) || !fs.existsSync(absoluteTarget)) {
            errors.push(`Missing target for ${entry.doc}: ${entry.target}`);
        }

        if ((entry.kind === 'example' || entry.kind === 'shared-example') && entry.status === 'covered') {
            if (!entry.target.startsWith('examples/')) {
                errors.push(`${entry.doc} uses ${entry.kind} but target is outside examples/: ${entry.target}`);
            } else if (!runnerTargets.has(entry.target)) {
                errors.push(`${entry.doc} example target is not executed by scripts/run-examples.cjs: ${entry.target}`);
            }
        }

        if (entry.kind === 'doc-check' && entry.status === 'covered') {
            const expectedDocTarget = `docs/en/${entry.doc}.md`;
            if (targetPath !== expectedDocTarget) {
                errors.push(`${entry.doc} doc-check must target its English source doc (${expectedDocTarget}), got: ${entry.target}`);
            }
        }
    }

    for (const slug of enSlugs) {
        if (!entryMap.has(slug)) {
            errors.push(`Missing matrix entry for English doc: ${slug}`);
        }
        if (!zhSlugSet.has(slug)) {
            errors.push(`Missing Chinese counterpart for doc: ${slug}`);
        }
    }

    for (const slug of zhSlugs) {
        if (!enSlugSet.has(slug)) {
            errors.push(`Missing English counterpart for Chinese doc: ${slug}`);
        }
    }

    for (const slug of entryMap.keys()) {
        if (!enSlugSet.has(slug)) {
            errors.push(`Matrix entry does not match an English doc slug: ${slug}`);
        }
    }

    if (process.argv.includes('--require-covered')) {
        for (const entry of entries) {
            if (entry.status !== 'covered') {
                errors.push(`Entry is not covered: ${entry.doc}`);
            }
        }
    }

    errors.push(...collectVisibleRelativeLinkTextIssues());

    for (const missing of diffSet(runnerTargets, examplesReadmeTargets)) {
        errors.push(`Runner example is missing from examples/README.md: ${missing}`);
    }

    for (const target of [...docsExamplesEnTargets, ...docsExamplesZhTargets]) {
        const absoluteTarget = path.resolve(projectRoot, target);
        if (!fs.existsSync(absoluteTarget)) {
            errors.push(`docs examples page references missing example target: ${target}`);
        }
    }

    for (const missing of diffSet(docsExamplesEnTargets, docsExamplesZhTargets)) {
        errors.push(`docs/zh/examples.md is missing target listed by docs/en/examples.md: ${missing}`);
    }

    for (const missing of diffSet(docsExamplesZhTargets, docsExamplesEnTargets)) {
        errors.push(`docs/en/examples.md is missing target listed by docs/zh/examples.md: ${missing}`);
    }

    const coveredCount = entries.filter(entry => entry.status === 'covered').length;
    const docCheckDocs = entries.filter(entry => entry.kind === 'doc-check').map(entry => entry.doc).sort();
    const sharedExampleDocs = entries.filter(entry => entry.kind === 'shared-example').map(entry => entry.doc).sort();
    const summary = {
        englishDocs: enSlugs.length,
        chineseDocs: zhSlugs.length,
        matrixEntries: entries.length,
        covered: coveredCount,
        byKind: countBy(entries, 'kind'),
        byStatus: countBy(entries, 'status'),
        runnerExamples: runnerTargets.size,
        examplesReadmeTargets: examplesReadmeTargets.size,
        docsExamplesTargets: {
            en: docsExamplesEnTargets.size,
            zh: docsExamplesZhTargets.size,
        },
        nonRunnableDocs: docCheckDocs.length,
        sharedExampleDocs: sharedExampleDocs.length,
        sharedExampleTargets: countTargets(entries, 'shared-example'),
    };

    if (errors.length > 0) {
        console.error('[docs-examples] Matrix check failed.');
        errors.forEach(error => console.error(`- ${error}`));
        console.error(`[docs-examples] Summary: ${JSON.stringify(summary)}`);
        process.exit(1);
    }

    console.log(`[docs-examples] Matrix check passed: ${coveredCount}/${enSlugs.length} docs covered.`);
    console.log(`[docs-examples] Runnable examples: ${runnerTargets.size}; shared-example docs: ${sharedExampleDocs.length}; doc-check docs: ${docCheckDocs.length}.`);
    console.log(`[docs-examples] Summary: ${JSON.stringify(summary)}`);
}

main();
