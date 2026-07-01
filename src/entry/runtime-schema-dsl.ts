import { createSchemaDslEngine, type SchemaDslEngine } from '../capabilities/model/schema-dsl';
import type { LoggerLike } from '../core/logger';
import type { MonSQLizeOptions } from '../../types/monsqlize';

export type { SchemaDslEngine } from '../capabilities/model/schema-dsl';

export function createRuntimeSchemaDslEngine(options: MonSQLizeOptions): SchemaDslEngine {
    return createSchemaDslEngine(options.schemaDsl);
}

export function replaceRuntimeSchemaDslEngine(
    engine: SchemaDslEngine,
    options: MonSQLizeOptions,
    logger: LoggerLike,
): SchemaDslEngine {
    disposeRuntimeSchemaDslEngine(engine, logger, 'before reconnect');
    return createRuntimeSchemaDslEngine(options);
}

export function disposeRuntimeSchemaDslEngine(
    engine: SchemaDslEngine,
    logger: LoggerLike,
    phase: 'before reconnect' | 'during close',
): void {
    try {
        engine.dispose();
    } catch (err) {
        logger.warn?.(`[MonSQLizeRuntime] schema-dsl runtime cleanup error ${phase}`, err);
    }
}
