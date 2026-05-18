/**
 * runtime Model 实例管理工具集。
 *
 * 封装 Model 注册表查询、Model 实例缓存命中/失效检测与 ModelInstance 构建逻辑，
 * 使 runtime-core 专注于连接生命周期，不直接处理 Model 内部状态的组装细节。
 *
 * 缓存 Key 格式：`<pool>:<database>:<collectionName>`，使用 Model.getRevision()
 * 检测 Model 定义变更，变更时自动使旧实例失效。
 */

import { Model, ModelInstance } from '../capabilities/model';
import { ErrorCodes, createError } from '../core/errors';
import type { MonSQLizeOptions } from '../../types/monsqlize';
import type { ModelInstanceCacheEntry } from '../types/internal/model';
import type { ModelCollectionLike, ModelRuntimeLike } from '../capabilities/model/populate-promise';
import { resolveDatabaseName } from './runtime-db-facade';

/**
 * `createRuntimeModelHost` 的输入配置参数，
 * 使宿主与 Model 工厂之间保持解耦。
 */
export type RuntimeModelHost = {
    options: MonSQLizeOptions;
    _modelInstances: Map<string, ModelInstanceCacheEntry>;
    runtime: ModelRuntimeLike;
    scopedCollection<TDocument = Record<string, unknown>>(
        name: string,
        options?: { database?: string; pool?: string },
    ): ModelCollectionLike<TDocument>;
};

/**
 * 将松散的配置参数组装为标准的 `RuntimeModelHost` 对象。
 * 主要作用是统一泛型类型和字段名映射，简化调用处代码。
 */
export function createRuntimeModelHost(config: {
    options: MonSQLizeOptions;
    modelInstances: Map<string, ModelInstanceCacheEntry>;
    runtime: unknown;
    scopedCollection: <TDocument = Record<string, unknown>>(
        name: string,
        options?: { database?: string; pool?: string },
    ) => unknown;
}): RuntimeModelHost {
    return {
        options: config.options,
        _modelInstances: config.modelInstances,
        runtime: config.runtime as ModelRuntimeLike,
        scopedCollection: <TDocument = Record<string, unknown>>(name: string, options?: { database?: string; pool?: string }) =>
            config.scopedCollection(name, options) as ModelCollectionLike<TDocument>,
    };
}

/**
 * 获取或创建指定名称的 `ModelInstance`。
 *
 * 命中缓存且版本号未变更时直接返回已有实例；
 * 版本号变更（Model 定义被更新）时丢弃旧实例并重新构建。
 *
 * @param host - runtime 宿主，提供 options / _modelInstances / scopedCollection / runtime
 * @param name - 已注册的 Model 名称
 * @param scope - 可选的数据库名与连接池名限定
 * @throws `MODEL_NOT_DEFINED` — 若指定名称的 Model 尚未注册
 */
export function createRuntimeModelInstance<TDocument = Record<string, unknown>>(
    host: RuntimeModelHost,
    name: string,
    scope: { database?: string; pool?: string },
): ModelInstance<TDocument> {
    const registered = Model.get<TDocument>(name);
    if (!registered) {
        throw createError(ErrorCodes.MODEL_NOT_DEFINED, `Model '${name}' is not defined.`);
    }

    const databaseName = registered.definition.connection?.database ?? scope.database ?? resolveDatabaseName(host.options);
    const poolName = registered.definition.connection?.pool ?? scope.pool;
    const cacheKey = `${poolName ?? 'default'}:${databaseName}:${registered.collectionName}`;
    const revision = Model.getRevision(registered.collectionName);
    const cached = host._modelInstances.get(cacheKey);
    if (cached && cached.revision === revision) {
        return cached.instance as ModelInstance<TDocument>;
    }

    const instance = new ModelInstance<TDocument>(
        host.scopedCollection(registered.collectionName, { database: databaseName }),
        host.runtime,
        {
            collectionName: registered.collectionName,
            dbName: databaseName,
            poolName,
            definition: registered.definition,
        },
    );
    host._modelInstances.set(cacheKey, {
        revision,
        instance: instance as ModelInstance<Record<string, unknown>>,
    });
    return instance;
}
