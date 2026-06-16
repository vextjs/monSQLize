/**
 * Model write operation helpers.
 *
 * Encapsulates pre/post-processing logic related to model semantics for
 * insertOne, updateOne, replaceOne, deleteOne, and other write paths.
 */
import { ErrorCodes, createError } from '../../core/errors';

export type ModelTimestampConfig = {
    createdAt: string | false;
    updatedAt: string | false;
} | null;

export type ModelSoftDeleteConfig = {
    enabled: boolean;
    field: string;
    type: string;
    ttl: number | null;
} | null;

export type ModelVersionConfig = {
    enabled: boolean;
    field: string;
} | null;

export type ModelHookOperation = 'find' | 'insert' | 'update' | 'delete';
export type ModelHookPhase = 'before' | 'after';

type ModelV1HookHandler = (...args: unknown[]) => unknown;

export type ModelV1HooksFactory = ((
    model: unknown,
) => Record<ModelHookOperation, { before?: ModelV1HookHandler; after?: ModelV1HookHandler } | undefined>) | null;

type ModelSchemaValidationResult = {
    valid: boolean;
    errors?: Array<{ path?: string; field?: string; message?: string }>;
};

export type ModelSchemaValidateFn = ((schema: unknown, document: unknown) => ModelSchemaValidationResult) | null;

type ModelSchemaValidationContext = {
    validateEnabled: boolean;
    schemaCache: unknown;
    schemaValidateFn: ModelSchemaValidateFn;
};

function withModelErrorMetadata<TError extends Error>(
    error: TError,
    metadata: Record<string, unknown>,
): TError & Record<string, unknown> {
    return Object.assign(error, metadata);
}

export async function runModelV1Hook(
    hooksFactory: ModelV1HooksFactory,
    model: unknown,
    operation: ModelHookOperation,
    phase: ModelHookPhase,
    context: Record<string, unknown>,
    ...args: unknown[]
): Promise<unknown> {
    if (!hooksFactory) {
        return undefined;
    }
    const hooks = hooksFactory(model);
    const operationHooks = hooks[operation];
    if (!operationHooks) {
        return undefined;
    }
    const hook = operationHooks[phase];
    if (typeof hook !== 'function') {
        return undefined;
    }
    return hook(context, ...args);
}

export function validateModelSchemaPayload(
    context: ModelSchemaValidationContext,
    document: Record<string, unknown>,
    options?: Record<string, unknown>,
    metadata: Record<string, unknown> = {},
): void {
    const shouldValidate = context.validateEnabled || options?.validate === true;
    if (!shouldValidate) {
        return;
    }
    if (options?.skipValidation) {
        return;
    }
    if (!context.schemaCache || !context.schemaValidateFn) {
        return;
    }
    const result = context.schemaValidateFn(context.schemaCache, document);
    if (result.valid) {
        return;
    }
    const errors = result.errors ?? [];
    const fields = [...new Set(errors.map((item) => item.path ?? item.field).filter(Boolean))];
    const summary = fields.length > 0 ? ` (${fields.join(', ')})` : '';
    throw withModelErrorMetadata(
        createError(ErrorCodes.VALIDATION_ERROR, `Schema validation failed${summary}`),
        {
            errors,
            ...metadata,
        },
    );
}

export function applyModelSoftDeleteFilter(
    query: unknown,
    options: unknown,
    softDeleteConfig: ModelSoftDeleteConfig,
): unknown {
    if (!softDeleteConfig?.enabled) {
        return query ?? {};
    }
    const resolvedOptions = (options ?? {}) as Record<string, unknown>;
    const resolvedQuery = (query ?? {}) as Record<string, unknown>;
    if (resolvedQuery[softDeleteConfig.field] !== undefined) {
        return resolvedQuery;
    }
    if (resolvedOptions.withDeleted) {
        return resolvedQuery;
    }
    if (resolvedOptions.onlyDeleted) {
        return { ...resolvedQuery, [softDeleteConfig.field]: { $ne: null } };
    }
    return { ...resolvedQuery, [softDeleteConfig.field]: null };
}

export function applyModelInsertTimestamps(
    document: Record<string, unknown>,
    timestampsConfig: ModelTimestampConfig,
    nowFactory: () => Date,
): Record<string, unknown> {
    if (!timestampsConfig) {
        return document;
    }
    const now = nowFactory();
    const result = { ...document };
    if (timestampsConfig.createdAt !== false && result[timestampsConfig.createdAt] === undefined) {
        result[timestampsConfig.createdAt] = now;
    }
    if (timestampsConfig.updatedAt !== false && result[timestampsConfig.updatedAt] === undefined) {
        result[timestampsConfig.updatedAt] = now;
    }
    return result;
}

export function applyModelInsertVersion(
    document: Record<string, unknown>,
    versionConfig: ModelVersionConfig,
): Record<string, unknown> {
    if (!versionConfig?.enabled || document[versionConfig.field] !== undefined) {
        return document;
    }
    return { ...document, [versionConfig.field]: 0 };
}

export function applyModelUpdateTimestamps(
    update: unknown,
    timestampsConfig: ModelTimestampConfig,
    nowFactory: () => Date,
): unknown {
    if (!timestampsConfig || timestampsConfig.updatedAt === false) {
        return update;
    }
    const resolvedUpdate = (update ?? {}) as Record<string, unknown>;
    const $set = {
        ...((resolvedUpdate.$set ?? {}) as Record<string, unknown>),
        [timestampsConfig.updatedAt]: nowFactory(),
    };
    return { ...resolvedUpdate, $set };
}

export function applyModelVersionIncrement(
    update: unknown,
    versionConfig: ModelVersionConfig,
): unknown {
    if (!versionConfig?.enabled) {
        return update;
    }
    const resolvedUpdate = (update ?? {}) as Record<string, unknown>;
    const $inc = (resolvedUpdate.$inc ?? {}) as Record<string, unknown>;
    if ($inc[versionConfig.field] !== undefined) {
        return update;
    }
    return {
        ...resolvedUpdate,
        $inc: {
            ...$inc,
            [versionConfig.field]: 1,
        },
    };
}

export function resolveModelOptimisticLock(
    filter: unknown,
    options: unknown,
    versionConfig: ModelVersionConfig,
): { filter: unknown; expectedVersion: unknown; driverOptions: unknown } {
    if (!versionConfig?.enabled) {
        return { filter, expectedVersion: undefined, driverOptions: options };
    }
    const resolvedFilter = { ...((filter as Record<string, unknown>) ?? {}) };
    const rawOptions = (options ?? {}) as Record<string, unknown>;
    const expectedVersion = rawOptions.expectedVersion ?? rawOptions.version ?? resolvedFilter[versionConfig.field];
    const { expectedVersion: _expectedVersion, version: _version, ...driverOptions } = rawOptions;
    void _expectedVersion;
    void _version;

    if (expectedVersion === undefined) {
        throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            `Model optimistic locking requires expectedVersion or ${versionConfig.field} in the filter.`,
        );
    }
    if (resolvedFilter[versionConfig.field] === undefined) {
        resolvedFilter[versionConfig.field] = expectedVersion;
    }
    return {
        filter: resolvedFilter,
        expectedVersion,
        driverOptions: options === undefined ? undefined : driverOptions,
    };
}

export function assertModelOptimisticLockMatched(
    result: { matchedCount?: number } | null | undefined,
    versionConfig: ModelVersionConfig,
): void {
    if (!versionConfig?.enabled) {
        return;
    }
    if ((result?.matchedCount ?? 0) === 0) {
        throw createError(ErrorCodes.WRITE_CONFLICT, 'Model optimistic lock conflict.');
    }
}

export function assertModelOptimisticLockDocument(
    document: unknown,
    versionConfig: ModelVersionConfig,
): void {
    if (!versionConfig?.enabled) {
        return;
    }
    if (document == null) {
        throw createError(ErrorCodes.WRITE_CONFLICT, 'Model optimistic lock conflict.');
    }
}

export function applyModelReplaceVersion(
    replacement: unknown,
    versionConfig: ModelVersionConfig,
    expectedVersion: unknown,
): unknown {
    if (!versionConfig?.enabled) {
        return replacement;
    }
    if (typeof expectedVersion !== 'number') {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'Model optimistic locking requires a numeric expectedVersion for replaceOne.');
    }
    const resolvedReplacement = { ...((replacement as Record<string, unknown>) ?? {}) };
    if (resolvedReplacement[versionConfig.field] === undefined) {
        resolvedReplacement[versionConfig.field] = expectedVersion + 1;
    }
    return resolvedReplacement;
}

export function assertModelVersionedMultiUpdateAllowed(versionConfig: ModelVersionConfig, operation: string): void {
    if (!versionConfig?.enabled) {
        return;
    }
    throw createError(
        ErrorCodes.INVALID_OPERATION,
        `${operation} is not supported for versioned models because optimistic locking is single-document only.`,
    );
}

export function applyModelUpsertTimestamps(
    update: unknown,
    timestampsConfig: ModelTimestampConfig,
    nowFactory: () => Date,
): unknown {
    if (!timestampsConfig) {
        return update;
    }
    const now = nowFactory();
    const resolvedUpdate = (update ?? {}) as Record<string, unknown>;
    const result: Record<string, unknown> = { ...resolvedUpdate };
    if (timestampsConfig.updatedAt !== false) {
        result.$set = {
            ...((resolvedUpdate.$set ?? {}) as Record<string, unknown>),
            [timestampsConfig.updatedAt]: now,
        };
    }
    if (timestampsConfig.createdAt !== false) {
        const $setOnInsert = {
            ...((resolvedUpdate.$setOnInsert ?? {}) as Record<string, unknown>),
        };
        if ($setOnInsert[timestampsConfig.createdAt] === undefined) {
            $setOnInsert[timestampsConfig.createdAt] = now;
        }
        result.$setOnInsert = $setOnInsert;
    }
    return result;
}

export function applyModelReplaceTimestamps(
    replacement: unknown,
    timestampsConfig: ModelTimestampConfig,
    nowFactory: () => Date,
): unknown {
    if (!timestampsConfig || timestampsConfig.updatedAt === false) {
        return replacement;
    }
    const resolvedReplacement = (replacement ?? {}) as Record<string, unknown>;
    if (resolvedReplacement[timestampsConfig.updatedAt] !== undefined) {
        return resolvedReplacement;
    }
    return {
        ...resolvedReplacement,
        [timestampsConfig.updatedAt]: nowFactory(),
    };
}
