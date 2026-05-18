/**
 * schema-dsl.ts
 *
 * schema-dsl 可选依赖的集成层。
 *
 * 设计说明：
 * - schema-dsl 是可选 peer dependency，未安装时 Model.define() 仍可工作（跳过 schema 校验）。
 * - 此文件在模块加载时尝试 require('schema-dsl')，成功则启用 dsl 与 validate；失败则静默降级。
 * - 对外暴露两个变量（_schemaDslFn / _schemaValidateFn）及一个包装工厂（_makeValidatingDslFn）。
 */

// ── schema-dsl 类型声明 ───────────────────────────────────────────────────────
export type SchemaDslFn = (fn: (dslArg: unknown) => unknown) => unknown;
export type SchemaValidateFn = (
    schema: unknown,
    data: unknown,
) => { valid: boolean; errors?: Array<{ field?: string; path?: string; message?: string; type?: string; expected?: string }> };

/** schema-dsl 的 dsl() 函数；未安装时为 null。 */
export let _schemaDslFn: SchemaDslFn | null = null;
/** schema-dsl 的 validate() 函数；未安装时为 null。 */
export let _schemaValidateFn: SchemaValidateFn | null = null;

try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('schema-dsl') as { dsl: SchemaDslFn; validate: SchemaValidateFn };
    _schemaDslFn = mod.dsl;
    _schemaValidateFn = mod.validate;
} catch {
    // schema-dsl not available – schema validation will be skipped
}

// ── 已知合法 base type 集合（与 v1 保持一致）────────────────────────────────
const KNOWN_SCHEMA_BASE_TYPES = new Set([
    'string', 'number', 'boolean', 'integer', 'float', 'int', 'double', 'decimal',
    'date', 'objectid', 'uuid', 'email', 'url', 'buffer', 'binary',
    'object', 'array', 'any', 'mixed', 'null',
]);

/**
 * 从 schema-dsl 类型字符串中提取 base type 名称（去除修饰符如 ! ? [] :range）。
 *
 * 例：
 *   "string!"    → "string"
 *   "objectid!"  → "objectid"
 *   "invalid!"   → "invalid"
 */
function _extractBaseType(typeStr: string): string {
    const m = typeStr.match(/^[a-zA-Z_]+/);
    return m ? m[0].toLowerCase() : '';
}

/**
 * 包装 schema-dsl 的 dsl() 函数，在 Model.define() 阶段提前校验字段类型字符串的合法性。
 *
 * 作用：
 * - 若字段类型字符串包含未知 base type，立即抛出 TypeError（不等到 validate 时才报错）。
 * - enum DSL（如 "admin|user"）跳过检查（含 | 的为字面量联合类型，不是 base type）。
 *
 * 这样可以在 Model.define() 时快速失败，而不是在运行时悄悄降级为 string。
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
