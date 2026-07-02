const functionIdentifierPattern = /[A-Za-z_$][\w$]*/g;

export type FunctionScopeInfo = {
    start: number;
    end: number;
    bodyStart: number;
    bodyEnd: number;
    name?: string;
    kind: 'arrow' | 'function';
    boundIdentifiers: Set<string>;
};

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

export function addParameterIdentifiers(parameters: string, identifiers: Set<string>): void {
    for (const parameter of splitTopLevel(parameters, ',')) {
        addBindingIdentifiers(parameter, identifiers);
    }
}

function findMatchingParenStart(source: string, start: number): number {
    let depth = 0;
    for (let index = start; index >= 0; index -= 1) {
        const char = source[index];
        if (char === ')') {
            depth += 1;
        } else if (char === '(') {
            depth -= 1;
            if (depth === 0) {
                return index;
            }
        }
    }
    return -1;
}

function findArrowParameterStart(source: string, arrowIndex: number): number {
    let index = arrowIndex - 1;
    while (index >= 0 && /\s/.test(source[index])) {
        index -= 1;
    }
    if (source[index] === ')') {
        return findMatchingParenStart(source, index);
    }
    while (index >= 0 && isIdentifierPart(source[index])) {
        index -= 1;
    }
    const identifierStart = index + 1;
    const before = source.slice(0, identifierStart).trimEnd();
    if (before.endsWith('async')) {
        const asyncStart = before.length - 'async'.length;
        if (!isIdentifierPart(before[asyncStart - 1])) {
            return asyncStart;
        }
    }
    return identifierStart;
}

function findArrowExpressionEnd(source: string, start: number): number {
    let depth = 0;
    for (let index = start; index < source.length; index += 1) {
        const char = source[index];
        if (char === '{' || char === '[' || char === '(') {
            depth += 1;
        } else if (char === '}' || char === ']' || char === ')') {
            if (depth === 0) {
                return index - 1;
            }
            depth -= 1;
        } else if ((char === ';' || char === ',') && depth === 0) {
            return index - 1;
        }
    }
    return source.length - 1;
}

export function addScopedLocalIdentifiers(
    source: string,
    start: number,
    end: number,
    identifiers: Set<string>,
    excludedRanges: ReadonlyArray<{ start: number; end: number }>,
): void {
    const scopeSource = source.slice(start, end + 1);
    for (const match of scopeSource.matchAll(/\b(?:const|let|var)\s+([^;]+)/g)) {
        const matchIndex = start + (match.index ?? 0);
        if (isIndexInRanges(matchIndex, excludedRanges)) {
            continue;
        }
        for (const declaration of splitTopLevel(match[1], ',')) {
            addBindingIdentifiers(stripLocalDeclarationBinding(declaration), identifiers);
        }
    }
    for (const match of scopeSource.matchAll(/\bcatch\s*\(([^)]*)\)/g)) {
        const matchIndex = start + (match.index ?? 0);
        if (isIndexInRanges(matchIndex, excludedRanges)) {
            continue;
        }
        addBindingIdentifiers(match[1], identifiers);
    }
}

export function findParentFunctionScope(scope: FunctionScopeInfo, scopes: readonly FunctionScopeInfo[]): FunctionScopeInfo | null {
    let parent: FunctionScopeInfo | null = null;
    for (const candidate of scopes) {
        if (candidate === scope || candidate.start >= scope.start || candidate.end < scope.end) {
            continue;
        }
        if (!parent || (candidate.end - candidate.start) < (parent.end - parent.start)) {
            parent = candidate;
        }
    }
    return parent;
}

export function findNestedFunctionScopes(source: string, rootArrowIndex: number, rootFunctionIndex: number): FunctionScopeInfo[] {
    const scopes: FunctionScopeInfo[] = [];
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
            const header = source.slice(functionIndex, bodyStart);
            const functionMatch = /function(?:\s+([A-Za-z_$][\w$]*))?\s*\(([^)]*)\)/.exec(header);
            const boundIdentifiers = new Set<string>();
            if (functionMatch?.[1]) {
                boundIdentifiers.add(functionMatch[1]);
            }
            addParameterIdentifiers(functionMatch?.[2] ?? '', boundIdentifiers);
            scopes.push({
                start: functionIndex,
                end: bodyEnd,
                bodyStart,
                bodyEnd,
                name: functionMatch?.[1],
                kind: 'function',
                boundIdentifiers,
            });
        }
    }

    for (const match of source.matchAll(/=>/g)) {
        const arrowIndex = match.index ?? 0;
        if (arrowIndex === rootArrowIndex) {
            continue;
        }
        const paramsStart = findArrowParameterStart(source, arrowIndex);
        if (paramsStart < 0) {
            continue;
        }
        let bodyStart = arrowIndex + 2;
        while (bodyStart < source.length && /\s/.test(source[bodyStart])) {
            bodyStart += 1;
        }
        const bodyEnd = source[bodyStart] === '{'
            ? findMatchingBrace(source, bodyStart)
            : findArrowExpressionEnd(source, bodyStart);
        if (bodyEnd > bodyStart) {
            let params = source.slice(paramsStart, arrowIndex).trim().replace(/^async\s+/, '').trim();
            if (params.startsWith('(')) {
                params = params.slice(1, params.lastIndexOf(')'));
            }
            const boundIdentifiers = new Set<string>();
            addParameterIdentifiers(params, boundIdentifiers);
            scopes.push({
                start: paramsStart,
                end: bodyEnd,
                bodyStart,
                bodyEnd,
                kind: 'arrow',
                boundIdentifiers,
            });
        }
    }
    scopes.sort((left, right) => left.start - right.start || right.end - left.end);

    for (const scope of scopes) {
        const childScopes = scopes.filter((candidate) => candidate !== scope && candidate.start > scope.start && candidate.end <= scope.end);
        addScopedLocalIdentifiers(source, scope.bodyStart, scope.bodyEnd, scope.boundIdentifiers, childScopes);
        for (const childScope of childScopes) {
            if (childScope.kind !== 'function' || !childScope.name) {
                continue;
            }
            const parent = findParentFunctionScope(childScope, scopes);
            if (parent === scope) {
                scope.boundIdentifiers.add(childScope.name);
            }
        }
    }

    return scopes;
}

export function isBoundByNestedFunctionScope(identifier: string, index: number, scopes: readonly FunctionScopeInfo[]): boolean {
    return scopes.some((scope) => index >= scope.start && index <= scope.end && scope.boundIdentifiers.has(identifier));
}
