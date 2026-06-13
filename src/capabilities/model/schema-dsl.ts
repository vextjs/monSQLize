/**
 * schema-dsl.ts
 *
 * Integration layer for the optional schema-dsl dependency.
 *
 * Design notes:
 * - schema-dsl is a runtime dependency of the published package; Model.define() still degrades gracefully
 *   if a non-standard install omits it (schema validation is skipped).
 * - This file attempts require('schema-dsl') at module load time; if successful, dsl and validate are enabled;
 *   otherwise it silently degrades.
 * - Exposes two variables (_schemaDslFn / _schemaValidateFn) and one wrapper factory (_makeValidatingDslFn).
 * - _makeValidatingDslFn intentionally delegates DSL semantics to schema-dsl instead of maintaining
 *   a shadow type allowlist in monsqlize.
 */

// ── schema-dsl type declarations ────────────────────────────────────────────
export type SchemaDslFn = (fn: (dslArg: unknown) => unknown) => unknown;
export type SchemaValidateFn = (
    schema: unknown,
    data: unknown,
) => { valid: boolean; errors?: Array<{ field?: string; path?: string; message?: string; type?: string; expected?: string }> };

/** The dsl() function from schema-dsl; null when not installed. */
export let _schemaDslFn: SchemaDslFn | null = null;
/** The validate() function from schema-dsl; null when not installed. */
export let _schemaValidateFn: SchemaValidateFn | null = null;

try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('schema-dsl') as { dsl: SchemaDslFn; validate: SchemaValidateFn };
    _schemaDslFn = mod.dsl;
    _schemaValidateFn = mod.validate;
} catch {
    // schema-dsl not available – schema validation will be skipped
}

/**
 * Wrap the schema-dsl dsl() function while keeping schema-dsl as the single DSL authority.
 *
 * Behavior:
 * - monsqlize no longer keeps a duplicate schema-dsl type allowlist.
 * - Unknown types, custom types, aliases, and fallback behavior are delegated to schema-dsl.
 * - A future schema-dsl diagnostics API can be consumed here without parsing DSL strings in monsqlize.
 */
export function _makeValidatingDslFn(realDsl: SchemaDslFn): SchemaDslFn {
    const validating = function validatingDsl(fields: unknown): unknown {
        return (realDsl as unknown as (f: unknown) => unknown)(fields);
    };
    return validating as unknown as SchemaDslFn;
}
