/**
 * schema-dsl runtime integration.
 *
 * monSQLize owns or receives one schema-dsl runtime per MonSQLizeRuntime instance.
 * Model definitions stay registry-only; actual schema compilation and validation
 * happen when a ModelInstance is bound to a runtime.
 */
import type { SchemaDslRuntime, SchemaDslRuntimeOptions } from 'schema-dsl/runtime';

type SchemaDslInvoker = (definition: unknown, ...args: unknown[]) => unknown;

export type SchemaDslFn = SchemaDslRuntime['dsl'] | ((...args: never[]) => unknown);
export type SchemaValidateFn = (
    schema: unknown,
    data: unknown,
) => { valid: boolean; data?: unknown; errors?: Array<{ field?: string; path?: string; message?: string; type?: string; expected?: string }> };

export type SchemaDslRuntimeLike = Partial<Omit<Pick<
    SchemaDslRuntime,
    'dsl' | 's' | 'validate' | 'dispose' | 'registerExtensions'
>, 'dsl' | 's'>> & {
    dsl?: SchemaDslFn;
    s?: SchemaDslFn;
};

export type SchemaDslRuntimeConfig = false | {
    enabled?: boolean;
    runtime?: SchemaDslRuntimeLike;
    options?: SchemaDslRuntimeOptions;
    extensions?: readonly unknown[];
};

export type SchemaDslEngine = {
    enabled: boolean;
    owned: boolean;
    runtime: SchemaDslRuntimeLike | null;
    dsl: SchemaDslFn | null;
    validate: SchemaValidateFn | null;
    dispose(): void;
};

type SchemaDslRuntimeModule = {
    createRuntime?: (options?: SchemaDslRuntimeOptions) => SchemaDslRuntimeLike;
    createSchemaDslRuntime?: (options?: SchemaDslRuntimeOptions) => SchemaDslRuntimeLike;
};

function createDisabledSchemaDslEngine(): SchemaDslEngine {
    return {
        enabled: false,
        owned: false,
        runtime: null,
        dsl: null,
        validate: null,
        dispose() { },
    };
}

function resolveRuntime(config: SchemaDslRuntimeConfig | null | undefined): { runtime: SchemaDslRuntimeLike; owned: boolean } | null {
    if (config === false || config?.enabled === false) {
        return null;
    }
    if (config?.runtime) {
        return { runtime: config.runtime, owned: false };
    }
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require('schema-dsl/runtime') as SchemaDslRuntimeModule;
        const createRuntime = mod.createRuntime ?? mod.createSchemaDslRuntime;
        if (!createRuntime) {
            return null;
        }
        return { runtime: createRuntime(config?.options), owned: true };
    } catch {
        return null;
    }
}

function resolveDsl(runtime: SchemaDslRuntimeLike): SchemaDslFn | null {
    return runtime.s ?? runtime.dsl ?? null;
}

function resolveValidate(runtime: SchemaDslRuntimeLike): SchemaValidateFn | null {
    if (typeof runtime.validate !== 'function') {
        return null;
    }
    const validate = runtime.validate.bind(runtime) as unknown as SchemaValidateFn;
    return (schema, data) => validate(schema, data);
}

function registerRuntimeExtensions(runtime: SchemaDslRuntimeLike, extensions: readonly unknown[] | undefined): void {
    if (!extensions || extensions.length === 0 || typeof runtime.registerExtensions !== 'function') {
        return;
    }
    runtime.registerExtensions(extensions as readonly [unknown, ...unknown[]]);
}

export function createSchemaDslEngine(config?: SchemaDslRuntimeConfig | null): SchemaDslEngine {
    const resolved = resolveRuntime(config);
    if (!resolved) {
        return createDisabledSchemaDslEngine();
    }

    const extensions = config === false ? undefined : config?.extensions;
    registerRuntimeExtensions(resolved.runtime, extensions);
    const dsl = resolveDsl(resolved.runtime);
    const validate = resolveValidate(resolved.runtime);
    if (!dsl || !validate) {
        if (resolved.owned) {
            resolved.runtime.dispose?.();
        }
        return createDisabledSchemaDslEngine();
    }

    let disposed = false;
    return {
        enabled: true,
        owned: resolved.owned,
        runtime: resolved.runtime,
        dsl,
        validate,
        dispose() {
            if (disposed) {
                return;
            }
            disposed = true;
            if (resolved.owned) {
                resolved.runtime.dispose?.();
            }
        },
    };
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
    const validating = function validatingDsl(fields: unknown, ...args: unknown[]): unknown {
        return (realDsl as unknown as SchemaDslInvoker)(fields, ...args);
    };
    return new Proxy(validating as SchemaDslFn, {
        get(target, property, receiver) {
            if (Reflect.has(target, property)) {
                return Reflect.get(target, property, receiver);
            }
            const value = Reflect.get(realDsl as object, property);
            return typeof value === 'function' ? value.bind(realDsl) : value;
        },
    });
}
