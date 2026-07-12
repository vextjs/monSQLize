#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const distOptionIndex = process.argv.indexOf('--dist');
if (distOptionIndex >= 0 && !process.argv[distOptionIndex + 1]) {
    console.error('[site-links] --dist requires a directory path.');
    process.exit(1);
}
const dist = distOptionIndex >= 0
    ? path.resolve(process.argv[distOptionIndex + 1])
    : path.join(root, 'website', 'dist');
const basePath = (process.env.MONSQLIZE_SITE_BASE_PATH || '/monSQLize/').replace(/\/+$/, '/');

if (!fs.existsSync(dist)) {
    console.error('[site-links] website/dist is missing; run the website build first.');
    process.exit(1);
}

const files = [];
const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(absolute);
        else files.push(absolute);
    }
};
visit(dist);

const missing = [];
let references = 0;
const htmlFiles = files.filter((file) => file.endsWith('.html'));
for (const htmlFile of htmlFiles) {
    const html = fs.readFileSync(htmlFile, 'utf8');
    for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)) {
        const raw = match[1];
        if (!raw || raw.startsWith('#') || raw.startsWith('//') || /^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(raw)) continue;
        references += 1;
        let clean;
        try {
            clean = decodeURIComponent(raw.split('#', 1)[0].split('?', 1)[0]);
        } catch {
            missing.push({ page: path.relative(dist, htmlFile), reference: raw, reason: 'invalid URL encoding' });
            continue;
        }

        let target;
        if (clean.startsWith(basePath)) target = path.join(dist, clean.slice(basePath.length));
        else if (clean.startsWith('/')) target = path.join(dist, clean.slice(1));
        else target = path.resolve(path.dirname(htmlFile), clean);

        const relativeTarget = path.relative(dist, target);
        if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
            missing.push({ page: path.relative(dist, htmlFile), reference: raw, reason: 'path escapes website/dist' });
            continue;
        }

        const candidates = [target];
        if (clean.endsWith('/')) candidates.push(path.join(target, 'index.html'));
        if (!path.extname(target)) {
            candidates.push(`${target}.html`);
            candidates.push(path.join(target, 'index.html'));
        }
        if (!candidates.some((candidate) => fs.existsSync(candidate))) {
            missing.push({ page: path.relative(dist, htmlFile), reference: raw, reason: 'target not found' });
        }
    }
}

console.log(`[site-links] pages=${htmlFiles.length} references=${references} missing=${missing.length}`);
if (missing.length > 0) {
    for (const item of missing.slice(0, 100)) {
        console.error(`[site-links] ${item.page}: ${item.reference} (${item.reason})`);
    }
    process.exit(1);
}
