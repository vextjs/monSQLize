/**
 * runtime 核心层内部契约类型。
 *
 * 将 entry/runtime-core.ts 中大块匿名 inline 接口抽离为具名接口，
 * 提升可读性，并为外部工具类（测试辅助、adapter bridge 扩展）提供稳定的类型锚点。
 *
 * 注意：所有导入均使用 `import type` 避免引入运行时循环依赖。
 */

import type { Db, MongoClient, Collection } from 'mongodb';
import type { MemoryCache } from '../../capabilities/cache';
import type { ModelInstance } from '../../capabilities/model';
import type {
    MongoCollectionAccessor as CollectionFacade,
    MongoDbAccessor as DbFacade,
} from '../../adapters/mongodb/common/accessors';

// ─── AdapterBridge ────────────────────────────────────────────────────────────

/**
 * _adapterBridge 的内部接口定义。
 *
 * AdapterBridge 是 MonSQLizeRuntime 向下游 adapter / 能力层暴露 MongoDB
 * 底层句柄与管理操作的桥接对象，不对最终用户直接可见。
 *
 * 主要职责：
 * - 暴露 `db` / `client` / `cache` / `instanceId` 句柄
 * - 代理 admin 类操作（ping / buildInfo / serverStatus 等）
 * - 提供底层 `collection()` 访问器供 v1 兼容层使用
 */
export interface AdapterBridgeLike {
    /** 当前默认 MongoDB Db 实例，未连接时为 null。 */
    readonly db: Db | null;
    /** 当前 MongoClient 实例，未连接时为 null。 */
    readonly client: MongoClient | null;
    /** 当前使用的 MemoryCache 实例，可被外部替换。 */
    cache: MemoryCache | null;
    /** 当前实例 ID（来自 namespace.instanceId 配置），未设置时为 undefined。 */
    readonly instanceId: string | undefined;
    /** 测试 MongoDB 连接可达性。 */
    ping(): Promise<boolean>;
    /** 返回 MongoDB 服务端 buildInfo 信息。 */
    buildInfo(): Promise<Record<string, unknown>>;
    /** 返回 MongoDB 服务端 serverStatus 报告。 */
    serverStatus(options?: { scale?: number }): Promise<Record<string, unknown>>;
    /** 返回 MongoDB 服务端 stats 信息。 */
    stats(options?: { scale?: number }): Promise<Record<string, unknown>>;
    /** 列出所有数据库。 */
    listDatabases(options?: { nameOnly?: boolean }): Promise<unknown[]>;
    /**
     * 删除指定数据库（需要显式确认，生产环境需额外参数）。
     * 安全保障：未传 `confirm: true` 时会抛出 CONFIRMATION_REQUIRED 错误。
     */
    dropDatabase(
        name: string,
        options?: { confirm?: boolean; allowProduction?: boolean; user?: string },
    ): Promise<{ dropped: boolean; database: string; timestamp: Date }>;
    /** 列出当前数据库中的集合。 */
    listCollections(options?: Record<string, unknown>): Promise<unknown>;
    /** 向 MongoDB 发送任意管理命令。 */
    runCommand(
        command: Record<string, unknown>,
        options?: Record<string, unknown>,
    ): Promise<Record<string, unknown>>;
    /**
     * 返回底层原生 MongoDB Collection 句柄（v1 兼容层使用）。
     * @param dbName 数据库名
     * @param collName 集合名
     */
    collection(dbName: string, collName: string): Collection;
}

export interface LegacyAdapterBridgeLike extends AdapterBridgeLike {
    _iidCache: Map<string, string> | null;
}

// ─── Connect result ───────────────────────────────────────────────────────────

/**
 * `use(dbName)` 返回的作用域访问器形状。
 * 通过这个对象可以在指定数据库下获取集合或 model 实例。
 */
export interface ScopedUseResult {
    /** 按名称获取指定集合的访问器。 */
    collection(collectionName: string): CollectionFacade;
    /** 按名称获取指定 model 的类型化实例。 */
    model<TDocument = Record<string, unknown>>(modelName: string): ModelInstance<TDocument>;
}

/**
 * `connect()` 方法解析后的访问器对象形状。
 * `TRuntime` 使用泛型参数，避免与 `MonSQLizeRuntime` 形成循环 import。
 *
 * 典型用法：
 * ```ts
 * const { collection, db, use, instance } = await client.connect();
 * ```
 */
export interface ConnectResult<TRuntime = unknown> {
    /** 获取默认数据库下的集合访问器。 */
    collection(name: string): CollectionFacade;
    /** 获取指定数据库的 DbFacade（不传名称则使用默认库）。 */
    db(name?: string): DbFacade;
    /** 切换到指定数据库，返回作用域化的 collection / model 访问器。 */
    use(name: string): ScopedUseResult;
    /** 当前 MonSQLizeRuntime 实例自身的引用（用于链式调用或事件监听）。 */
    instance: TRuntime;
}

// ─── AutoConvert config ───────────────────────────────────────────────────────

/**
 * ObjectId 自动转换配置的公共属性形状（对应 runtime.autoConvertConfig）。
 *
 * 当 `enabled = true` 时，MonSQLize 会在查询 / 写入时自动把符合条件的
 * 字符串字段转换为 MongoDB ObjectId，提升与 v1 的行为兼容性。
 */
export interface AutoConvertConfigPublic {
    /** 是否启用 ObjectId 自动转换（默认 false）。 */
    enabled: boolean;
    /** 排除不参与自动转换的字段名列表。 */
    excludeFields?: string[];
    /** 自定义字段名匹配模式列表（字符串包含匹配）。 */
    customFieldPatterns?: string[];
    /** 递归扫描嵌套对象时的最大深度（默认 3）。 */
    maxDepth?: number;
    /** 转换日志等级（'debug' | 'info' | 'none'）。 */
    logLevel?: string;
}
