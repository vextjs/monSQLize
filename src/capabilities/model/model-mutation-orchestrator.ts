/**
 * Model 变更操作编排（ModelMutationOrchestrator）。
 *
 * 统一处理写入前后的钩子（beforeSave/afterSave）、时间戳注入、
 * 版本控制（__v）和软删除标记，确保各写操作路径行为一致。
 */
import type { HookContext } from '../../../types/model';
import type { ModelCollectionLike } from './populate-promise';
import {
    applyModelInsertTimestamps,
    applyModelInsertVersion,
    applyModelReplaceTimestamps,
    applyModelUpdateTimestamps,
    applyModelUpsertTimestamps,
    applyModelVersionIncrement,
    type ModelSchemaValidateFn,
    type ModelSoftDeleteConfig,
    type ModelTimestampConfig,
    type ModelV1HooksFactory,
    type ModelVersionConfig,
    runModelV1Hook,
    validateModelSchemaPayload,
} from './model-write-helpers';

type ExtendedModelCollectionLike<TDocument> = ModelCollectionLike<TDocument> & {
    findOneAndReplace: (filter?: unknown, replacement?: unknown, options?: unknown) => Promise<TDocument | null>;
    incrementOne: (
        filter?: unknown,
        field?: string | Record<string, number>,
        increment?: number,
        options?: unknown,
    ) => Promise<unknown>;
    insertBatch: (docs: unknown[], options?: unknown) => Promise<unknown>;
    updateBatch: (filter?: unknown, update?: unknown, options?: unknown) => Promise<unknown>;
};

type HookOperation = 'find' | 'insert' | 'update' | 'delete';
type HookPhase = 'before' | 'after';

export type ModelMutationContext<TDocument = Record<string, unknown>> = {
    collectionName: string;
    collection: ModelCollectionLike<TDocument>;
    extendedCollection(): ExtendedModelCollectionLike<TDocument>;
    applyDefaults(document?: Record<string, unknown>): Record<string, unknown>;
    nowDate(): Date;
    timestampsConfig: ModelTimestampConfig;
    softDeleteConfig: ModelSoftDeleteConfig;
    versionConfig: ModelVersionConfig;
    validateEnabled: boolean;
    schemaCache: unknown;
    schemaValidateFn: ModelSchemaValidateFn;
    hooksFactory: ModelV1HooksFactory;
    runHook(hookName: string, context: HookContext): Promise<void>;
};

async function invokeV1Hook<TDocument>(
    context: ModelMutationContext<TDocument>,
    operation: HookOperation,
    phase: HookPhase,
    hookContext: Record<string, unknown>,
    ...args: unknown[]
): Promise<unknown> {
    return runModelV1Hook(context.hooksFactory, context, operation, phase, hookContext, ...args);
}

async function invokeStandardHook<TDocument>(
    context: ModelMutationContext<TDocument>,
    hookName: string,
    payload: HookContext,
): Promise<void> {
    if (context.hooksFactory) {
        return;
    }
    await context.runHook(hookName, payload);
}

export async function orchestrateModelInsertOne<TDocument = Record<string, unknown>>(
    context: ModelMutationContext<TDocument>,
    document?: unknown,
    options?: unknown,
): Promise<{ acknowledged: boolean; insertedId: unknown }> {
    const hookContext: Record<string, unknown> = {};
    let payload = context.applyDefaults(document as Record<string, unknown> | undefined);

    if (context.hooksFactory) {
        const hookResult = await invokeV1Hook(context, 'insert', 'before', hookContext, payload);
        if (hookResult !== undefined && typeof hookResult === 'object') {
            payload = hookResult as Record<string, unknown>;
        }
    } else {
        await invokeStandardHook(context, 'beforeCreate', { operation: 'insertOne', collection: context.collectionName, data: payload });
    }

    validateModelSchemaPayload({
        validateEnabled: context.validateEnabled,
        schemaCache: context.schemaCache,
        schemaValidateFn: context.schemaValidateFn,
    }, payload, options as Record<string, unknown> | undefined);

    payload = applyModelInsertTimestamps(payload, context.timestampsConfig, () => context.nowDate());
    payload = applyModelInsertVersion(payload, context.versionConfig);

    const result = await context.collection.insertOne(payload, options);

    if (context.hooksFactory) {
        try {
            await invokeV1Hook(context, 'insert', 'after', hookContext, result);
        } catch { /* after hooks don't affect operation */ }
    } else {
        await invokeStandardHook(context, 'afterCreate', {
            operation: 'insertOne',
            collection: context.collectionName,
            data: payload,
            result,
        });
    }

    return result;
}

export async function orchestrateModelInsertMany<TDocument = Record<string, unknown>>(
    context: ModelMutationContext<TDocument>,
    documents?: unknown[],
    options?: unknown,
): Promise<unknown> {
    const resolvedOptions = (options ?? {}) as Record<string, unknown>;
    const docs: Record<string, unknown>[] = [];
    for (let index = 0; index < (documents ?? []).length; index++) {
        let doc = context.applyDefaults((documents ?? [])[index] as Record<string, unknown>);
        validateModelSchemaPayload({
            validateEnabled: context.validateEnabled,
            schemaCache: context.schemaCache,
            schemaValidateFn: context.schemaValidateFn,
        }, doc, resolvedOptions, { index });
        doc = applyModelInsertTimestamps(doc, context.timestampsConfig, () => context.nowDate());
        doc = applyModelInsertVersion(doc, context.versionConfig);
        docs.push(doc);
    }
    return context.collection.insertMany(docs, options);
}

export async function orchestrateModelUpdateOne<TDocument = Record<string, unknown>>(
    context: ModelMutationContext<TDocument>,
    filter?: unknown,
    update?: unknown,
    options?: unknown,
): Promise<unknown> {
    const hookContext: Record<string, unknown> = {};
    let nextUpdate = update;

    if (context.hooksFactory) {
        await invokeV1Hook(context, 'update', 'before', hookContext, filter, nextUpdate);
    } else {
        await invokeStandardHook(context, 'beforeUpdate', {
            operation: 'updateOne',
            collection: context.collectionName,
            filter,
            update: nextUpdate,
        });
    }

    nextUpdate = applyModelVersionIncrement(
        applyModelUpdateTimestamps(nextUpdate, context.timestampsConfig, () => context.nowDate()),
        context.versionConfig,
    );
    const result = await context.collection.updateOne(filter, nextUpdate, options);

    if (context.hooksFactory) {
        try {
            await invokeV1Hook(context, 'update', 'after', hookContext, result);
        } catch { /* after hooks don't affect operation */ }
    } else {
        await invokeStandardHook(context, 'afterUpdate', {
            operation: 'updateOne',
            collection: context.collectionName,
            filter,
            update: nextUpdate,
            result,
        });
    }

    return result;
}

export async function orchestrateModelUpdateMany<TDocument = Record<string, unknown>>(
    context: ModelMutationContext<TDocument>,
    filter?: unknown,
    update?: unknown,
    options?: unknown,
): Promise<unknown> {
    const nextUpdate = applyModelVersionIncrement(
        applyModelUpdateTimestamps(update, context.timestampsConfig, () => context.nowDate()),
        context.versionConfig,
    );
    return context.collection.updateMany(filter, nextUpdate, options);
}

export async function orchestrateModelReplaceOne<TDocument = Record<string, unknown>>(
    context: ModelMutationContext<TDocument>,
    filter?: unknown,
    replacement?: unknown,
    options?: unknown,
): Promise<unknown> {
    const nextReplacement = applyModelReplaceTimestamps(replacement, context.timestampsConfig, () => context.nowDate());
    return context.collection.replaceOne(filter, nextReplacement, options);
}

export async function orchestrateModelFindOneAndUpdate<TDocument = Record<string, unknown>>(
    context: ModelMutationContext<TDocument>,
    filter?: unknown,
    update?: unknown,
    options?: unknown,
): Promise<TDocument | null> {
    const nextUpdate = applyModelUpdateTimestamps(update, context.timestampsConfig, () => context.nowDate());
    return context.collection.findOneAndUpdate(filter, nextUpdate, options);
}

export async function orchestrateModelFindOneAndReplace<TDocument = Record<string, unknown>>(
    context: ModelMutationContext<TDocument>,
    filter?: unknown,
    replacement?: unknown,
    options?: unknown,
): Promise<TDocument | null> {
    const nextReplacement = applyModelReplaceTimestamps(replacement, context.timestampsConfig, () => context.nowDate());
    return context.extendedCollection().findOneAndReplace(filter, nextReplacement, options);
}

export async function orchestrateModelFindOneAndDelete<TDocument = Record<string, unknown>>(
    context: ModelMutationContext<TDocument>,
    filter?: unknown,
    options?: unknown,
): Promise<TDocument | null> {
    return context.collection.findOneAndDelete(filter, options);
}

export async function orchestrateModelUpsertOne<TDocument = Record<string, unknown>>(
    context: ModelMutationContext<TDocument>,
    filter?: unknown,
    update?: unknown,
    options?: unknown,
): Promise<unknown> {
    const nextUpdate = applyModelUpsertTimestamps(update, context.timestampsConfig, () => context.nowDate());
    return context.collection.upsertOne(filter, nextUpdate, options);
}

export async function orchestrateModelIncrementOne<TDocument = Record<string, unknown>>(
    context: ModelMutationContext<TDocument>,
    filter?: unknown,
    field?: string | Record<string, number>,
    increment?: number,
    options?: unknown,
): Promise<unknown> {
    const timestamps = context.timestampsConfig;
    if (timestamps && timestamps.updatedAt !== false) {
        const resolvedOptions = (options ?? {}) as Record<string, unknown>;
        const $set = {
            ...((resolvedOptions.$set ?? {}) as Record<string, unknown>),
            [timestamps.updatedAt]: context.nowDate(),
        };
        return context.extendedCollection().incrementOne(filter, field, increment, { ...resolvedOptions, $set });
    }
    return context.extendedCollection().incrementOne(filter, field, increment, options);
}

export async function orchestrateModelInsertBatch<TDocument = Record<string, unknown>>(
    context: ModelMutationContext<TDocument>,
    docs: unknown[],
    options?: unknown,
): Promise<unknown> {
    const docsToInsert = docs.map((doc) => {
        let record = doc as Record<string, unknown>;
        record = applyModelInsertTimestamps(record, context.timestampsConfig, () => context.nowDate());
        record = applyModelInsertVersion(record, context.versionConfig) as Record<string, unknown>;
        return record;
    });
    return context.extendedCollection().insertBatch(docsToInsert, options);
}

export async function orchestrateModelUpdateBatch<TDocument = Record<string, unknown>>(
    context: ModelMutationContext<TDocument>,
    filter?: unknown,
    update?: unknown,
    options?: unknown,
): Promise<unknown> {
    const nextUpdate = applyModelUpdateTimestamps(update, context.timestampsConfig, () => context.nowDate());
    return context.extendedCollection().updateBatch(filter, nextUpdate, options);
}

export async function orchestrateModelDeleteOne<TDocument = Record<string, unknown>>(
    context: ModelMutationContext<TDocument>,
    filter?: unknown,
    options?: unknown,
): Promise<unknown> {
    const softDeleteConfig = context.softDeleteConfig;
    const resolvedOptions = (options ?? {}) as Record<string, unknown>;
    const hookContext: Record<string, unknown> = {};

    if (context.hooksFactory) {
        await invokeV1Hook(context, 'delete', 'before', hookContext, filter);
    } else {
        await invokeStandardHook(context, 'beforeDelete', {
            operation: 'deleteOne',
            collection: context.collectionName,
            filter,
        });
    }

    let result: unknown;
    if (softDeleteConfig?.enabled && !resolvedOptions._forceDelete) {
        result = await context.collection.updateOne(
            { ...((filter as Record<string, unknown>) ?? {}), [softDeleteConfig.field]: null },
            { $set: { [softDeleteConfig.field]: softDeleteConfig.type === 'boolean' ? true : context.nowDate() } },
            options,
        );
    } else {
        result = await context.collection.deleteOne(filter, options);
    }

    if (context.hooksFactory) {
        try {
            await invokeV1Hook(context, 'delete', 'after', hookContext, result);
        } catch { /* after hooks don't affect operation */ }
    } else {
        await invokeStandardHook(context, 'afterDelete', {
            operation: 'deleteOne',
            collection: context.collectionName,
            filter,
            result,
        });
    }

    return result;
}

export async function orchestrateModelDeleteMany<TDocument = Record<string, unknown>>(
    context: ModelMutationContext<TDocument>,
    filter?: unknown,
    options?: unknown,
): Promise<unknown> {
    const softDeleteConfig = context.softDeleteConfig;
    const resolvedOptions = (options ?? {}) as Record<string, unknown>;
    if (softDeleteConfig?.enabled && !resolvedOptions._forceDelete) {
        return context.collection.updateMany(
            { ...((filter as Record<string, unknown>) ?? {}), [softDeleteConfig.field]: null },
            { $set: { [softDeleteConfig.field]: softDeleteConfig.type === 'boolean' ? true : context.nowDate() } },
            options,
        );
    }
    return context.collection.deleteMany(filter, options);
}
