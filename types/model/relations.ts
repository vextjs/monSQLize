/**
 * Model 关系定义相关类型
 * @module types/model/relations
 * @since v1.2.0
 */

/**
 * 关系配置（MongoDB 原生风格）
 * @since v1.2.0
 */
export interface RelationConfig {
    /**
     * 关联的集合名称（MongoDB 原生集合名）
     * @example 'posts'
     */
    from: string;

    /**
     * 本地字段名（用于匹配的字段）
     * @example '_id'
     */
    localField: string;

    /**
     * 外部字段名（关联集合中的字段）
     * @example 'authorId'
     */
    foreignField: string;

    /**
     * 返回类型
     * - true: 返回单个文档或 null（one-to-one）
     * - false: 返回数组（one-to-many）
     * @default false
     */
    single?: boolean;
}

/**
 * Populate 配置
 * @since v1.2.0
 */
export interface PopulateConfig {
    /**
     * 关系路径（relations 中定义的名称）
     * @example 'posts'
     */
    path: string;

    /**
     * 字段选择（空格分隔）
     * @example 'title content createdAt'
     */
    select?: string;

    /**
     * 排序规则
     * @example { createdAt: -1 }
     */
    sort?: Record<string, 1 | -1>;

    /**
     * 限制返回数量
     * @example 10
     */
    limit?: number;

    /**
     * 跳过数量
     * @example 20
     */
    skip?: number;

    /**
     * 额外过滤条件
     * @example { status: 'published' }
     */
    match?: any;

    /**
     * 嵌套 populate（支持多层关联）
     * @example
     * // 字符串形式
     * populate: 'comments'
     *
     * // 对象形式
     * populate: { path: 'comments', select: 'content' }
     *
     * // 数组形式
     * populate: ['comments', 'likes']
     */
    populate?: string | PopulateConfig | (string | PopulateConfig)[];
}

/**
 * PopulateProxy - 支持链式 populate 调用
 * @since v1.2.0
 */
export interface PopulateProxy<T = any> extends Promise<T> {
    /**
     * 添加 populate 路径（链式调用）
     *
     * @param path - 关系路径或配置对象
     * @returns PopulateProxy 实例，支持继续链式调用
     *
     * @example
     * // 字符串形式
     * User.findOne({ _id }).populate('posts')
     *
     * // 对象形式
     * User.findOne({ _id }).populate({ path: 'posts', select: 'title' })
     *
     * // 链式调用
     * User.findOne({ _id })
     *     .populate('profile')
     *     .populate({ path: 'posts', limit: 10 })
     */
    populate(path: string): PopulateProxy<T>;
    populate(config: PopulateConfig): PopulateProxy<T>;
}

