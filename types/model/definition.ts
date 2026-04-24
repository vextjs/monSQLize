/**
 * Model 定义相关类型
 * @module types/model/definition
 * @since v1.0.3
 */

/**
 * Schema DSL 函数类型
 */
export type SchemaDSL = (dsl: any) => any;

/**
 * 默认值类型
 * @since v1.0.6
 */
export type DefaultValue<T = any> = T | ((context?: any, doc?: any) => T);

/**
 * 钩子上下文
 */
export interface HookContext {
    operation: string;
    collection: string;
    data?: any;
    filter?: any;
    update?: any;
    result?: any;
    error?: Error;
    [key: string]: any;
}

/**
 * 验证结果
 */
export interface ValidationResult {
    valid: boolean;
    errors?: Array<{
        field: string;
        message: string;
        value?: any;
    }>;
}

/**
 * Model 定义配置
 */
export interface ModelDefinition<T = any> {
    /**
     * 枚举配置（可被 schema 引用）
     * @example
     * enums: {
     *   role: 'admin|user|guest',
     *   status: 'active|inactive'
     * }
     */
    enums?: Record<string, string>;

    /**
     * Schema 定义（数据验证规则）
     * 使用 function 时，this 自动绑定到 definition，可访问 this.enums
     */
    schema?: SchemaDSL | Record<string, any>;

    /**
     * 默认值配置
     * @example
     * defaults: {
     *   status: 'active',
     *   createdAt: () => new Date()
     * }
     */
    defaults?: Record<string, DefaultValue>;

    /**
     * 钩子函数配置
     */
    hooks?: {
        beforeCreate?: (context: HookContext) => Promise<void> | void;
        afterCreate?: (context: HookContext) => Promise<void> | void;
        beforeUpdate?: (context: HookContext) => Promise<void> | void;
        afterUpdate?: (context: HookContext) => Promise<void> | void;
        beforeDelete?: (context: HookContext) => Promise<void> | void;
        afterDelete?: (context: HookContext) => Promise<void> | void;
        beforeFind?: (context: HookContext) => Promise<void> | void;
        afterFind?: (context: HookContext) => Promise<void> | void;
    };

    /**
     * 方法配置（实例方法）
     * @example
     * methods: {
     *   fullName: function() {
     *     return `${this.firstName} ${this.lastName}`;
     *   }
     * }
     */
    methods?: Record<string, (this: any, ...args: any[]) => any>;

    /**
     * 静态方法配置（Model 静态方法）
     * @example
     * statics: {
     *   findByRole: async function(role) {
     *     return this.find({ role });
     *   }
     * }
     */
    statics?: Record<string, (...args: any[]) => any>;

    /**
     * 数据源绑定配置（v1.2.2+）
     *
     * 声明此 Model 使用哪个连接池和/或数据库。
     * 不配置时行为与 v1.2.1 完全相同（向后兼容）。
     *
     * @example
     * // 绑定到指定连接池 + 数据库
     * connection: { pool: 'analytics', database: 'reports_db' }
     *
     * @example
     * // 只切换数据库（使用默认连接池）
     * connection: { database: 'logs_db' }
     *
     * @since v1.2.2
     */
    connection?: ModelConnection;
}

/**
 * Model 数据源绑定配置
 *
 * 声明 Model 使用哪个连接池（pool）和/或数据库（database）。
 * 两个字段均为可选：
 *   - 只指定 pool   → 使用该池 + 实例初始化时的 databaseName
 *   - 只指定 database → 使用默认连接池 + 指定数据库
 *   - 两者都指定    → 使用指定池 + 指定数据库
 *   - 均不指定      → 与原来完全相同（向后兼容）
 *
 * @since v1.2.2
 */
export interface ModelConnection {
    /**
     * 连接池名称，须与 MonSQLize 构造函数 `pools[].name` 对应
     */
    pool?: string;

    /**
     * 数据库名称，不指定时使用实例初始化时的 `databaseName`
     */
    database?: string;
}

