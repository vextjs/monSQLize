import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_MEMORY_SERVER_VERSION = '7.0.14';
const MANAGED_DB_PATH_PREFIXES = ['single-', 'replset-', 'examples-single-', 'examples-replset-', 'probe-single-', 'probe-replset-'];

type MemoryServerPolicy = {
    projectRoot: string;
    cacheRoot: string;
    downloadDir: string;
    dbRoot: string;
    binaryVersion: string;
};

function isGeneratedPath(dir: string): boolean {
    return dir.split(path.sep).includes('.generated');
}

function resolveProjectRoot(): string {
    let dir = __dirname;

    while (true) {
        const packageJsonPath = path.join(dir, 'package.json');
        if (existsSync(packageJsonPath) && !isGeneratedPath(dir)) {
            try {
                const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { name?: string };
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

function setDefaultEnv(name: string, value: string): void {
    if (!process.env[name]) {
        process.env[name] = value;
    }
}

function sanitizeSegment(input: string): string {
    return input.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'default';
}

function parseManagedPathPid(name: string): number | null {
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

function isProcessAlive(pid: number): boolean {
    if (pid === process.pid) {
        return true;
    }
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return (error as { code?: string }).code === 'EPERM';
    }
}

export function pruneMemoryServerDbRoot(dbRoot: string): void {
    let entries: Array<{ isDirectory(): boolean; name: string }>;
    try {
        entries = readdirSync(dbRoot, { withFileTypes: true });
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
            rmSync(path.join(dbRoot, entry.name), { recursive: true, force: true });
        } catch {
            // Best-effort cleanup; current instance cleanup still fails loudly when its own path remains.
        }
    }
}

export function resolveMemoryServerBinaryVersion(version?: string): string {
    return version || process.env.MONSQLIZE_MEMORY_MONGO_BINARY_VERSION || process.env.MONGOMS_VERSION || DEFAULT_MEMORY_SERVER_VERSION;
}

export function resolveReplSetBinaryVersion(version?: string): string {
    return (
        version ||
        process.env.MONSQLIZE_REPLSET_BINARY_VERSION ||
        process.env.MONSQLIZE_MEMORY_MONGO_BINARY_VERSION ||
        process.env.MONGOMS_VERSION ||
        DEFAULT_MEMORY_SERVER_VERSION
    );
}

export function configureMemoryServerEnv(version?: string): MemoryServerPolicy {
    const projectRoot = resolveProjectRoot();
    const cacheRoot = path.resolve(process.env.MONSQLIZE_MEMORY_SERVER_CACHE_DIR || path.join(projectRoot, '.cache', 'mongodb-memory-server'));
    const downloadDir = path.resolve(process.env.MONGOMS_DOWNLOAD_DIR || path.join(cacheRoot, 'binaries'));
    const dbRoot = path.resolve(process.env.MONSQLIZE_MEMORY_SERVER_DB_DIR || path.join(cacheRoot, 'db'));
    const binaryVersion = resolveMemoryServerBinaryVersion(version);

    mkdirSync(downloadDir, { recursive: true });
    mkdirSync(dbRoot, { recursive: true });

    setDefaultEnv('MONGOMS_DOWNLOAD_DIR', downloadDir);
    setDefaultEnv('MONGOMS_PREFER_GLOBAL_PATH', 'false');
    setDefaultEnv('MONGOMS_RUNTIME_DOWNLOAD', 'true');
    setDefaultEnv('MONGOMS_VERSION', binaryVersion);

    return { projectRoot, cacheRoot, downloadDir, dbRoot, binaryVersion };
}

export function createMemoryServerDbPath(kind: string, dbName = 'monsqlize'): string {
    const { dbRoot } = configureMemoryServerEnv();
    pruneMemoryServerDbRoot(dbRoot);
    return mkdtempSync(path.join(dbRoot, `${sanitizeSegment(kind)}-${sanitizeSegment(dbName)}-${process.pid}-`));
}

export async function seedMemoryServerBinaryCache(version?: string): Promise<void> {
    const policy = configureMemoryServerEnv(version);

    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { DryMongoBinary } = require('mongodb-memory-server-core/lib/util/DryMongoBinary') as {
            DryMongoBinary: {
                generateOptions(opts: Record<string, unknown>): Promise<Record<string, unknown>>;
                generatePaths(opts: Record<string, unknown>): Promise<{ resolveConfig?: string; homeCache?: string }>;
            };
        };
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
            existsSync(paths.homeCache) &&
            !existsSync(paths.resolveConfig)
        ) {
            mkdirSync(path.dirname(paths.resolveConfig), { recursive: true });
            copyFileSync(paths.homeCache, paths.resolveConfig);
        }
    } catch {
        // Best-effort seeding only; mongodb-memory-server can still download into the project cache.
    }
}

export function resolveMemoryServerLaunchTimeoutMs(): number | undefined {
    const raw = process.env.MONSQLIZE_MEMORY_MONGO_LAUNCH_TIMEOUT_MS;
    if (!raw) {
        return undefined;
    }

    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function memoryServerCleanupOptions(): { doCleanup: true; force: true } {
    return { doCleanup: true, force: true };
}

function isCleanupPathError(error: unknown, dbPath: string): boolean {
    if (!error || typeof error !== 'object') {
        return false;
    }
    const candidate = error as { code?: string; path?: string };
    if (!candidate.code || !['ENOTEMPTY', 'EBUSY', 'EPERM', 'ENOENT'].includes(candidate.code)) {
        return false;
    }
    return !candidate.path || path.resolve(candidate.path).startsWith(path.resolve(dbPath));
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function stopMemoryServerWithCleanup(
    instance: { stop(cleanupOptions?: { doCleanup?: boolean; force?: boolean }): Promise<boolean | void> },
    dbPath: string | null | undefined,
): Promise<void> {
    let stopError: unknown = null;
    let cleanupError: unknown = null;

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
                rmSync(dbPath, { recursive: true, force: true });
                if (!existsSync(dbPath)) {
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

    if (dbPath && existsSync(dbPath) && (!stopError || isCleanupPathError(stopError, dbPath))) {
        throw cleanupError instanceof Error ? cleanupError : new Error(`Failed to remove MongoDB memory-server dbPath: ${dbPath}`);
    }

    if (stopError) {
        throw stopError;
    }
}
