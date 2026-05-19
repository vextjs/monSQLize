/**
 * model-registry.ts
 *
 * Static model registry (global singleton).
 *
 * Design notes:
 * - All model definitions are registered via Model.define() into a module-level Map
 *   scoped to the current process.
 * - Each define / redefine / undefine increments the revision counter; the MonSQLize
 *   runtime uses revisions to detect model changes for hot-reloading.
 * - _clear() and _redefinedNames are for test frameworks only and are not part of the
 *   public API.
 * - redefine semantics (v1-compat): the old entry is deleted before the new one is
 *   registered; if validation fails the old entry remains deleted (no rollback).
 */

import { ErrorCodes, createError } from '../../core/errors';
import type { ModelDefinition, RegisteredModel } from '../../../types/model';
import { validateCollectionName, validateDefinition, processTimestamps } from './definition-validator';
import { _schemaDslFn, _makeValidatingDslFn } from './schema-dsl';

/**
 * Static model registry.
 *
 * Typical usage:
 *   Model.define('users', { schema: (dsl) => dsl({ name: 'string!' }) });
 *   const registered = Model.get('users');
 */
export class Model {
    // collection name → registered model definition
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private static registry = new Map<string, RegisteredModel<any>>();

    // collection name → revision number (incremented on each define/redefine/undefine, used for hot-reload detection)
    private static revisions = new Map<string, number>();

    /** Collection names that have been redefined (used by the runtime to trigger hot-reload). */
    static _redefinedNames = new Set<string>();

    /**
     * Register a new model definition.
     * Throws MODEL_ALREADY_EXISTS if a model with the same name already exists.
     * Validates the definition, resolves the timestamps option, and pre-validates schema type strings.
     */
    static define<TDocument = Record<string, unknown>>(collectionName: string, definition: ModelDefinition<TDocument>): void {
        const normalizedName = validateCollectionName(collectionName);
        if (this.registry.has(normalizedName)) {
            throw createError(ErrorCodes.MODEL_ALREADY_EXISTS, `Model '${normalizedName}' is already defined.`);
        }
        validateDefinition<TDocument>(definition);
        processTimestamps(definition);

        // Pre-validate schema type strings at define time (rather than failing silently at validation time)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (_schemaDslFn !== null && typeof (definition as any).schema === 'function') {
            const validatingDsl = _makeValidatingDslFn(_schemaDslFn);
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (definition as any).schema(validatingDsl);
            } catch (err) {
                if (err instanceof TypeError && (err as TypeError).message.includes('[schema] Invalid type')) {
                    throw err;
                }
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.registry.set(normalizedName, {
            collectionName: normalizedName,
            definition,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as RegisteredModel<any>);
        this.bumpRevision(normalizedName);
    }

    /**
     * Look up a registered model definition; returns undefined if not found.
     */
    static get<TDocument = Record<string, unknown>>(collectionName: string): RegisteredModel<TDocument> | undefined {
        return this.registry.get(collectionName) as RegisteredModel<TDocument> | undefined;
    }

    /** Check whether the given collection name has been registered. */
    static has(collectionName: string): boolean {
        return this.registry.has(collectionName);
    }

    /** Return a list of all registered collection names. */
    static list(): string[] {
        return [...this.registry.keys()];
    }

    /**
     * Unregister the model definition for the given collection name.
     * Returns true if the entry existed and was removed; false if it did not exist.
     */
    static undefine(collectionName: string): boolean {
        const existed = this.registry.delete(collectionName);
        this.bumpRevision(collectionName);
        return existed;
    }

    /**
     * Re-register a model (deletes the old entry before registering the new one).
     * v1-compat: if validation fails the old entry is not restored (it stays deleted).
     * Used for hot-reload; the runtime is notified via _redefinedNames.
     */
    static redefine<TDocument = Record<string, unknown>>(collectionName: string, definition: ModelDefinition<TDocument>): void {
        const normalizedName = validateCollectionName(collectionName);
        // v1-compat: delete first, then validate (if validation fails the old entry is gone)
        this.registry.delete(normalizedName);
        validateDefinition<TDocument>(definition);
        processTimestamps(definition);
        this._redefinedNames.add(normalizedName);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.registry.set(normalizedName, {
            collectionName: normalizedName,
            definition,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as RegisteredModel<any>);
        this.bumpRevision(normalizedName);
    }

    /**
     * Clear the entire registry (for test frameworks only).
     * All registered collection names are added to _redefinedNames and their revisions are incremented.
     */
    static _clear(): void {
        const names = [...this.registry.keys()];
        for (const name of names) {
            this._redefinedNames.add(name);
            this.bumpRevision(name);
        }
        this.registry.clear();
    }

    /**
     * Get the current revision number for a collection name.
     * Incremented on every define / redefine / undefine; used for runtime hot-reload detection.
     */
    static getRevision(collectionName: string): number {
        return this.revisions.get(collectionName) ?? 0;
    }

    private static bumpRevision(collectionName: string): void {
        this.revisions.set(collectionName, (this.revisions.get(collectionName) ?? 0) + 1);
    }
}
