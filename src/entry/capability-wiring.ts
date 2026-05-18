/**
 * capability-wiring.ts — 能力初始化纯函数层
 *
 * 说明：
 * - 从 runtime-core.ts 提取的可独立调用的初始化辅助函数
 * - 这些函数接受参数并返回值，不依赖 this，便于单独测试和复用
 * - 覆盖：autoConvert 配置构建、运行时默认值、连接池创建、Model 文件自动加载
 */

import type { MonSQLizeOptions } from '../../types/monsqlize';
import type { RuntimeDefaults } from '../types/internal/query';
import type { LoggerLike } from '../core/logger';
import type { ModelDefinition } from '../capabilities/model';
import { Model } from '../capabilities/model';
import { CountQueue } from '../capabilities/count-queue';
import { ConnectionPoolManager } from '../capabilities/pool';

// ────────────────────────────────────────────────────────
// AutoConvert 配置
// ────────────────────────────────────────────────────────

/**
 * 初始化 ObjectId 自动转换配置。
 * 仅 mongodb 类型时允许启用；其他类型强制返回 disabled。
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
// 运行时默认值
// ────────────────────────────────────────────────────────

/**
 * 从 options 构建运行时默认值对象。
 * 包含 maxTimeMS、findLimit、autoConvertObjectId、countQueue 等字段。
 */
export function buildRuntimeDefaults(options: MonSQLizeOptions): RuntimeDefaults {
    const o = options;
    const defaults: RuntimeDefaults = {};
    if (o.maxTimeMS !== undefined) defaults.maxTimeMS = o.maxTimeMS;
    if (o.findLimit !== undefined) defaults.findLimit = o.findLimit;
    if (o.findPageMaxLimit !== undefined) defaults.findPageMaxLimit = o.findPageMaxLimit;
    if (o.slowQueryMs !== undefined) defaults.slowQueryMs = o.slowQueryMs;
    // v1-compat: autoConvertObjectId 在 MongoDB 类型下默认为 true（镜像 v1 行为）
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
// 连接池管理器
// ────────────────────────────────────────────────────────

/**
 * 创建并启动连接池管理器。
 * - 若 options.pools 未配置则返回 null
 * - 创建新实例、注册所有池、启动健康检查后返回
 * - 调用方负责判断是否已存在，避免重复初始化
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
// Model 文件自动加载
// ────────────────────────────────────────────────────────

/**
 * 自动从配置路径加载 Model 定义文件（镜像 v1 models 自动加载行为）。
 *
 * 支持两种格式：
 * - 字符串：`models: './models'` → 扫描 `*.model.{js,ts,mjs,cjs}`，非递归
 * - 对象：`models: { path, pattern?, recursive? }` → 完整控制
 *
 * 每个文件必须导出包含 name 字段的对象（即 Model.define() 的参数）。
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

    // glob 模式转 RegExp（支持 {a,b} 变体和 * 通配符）
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
