const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');
const packageJson = require(path.join(projectRoot, 'package.json'));
const baseDriverRange = packageJson.dependencies.mongodb;
const currentDriverVersion = readInstalledDriverVersion();
const testDistRoot = path.join('.generated', 'test-dist');
const mongoVersions = [
    { label: 'MongoDB 6.x', version: '6.0.14' },
    { label: 'MongoDB 7.x', version: '7.0.14' },
];
const integrationSourceSuites = [
    'test/integration/mongodb/connect.test.js',
    'test/integration/mongodb/queries.test.js',
    'test/integration/mongodb/management.test.js',
    'test/integration/mongodb/writes-batch.test.js',
    'test/integration/model/model-features.test.js',
    'test/integration/pool/pool.test.js',
    'test/integration/slow-query-log/slow-query-log.test.js',
    'test/integration/transaction/transaction.test.js',
    'test/integration/sync/sync.test.js',
];
const integrationSuites = integrationSourceSuites.map((suite) => path.join(testDistRoot, suite));

function commandExists(command) {
    const lookupCommand = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSync(lookupCommand, [command], { stdio: 'pipe', encoding: 'utf8' });
    return result.status === 0;
}

function run(command, args, options = {}) {
    return spawnSync(command, args, {
        cwd: projectRoot,
        stdio: options.capture ? 'pipe' : 'inherit',
        encoding: 'utf8',
        shell: options.shell ?? (process.platform === 'win32'),
        env: {
            ...process.env,
            ...(options.env || {}),
        },
    });
}

function runNodeScenario(scenario, args, options = {}) {
    if (scenario.type === 'current') {
        return run('node', args, options);
    }
    return run('volta', ['run', '--node', scenario.major, 'node', ...args], options);
}

function runNpmScenario(scenario, npmArgs, options = {}) {
    if (scenario.type === 'current') {
        return run('npm', npmArgs, options);
    }
    return run('volta', ['run', '--node', scenario.major, 'npm', ...npmArgs], options);
}

function readInstalledDriverVersion() {
    return JSON.parse(
        fs.readFileSync(path.join(projectRoot, 'node_modules', 'mongodb', 'package.json'), 'utf8'),
    ).version;
}

function installDriver(range) {
    return run('npm', ['install', `mongodb@${range}`, '--no-save', '--package-lock=false']);
}

function restoreBaseDriver() {
    return installDriver(baseDriverRange);
}

function probeMongoVersion(scenario, version) {
    const result = runNodeScenario(
        scenario,
        ['scripts/validation/probe-memory-server-version.cjs', version],
        { capture: true, shell: false },
    );
    if (result.status === 0) {
        return { supported: true };
    }

    const errorText = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
    const unsupported = /KnownVersionIncompatibilityError|Unsupported Architecture|not available for|does not provide binaries|cannot download/i.test(errorText);

    return {
        supported: false,
        unsupported,
        error: errorText,
    };
}

function fail(message) {
    console.error(`[memory-server-matrix] ${message}`);
    process.exit(1);
}

const nodeScenarios = [
    { label: `Node ${process.version} (current environment)`, type: 'current', major: Number(process.versions.node.split('.')[0]) },
];

if (commandExists('volta')) {
    nodeScenarios.push({ label: 'Node 22.x (Volta)', type: 'volta', major: 22 });
}

const driverScenarios = [
    {
        label: `Driver ${currentDriverVersion} (current dependency)`,
        range: null,
        setup() {
            return { skipped: false, version: readInstalledDriverVersion() };
        },
        cleanup() {
            return true;
        },
    },
    {
        label: 'Driver 7.x (temporary install)',
        range: '7',
        setup() {
            const installResult = installDriver('7');
            if (installResult.status !== 0) {
                return {
                    skipped: true,
                    reason: 'temporary mongodb@7 install failed; marked environment-unavailable and must be rechecked before release',
                };
            }
            return { skipped: false, version: readInstalledDriverVersion() };
        },
        cleanup() {
            const restoreResult = restoreBaseDriver();
            if (restoreResult.status !== 0) {
                fail(`failed to restore base dependency ${baseDriverRange}`);
            }
            return true;
        },
    },
];

const summary = [];

for (const driverScenario of driverScenarios) {
    console.log(`\n[memory-server-matrix] === ${driverScenario.label} ===`);
    const driverSetup = driverScenario.setup();
    if (driverSetup.skipped) {
        summary.push({
            driver: driverScenario.label,
            status: 'environment-unavailable',
            reason: driverSetup.reason,
            results: [],
        });
        continue;
    }

    const driverVersion = driverSetup.version;
    const driverSummary = {
        driver: `${driverScenario.label} -> ${driverVersion}`,
        status: 'verified',
        results: [],
    };

    for (const nodeScenario of nodeScenarios) {
        console.log(`[memory-server-matrix] -> ${nodeScenario.label}`);
        const buildResult = runNpmScenario(nodeScenario, ['run', 'build']);
        if (buildResult.status !== 0) {
            driverScenario.cleanup();
            fail(`${driverScenario.label} build failed under ${nodeScenario.label}`);
        }

        const compatibilityResult = runNpmScenario(nodeScenario, ['run', 'test:compatibility']);
        if (compatibilityResult.status !== 0) {
            driverScenario.cleanup();
            fail(`${driverScenario.label} compatibility tests failed under ${nodeScenario.label}`);
        }

        for (const mongoVersion of mongoVersions) {
            const probe = probeMongoVersion(nodeScenario, mongoVersion.version);
            if (!probe.supported) {
                driverSummary.results.push({
                    node: nodeScenario.label,
                    mongo: mongoVersion.label,
                    status: 'environment-unavailable',
                    reason: probe.unsupported ? 'memory-server does not support this version/platform combination; recheck before release' : 'memory-server probe failed; recheck before release',
                    error: probe.error,
                });
                continue;
            }

            console.log(`[memory-server-matrix]    verifying ${nodeScenario.label} / ${driverVersion} / ${mongoVersion.label}`);
            const integrationResult = runNodeScenario(nodeScenario, ['--test', ...integrationSuites], {
                env: {
                    MONSQLIZE_MATRIX_MODE: '1',
                    MONSQLIZE_MEMORY_MONGO_BINARY_VERSION: mongoVersion.version,
                    MONSQLIZE_REPLSET_BINARY_VERSION: mongoVersion.version,
                },
            });

            if (integrationResult.status !== 0) {
                driverScenario.cleanup();
                fail(`${driverScenario.label} integration tests failed under ${nodeScenario.label} + ${mongoVersion.label}`);
            }

            driverSummary.results.push({
                node: nodeScenario.label,
                mongo: mongoVersion.label,
                status: 'verified',
            });
        }
    }

    driverScenario.cleanup();
    summary.push(driverSummary);
}

if (readInstalledDriverVersion() !== currentDriverVersion) {
    const restoreResult = restoreBaseDriver();
    if (restoreResult.status !== 0) {
        fail(`final driver restore to ${baseDriverRange} failed`);
    }
}

console.log('\n[memory-server-matrix] summary:');
console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    node: process.version,
    baseDriver: currentDriverVersion,
    summary,
}, null, 2));
