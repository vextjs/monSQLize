import type { LoggerLike } from '../core/logger';

interface ClosableResource {
    close(): unknown;
}

interface StoppableResource {
    stop(): unknown;
}

interface AbortableResource {
    abortAll(): unknown;
}

export interface FailedRuntimeConnectionResources {
    client: ClosableResource | null;
    pool: ClosableResource | null;
    tunnel: ClosableResource | null;
    invalidator: ClosableResource | null;
    sync: StoppableResource | null;
    slowQuery: ClosableResource | null;
    transaction: AbortableResource | null;
    lock: ClosableResource | null;
}

export async function cleanupFailedRuntimeConnection(
    resources: FailedRuntimeConnectionResources,
    logger: LoggerLike,
): Promise<void> {
    try {
        resources.lock?.close();
    } catch (error) {
        logger.warn?.('[MonSQLizeRuntime] lock cleanup error after failed connect', error);
    }

    const results = await Promise.allSettled([
        resources.sync?.stop(),
        resources.slowQuery?.close(),
        resources.transaction?.abortAll(),
        resources.pool?.close(),
        resources.invalidator?.close(),
        resources.client?.close(),
        resources.tunnel?.close(),
    ]);
    for (const result of results) {
        if (result.status === 'rejected') {
            logger.warn?.('[MonSQLizeRuntime] cleanup error after failed connect', result.reason);
        }
    }
}
