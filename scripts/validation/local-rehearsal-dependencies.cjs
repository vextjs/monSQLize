'use strict';

const fs = require('node:fs');
const path = require('node:path');

function isPrereleaseVersion(version) {
    return typeof version === 'string' && version.includes('-');
}

function resolveFileReference(projectRoot, reference) {
    const relativePath = reference.slice('file:'.length);
    return path.resolve(projectRoot, relativePath);
}

/**
 * Resolve identity-bound local tarballs used only by an unpublished rehearsal candidate.
 * Stable packages and registry-backed prereleases keep the normal registry install path.
 */
function resolveLocalRehearsalDependencyTarballs(projectRoot, dependencyNames) {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    if (!isPrereleaseVersion(packageJson.version)) {
        return [];
    }

    const lock = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package-lock.json'), 'utf8'));
    const tarballs = [];
    for (const dependencyName of dependencyNames) {
        const expectedVersion = packageJson.dependencies?.[dependencyName];
        if (!isPrereleaseVersion(expectedVersion)) {
            continue;
        }
        const lockEntry = lock.packages?.[`node_modules/${dependencyName}`];
        if (!lockEntry || lockEntry.version !== expectedVersion) {
            throw new Error(`Lock entry for ${dependencyName}@${expectedVersion} is missing or mismatched.`);
        }
        if (typeof lockEntry.resolved !== 'string' || !lockEntry.resolved.startsWith('file:')) {
            continue;
        }
        const tarballPath = resolveFileReference(projectRoot, lockEntry.resolved);
        if (!fs.existsSync(tarballPath)) {
            throw new Error(`Local rehearsal tarball does not exist: ${tarballPath}`);
        }
        tarballs.push(tarballPath);
    }
    return tarballs;
}

module.exports = { resolveLocalRehearsalDependencyTarballs };
