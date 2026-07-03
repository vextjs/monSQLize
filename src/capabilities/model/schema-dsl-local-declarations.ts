const localDeclarationBoundaryWords = new Set([
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'do',
    'else',
    'finally',
    'for',
    'function',
    'if',
    'let',
    'return',
    'switch',
    'throw',
    'try',
    'var',
    'while',
    'with',
]);

function isIdentifierPart(char: string | undefined): boolean {
    return char !== undefined && /[A-Za-z_$\d]/.test(char);
}

function nextNonWhitespaceIndex(source: string, start: number): number {
    for (let index = start; index < source.length; index += 1) {
        if (!/\s/.test(source[index])) {
            return index;
        }
    }
    return -1;
}

function previousNonWhitespaceIndex(source: string, start: number): number {
    for (let index = start; index >= 0; index -= 1) {
        if (!/\s/.test(source[index])) {
            return index;
        }
    }
    return -1;
}

function readIdentifierAt(source: string, start: number): string | null {
    if (!/[A-Za-z_$]/.test(source[start] ?? '')) {
        return null;
    }
    let end = start + 1;
    while (end < source.length && isIdentifierPart(source[end])) {
        end += 1;
    }
    return source.slice(start, end);
}

function currentDeclaratorHasInitializer(source: string, start: number, end: number): boolean {
    let depth = 0;
    let segmentStart = start;
    for (let index = start; index < end; index += 1) {
        const char = source[index];
        if (char === '{' || char === '[' || char === '(') {
            depth += 1;
        } else if (char === '}' || char === ']' || char === ')') {
            depth = Math.max(0, depth - 1);
        } else if (char === ',' && depth === 0) {
            segmentStart = index + 1;
        }
    }

    depth = 0;
    for (let index = segmentStart; index < end; index += 1) {
        const char = source[index];
        if (char === '{' || char === '[' || char === '(') {
            depth += 1;
        } else if (char === '}' || char === ']' || char === ')') {
            depth = Math.max(0, depth - 1);
        } else if (char === '=' && depth === 0) {
            return true;
        }
    }
    return false;
}

function shouldEndLocalDeclarationAtLineBreak(source: string, start: number, index: number): boolean {
    const next = nextNonWhitespaceIndex(source, index + 1);
    if (next < 0) {
        return true;
    }
    const previous = previousNonWhitespaceIndex(source, index - 1);
    if (source[next] === ',' || source[previous] === ',') {
        return false;
    }
    if (!currentDeclaratorHasInitializer(source, start, index)) {
        return true;
    }
    const nextIdentifier = readIdentifierAt(source, next);
    if (nextIdentifier === null) {
        return false;
    }
    const afterIdentifier = nextNonWhitespaceIndex(source, next + nextIdentifier.length);
    if (source[afterIdentifier] === ':') {
        return true;
    }
    return localDeclarationBoundaryWords.has(nextIdentifier);
}

export function findLocalDeclarationEnd(source: string, start: number): number {
    let depth = 0;
    for (let index = start; index < source.length; index += 1) {
        const char = source[index];
        if (char === '{' || char === '[' || char === '(') {
            depth += 1;
        } else if (char === '}' || char === ']' || char === ')') {
            depth = Math.max(0, depth - 1);
        } else if (char === ';' && depth === 0) {
            return index;
        } else if ((char === '\n' || char === '\r') && depth === 0 && shouldEndLocalDeclarationAtLineBreak(source, start, index)) {
            return index;
        }
    }
    return source.length;
}
