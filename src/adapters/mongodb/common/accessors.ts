/**
 * Barrel export for MongoDB adapter accessors.
 *
 * Re-exports MongoCollectionAccessor and MongoDbAccessor from a single
 * entry point for use by higher-level capability layers and runtime wiring.
 */
export { MongoCollectionAccessor } from './collection-accessor';
export { MongoDbAccessor } from './db-accessor';
