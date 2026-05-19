/**
 * capability-wiring.ts — pure-function capability initialisation layer
 *
 * Notes:
 * - Standalone initialisation helpers extracted from runtime-core.ts
 * - All functions accept parameters and return values with no `this` dependency,
 *   making them easy to test and reuse in isolation
 * - Covers: autoConvert config building, runtime defaults, pool creation, and Model file auto-loading
 */

import type { MonSQLizeOptions } from '../../types/monsqlize';
import type { RuntimeDefaults } from '../types/internal/query';
import type { LoggerLike } from '../core/logger';
import type { ModelDefinition } from '../capabilities/model';
import { Model } from '../capabilities/model';
import { CountQueue } from '../capabilities/count-queue';
import { ConnectionPoolManager } from '../capabilities/pool';

// ────────────────────────────────────────────────────────
// AutoConvert config
// ────────────────────────────────────────────────────────

/**
 * Initialise the ObjectId auto-convert configuration.
 * Only enabled for the `mongodb` type; all other types always return disabled.
 */
export function initAutoConvertConfig(
    config: boolean | { enabled?: boolean; excludeFields?: string[]; customFieldPatterns?: string[]; maxDepth?: number; logLevel?: string; } | undefined,
    type: string | undefined,
): { enabled: boolean; excludeFields?: string[]; customFieldPatterns?: string[]; maxDepth?: number; logLevel?: string; } {
    if (type !== 'mongodb') {
        return { enabled: false };
    }
    if (config === false) {
        return { enabled: false };
    }
    const defaults = { enabled: true, excludeFields: [], customFieldPatterns: [], maxDepth: 10, logLevel: 'warn' };
    if (config === true || config === undefined) {
        return defaults;
    }
    if (typeof config === 'object' && config !== null) {
        if (config.enabled === false) {
            return { enabled: false };
        }
        return { ...defaults, ...config, enabled: true };
    }
    return defaults;
}

// ────────────────────────────────────────────────────────
// Runtime defaults
// ────────────────────────────────────────────────────────

/**
 * Build the runtime defaults object from options.
 * Includes maxTimeMS, findLimit, autoConvertObjectId, countQueue, and related fields.
 */
export function buildRuntimeDefaults(options: MonSQLizeOptions): RuntimeDefaults {
    const o = options;
    const defaults: RuntimeDefaults = {};
    if (o.maxTimeMS !== undefined) defaults.maxTimeMS = o.maxTimeMS;
    if (o.findLimit !== undefined) defaults.findLimit = o.findLimit;
    if (o.findPageMaxLimit !== undefined) defaults.findPageMaxLimit = o.findPageMaxLimit;
    if (o.slowQueryMs !== undefined) defaults.slowQueryMs = o.slowQueryMs;
    // v1-compat: autoConvertObjectId defaults to true for MongoDB type (mirrors v1 behaviour)
    defaults.autoConvertObjectId = o.autoConvertObjectId !== undefined
        ? o.autoConvertObjectId
        : (o.type === 'mongodb' || !o.type ? true : false);
    if (o.cursorSecret !== undefined) defaults.cursorSecret = o.cursorSecret;
    if (o.namespace !== undefined) defaults.namespace = o.namespace;
    if (o.countQueue?.enabled) {
        defaults.countQueue = new CountQueue({
            concurrency: o.countQueue.concurrency,
            maxQueueSize: o.countQueue.maxQueueSize,
            timeout: o.countQueue.timeout,
        });
    }
    return defaults;
}

// ────────────────────────────────────────────────────────
// Connection pool manager
// ────────────────────────────────────────────────────────

/**
 * Create and start the connection pool manager.
 * - Returns null when options.pools is not configured
 * - Creates a new instance, registers all pools, starts health checks, then returns
 * - Callers are responsible for checking whether an instance already exists to avoid duplicate initialisation
 */
export async function createAndStartPoolManager(
    options: MonSQLizeOptions,
): Promise<ConnectionPoolManager | null> {
    if (!options.pools?.length) {
        return null;
    }
    const pm = new ConnectionPoolManager({
        pools: options.pools,
        poolStrategy: options.poolStrategy,
        poolFallback: options.poolFallback,
        maxPoolsCount: options.maxPoolsCount,
        logger: options.logger ?? null,
    });
    for (const pool of options.pools) {
        await pm.addPool(pool);
    }
    pm.startHealthCheck();
    return pm;
}

// ────────────────────────────────────────────────────────
// Model file auto-loading
// ────────────────────────────────────────────────────────

/**
 * Auto-load Model definition files from the configured path (mirrors v1 models auto-load behaviour).
 *
 * Supports two formats:
 * - String: `models: './models'` — scans `*.model.{js,ts,mjs,cjs}`, non-recursive
 * - Object: `models: { path, pattern?, recursive? }` — full control
 *
 * Each file must export an object with a `name` field (i.e. the argument to Model.define()).
 */
export async function loadModelFiles(
    options: MonSQLizeOptions,
    logger: LoggerLike,
    opts: { reload?: boolean } = {},
): Promise<void> {
    const modelsConfig = options.models;
    if (!modelsConfig) return;
    if (typeof modelsConfig !== 'string' && typeof modelsConfig !== 'object') return;

    const { readdirSync } = await import('node:fs');
    const { resolve, join, isAbsolute } = await import('node:path');
    const { createRequire } = await import('node:module');

    let targetPath: string;
    let pattern: string;
    let recursive: boolean;

    if (typeof modelsConfig === 'string') {
        targetPath = isAbsolute(modelsConfig) ? modelsConfig : resolve(process.cwd(), modelsConfig);
        pattern = '*.model.{js,ts,mjs,cjs}';
        recursive = false;
    } else {
        const p = modelsConfig.path;
        targetPath = isAbsolute(p) ? p : resolve(process.cwd(), p);
        pattern = modelsConfig.pattern ?? '*.model.{js,ts,mjs,cjs}';
        recursive = modelsConfig.recursive ?? false;
    }

    // Convert glob pattern to RegExp (supports {a,b} alternatives and * wildcard)
    const globToRegex = (glob: string): RegExp => {
        const escaped = glob
            .replace(/\./g, '\\.')
            .replace(/\{([^}]+)\}/g, (_, inner) => `(?:${inner.split(',').join('|')})`)
            .replace(/\*/g, '[^/\\\\]*');
        return new RegExp(`^${escaped}$`);
    };
    const filePattern = globToRegex(pattern);

    const collectFiles = (dir: string): string[] => {
        let entries: Array<{ name: string | Buffer; isDirectory(): boolean; isFile(): boolean }>;
        try {
            entries = readdirSync(dir, { withFileTypes: true }) as unknown as Array<{ name: string | Buffer; isDirectory(): boolean; isFile(): boolean }>;
        } catch {
            logger.warn?.(`[Models] cannot read directory: ${dir}`);
            return [];
        }
        const files: string[] = [];
        for (const entry of entries) {
            const entryName = typeof entry.name === 'string' ? entry.name : entry.name.toString();
            if (entry.isDirectory() && recursive) {
                files.push(...collectFiles(join(dir, entryName)));
            } else if (entry.isFile() && filePattern.test(entryName)) {
                files.push(join(dir, entryName));
            }
        }
        return files;
    };

    const files = collectFiles(targetPath);
    if (files.length === 0) return;

    const req = createRequire(resolve(process.cwd(), 'package.json'));
    for (const file of files) {
        try {
            delete req.cache[req.resolve(file)];
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const mod = req(file) as Record<string, unknown>;
            const definition = (mod.default ?? mod) as { name?: string; [key: string]: unknown };
            if (!definition?.name) {
                logger.warn?.(`[Models] ${file}: exported object must have a 'name' field`);
                continue;
            }
            if (opts.reload && Model.has(definition.name as string)) {
                Model.redefine(definition.name as string, definition as ModelDefinition<unknown>);
            } else {
                Model.define(definition.name as string, definition as ModelDefinition<unknown>);
            }
        } catch (err) {
            logger.warn?.(`[Models] failed to load ${file}`, err);
        }
    }
}
