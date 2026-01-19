/**
 * 链式调用 API 类型定义
 * @module types/chain
 * @since v2.0+
 */

import type { ExplainResult } from './stream';

/**
 * Collation 选项（字符串排序规则）
 */
export interface CollationOptions {
    locale: string;                  // 语言代码，如 'zh', 'en'
    strength?: number;               // 比较级别：1=基本, 2=重音, 3=大小写
    caseLevel?: boolean;             // 是否区分大小写
    caseFirst?: 'upper' | 'lower';   // 大小写优先级
    numericOrdering?: boolean;       // 数字排序
    alternate?: 'non-ignorable' | 'shifted'; // 空格和标点处理
    maxVariable?: 'punct' | 'space'; // 最大可变字符
    backwards?: boolean;             // 反向比较
}

/**
 * FindChain - find 查询的链式调用构建器
 *
 * @template T - 文档类型
 *
 * @example
 * // 基础链式调用
 * const results = await collection<Product>('products')
 *   .find({ category: 'electronics' })
 *   .limit(10)
 *   .skip(5)
 *   .sort({ price: -1 });
 */
export interface FindChain<T = any> extends PromiseLike<T[]> {
    /**
     * 限制返回文档数量
     * @param n - 限制数量，必须为非负数
     * @returns 返回自身以支持链式调用
     * @throws {Error} 如果 n 不是非负数
     */
    limit(n: number): FindChain<T>;

    /**
     * 跳过指定数量的文档
     * @param n - 跳过数量，必须为非负数
     * @returns 返回自身以支持链式调用
     * @throws {Error} 如果 n 不是非负数
     */
    skip(n: number): FindChain<T>;

    /**
     * 设置排序规则
     * @param spec - 排序配置，如 { price: -1, name: 1 }
     * @returns 返回自身以支持链式调用
     * @throws {Error} 如果 spec 不是对象或数组
     */
    sort(spec: Record<string, 1 | -1> | Array<[string, 1 | -1]>): FindChain<T>;

    /**
     * 设置字段投影
     * @param spec - 投影配置，如 { name: 1, price: 1 }
     * @returns 返回带有投影类型的新链
     * @throws {Error} 如果 spec 不是对象或数组
     */
    project<K extends keyof T>(spec: Record<K, 1 | 0> | Array<K>): FindChain<Pick<T, K>>;
    project(spec: Record<string, 1 | 0> | string[]): FindChain<Partial<T>>;

    /**
     * 设置索引提示（强制使用指定索引）
     * @param spec - 索引名称或索引规格
     * @returns 返回自身以支持链式调用
     * @throws {Error} 如果 spec 为空
     */
    hint(spec: Record<string, 1 | -1> | string): FindChain<T>;

    /**
     * 设置排序规则（用于字符串排序）
     * @param spec - 排序规则配置
     * @returns 返回自身以支持链式调用
     * @throws {Error} 如果 spec 不是对象
     */
    collation(spec: CollationOptions): FindChain<T>;

    /**
     * 设置查询注释（用于日志追踪）
     * @param str - 注释内容
     * @returns 返回自身以支持链式调用
     * @throws {Error} 如果 str 不是字符串
     */
    comment(str: string): FindChain<T>;

    /**
     * 设置查询超时时间
     * @param ms - 超时时间（毫秒）
     * @returns 返回自身以支持链式调用
     * @throws {Error} 如果 ms 不是非负数
     */
    maxTimeMS(ms: number): FindChain<T>;

    /**
     * 设置批处理大小
     * @param n - 批处理大小
     * @returns 返回自身以支持链式调用
     * @throws {Error} 如果 n 不是非负数
     */
    batchSize(n: number): FindChain<T>;

    /**
     * 返回查询执行计划（不执行查询）
     * @param verbosity - 详细级别
     * @returns 执行计划
     */
    explain(verbosity?: 'queryPlanner' | 'executionStats' | 'allPlansExecution'): Promise<ExplainResult>;

    /**
     * 返回流式结果
     * @returns MongoDB 游标流
     */
    stream(): NodeJS.ReadableStream;

    /**
     * 显式转换为数组（执行查询）
     * @returns 查询结果数组
     * @throws {Error} 如果查询已执行
     */
    toArray(): Promise<T[]>;

    /**
     * Promise.then 接口
     */
    then<TResult1 = T[], TResult2 = never>(
        onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
    ): Promise<TResult1 | TResult2>;

    /**
     * Promise.catch 接口
     */
    catch<TResult = never>(
        onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
    ): Promise<T[] | TResult>;

    /**
     * Promise.finally 接口
     */
    finally(onfinally?: (() => void) | null): Promise<T[]>;
}

/**
 * AggregateChain - aggregate 查询的链式调用构建器
 *
 * @template T - 文档类型
 *
 * @example
 * // 基础聚合
 * const results = await collection<Order>('orders')
 *   .aggregate([
 *     { $match: { status: 'paid' } },
 *     { $group: { _id: '$category', total: { $sum: '$amount' } } }
 *   ])
 *   .allowDiskUse(true);
 */
export interface AggregateChain<T = any> extends PromiseLike<T[]> {
    /**
     * 设置索引提示（强制使用指定索引）
     * @param spec - 索引名称或索引规格
     * @returns 返回自身以支持链式调用
     * @throws {Error} 如果 spec 为空
     */
    hint(spec: Record<string, 1 | -1> | string): AggregateChain<T>;

    /**
     * 设置排序规则（用于字符串排序）
     * @param spec - 排序规则配置
     * @returns 返回自身以支持链式调用
     * @throws {Error} 如果 spec 不是对象
     */
    collation(spec: CollationOptions): AggregateChain<T>;

    /**
     * 设置查询注释（用于日志追踪）
     * @param str - 注释内容
     * @returns 返回自身以支持链式调用
     * @throws {Error} 如果 str 不是字符串
     */
    comment(str: string): AggregateChain<T>;

    /**
     * 设置查询超时时间
     * @param ms - 超时时间（毫秒）
     * @returns 返回自身以支持链式调用
     * @throws {Error} 如果 ms 不是非负数
     */
    maxTimeMS(ms: number): AggregateChain<T>;

    /**
     * 允许使用磁盘进行大数据量排序/分组
     * @param bool - 是否允许
     * @returns 返回自身以支持链式调用
     * @throws {Error} 如果 bool 不是布尔值
     */
    allowDiskUse(bool: boolean): AggregateChain<T>;

    /**
     * 设置批处理大小
     * @param n - 批处理大小
     * @returns 返回自身以支持链式调用
     * @throws {Error} 如果 n 不是非负数
     */
    batchSize(n: number): AggregateChain<T>;

    /**
     * 返回聚合执行计划（不执行聚合）
     * @param verbosity - 详细级别
     * @returns 执行计划
     */
    explain(verbosity?: 'queryPlanner' | 'executionStats' | 'allPlansExecution'): Promise<ExplainResult>;

    /**
     * 返回流式结果
     * @returns MongoDB 游标流
     */
    stream(): NodeJS.ReadableStream;

    /**
     * 显式转换为数组（执行聚合）
     * @returns 聚合结果数组
     * @throws {Error} 如果查询已执行
     */
    toArray(): Promise<T[]>;

    /**
     * Promise.then 接口
     */
    then<TResult1 = T[], TResult2 = never>(
        onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
    ): Promise<TResult1 | TResult2>;

    /**
     * Promise.catch 接口
     */
    catch<TResult = never>(
        onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
    ): Promise<T[] | TResult>;

    /**
     * Promise.finally 接口
     */
    finally(onfinally?: (() => void) | null): Promise<T[]>;
}

