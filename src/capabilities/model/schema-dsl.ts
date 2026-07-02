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

const externalRuntimeExtensionRegistrations = new WeakMap<object, Set<string>>();
const extensionObjectKeys = new WeakMap<object, string>();
const patchedExternalRuntimeLifecycles = new WeakSet<object>();
let extensionObjectKeyCounter = 0;

const functionIdentifierPattern = /[A-Za-z_$][\w$]*/g;
const functionReservedIdentifiers = new Set([
    'arguments',
    'async',
    'await',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'default',
    'delete',
    'do',
    'else',
    'extends',
    'false',
    'finally',
    'for',
    'function',
    'get',
    'globalThis',
    'if',
    'in',
    'instanceof',
    'let',
    'new',
    'null',
    'of',
    'return',
    'set',
    'static',
    'switch',
    'this',
    'throw',
    'true',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'yield',
]);

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

function getExtensionObjectKey(value: object): string {
    let key = extensionObjectKeys.get(value);
    if (!key) {
        extensionObjectKeyCounter += 1;
        key = `ref:${extensionObjectKeyCounter}`;
        extensionObjectKeys.set(value, key);
    }
    return key;
}

function maskFunctionLiteralsAndComments(source: string): string {
    let masked = '';
    for (let index = 0; index < source.length;) {
        const current = source[index];
        const next = source[index + 1];
        if (current === '/' && next === '/') {
            const end = source.indexOf('\n', index + 2);
            const commentEnd = end === -1 ? source.length : end;
            masked += ' '.repeat(commentEnd - index);
            index = commentEnd;
            continue;
        }
        if (current === '/' && next === '*') {
            const end = source.indexOf('*/', index + 2);
            const commentEnd = end === -1 ? source.length : end + 2;
            masked += ' '.repeat(commentEnd - index);
            index = commentEnd;
            continue;
        }
        if (current === '/' && next !== undefined && next !== '=' && canStartRegexLiteral(source, index)) {
            const regexEnd = readRegexLiteralEnd(source, index);
            if (regexEnd !== null) {
                masked += ' '.repeat(regexEnd - index);
                index = regexEnd;
                continue;
            }
        }
        if (current === '\'' || current === '"' || current === '`') {
            const quote = current;
            let end = index + 1;
            while (end < source.length) {
                if (source[end] === '\\') {
                    end += 2;
                    continue;
                }
                if (source[end] === quote) {
                    end += 1;
                    break;
                }
                end += 1;
            }
            masked += ' '.repeat(end - index);
            index = end;
            continue;
        }
        masked += current;
        index += 1;
    }
    return masked;
}

function canStartRegexLiteral(source: string, index: number): boolean {
    const before = source.slice(0, index).trimEnd();
    if (!before) {
        return true;
    }
    if (before.endsWith('=>')) {
        return true;
    }
    const previous = before[before.length - 1];
    if (previous && '({[=,:;!?&|^~+-*%<>'.includes(previous)) {
        return true;
    }
    const wordMatch = /([A-Za-z_$][\w$]*)$/.exec(before);
    if (!wordMatch) {
        return false;
    }
    return new Set(['return', 'throw', 'case', 'yield', 'typeof', 'delete', 'void', 'new']).has(wordMatch[1]);
}

function readRegexLiteralEnd(source: string, start: number): number | null {
    let index = start + 1;
    let inCharacterClass = false;
    while (index < source.length) {
        const char = source[index];
        if (char === '\\') {
            index += 2;
            continue;
        }
        if (char === '[') {
            inCharacterClass = true;
        } else if (char === ']') {
            inCharacterClass = false;
        } else if (char === '/' && !inCharacterClass) {
            index += 1;
            while (index < source.length && /[A-Za-z_$\d]/.test(source[index])) {
                index += 1;
            }
            return index;
        }
        index += 1;
    }
    return null;
}

function addIdentifiersFromPattern(pattern: string, identifiers: Set<string>): void {
    for (const match of pattern.matchAll(functionIdentifierPattern)) {
        identifiers.add(match[0]);
    }
}

function isIdentifierPart(char: string | undefined): boolean {
    return char !== undefined && /[A-Za-z_$\d]/.test(char);
}

function splitTopLevel(source: string, delimiter: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (char === '{' || char === '[' || char === '(') {
            depth += 1;
        } else if (char === '}' || char === ']' || char === ')') {
            depth = Math.max(0, depth - 1);
        } else if (char === delimiter && depth === 0) {
            parts.push(source.slice(start, index));
            start = index + 1;
        }
    }
    parts.push(source.slice(start));
    return parts;
}

function indexOfTopLevel(source: string, needle: string): number {
    let depth = 0;
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (char === '{' || char === '[' || char === '(') {
            depth += 1;
        } else if (char === '}' || char === ']' || char === ')') {
            depth = Math.max(0, depth - 1);
        } else if (char === needle && depth === 0) {
            return index;
        }
    }
    return -1;
}

function indexOfTopLevelWord(source: string, word: string): number {
    let depth = 0;
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (char === '{' || char === '[' || char === '(') {
            depth += 1;
        } else if (char === '}' || char === ']' || char === ')') {
            depth = Math.max(0, depth - 1);
        } else if (
            depth === 0
            && source.startsWith(word, index)
            && !isIdentifierPart(source[index - 1])
            && !isIdentifierPart(source[index + word.length])
        ) {
            return index;
        }
    }
    return -1;
}

function stripTopLevelDefault(pattern: string): string {
    const defaultIndex = indexOfTopLevel(pattern, '=');
    return defaultIndex >= 0 ? pattern.slice(0, defaultIndex).trim() : pattern.trim();
}

function stripLocalDeclarationBinding(declaration: string): string {
    const boundaries = [
        indexOfTopLevel(declaration, '='),
        indexOfTopLevelWord(declaration, 'of'),
        indexOfTopLevelWord(declaration, 'in'),
    ].filter((index) => index >= 0);
    const end = boundaries.length > 0 ? Math.min(...boundaries) : declaration.length;
    return declaration.slice(0, end).trim();
}

function findMatchingBrace(source: string, start: number): number {
    let depth = 0;
    for (let index = start; index < source.length; index += 1) {
        const char = source[index];
        if (char === '{') {
            depth += 1;
        } else if (char === '}') {
            depth -= 1;
            if (depth === 0) {
                return index;
            }
        }
    }
    return -1;
}

function isIndexInRanges(index: number, ranges: ReadonlyArray<{ start: number; end: number }>): boolean {
    return ranges.some((range) => index >= range.start && index <= range.end);
}

function findNestedFunctionBodyRanges(source: string, rootArrowIndex: number, rootFunctionIndex: number): Array<{ start: number; end: number }> {
    const ranges: Array<{ start: number; end: number }> = [];
    for (const match of source.matchAll(/\bfunction\b/g)) {
        const functionIndex = match.index ?? 0;
        if (functionIndex === rootFunctionIndex) {
            continue;
        }
        const bodyStart = source.indexOf('{', functionIndex);
        if (bodyStart <= 0) {
            continue;
        }
        const bodyEnd = findMatchingBrace(source, bodyStart);
        if (bodyEnd > bodyStart) {
            ranges.push({ start: bodyStart, end: bodyEnd });
        }
    }

    for (const match of source.matchAll(/=>/g)) {
        const arrowIndex = match.index ?? 0;
        if (arrowIndex === rootArrowIndex) {
            continue;
        }
        let bodyStart = arrowIndex + 2;
        while (bodyStart < source.length && /\s/.test(source[bodyStart])) {
            bodyStart += 1;
        }
        if (source[bodyStart] !== '{') {
            continue;
        }
        const bodyEnd = findMatchingBrace(source, bodyStart);
        if (bodyEnd > bodyStart) {
            ranges.push({ start: bodyStart, end: bodyEnd });
        }
    }
    return ranges;
}

function addBindingIdentifiers(pattern: string, identifiers: Set<string>): void {
    let binding = stripTopLevelDefault(pattern).replace(/^\s*\.\.\./, '').trim();
    if (!binding) return;
    if (/^[A-Za-z_$][\w$]*$/.test(binding)) {
        identifiers.add(binding);
        return;
    }
    if (binding.startsWith('{') && binding.endsWith('}')) {
        const body = binding.slice(1, -1);
        for (const property of splitTopLevel(body, ',')) {
            const propertyBinding = property.trim();
            if (!propertyBinding) continue;
            if (propertyBinding.startsWith('...')) {
                addBindingIdentifiers(propertyBinding, identifiers);
                continue;
            }
            const colonIndex = indexOfTopLevel(propertyBinding, ':');
            if (colonIndex >= 0) {
                addBindingIdentifiers(propertyBinding.slice(colonIndex + 1), identifiers);
            } else {
                addBindingIdentifiers(propertyBinding, identifiers);
            }
        }
        return;
    }
    if (binding.startsWith('[') && binding.endsWith(']')) {
        const body = binding.slice(1, -1);
        for (const element of splitTopLevel(body, ',')) {
            addBindingIdentifiers(element, identifiers);
        }
        return;
    }
    addIdentifiersFromPattern(binding, identifiers);
}

function addParameterIdentifiers(parameters: string, identifiers: Set<string>): void {
    for (const parameter of splitTopLevel(parameters, ',')) {
        addBindingIdentifiers(parameter, identifiers);
    }
}

function extractFunctionBoundIdentifiers(maskedSource: string): Set<string> {
    const identifiers = new Set<string>();
    const functionMatch = /^\s*(?:async\s+)?function(?:\s+([A-Za-z_$][\w$]*))?\s*\(([^)]*)\)/.exec(maskedSource);
    const arrowIndex = maskedSource.indexOf('=>');
    const methodMatch = /^\s*(?:async\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)?\s*\(([^)]*)\)/.exec(maskedSource);
    const rootFunctionIndex = functionMatch ? maskedSource.indexOf('function', functionMatch.index ?? 0) : -1;
    const nestedFunctionBodyRanges = findNestedFunctionBodyRanges(maskedSource, arrowIndex, rootFunctionIndex);

    if (functionMatch) {
        if (functionMatch[1]) identifiers.add(functionMatch[1]);
        addParameterIdentifiers(functionMatch[2] ?? '', identifiers);
    } else if (arrowIndex >= 0) {
        let params = maskedSource.slice(0, arrowIndex).trim().replace(/^async\s+/, '').trim();
        if (params.startsWith('(')) {
            params = params.slice(1, params.lastIndexOf(')'));
        }
        addParameterIdentifiers(params, identifiers);
    } else if (methodMatch) {
        if (methodMatch[1]) identifiers.add(methodMatch[1]);
        addParameterIdentifiers(methodMatch[2] ?? '', identifiers);
    }

    for (const match of maskedSource.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) {
        if (isIndexInRanges(match.index ?? 0, nestedFunctionBodyRanges)) {
            continue;
        }
        identifiers.add(match[1]);
    }
    for (const match of maskedSource.matchAll(/\b(?:const|let|var)\s+([^;]+)/g)) {
        if (isIndexInRanges(match.index ?? 0, nestedFunctionBodyRanges)) {
            continue;
        }
        for (const declaration of splitTopLevel(match[1], ',')) {
            addBindingIdentifiers(stripLocalDeclarationBinding(declaration), identifiers);
        }
    }
    for (const match of maskedSource.matchAll(/\bcatch\s*\(([^)]*)\)/g)) {
        if (isIndexInRanges(match.index ?? 0, nestedFunctionBodyRanges)) {
            continue;
        }
        addBindingIdentifiers(match[1], identifiers);
    }
    return identifiers;
}

function previousNonWhitespaceChar(source: string, start: number): string | undefined {
    for (let index = start; index >= 0; index -= 1) {
        if (!/\s/.test(source[index])) {
            return source[index];
        }
    }
    return undefined;
}

function nextNonWhitespaceChar(source: string, start: number): string | undefined {
    for (let index = start; index < source.length; index += 1) {
        if (!/\s/.test(source[index])) {
            return source[index];
        }
    }
    return undefined;
}

function isObjectLiteralKey(source: string, start: number, end: number): boolean {
    const next = nextNonWhitespaceChar(source, end);
    if (next !== ':') {
        return false;
    }
    const previous = previousNonWhitespaceChar(source, start - 1);
    return previous === '{' || previous === ',';
}

function isClosureSensitiveFunctionSource(source: string, functionName?: string): boolean {
    if (source.includes('`') && source.includes('${')) {
        return true;
    }
    const maskedSource = maskFunctionLiteralsAndComments(source);
    const boundIdentifiers = extractFunctionBoundIdentifiers(maskedSource);
    if (functionName) {
        boundIdentifiers.add(functionName);
    }

    for (const match of maskedSource.matchAll(functionIdentifierPattern)) {
        const identifier = match[0];
        const start = match.index ?? 0;
        const end = start + identifier.length;
        if (functionReservedIdentifiers.has(identifier) || boundIdentifiers.has(identifier)) {
            continue;
        }
        if (previousNonWhitespaceChar(maskedSource, start - 1) === '.') {
            continue;
        }
        if (isObjectLiteralKey(maskedSource, start, end)) {
            continue;
        }
        return true;
    }
    return false;
}

function normalizeExtensionFunction(value: Function): string {
    try {
        const source = Function.prototype.toString.call(value);
        if (isClosureSensitiveFunctionSource(source, value.name)) {
            return JSON.stringify({
                name: value.name,
                length: value.length,
                source,
                ref: getExtensionObjectKey(value),
                closureSensitive: true,
            });
        }
        return JSON.stringify({
            name: value.name,
            length: value.length,
            source,
        });
    } catch {
        return getExtensionObjectKey(value);
    }
}

function normalizeExtensionValue(value: unknown, stack: WeakSet<object>): string {
    if (value === null) {
        return 'null';
    }
    switch (typeof value) {
        case 'string':
            return `string:${JSON.stringify(value)}`;
        case 'number':
            if (Number.isNaN(value)) {
                return 'number:NaN';
            }
            return `number:${Object.is(value, -0) ? '-0' : String(value)}`;
        case 'boolean':
        case 'bigint':
        case 'undefined':
            return `${typeof value}:${String(value)}`;
        case 'symbol':
            return `symbol:${String(value.description)}`;
        case 'function':
            return `function:${normalizeExtensionFunction(value)}`;
        case 'object':
            break;
        default:
            return `${typeof value}:${String(value)}`;
    }

    if (value instanceof Date) {
        return `date:${Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString()}`;
    }
    if (value instanceof RegExp) {
        return `regexp:${value.source}/${value.flags}`;
    }

    const objectValue = value as object;
    if (stack.has(objectValue)) {
        return `circular:${getExtensionObjectKey(objectValue)}`;
    }

    const prototype = Object.getPrototypeOf(objectValue);
    const isPlainObject = prototype === Object.prototype || prototype === null;
    if (!Array.isArray(objectValue) && !isPlainObject) {
        return `object:${prototype?.constructor?.name ?? 'unknown'}:${getExtensionObjectKey(objectValue)}`;
    }

    stack.add(objectValue);
    try {
        if (Array.isArray(objectValue)) {
            return `array:[${objectValue.map((item) => normalizeExtensionValue(item, stack)).join(',')}]`;
        }
        const entries = Object.keys(objectValue as Record<string, unknown>)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${normalizeExtensionValue((objectValue as Record<string, unknown>)[key], stack)}`);
        return `object:{${entries.join(',')}}`;
    } finally {
        stack.delete(objectValue);
    }
}

function createExtensionRegistrationKeys(extensions: readonly unknown[]): string[] {
    const stack = new WeakSet<object>();
    return extensions.map((extension) => normalizeExtensionValue(extension, stack));
}

function patchExternalRuntimeLifecycle(runtime: SchemaDslRuntimeLike): void {
    if (patchedExternalRuntimeLifecycles.has(runtime)) {
        return;
    }
    patchedExternalRuntimeLifecycles.add(runtime);

    const mutableRuntime = runtime as SchemaDslRuntimeLike & {
        configure?: (...args: unknown[]) => unknown;
        dispose?: (...args: unknown[]) => unknown;
    };
    const originalConfigure = mutableRuntime.configure;
    if (typeof originalConfigure === 'function') {
        try {
            mutableRuntime.configure = function patchedConfigure(this: unknown, ...args: unknown[]): unknown {
                const control = args[1] as { mode?: unknown } | undefined;
                const mode = control && typeof control === 'object' ? control.mode : undefined;
                try {
                    return originalConfigure.apply(this, args);
                } finally {
                    if (mode === 'reset' || mode === 'replace') {
                        externalRuntimeExtensionRegistrations.delete(runtime);
                    }
                }
            };
        } catch {
            // Some runtime-like objects may expose non-writable lifecycle methods.
        }
    }

    const originalDispose = mutableRuntime.dispose;
    if (typeof originalDispose === 'function') {
        try {
            mutableRuntime.dispose = function patchedDispose(this: unknown, ...args: unknown[]): unknown {
                try {
                    return originalDispose.apply(this, args);
                } finally {
                    externalRuntimeExtensionRegistrations.delete(runtime);
                }
            };
        } catch {
            // Some runtime-like objects may expose non-writable lifecycle methods.
        }
    }
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

function registerRuntimeExtensions(runtime: SchemaDslRuntimeLike, extensions: readonly unknown[] | undefined, owned: boolean): void {
    if (!extensions || extensions.length === 0 || typeof runtime.registerExtensions !== 'function') {
        return;
    }
    if (!owned) {
        // External runtimes survive failed connects, close/reconnect, and multi-instance reuse.
        // Register one by one because schema-dsl's batch API is not transactionally atomic.
        // Successful prefixes must be remembered even if a later extension still fails.
        patchExternalRuntimeLifecycle(runtime);
        const registrationKeys = createExtensionRegistrationKeys(extensions);
        let registeredKeys = externalRuntimeExtensionRegistrations.get(runtime);
        if (!registeredKeys) {
            registeredKeys = new Set<string>();
            externalRuntimeExtensionRegistrations.set(runtime, registeredKeys);
        }
        for (const [index, extension] of extensions.entries()) {
            const key = registrationKeys[index];
            if (!key || registeredKeys.has(key)) {
                continue;
            }
            runtime.registerExtensions([extension] as unknown as readonly [unknown, ...unknown[]]);
            registeredKeys.add(key);
        }
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
    try {
        registerRuntimeExtensions(resolved.runtime, extensions, resolved.owned);
    } catch (err) {
        if (resolved.owned) {
            try {
                resolved.runtime.dispose?.();
            } catch {
                // Preserve the original registration failure; cleanup is best effort here.
            }
        }
        throw err;
    }
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
