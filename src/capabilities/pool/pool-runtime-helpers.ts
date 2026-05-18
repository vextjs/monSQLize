/**
 * ConnectionPoolManager 的运行时辅助函数集合。
 *
 * 提供连接池配置校验（严格模式与宽松模式）、空统计对象工厂、
 * 默认 MongoClient 工厂以及默认健康检查函数，
 * 减少 pool 核心文件对初始化细节的关注。
 */

import { MongoClient as MongoDriverClient } from 'mongodb';
import type { MongoClient } from 'mongodb';
import type { PoolConfig, PoolStats } from '../../../types/pool';

/**
 * 严格校验连接池配置，任意字段不合法时立即抛出错误。
 * 适用于初始化路径，确保配置完全合法后再继续。
 */
export function validatePoolConfig(config: Record<string, unknown>): void {
    if (!config || typeof config !== 'object') throw new Error('Pool config must be an object');
    if (!config.name || typeof config.name !== 'string') throw new Error('Pool config.name is required and must be a string');
    if (!config.uri || typeof config.uri !== 'string') throw new Error('Pool config.uri is required and must be a string');
    if (!(config.uri as string).startsWith('mongodb://') && !(config.uri as string).startsWith('mongodb+srv://')) {
        throw new Error('Pool config.uri must start with mongodb:// or mongodb+srv://');
    }
    if (config.role) {
        const validRoles = ['primary', 'secondary', 'analytics', 'custom'];
        if (!validRoles.includes(config.role as string)) throw new Error(`Pool config.role must be one of: ${validRoles.join(', ')}`);
    }
    if (config.weight !== undefined) {
        if (typeof config.weight !== 'number') throw new Error('Pool config.weight must be a number');
        if ((config.weight as number) < 0) throw new Error('Pool config.weight must be a non-negative number');
    }
    if (config.options !== undefined) {
        if (typeof config.options !== 'object' || Array.isArray(config.options)) throw new Error('Pool config.options must be an object');
        const opts = config.options as Record<string, unknown>;
        for (const key of ['maxPoolSize', 'minPoolSize', 'maxIdleTimeMS', 'waitQueueTimeoutMS', 'connectTimeoutMS', 'serverSelectionTimeoutMS']) {
            if (opts[key] !== undefined && (typeof opts[key] !== 'number' || (opts[key] as number) < 0)) {
                throw new Error(`Pool config.options.${key} must be a non-negative number`);
            }
        }
    }
    if (config.healthCheck !== undefined) {
        if (typeof config.healthCheck !== 'object' || Array.isArray(config.healthCheck)) throw new Error('Pool config.healthCheck must be an object');
        const hc = config.healthCheck as Record<string, unknown>;
        if (hc.enabled !== undefined && typeof hc.enabled !== 'boolean') throw new Error('Pool config.healthCheck.enabled must be a boolean');
        for (const key of ['interval', 'timeout', 'retries']) {
            if (hc[key] !== undefined && (typeof hc[key] !== 'number' || (hc[key] as number) < 0)) {
                throw new Error(`Pool config.healthCheck.${key} must be a non-negative number`);
            }
        }
    }
    if (config.tags !== undefined) {
        if (!Array.isArray(config.tags)) throw new Error('Pool config.tags must be an array');
        for (const tag of config.tags as unknown[]) {
            if (typeof tag !== 'string') throw new Error('Pool config.tags must be an array of strings');
        }
    }
}

/**
 * 宽松校验连接池配置，收集所有错误并以字符串数组返回，不抛出异常。
 * 适用于需要批量报错的场景（如 CLI 工具、配置预检查）。
 */
export function validatePoolConfigSafe(config: Record<string, unknown>): string[] {
    const errors: string[] = [];
    if (!config || typeof config !== 'object') { errors.push('Pool config must be an object'); return errors; }
    if (!config.name || typeof config.name !== 'string') errors.push('Pool config.name is required and must be a string');
    if (!config.uri || typeof config.uri !== 'string') {
        errors.push('Pool config.uri is required and must be a string');
    } else if (!(config.uri as string).startsWith('mongodb://') && !(config.uri as string).startsWith('mongodb+srv://')) {
        errors.push('Pool config.uri must start with mongodb:// or mongodb+srv://');
    }
    if (config.role) {
        const validRoles = ['primary', 'secondary', 'analytics', 'custom'];
        if (!validRoles.includes(config.role as string)) errors.push(`Pool config.role must be one of: ${validRoles.join(', ')}`);
    }
    if (config.weight !== undefined && (typeof config.weight !== 'number' || (config.weight as number) < 0)) {
        errors.push('Pool config.weight must be a non-negative number');
    }
    if (config.options && typeof config.options !== 'object') errors.push('Pool config.options must be an object');
    if (config.options && typeof config.options === 'object') {
        const opts = config.options as Record<string, unknown>;
        if (opts.maxPoolSize !== undefined && (typeof opts.maxPoolSize !== 'number' || (opts.maxPoolSize as number) < 0)) {
            errors.push('Pool config.options.maxPoolSize must be a non-negative number');
        }
    }
    if (config.healthCheck) {
        if (typeof config.healthCheck !== 'object') {
            errors.push('Pool config.healthCheck must be an object');
        } else {
            const hc = config.healthCheck as Record<string, unknown>;
            if (hc.enabled !== undefined && typeof hc.enabled !== 'boolean') errors.push('Pool config.healthCheck.enabled must be a boolean');
            for (const key of ['interval', 'timeout', 'retries']) {
                if (hc[key] !== undefined && (typeof hc[key] !== 'number' || (hc[key] as number) < 0)) {
                    errors.push(`Pool config.healthCheck.${key} must be a non-negative number`);
                }
            }
        }
    }
    if (config.tags) {
        if (!Array.isArray(config.tags)) {
            errors.push('Pool config.tags must be an array');
        } else {
            for (const tag of config.tags as unknown[]) {
                if (typeof tag !== 'string') {
                    errors.push('Pool config.tags must be an array of strings');
                    break;
                }
            }
        }
    }
    return errors;
}

/**
 * 校验 `PoolConfig` 类型对象的必填字段（name / uri），不合法时抛出错误。
 */
export function validatePoolConfigInternal(config: PoolConfig): void {
    if (!config.name?.trim()) {
        throw new Error('Pool config requires a non-empty name');
    }
    if (!config.uri?.trim()) {
        throw new Error('Pool config requires a non-empty uri');
    }
}

/**
 * 创建指定连接池的空统计对象，所有计数器初始化为 0。
 */
export function createEmptyPoolStats(name: string): PoolStats {
    return {
        name,
        totalRequests: 0,
        successCount: 0,
        errorCount: 0,
        avgResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0,
        errorRate: 0,
        lastRequestTime: null,
    };
}

/**
 * 默认 MongoClient 工厂函数：按 `PoolConfig` 创建并连接新的 MongoClient 实例。
 * 可通过 `ConnectionPoolManager` 构造选项覆盖为自定义实现。
 */
export async function defaultClientFactory(config: PoolConfig): Promise<MongoClient> {
    const client = new MongoDriverClient(config.uri, config.options);
    await client.connect();
    return client;
}

/**
 * 默认连接池健康检查函数：向 admin 数据库发送 ping 命令。
 * 成功返回 true，抛出异常则由调用方决定如何处理（重试/标记不健康等）。
 */
export async function defaultHealthCheckFn(_poolName: string, client: MongoClient): Promise<boolean> {
    await client.db('admin').command({ ping: 1 });
    return true;
}
