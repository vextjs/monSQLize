'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MEMORY_SERVER_VERSION = '7.0.37';
const DEFAULT_MEMORY_SERVER_LAUNCH_TIMEOUT_MS = 30_000;
const MANAGED_DB_PATH_PREFIXES = ['single-', 'replset-', 'examples-single-', 'examples-replset-', 'probe-single-', 'probe-replset-'];

function isGeneratedPath(dir) {
    return dir.split(path.sep).includes('.generated');
}

function resolveProjectRoot() {
    let dir = __dirname;

    while (true) {
        const packageJsonPath = path.join(dir, 'package.json');
        if (fs.existsSync(packageJsonPath) && !isGeneratedPath(dir)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                if (pkg.name === 'monsqlize') {
                    return dir;
                }
            } catch {
                // Continue walking when a package file cannot be parsed.
            }
        }

        const parent = path.dirname(dir);
        if (parent === dir) {
            return process.cwd();
        }
        dir = parent;
    }
}

function setDefaultEnv(name, value) {
    if (!process.env[name]) {
        process.env[name] = value;
    }
}

function sanitizeSegment(input) {
    return String(input).replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'default';
}

function parseManagedPathPid(name) {
    if (!MANAGED_DB_PATH_PREFIXES.some((prefix) => name.startsWith(prefix))) {
        return null;
    }
    const match = /-(\d+)-[^-]+$/.exec(name);
    if (!match) {
        return null;
    }
    const pid = Number.parseInt(match[1], 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
}

function isProcessAlive(pid) {
    if (pid === process.pid) {
        return true;
    }
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return error && error.code === 'EPERM';
    }
}

function pruneMemoryServerDbRoot(dbRoot) {
    let entries;
    try {
        entries = fs.readdirSync(dbRoot, { withFileTypes: true });
    } catch {
        return;
    }

    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }
        const pid = parseManagedPathPid(entry.name);
        if (!pid || isProcessAlive(pid)) {
            continue;
        }
        try {
            fs.rmSync(path.join(dbRoot, entry.name), { recursive: true, force: true });
        } catch {
            // Best-effort cleanup; current instance cleanup still fails loudly when its own path remains.
        }
    }
}

function resolveMemoryServerBinaryVersion(version) {
    return version || process.env.MONSQLIZE_MEMORY_MONGO_BINARY_VERSION || process.env.MONGOMS_VERSION || DEFAULT_MEMORY_SERVER_VERSION;
}

function resolveReplSetBinaryVersion(version) {
    return (
        version ||
        process.env.MONSQLIZE_REPLSET_BINARY_VERSION ||
        process.env.MONSQLIZE_MEMORY_MONGO_BINARY_VERSION ||
        process.env.MONGOMS_VERSION ||
        DEFAULT_MEMORY_SERVER_VERSION
    );
}

function configureMemoryServerEnv(version) {
    const projectRoot = resolveProjectRoot();
    const cacheRoot = path.resolve(process.env.MONSQLIZE_MEMORY_SERVER_CACHE_DIR || path.join(projectRoot, '.cache', 'mongodb-memory-server'));
    const downloadDir = path.resolve(process.env.MONGOMS_DOWNLOAD_DIR || path.join(cacheRoot, 'binaries'));
    const dbRoot = path.resolve(process.env.MONSQLIZE_MEMORY_SERVER_DB_DIR || path.join(cacheRoot, 'db'));
    const binaryVersion = resolveMemoryServerBinaryVersion(version);

    fs.mkdirSync(downloadDir, { recursive: true });
    fs.mkdirSync(dbRoot, { recursive: true });

    setDefaultEnv('MONGOMS_DOWNLOAD_DIR', downloadDir);
    setDefaultEnv('MONGOMS_PREFER_GLOBAL_PATH', 'false');
    setDefaultEnv('MONGOMS_RUNTIME_DOWNLOAD', 'true');
    setDefaultEnv('MONGOMS_VERSION', binaryVersion);

    return { projectRoot, cacheRoot, downloadDir, dbRoot, binaryVersion };
}

function createMemoryServerDbPath(kind, dbName = 'monsqlize') {
    const { dbRoot } = configureMemoryServerEnv();
    pruneMemoryServerDbRoot(dbRoot);
    return fs.mkdtempSync(path.join(dbRoot, `${sanitizeSegment(kind)}-${sanitizeSegment(dbName)}-${process.pid}-`));
}

async function seedMemoryServerBinaryCache(version) {
    const policy = configureMemoryServerEnv(version);

    try {
        const { DryMongoBinary } = require('mongodb-memory-server-core/lib/util/DryMongoBinary');
        const options = await DryMongoBinary.generateOptions({
            version: policy.binaryVersion,
            downloadDir: policy.downloadDir,
        });
        options.downloadDir = policy.downloadDir;
        const paths = await DryMongoBinary.generatePaths(options);
        if (
            paths.resolveConfig &&
            paths.homeCache &&
            path.resolve(paths.resolveConfig) !== path.resolve(paths.homeCache) &&
            fs.existsSync(paths.homeCache) &&
            !fs.existsSync(paths.resolveConfig)
        ) {
            fs.mkdirSync(path.dirname(paths.resolveConfig), { recursive: true });
            fs.copyFileSync(paths.homeCache, paths.resolveConfig);
        }
    } catch {
        // Best-effort seeding only; mongodb-memory-server can still download into the project cache.
    }
}

function resolveMemoryServerLaunchTimeoutMs() {
    const raw = process.env.MONSQLIZE_MEMORY_MONGO_LAUNCH_TIMEOUT_MS;
    if (!raw) {
        return DEFAULT_MEMORY_SERVER_LAUNCH_TIMEOUT_MS;
    }

    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : undefined;
}

function memoryServerCleanupOptions() {
    return { doCleanup: true, force: true };
}

function isCleanupPathError(error, dbPath) {
    if (!error || typeof error !== 'object') {
        return false;
    }
    if (!error.code || !['ENOTEMPTY', 'EBUSY', 'EPERM', 'ENOENT'].includes(error.code)) {
        return false;
    }
    return !error.path || path.resolve(error.path).startsWith(path.resolve(dbPath));
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopMemoryServerWithCleanup(instance, dbPath) {
    let stopError = null;
    let cleanupError = null;

    try {
        await instance.stop(memoryServerCleanupOptions());
    } catch (error) {
        stopError = error;
    }

    if (dbPath) {
        for (const waitMs of [0, 50, 100, 200, 400, 800]) {
            if (waitMs > 0) {
                await delay(waitMs);
            }
            try {
                fs.rmSync(dbPath, { recursive: true, force: true });
                if (!fs.existsSync(dbPath)) {
                    if (!stopError || isCleanupPathError(stopError, dbPath)) {
                        return;
                    }
                    break;
                }
            } catch (error) {
                cleanupError = error;
                // Retry while the OS releases journal files.
            }
        }
    }

    if (dbPath && fs.existsSync(dbPath) && (!stopError || isCleanupPathError(stopError, dbPath))) {
        throw cleanupError instanceof Error ? cleanupError : new Error(`Failed to remove MongoDB memory-server dbPath: ${dbPath}`);
    }

    if (stopError) {
        throw stopError;
    }
}

module.exports = {
    DEFAULT_MEMORY_SERVER_VERSION,
    DEFAULT_MEMORY_SERVER_LAUNCH_TIMEOUT_MS,
    configureMemoryServerEnv,
    createMemoryServerDbPath,
    memoryServerCleanupOptions,
    pruneMemoryServerDbRoot,
    resolveMemoryServerBinaryVersion,
    resolveMemoryServerLaunchTimeoutMs,
    resolveReplSetBinaryVersion,
    seedMemoryServerBinaryCache,
    stopMemoryServerWithCleanup,
};
