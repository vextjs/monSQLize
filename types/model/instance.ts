/**
 * Model 实例和静态类相关类型
 * @module types/model/instance
 * @since v1.0.3
 */

import type { ModelDefinition, ValidationResult } from './definition';
import type { RelationConfig, PopulateProxy } from './relations';
import type { VirtualConfig } from './virtuals';

/**
 * Model 实例接口
 * 文档实例的扩展方法
 */
export interface ModelInstance<T = any> {
    /**
     * 保存文档（插入或更新）
     */
    save(): Promise<T>;

    /**
     * 删除文档
     */
    remove(): Promise<boolean>;

    /**
     * 验证文档
     */
    validate(): Promise<ValidationResult>;

    /**
     * 关联查询（populate）
     */
    populate(path: string): PopulateProxy<T>;
    populate(config: any): PopulateProxy<T>;

    /**
     * 转换为普通对象
     */
    toObject(): T;

    /**
     * 转换为 JSON
     */
    toJSON(): any;
}

/**
 * Model 类（静态方法）
 */
export class Model {
    /**
     * 注册一个 Model 定义
     *
     * @param collectionName - 集合名称
     * @param definition - Model 定义对象
     * @throws {Error} 集合名称无效、schema 未定义、Model 已存在
     */
    static define<T = any>(collectionName: string, definition: ModelDefinition<T>): void;

    /**
     * 获取已注册的 Model 定义
     *
     * @param collectionName - 集合名称
     * @returns Model 定义对象，如果不存在返回 undefined
     */
    static get<T = any>(collectionName: string): ModelDefinition<T> | undefined;

    /**
     * 检查 Model 是否已注册
     *
     * @param collectionName - 集合名称
     * @returns boolean
     */
    static has(collectionName: string): boolean;

    /**
     * 列出所有已注册的 Model 名称
     *
     * @returns 集合名称数组
     */
    static list(): string[];

    /**
     * 删除已注册的 Model
     *
     * @param collectionName - 集合名称
     * @returns 是否删除成功
     */
    static remove(collectionName: string): boolean;

    /**
     * 清空所有已注册的 Model
     */
    static clear(): void;
}

