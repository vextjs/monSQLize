/**
 * Mongo 去敏形状构造
 * - shapeQuery: 仅输出字段名与运算符（以 '$' 代表），不含具体值
 * - shapeProjection: 将数组投影转为字段名数组，或对象投影的键名数组
 * - shapeSort: 仅输出排序键与 1/-1
 */

function shapeQuery(input, maxKeys = 30, maxDepth = 3) {
    const walk = (v, depth) => {
        if (depth > maxDepth || v == null || typeof v !== 'object') return true; // 值用 true 表示
        if (Array.isArray(v)) return v.length ? [walk(v[0], depth + 1)] : [];
        const out = {};
        let count = 0;
        for (const k of Object.keys(v)) {
            out[k] = k.startsWith('$') ? '$' : walk(v[k], depth + 1);
            if (++count >= maxKeys) { out.__truncated__ = true; break; }
        }
        return out;
    };
    return walk(input, 0);
}

function shapeProjection(p) {
    return Array.isArray(p) ? p.slice(0, 30) : Object.keys(p || {}).slice(0, 30);
}

function shapeSort(s) {
    return Object.fromEntries(Object.entries(s || {}).slice(0, 30).map(([k, v]) => [k, v === -1 ? -1 : 1]));
}

module.exports = { shapeQuery, shapeProjection, shapeSort };

