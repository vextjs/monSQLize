import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(__dirname, '..', '..', '..', '..');

function read(relativePath: string): string {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('release paths consume the complete single-source preflight gate', () => {
    const packageJson = JSON.parse(read('package.json')) as {
        version: string;
        scripts: Record<string, string>;
        files: string[];
    };
    const preflight = read('scripts/release-preflight.cjs');
    const ci = read('.github/workflows/test.yml');
    const releaseWorkflow = read('.github/workflows/release-preflight.yml');
    const publishWorkflow = read('.github/workflows/publish.yml');

    for (const script of [
        'verify:fast',
        'test:coverage',
        'test:examples',
        'test:server-matrix',
        'test:data-tasks:integration',
        'test:data-task-cli',
        'test:audit',
        'test:pack-install',
    ]) {
        assert.match(preflight, new RegExp(`['\"]${script.replaceAll(':', '\\:')}['\"]`));
    }

    assert.match(packageJson.scripts['type-check'], /data-tasks-usage\.test-d\.ts/);
    assert.equal(packageJson.scripts.prepublishOnly, 'npm run release:preflight');
    assert.match(packageJson.scripts['release:publish'], /^npm run release:preflight && /);
    assert.ok(packageJson.files.includes(`changelogs/v${packageJson.version}.md`));
    assert.match(ci, /npm run release:preflight/);
    assert.match(releaseWorkflow, /npm run release:preflight/);
    assert.match(publishWorkflow, /npm run release:preflight/);
    assert.match(publishWorkflow, /dist\.integrity/);
    assert.match(publishWorkflow, /dist-tags\.latest/);
    assert.match(publishWorkflow, /mkdir -p "\$\{CONSUMER_DIR\}"/);
    assert.match(publishWorkflow, /dist\/esm\/index\.mjs/);
    assert.match(publishWorkflow, /release_tag:/);
    assert.match(publishWorkflow, /ref: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.release_tag \|\| github\.ref \}\}/);
    assert.match(publishWorkflow, /git rev-parse "\$\{RELEASE_TAG\}\^\{commit\}"/);
});

test('stable docs deployment requires an npm-verified release tag', () => {
    const deployDocs = read('.github/workflows/deploy-docs.yml');

    assert.doesNotMatch(deployDocs, /branches:\s*\[main\]/);
    assert.match(deployDocs, /release_tag:/);
    assert.match(deployDocs, /npm view "monsqlize@\$\{PACKAGE_VERSION\}"/);
    assert.match(deployDocs, /DOCS_RELEASE_CHANNEL=stable/);
});
