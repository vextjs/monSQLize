/**
 * model-registry.ts
 *
 * Model 静态注册表（全局单例）。
 *
 * 设计说明：
 * - 所有 Model 定义通过 Model.define() 注册到模块级 Map 中，作用域为整个进程。
 * - 每次 define / redefine / undefine 都会使 revision 自增，
 *   MonSQLize 运行时通过 revision 检测模型变更从而热重载。
 * - _clear() 与 _redefinedNames 仅供测试框架使用，不对外暴露文档。
 * - redefine 语义（v1 兼容）：先删除旧条目再重新注册；若校验失败，旧条目已删除（不回滚）。
 */

import { ErrorCodes, createError } from '../../core/errors';
import type { ModelDefinition, RegisteredModel } from '../../../types/model';
import { validateCollectionName, validateDefinition, processTimestamps } from './definition-validator';
import { _schemaDslFn, _makeValidatingDslFn } from './schema-dsl';

/**
 * Model 静态注册表。
 *
 * 典型用法：
 *   Model.define('users', { schema: (dsl) => dsl({ name: 'string!' }) });
 *   const registered = Model.get('users');
 */
export class Model {
    // 集合名 → 已注册 Model 定义
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private static registry = new Map<string, RegisteredModel<any>>();

    // 集合名 → 版本号（每次 define/redefine/undefine 自增，用于热重载检测）
    private static revisions = new Map<string, number>();

    /** 被 redefine 过的集合名集合（供运行时触发热重载使用）。 */
    static _redefinedNames = new Set<string>();

    /**
     * 注册一个新的 Model 定义。
     * 若同名 Model 已存在，抛出 MODEL_ALREADY_EXISTS 错误。
     * 注册时会同步校验 definition 合法性、解析 timestamps 选项、以及预校验 schema 类型字符串。
     */
    static define<TDocument = Record<string, unknown>>(collectionName: string, definition: ModelDefinition<TDocument>): void {
        const normalizedName = validateCollectionName(collectionName);
        if (this.registry.has(normalizedName)) {
            throw createError(ErrorCodes.MODEL_ALREADY_EXISTS, `Model '${normalizedName}' is already defined.`);
        }
        validateDefinition<TDocument>(definition);
        processTimestamps(definition);

        // 在 define 阶段提前校验 schema 类型字符串（而非等到 validate 时才报错）
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (_schemaDslFn !== null && typeof (definition as any).schema === 'function') {
            const validatingDsl = _makeValidatingDslFn(_schemaDslFn);
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (definition as any).schema(validatingDsl);
            } catch (err) {
                if (err instanceof TypeError && (err as TypeError).message.includes('[schema] Invalid type')) {
                    throw err;
                }
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.registry.set(normalizedName, {
            collectionName: normalizedName,
            definition,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as RegisteredModel<any>);
        this.bumpRevision(normalizedName);
    }

    /**
     * 查询已注册的 Model 定义，不存在时返回 undefined。
     */
    static get<TDocument = Record<string, unknown>>(collectionName: string): RegisteredModel<TDocument> | undefined {
        return this.registry.get(collectionName) as RegisteredModel<TDocument> | undefined;
    }

    /** 检查指定集合名是否已注册。 */
    static has(collectionName: string): boolean {
        return this.registry.has(collectionName);
    }

    /** 返回所有已注册的集合名列表。 */
    static list(): string[] {
        return [...this.registry.keys()];
    }

    /**
     * 取消注册指定集合名的 Model 定义。
     * 返回 true 表示条目存在并已删除，false 表示条目不存在。
     */
    static undefine(collectionName: string): boolean {
        const existed = this.registry.delete(collectionName);
        this.bumpRevision(collectionName);
        return existed;
    }

    /**
     * 重新注册 Model（先删除旧条目再注册）。
     * v1 兼容语义：若校验失败，旧条目不回滚（已删除状态）。
     * 用于热重载场景，通过 _redefinedNames 通知运行时。
     */
    static redefine<TDocument = Record<string, unknown>>(collectionName: string, definition: ModelDefinition<TDocument>): void {
        const normalizedName = validateCollectionName(collectionName);
        // v1 兼容：先删除，再校验（若校验失败，旧条目不存在）
        this.registry.delete(normalizedName);
        validateDefinition<TDocument>(definition);
        processTimestamps(definition);
        this._redefinedNames.add(normalizedName);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.registry.set(normalizedName, {
            collectionName: normalizedName,
            definition,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as RegisteredModel<any>);
        this.bumpRevision(normalizedName);
    }

    /**
     * 清空所有注册表（仅供测试框架使用）。
     * 所有已注册集合名会被标记为 _redefinedNames，revision 自增。
     */
    static _clear(): void {
        const names = [...this.registry.keys()];
        for (const name of names) {
            this._redefinedNames.add(name);
            this.bumpRevision(name);
        }
        this.registry.clear();
    }

    /**
     * 获取指定集合名的当前 revision（版本号）。
     * 每次 define / redefine / undefine 后自增，用于运行时热重载检测。
     */
    static getRevision(collectionName: string): number {
        return this.revisions.get(collectionName) ?? 0;
    }

    private static bumpRevision(collectionName: string): void {
        this.revisions.set(collectionName, (this.revisions.get(collectionName) ?? 0) + 1);
    }
}
