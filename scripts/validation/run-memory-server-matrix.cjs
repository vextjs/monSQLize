const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');
const packageJson = require(path.join(projectRoot, 'package.json'));
const baseDriverRange = packageJson.dependencies.mongodb;
const currentDriverVersion = readInstalledDriverVersion();
const mongoVersions = [
    { label: 'MongoDB 6.x', version: '6.0.14' },
    { label: 'MongoDB 7.x', version: '7.0.14' },
];
const integrationSuites = [
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
    { label: `Node ${process.version}（当前环境）`, type: 'current', major: Number(process.versions.node.split('.')[0]) },
];

if (commandExists('volta')) {
    nodeScenarios.push({ label: 'Node 22.x（Volta）', type: 'volta', major: 22 });
}

const driverScenarios = [
    {
        label: `Driver ${currentDriverVersion}（当前依赖）`,
        range: null,
        setup() {
            return { skipped: false, version: readInstalledDriverVersion() };
        },
        cleanup() {
            return true;
        },
    },
    {
        label: 'Driver 7.x（临时安装）',
        range: '7',
        setup() {
            const installResult = installDriver('7');
            if (installResult.status !== 0) {
                return {
                    skipped: true,
                    reason: '临时安装 mongodb@7 失败，按不支持处理',
                };
            }
            return { skipped: false, version: readInstalledDriverVersion() };
        },
        cleanup() {
            const restoreResult = restoreBaseDriver();
            if (restoreResult.status !== 0) {
                fail(`恢复基础依赖 ${baseDriverRange} 失败`);
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
            status: 'skipped',
            reason: driverSetup.reason,
            results: [],
        });
        continue;
    }

    const driverVersion = driverSetup.version;
    const driverSummary = {
        driver: `${driverScenario.label} -> ${driverVersion}`,
        status: 'passed',
        results: [],
    };

    for (const nodeScenario of nodeScenarios) {
        console.log(`[memory-server-matrix] -> ${nodeScenario.label}`);
        const buildResult = runNpmScenario(nodeScenario, ['run', 'build']);
        if (buildResult.status !== 0) {
            driverScenario.cleanup();
            fail(`${driverScenario.label} 在 ${nodeScenario.label} 下构建失败`);
        }

        const compatibilityResult = runNpmScenario(nodeScenario, ['run', 'test:compatibility']);
        if (compatibilityResult.status !== 0) {
            driverScenario.cleanup();
            fail(`${driverScenario.label} 在 ${nodeScenario.label} 下兼容测试失败`);
        }

        for (const mongoVersion of mongoVersions) {
            const probe = probeMongoVersion(nodeScenario, mongoVersion.version);
            if (!probe.supported) {
                driverSummary.results.push({
                    node: nodeScenario.label,
                    mongo: mongoVersion.label,
                    status: 'skipped',
                    reason: probe.unsupported ? 'memory-server 不支持该版本/平台组合' : 'memory-server 探测失败',
                    error: probe.error,
                });
                continue;
            }

            console.log(`[memory-server-matrix]    验证 ${nodeScenario.label} / ${driverVersion} / ${mongoVersion.label}`);
            const integrationResult = runNodeScenario(nodeScenario, ['--test', ...integrationSuites], {
                env: {
                    MONSQLIZE_MATRIX_MODE: '1',
                    MONSQLIZE_MEMORY_MONGO_BINARY_VERSION: mongoVersion.version,
                    MONSQLIZE_REPLSET_BINARY_VERSION: mongoVersion.version,
                },
            });

            if (integrationResult.status !== 0) {
                driverScenario.cleanup();
                fail(`${driverScenario.label} 在 ${nodeScenario.label} + ${mongoVersion.label} 下集成测试失败`);
            }

            driverSummary.results.push({
                node: nodeScenario.label,
                mongo: mongoVersion.label,
                status: 'passed',
            });
        }
    }

    driverScenario.cleanup();
    summary.push(driverSummary);
}

if (readInstalledDriverVersion() !== currentDriverVersion) {
    const restoreResult = restoreBaseDriver();
    if (restoreResult.status !== 0) {
        fail(`最终恢复驱动版本 ${baseDriverRange} 失败`);
    }
}

console.log('\n[memory-server-matrix] 汇总:');
console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    node: process.version,
    baseDriver: currentDriverVersion,
    summary,
}, null, 2));
