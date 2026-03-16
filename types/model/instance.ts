/**
 * Model 实例和静态类相关类型
 * @module types/model/instance
 * @since v1.0.3
 */

import type { ModelDefinition, ValidationResult } from "./definition";
import type { PopulateProxy } from "./relations";

/**
 * Model 注册表条目（Model.get() 的返回值结构）
 * @since 1.1.7
 */
export interface RegisteredModel<T = any> {
  collectionName: string;
  definition: ModelDefinition<T>;
}

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
 * Model 命名空间（静态方法）
 */
export declare namespace Model {
  /**
   * 注册一个 Model 定义
   *
   * @param collectionName - 集合名称
   * @param definition - Model 定义对象
   * @throws {Error} 集合名称无效、schema 未定义、Model 已存在
   */
  function define<T = any>(
    collectionName: string,
    definition: ModelDefinition<T>,
  ): void;

  /**
   * 获取已注册的 Model 条目
   *
   * @param collectionName - 集合名称
   * @returns 注册条目 { collectionName, definition }，如果不存在返回 undefined
   */
  function get<T = any>(collectionName: string): RegisteredModel<T> | undefined;

  /**
   * 检查 Model 是否已注册
   *
   * @param collectionName - 集合名称
   * @returns boolean
   */
  function has(collectionName: string): boolean;

  /**
   * 列出所有已注册的 Model 名称
   *
   * @returns 集合名称数组
   */
  function list(): string[];

  /**
   * 注销已注册的 Model 定义
   *
   * 从全局注册表中移除指定的 Model 定义。
   * 已实例化的 ModelInstance 不受影响，仅影响后续通过 msq.model() 获取的新实例。
   *
   * @param collectionName - 集合名称
   * @returns 如果成功移除返回 true，如果 Model 不存在返回 false
   * @since 1.1.7
   */
  function undefine(collectionName: string): boolean;

  /**
   * 重新定义已注册的 Model（undefine + define 的组合操作）
   *
   * 如果 Model 不存在，行为等同于 define()（首次注册）。
   * 注意：如果新的 definition 校验失败，旧定义将被移除。
   *
   * @param collectionName - 集合名称
   * @param definition - 新的 Model 定义对象
   * @since 1.1.7
   */
  function redefine<T = any>(
    collectionName: string,
    definition: ModelDefinition<T>,
  ): void;
}
