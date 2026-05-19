/**
 * schema-dsl.ts
 *
 * Integration layer for the optional schema-dsl dependency.
 *
 * Design notes:
 * - schema-dsl is an optional peer dependency; Model.define() still works without it (schema validation is skipped).
 * - This file attempts require('schema-dsl') at module load time; if successful, dsl and validate are enabled;
 *   otherwise it silently degrades.
 * - Exposes two variables (_schemaDslFn / _schemaValidateFn) and one wrapper factory (_makeValidatingDslFn).
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

// ── Known valid base types (consistent with v1) ──────────────────────────────
const KNOWN_SCHEMA_BASE_TYPES = new Set([
    'string', 'number', 'boolean', 'integer', 'float', 'int', 'double', 'decimal',
    'date', 'objectid', 'uuid', 'email', 'url', 'buffer', 'binary',
    'object', 'array', 'any', 'mixed', 'null',
]);

/**
 * Extract the base type name from a schema-dsl type string (strips modifiers like ! ? [] :range).
 *
 * Examples:
 *   "string!"    → "string"
 *   "objectid!"  → "objectid"
 *   "invalid!"   → "invalid"
 */
function _extractBaseType(typeStr: string): string {
    const m = typeStr.match(/^[a-zA-Z_]+/);
    return m ? m[0].toLowerCase() : '';
}

/**
 * Wrap the schema-dsl dsl() function to eagerly validate field type strings during Model.define().
 *
 * Behavior:
 * - If a field type string contains an unknown base type, a TypeError is thrown immediately
 *   (rather than silently failing at validation time).
 * - Enum DSL strings (e.g. "admin|user") are skipped — pipe-separated values are literal unions, not base types.
 *
 * This enables fast-fail at Model.define() time instead of silent degradation at runtime.
 */
export function _makeValidatingDslFn(realDsl: SchemaDslFn): SchemaDslFn {
    const validating = function validatingDsl(fields: unknown): unknown {
        if (fields && typeof fields === 'object') {
            for (const [field, spec] of Object.entries(fields as Record<string, unknown>)) {
                if (typeof spec === 'string') {
                    // v1 compat: enum DSL like "admin|user" is a literal-union, not a base type.
                    if (spec.includes('|')) {
                        continue;
                    }
                    const base = _extractBaseType(spec);
                    if (base && !KNOWN_SCHEMA_BASE_TYPES.has(base)) {
                        throw new TypeError(
                            `[schema] Invalid type "${base}" in field "${field}". ` +
                            `Known types: ${[...KNOWN_SCHEMA_BASE_TYPES].join(', ')}.`
                        );
                    }
                }
            }
        }
        return (realDsl as unknown as (f: unknown) => unknown)(fields);
    };
    return validating as unknown as SchemaDslFn;
}
