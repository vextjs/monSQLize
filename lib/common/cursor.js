/**
 * 通用游标工具（跨数据库）
 * - Base64URL(JSON) 进行编码/解码，最小结构：{ v, s, a, d? }
 * - 仅负责“字符串化与结构校验”；锚点提取与比较逻辑由适配器实现。
 */

/** @param {string} s @returns {string} Base64URL 字符串 */
function b64urlEncodeStr(s) {
    return Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @param {string} s @returns {string} 原始字符串 */
function b64urlDecodeStr(s) {
    const pad = (x) => x + '==='.slice((x.length + 3) % 4);
    const b64 = pad(String(s || '')).replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(b64, 'base64').toString();
}

/**
 * 编码游标
 * @param {{v?:number,s:object,a:object,d?:'after'|'before'}} payload
 * @returns {string} Base64URL 游标
 */
function encodeCursor({ v = 1, s, a, d }) {
    // 仅做最小校验
    if (!s || !a) throw new Error('encodeCursor requires sort (s) and anchor (a)');
    const payload = JSON.stringify({ v, s, a, d });
    return b64urlEncodeStr(payload);
}

function makeInvalidCursorError(cause) {
    const err = new Error('游标无效');
    err.code = 'INVALID_CURSOR';
    if (cause) err.cause = cause;
    return err;
}


/**
 * 解码游标（含最小结构校验）
 * @param {string} str
 * @throws INVALID_CURSOR
 * @returns {{v:number,s:object,a:object,d?:string}}
 */
function decodeCursor(str) {
    try {
        const obj = JSON.parse(b64urlDecodeStr(str));
        if (!obj || obj.v !== 1 || !obj.s || !obj.a) throw new Error('bad-structure');
        return obj;
    } catch (e) {
        throw makeInvalidCursorError(e);
    }
}

module.exports = {
    encodeCursor,
    decodeCursor,
};
