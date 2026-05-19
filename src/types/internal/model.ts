/**
 * Internal domain types for the model capability layer.
 *
 * Consolidates model-related internal interfaces that are not tied to specific
 * business logic in runtime-core.ts / model/index.ts, allowing them to be
 * shared across multiple files without introducing circular dependencies.
 */

import type { ModelInstance } from '../../capabilities/model';

/**
 * Value type for the runtime's `_modelInstances` Map.
 * The `revision` field enables hot-reload detection: when `Model.getRevision()` changes,
 * the runtime destroys and rebuilds the corresponding ModelInstance to activate the new schema.
 */
export interface ModelInstanceCacheEntry<TDocument = Record<string, unknown>> {
    /**
     * The Model schema revision number at the time of caching (from `Model.getRevision()`).
     * A mismatch triggers an instance rebuild.
     */
    revision: number;
    /** The fully assembled ModelInstance. */
    instance: ModelInstance<TDocument>;
}
