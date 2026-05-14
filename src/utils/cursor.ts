/**
 * v1-compatible cursor utilities (public API).
 *
 * Signature matches monSQLize-v1/lib/common/cursor.js exactly so that the
 * v1 compatibility runner can redirect `require('.../lib/common/cursor')` to
 * the compiled TS output and tests pass unmodified.
 *
 * Internal pagination cursors used by findPage() live in
 * `adapters/mongodb/queries/index.ts` under different names and are NOT
 * exported from the public API.
 */

function b64urlEncodeStr(s: string): string {
    return Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecodeStr(s: string): string {
    const pad = (x: string): string => x + '==='.slice((x.length + 3) % 4);
    const b64 = pad(String(s || '')).replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(b64, 'base64').toString();
}

function makeInvalidCursorError(cause?: unknown): Error {
    const err = new Error('游标无效') as Error & { code: string; cause?: unknown };
    err.code = 'INVALID_CURSOR';
    if (cause !== undefined) err.cause = cause;
    return err;
}

/** @internal v1-compatible cursor payload shape used by encodeCursor/decodeCursor */
export interface CursorPayloadV1 {
    v: number;
    s: object;
    a: object;
    d?: string;
}

/**
 * Encode a v1-style cursor.
 * @param payload.v - Cursor version (defaults to 1)
 * @param payload.s - Sort specification object
 * @param payload.a - Anchor document (the boundary row's field values)
 * @param payload.d - Optional direction ('after' | 'before')
 */
export function encodeCursor(payload: { v?: number; s: object; a: object; d?: string }): string {
    if (!payload.s || !payload.a) {
        throw new Error('encodeCursor requires sort (s) and anchor (a)');
    }
    const json = JSON.stringify({ v: payload.v ?? 1, s: payload.s, a: payload.a, d: payload.d });
    return b64urlEncodeStr(json);
}

/**
 * Decode a v1-style cursor string.
 * @throws Error with code 'INVALID_CURSOR' if the string is invalid
 */
export function decodeCursor(str: string): CursorPayloadV1 {
    try {
        const obj = JSON.parse(b64urlDecodeStr(str)) as Record<string, unknown>;
        if (!obj || obj['v'] !== 1 || !obj['s'] || !obj['a']) {
            throw new Error('bad-structure');
        }
        return obj as unknown as CursorPayloadV1;
    } catch (e) {
        throw makeInvalidCursorError(e);
    }
}
