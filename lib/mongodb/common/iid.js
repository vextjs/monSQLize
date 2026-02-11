/**
 * Mongo 实例指纹（iid）生成
 * 基于 uri/db 生成稳定短标识，用于缓存命名空间等
 */
const crypto = require('crypto');

function genInstanceId(databaseName, uri, explicitId) {
    if (explicitId) return String(explicitId);
    const safeDb = String(databaseName || '');
    try {
        const u = new URL(String(uri || ''));
        const proto = (u.protocol || '').replace(':', '');
        const host = u.hostname || '';
        const port = u.port || (proto === 'mongodb+srv' ? 'srv' : '27017');
        const rs = u.searchParams.get('replicaSet') || '';
        const authSource = u.searchParams.get('authSource') || '';
        const tls = u.searchParams.get('tls') || u.searchParams.get('ssl') || '';
        const safe = `${proto}://${host}:${port}/${safeDb}?rs=${rs}&auth=${authSource}&tls=${tls}`;
        const h = crypto.createHash('sha1').update(safe).digest('base64url').slice(0, 12);
        return `mdb:${h}`;
    } catch (_) {
        const h = crypto.createHash('sha1').update(String(uri || '') + '|' + safeDb).digest('base64url').slice(0, 12);
        return `mdb:${h}`;
    }
}

module.exports = { genInstanceId };

