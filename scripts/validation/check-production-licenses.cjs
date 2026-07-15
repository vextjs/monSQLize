#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const packageJson = require('../../package.json');
const packageLock = require('../../package-lock.json');
const policy = require('../../config/production-license-policy.json');
const snapshot = require('../../licenses/production-dependencies.json');

function hashFile(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const failures = [];
const dependencies = Object.keys(packageJson.dependencies || {}).sort().map((name) => {
    const dependencyRoot = path.join(root, 'node_modules', name);
    const metadataPath = path.join(dependencyRoot, 'package.json');
    if (!fs.existsSync(metadataPath)) {
        failures.push(`${name}: installed package metadata is missing`);
        return null;
    }
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    const lockVersion = packageLock.packages?.[`node_modules/${name}`]?.version;
    if (lockVersion !== metadata.version || packageJson.dependencies[name] !== metadata.version) {
        failures.push(`${name}: package/lock/install version drift (${packageJson.dependencies[name]} / ${lockVersion} / ${metadata.version})`);
    }

    let license = typeof metadata.license === 'string' ? metadata.license : null;
    let source = 'package-metadata';
    if (!license) {
        const override = policy.metadataOverrides[`${name}@${metadata.version}`];
        if (!override) {
            failures.push(`${name}@${metadata.version}: license metadata is missing and no verified override exists`);
            return null;
        }
        const licenseFile = path.join(dependencyRoot, override.licenseFile);
        if (!fs.existsSync(licenseFile)) {
            failures.push(`${name}@${metadata.version}: override evidence ${override.licenseFile} is missing`);
            return null;
        }
        const digest = hashFile(licenseFile);
        if (digest !== override.sha256) {
            failures.push(`${name}@${metadata.version}: LICENSE hash ${digest} does not match ${override.sha256}`);
        }
        license = override.license;
        source = `LICENSE:${digest}`;
    }

    if (!policy.allowedSpdx.includes(license)) {
        failures.push(`${name}@${metadata.version}: license ${license} is not allowed`);
    }
    return { name, version: metadata.version, license, source };
}).filter(Boolean);

if (JSON.stringify(dependencies) !== JSON.stringify(snapshot.dependencies)) {
    failures.push('licenses/production-dependencies.json is out of sync with installed direct dependencies');
}

if (failures.length > 0) {
    console.error('[production-licenses] failed:');
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exit(1);
}

console.log(`[production-licenses] verified ${dependencies.length} direct dependencies; metadata overrides=${dependencies.filter((entry) => entry.source.startsWith('LICENSE:')).length}.`);
