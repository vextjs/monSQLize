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
    const releaseAuthWorkflow = read('.github/workflows/release-auth-check.yml');
    const publishWorkflow = read('.github/workflows/publish.yml');
    const candidateCheck = read('scripts/check-release-candidate.cjs');
    const packInstallSmoke = read('scripts/pack-install-smoke.cjs');
    const websitePackageJson = JSON.parse(read('website/package.json')) as {
        scripts: Record<string, string>;
    };

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
    assert.ok(packageJson.files.includes('MIGRATION.md'));
    assert.ok(packageJson.files.includes('SECURITY.md'));
    assert.match(preflight, /check:release-candidate/);
    assert.match(preflight, /\['--prefix', 'website', 'ci'\]/);
    assert.match(preflight, /\['--prefix', 'website', 'run', 'verify'\]/);
    assert.match(candidateCheck, /git[\s\S]*status[\s\S]*--porcelain=v1/);
    assert.match(candidateCheck, /npm[\s\S]*ls[\s\S]*--all/);
    assert.match(candidateCheck, /git[\s\S]*ls-remote[\s\S]*origin/);
    assert.match(packInstallSmoke, /MIGRATION\.md/);
    assert.match(packInstallSmoke, /SECURITY\.md/);
    assert.match(packInstallSmoke, /dataTasks/);
    assert.match(packInstallSmoke, /schema-dsl/);
    assert.match(websitePackageJson.scripts.verify, /type-check.*build.*check:links.*check:audit/);
    assert.match(ci, /npm run release:preflight/);
    assert.match(releaseWorkflow, /npm run release:preflight/);
    assert.match(releaseAuthWorkflow, /workflow_dispatch/);
    assert.match(releaseAuthWorkflow, /secrets\.NPM_TOKEN/);
    assert.match(releaseAuthWorkflow, /npm whoami/);
    assert.match(publishWorkflow, /npm run release:preflight/);
    assert.match(publishWorkflow, /dist\.integrity/);
    assert.match(publishWorkflow, /dist-tags\.latest/);
    assert.match(publishWorkflow, /mkdir -p "\$\{CONSUMER_DIR\}"/);
    assert.match(publishWorkflow, /dist\/esm\/index\.mjs/);
    assert.match(publishWorkflow, /dataTasks/);
    assert.match(publishWorkflow, /release_tag:/);
    assert.match(publishWorkflow, /ref: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.release_tag \|\| github\.ref \}\}/);
    assert.match(publishWorkflow, /git rev-parse "\$\{RELEASE_TAG\}\^\{commit\}"/);
    assert.match(publishWorkflow, /GITHUB_STEP_SUMMARY/);
    assert.match(publishWorkflow, /releases\/new\?tag=/);
    assert.match(publishWorkflow, /Deploy Docs to GitHub Pages/);
});

test('stable docs deployment requires an npm-verified release tag', () => {
    const deployDocs = read('.github/workflows/deploy-docs.yml');

    assert.doesNotMatch(deployDocs, /branches:\s*\[main\]/);
    assert.match(deployDocs, /release_tag:/);
    assert.match(deployDocs, /npm view "monsqlize@\$\{PACKAGE_VERSION\}"/);
    assert.match(deployDocs, /DOCS_RELEASE_CHANNEL=stable/);
    assert.match(deployDocs, /path: release/);
    assert.match(deployDocs, /path: tooling/);
    assert.match(deployDocs, /ref: \$\{\{ github\.sha \}\}/);
    assert.match(deployDocs, /Select verified website toolchain/);
    assert.match(deployDocs, /cp tooling\/website\/package-lock\.json release\/website\/package-lock\.json/);
    assert.match(deployDocs, /DOCS_LEGACY_TAG/);
    assert.match(deployDocs, /npm run verify/);
    assert.match(deployDocs, /check-site-links\.cjs --dist/);
    assert.match(deployDocs, /npm audit/);
    assert.match(deployDocs, /GITHUB_STEP_SUMMARY/);
});
