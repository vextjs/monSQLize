import { PopulatePromise } from './populate-promise';
import type { PopulatePath, ModelCollectionLike } from './populate-promise';

type SoftDeleteConfig = { enabled: boolean; field: string; type: string; ttl: number | null } | null;

type SoftDeleteContext<TDocument> = {
    collection: ModelCollectionLike<TDocument>;
    softDeleteConfig: SoftDeleteConfig;
    hydrateDocuments: (docs: Array<TDocument | null | undefined>) => Array<TDocument & Record<string, unknown>>;
    hydrateDocument: (doc: TDocument | null | undefined) => (TDocument & Record<string, unknown>) | null;
    populateDocuments: (docs: Array<TDocument & Record<string, unknown>>, paths: PopulatePath[]) => Promise<Array<TDocument & Record<string, unknown>>>;
    populateSingle: (doc: (TDocument & Record<string, unknown>) | null, paths: PopulatePath[]) => Promise<(TDocument & Record<string, unknown>) | null>;
};

function deletedFilter(filter: unknown, softDeleteConfig: SoftDeleteConfig): unknown {
    if (!softDeleteConfig) {
        return filter ?? {};
    }
    return { ...(filter as Record<string, unknown> ?? {}), [softDeleteConfig.field]: { $ne: null } };
}

export function findWithDeletedDocuments<TDocument>(
    context: SoftDeleteContext<TDocument>,
    query?: unknown,
    options?: unknown,
) {
    return new PopulatePromise(async (paths) => {
        const opts = { ...(options as Record<string, unknown> ?? {}), withDeleted: true };
        const docs = await context.collection.find(query, opts) as Array<TDocument | null | undefined>;
        return context.populateDocuments(context.hydrateDocuments(docs), paths);
    });
}

export function findOnlyDeletedDocuments<TDocument>(
    context: SoftDeleteContext<TDocument>,
    query?: unknown,
    options?: unknown,
) {
    return new PopulatePromise(async (paths) => {
        const docs = await context.collection.find(deletedFilter(query, context.softDeleteConfig), options) as Array<TDocument | null | undefined>;
        return context.populateDocuments(context.hydrateDocuments(docs), paths);
    });
}

export function findOneWithDeletedDocument<TDocument>(
    context: SoftDeleteContext<TDocument>,
    query?: unknown,
    options?: unknown,
) {
    return new PopulatePromise(async (paths) => {
        const opts = { ...(options as Record<string, unknown> ?? {}), withDeleted: true };
        const doc = await context.collection.findOne(query, opts) as TDocument | null | undefined;
        return context.populateSingle(context.hydrateDocument(doc), paths);
    });
}

export function findOneOnlyDeletedDocument<TDocument>(
    context: SoftDeleteContext<TDocument>,
    query?: unknown,
    options?: unknown,
) {
    return new PopulatePromise(async (paths) => {
        const doc = await context.collection.findOne(deletedFilter(query, context.softDeleteConfig), options) as TDocument | null | undefined;
        return context.populateSingle(context.hydrateDocument(doc), paths);
    });
}

export function countWithDeletedDocuments<TDocument>(
    context: SoftDeleteContext<TDocument>,
    query?: unknown,
    options?: unknown,
): Promise<number> {
    return context.collection.count(query, { ...(options as Record<string, unknown> ?? {}), withDeleted: true });
}

export function countOnlyDeletedDocuments<TDocument>(
    context: SoftDeleteContext<TDocument>,
    query?: unknown,
    options?: unknown,
): Promise<number> {
    return context.collection.count(
        deletedFilter(query, context.softDeleteConfig),
        { ...(options as Record<string, unknown> ?? {}), withDeleted: true },
    );
}

export function restoreSoftDeletedDocuments<TDocument>(
    context: SoftDeleteContext<TDocument>,
    filter?: unknown,
    options?: unknown,
): Promise<unknown> {
    const softDeleteConfig = context.softDeleteConfig;
    if (!softDeleteConfig?.enabled) {
        return Promise.resolve({ modifiedCount: 0 });
    }
    return context.collection.updateOne(
        { ...(filter as Record<string, unknown> ?? {}), [softDeleteConfig.field]: { $ne: null } },
        { $unset: { [softDeleteConfig.field]: 1 } },
        options,
    );
}

export function restoreManySoftDeletedDocuments<TDocument>(
    context: SoftDeleteContext<TDocument>,
    filter?: unknown,
    options?: unknown,
): Promise<unknown> {
    const softDeleteConfig = context.softDeleteConfig;
    if (!softDeleteConfig?.enabled) {
        return Promise.resolve({ modifiedCount: 0 });
    }
    return context.collection.updateMany(
        { ...(filter as Record<string, unknown> ?? {}), [softDeleteConfig.field]: { $ne: null } },
        { $unset: { [softDeleteConfig.field]: 1 } },
        options,
    );
}

export function forceDeleteDocument<TDocument>(
    context: SoftDeleteContext<TDocument>,
    filter?: unknown,
    options?: unknown,
): Promise<unknown> {
    return context.collection.deleteOne(filter, options);
}

export function forceDeleteManyDocuments<TDocument>(
    context: SoftDeleteContext<TDocument>,
    filter?: unknown,
    options?: unknown,
): Promise<unknown> {
    return context.collection.deleteMany(filter, options);
}
