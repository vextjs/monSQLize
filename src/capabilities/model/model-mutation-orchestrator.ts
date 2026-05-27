/**
 * Model mutation orchestration (ModelMutationOrchestrator).
 *
 * Centralizes pre/post-write hooks (beforeSave/afterSave), timestamp injection,
 * version control (__v), and soft-delete marking to ensure consistent behavior
 * across all write operation paths.
 */
import type { HookContext } from '../../../types/model';
import type { ExtendedModelCollectionLike, ModelCollectionLike } from './populate-promise';
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

async function invokeStandardOperationHook<TDocument>(
    context: ModelMutationContext<TDocument>,
    operation: HookOperation,
    phase: HookPhase,
    payload: HookContext,
): Promise<void> {
    if (context.hooksFactory) {
        return;
    }
    const canonical = operation === 'insert'
        ? phase === 'before' ? 'beforeCreate' : 'afterCreate'
        : `${phase}${operation[0].toUpperCase()}${operation.slice(1)}`;
    const alias = `${phase}${operation[0].toUpperCase()}${operation.slice(1)}`;
    await invokeStandardHook(context, canonical, payload);
    if (alias !== canonical) {
        await invokeStandardHook(context, alias, payload);
    }
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
        await invokeStandardOperationHook(context, 'insert', 'before', { operation: 'insertOne', collection: context.collectionName, data: payload });
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
        await invokeStandardOperationHook(context, 'insert', 'after', {
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
    const hookContext: Record<string, unknown> = {};
    if (context.hooksFactory) {
        await invokeV1Hook(context, 'insert', 'before', hookContext, documents);
    } else {
        await invokeStandardOperationHook(context, 'insert', 'before', { operation: 'insertMany', collection: context.collectionName, data: documents });
    }
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
    const result = await context.collection.insertMany(docs, options);
    if (context.hooksFactory) {
        try { await invokeV1Hook(context, 'insert', 'after', hookContext, result); } catch { /* after hooks don't affect operation */ }
    } else {
        await invokeStandardOperationHook(context, 'insert', 'after', { operation: 'insertMany', collection: context.collectionName, data: docs, result });
    }
    return result;
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
        await invokeStandardOperationHook(context, 'update', 'before', {
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
        await invokeStandardOperationHook(context, 'update', 'after', {
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
    const hookContext: Record<string, unknown> = {};
    let nextUpdate = update;
    if (context.hooksFactory) {
        await invokeV1Hook(context, 'update', 'before', hookContext, filter, nextUpdate);
    } else {
        await invokeStandardOperationHook(context, 'update', 'before', { operation: 'updateMany', collection: context.collectionName, filter, update: nextUpdate });
    }
    nextUpdate = applyModelVersionIncrement(
        applyModelUpdateTimestamps(update, context.timestampsConfig, () => context.nowDate()),
        context.versionConfig,
    );
    const result = await context.collection.updateMany(filter, nextUpdate, options);
    if (context.hooksFactory) {
        try { await invokeV1Hook(context, 'update', 'after', hookContext, result); } catch { /* after hooks don't affect operation */ }
    } else {
        await invokeStandardOperationHook(context, 'update', 'after', { operation: 'updateMany', collection: context.collectionName, filter, update: nextUpdate, result });
    }
    return result;
}

export async function orchestrateModelReplaceOne<TDocument = Record<string, unknown>>(
    context: ModelMutationContext<TDocument>,
    filter?: unknown,
    replacement?: unknown,
    options?: unknown,
): Promise<unknown> {
    const hookContext: Record<string, unknown> = {};
    if (context.hooksFactory) {
        await invokeV1Hook(context, 'update', 'before', hookContext, filter, replacement);
    } else {
        await invokeStandardOperationHook(context, 'update', 'before', { operation: 'replaceOne', collection: context.collectionName, filter, update: replacement });
    }
    const nextReplacement = applyModelReplaceTimestamps(replacement, context.timestampsConfig, () => context.nowDate());
    const result = await context.collection.replaceOne(filter, nextReplacement, options);
    if (context.hooksFactory) {
        try { await invokeV1Hook(context, 'update', 'after', hookContext, result); } catch { /* after hooks don't affect operation */ }
    } else {
        await invokeStandardOperationHook(context, 'update', 'after', { operation: 'replaceOne', collection: context.collectionName, filter, update: nextReplacement, result });
    }
    return result;
}

export async function orchestrateModelFindOneAndUpdate<TDocument = Record<string, unknown>>(
    context: ModelMutationContext<TDocument>,
    filter?: unknown,
    update?: unknown,
    options?: unknown,
): Promise<TDocument | null> {
    const hookContext: Record<string, unknown> = {};
    if (context.hooksFactory) {
        await invokeV1Hook(context, 'update', 'before', hookContext, filter, update);
    } else {
        await invokeStandardOperationHook(context, 'update', 'before', { operation: 'findOneAndUpdate', collection: context.collectionName, filter, update });
    }
    const nextUpdate = applyModelUpdateTimestamps(update, context.timestampsConfig, () => context.nowDate());
    const result = await context.collection.findOneAndUpdate(filter, nextUpdate, options);
    if (context.hooksFactory) {
        try { await invokeV1Hook(context, 'update', 'after', hookContext, result); } catch { /* after hooks don't affect operation */ }
    } else {
        await invokeStandardOperationHook(context, 'update', 'after', { operation: 'findOneAndUpdate', collection: context.collectionName, filter, update: nextUpdate, result });
    }
    return result;
}

export async function orchestrateModelFindOneAndReplace<TDocument = Record<string, unknown>>(
    context: ModelMutationContext<TDocument>,
    filter?: unknown,
    replacement?: unknown,
    options?: unknown,
): Promise<TDocument | null> {
    const hookContext: Record<string, unknown> = {};
    if (context.hooksFactory) {
        await invokeV1Hook(context, 'update', 'before', hookContext, filter, replacement);
    } else {
        await invokeStandardOperationHook(context, 'update', 'before', { operation: 'findOneAndReplace', collection: context.collectionName, filter, update: replacement });
    }
    const nextReplacement = applyModelReplaceTimestamps(replacement, context.timestampsConfig, () => context.nowDate());
    const result = await context.extendedCollection().findOneAndReplace(filter, nextReplacement, options);
    if (context.hooksFactory) {
        try { await invokeV1Hook(context, 'update', 'after', hookContext, result); } catch { /* after hooks don't affect operation */ }
    } else {
        await invokeStandardOperationHook(context, 'update', 'after', { operation: 'findOneAndReplace', collection: context.collectionName, filter, update: nextReplacement, result });
    }
    return result;
}

export async function orchestrateModelFindOneAndDelete<TDocument = Record<string, unknown>>(
    context: ModelMutationContext<TDocument>,
    filter?: unknown,
    options?: unknown,
): Promise<TDocument | null> {
    const hookContext: Record<string, unknown> = {};
    if (context.hooksFactory) {
        await invokeV1Hook(context, 'delete', 'before', hookContext, filter);
    } else {
        await invokeStandardOperationHook(context, 'delete', 'before', { operation: 'findOneAndDelete', collection: context.collectionName, filter });
    }
    const result = await context.collection.findOneAndDelete(filter, options);
    if (context.hooksFactory) {
        try { await invokeV1Hook(context, 'delete', 'after', hookContext, result); } catch { /* after hooks don't affect operation */ }
    } else {
        await invokeStandardOperationHook(context, 'delete', 'after', { operation: 'findOneAndDelete', collection: context.collectionName, filter, result });
    }
    return result;
}

export async function orchestrateModelUpsertOne<TDocument = Record<string, unknown>>(
    context: ModelMutationContext<TDocument>,
    filter?: unknown,
    update?: unknown,
    options?: unknown,
): Promise<unknown> {
    const hookContext: Record<string, unknown> = {};
    if (context.hooksFactory) {
        await invokeV1Hook(context, 'update', 'before', hookContext, filter, update);
    } else {
        await invokeStandardOperationHook(context, 'update', 'before', { operation: 'upsertOne', collection: context.collectionName, filter, update });
    }
    const nextUpdate = applyModelUpsertTimestamps(update, context.timestampsConfig, () => context.nowDate());
    const result = await context.collection.upsertOne(filter, nextUpdate, options);
    if (context.hooksFactory) {
        try { await invokeV1Hook(context, 'update', 'after', hookContext, result); } catch { /* after hooks don't affect operation */ }
    } else {
        await invokeStandardOperationHook(context, 'update', 'after', { operation: 'upsertOne', collection: context.collectionName, filter, update: nextUpdate, result });
    }
    return result;
}

export async function orchestrateModelIncrementOne<TDocument = Record<string, unknown>>(
    context: ModelMutationContext<TDocument>,
    filter?: unknown,
    field?: string | Record<string, number>,
    increment?: number,
    options?: unknown,
): Promise<unknown> {
    const hookContext: Record<string, unknown> = {};
    if (context.hooksFactory) {
        await invokeV1Hook(context, 'update', 'before', hookContext, filter, field, increment);
    } else {
        await invokeStandardOperationHook(context, 'update', 'before', { operation: 'incrementOne', collection: context.collectionName, filter, update: field });
    }
    const timestamps = context.timestampsConfig;
    let result: unknown;
    if (timestamps && timestamps.updatedAt !== false) {
        const resolvedOptions = (options ?? {}) as Record<string, unknown>;
        const $set = {
            ...((resolvedOptions.$set ?? {}) as Record<string, unknown>),
            [timestamps.updatedAt]: context.nowDate(),
        };
        result = await context.extendedCollection().incrementOne(filter, field, increment, { ...resolvedOptions, $set });
    } else {
        result = await context.extendedCollection().incrementOne(filter, field, increment, options);
    }
    if (context.hooksFactory) {
        try { await invokeV1Hook(context, 'update', 'after', hookContext, result); } catch { /* after hooks don't affect operation */ }
    } else {
        await invokeStandardOperationHook(context, 'update', 'after', { operation: 'incrementOne', collection: context.collectionName, filter, update: field, result });
    }
    return result;
}

export async function orchestrateModelInsertBatch<TDocument = Record<string, unknown>>(
    context: ModelMutationContext<TDocument>,
    docs: unknown[],
    options?: unknown,
): Promise<unknown> {
    const hookContext: Record<string, unknown> = {};
    if (context.hooksFactory) {
        await invokeV1Hook(context, 'insert', 'before', hookContext, docs);
    } else {
        await invokeStandardOperationHook(context, 'insert', 'before', { operation: 'insertBatch', collection: context.collectionName, data: docs });
    }
    const docsToInsert = docs.map((doc) => {
        let record = doc as Record<string, unknown>;
        record = applyModelInsertTimestamps(record, context.timestampsConfig, () => context.nowDate());
        record = applyModelInsertVersion(record, context.versionConfig) as Record<string, unknown>;
        return record;
    });
    const result = await context.extendedCollection().insertBatch(docsToInsert, options);
    if (context.hooksFactory) {
        try { await invokeV1Hook(context, 'insert', 'after', hookContext, result); } catch { /* after hooks don't affect operation */ }
    } else {
        await invokeStandardOperationHook(context, 'insert', 'after', { operation: 'insertBatch', collection: context.collectionName, data: docsToInsert, result });
    }
    return result;
}

export async function orchestrateModelUpdateBatch<TDocument = Record<string, unknown>>(
    context: ModelMutationContext<TDocument>,
    filter?: unknown,
    update?: unknown,
    options?: unknown,
): Promise<unknown> {
    const hookContext: Record<string, unknown> = {};
    if (context.hooksFactory) {
        await invokeV1Hook(context, 'update', 'before', hookContext, filter, update);
    } else {
        await invokeStandardOperationHook(context, 'update', 'before', { operation: 'updateBatch', collection: context.collectionName, filter, update });
    }
    const nextUpdate = applyModelUpdateTimestamps(update, context.timestampsConfig, () => context.nowDate());
    const result = await context.extendedCollection().updateBatch(filter, nextUpdate, options);
    if (context.hooksFactory) {
        try { await invokeV1Hook(context, 'update', 'after', hookContext, result); } catch { /* after hooks don't affect operation */ }
    } else {
        await invokeStandardOperationHook(context, 'update', 'after', { operation: 'updateBatch', collection: context.collectionName, filter, update: nextUpdate, result });
    }
    return result;
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
        await invokeStandardOperationHook(context, 'delete', 'before', {
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
        await invokeStandardOperationHook(context, 'delete', 'after', {
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
    const hookContext: Record<string, unknown> = {};
    if (context.hooksFactory) {
        await invokeV1Hook(context, 'delete', 'before', hookContext, filter);
    } else {
        await invokeStandardOperationHook(context, 'delete', 'before', { operation: 'deleteMany', collection: context.collectionName, filter });
    }
    let result: unknown;
    if (softDeleteConfig?.enabled && !resolvedOptions._forceDelete) {
        result = await context.collection.updateMany(
            { ...((filter as Record<string, unknown>) ?? {}), [softDeleteConfig.field]: null },
            { $set: { [softDeleteConfig.field]: softDeleteConfig.type === 'boolean' ? true : context.nowDate() } },
            options,
        );
    } else {
        result = await context.collection.deleteMany(filter, options);
    }
    if (context.hooksFactory) {
        try { await invokeV1Hook(context, 'delete', 'after', hookContext, result); } catch { /* after hooks don't affect operation */ }
    } else {
        await invokeStandardOperationHook(context, 'delete', 'after', { operation: 'deleteMany', collection: context.collectionName, filter, result });
    }
    return result;
}
