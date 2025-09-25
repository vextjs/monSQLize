/**
 * 命名空间实例 id（iid）解析流程（通用）
 * 适配器需提供 genInstanceId(databaseName, uri, explicitId?) 实现。
 */

/**
 * @param {{ genInstanceId: (db:string, uri?:string, explicitId?:string)=>string }} adapter
 * @param {object} defaults
 * @param {string} currentDb
 * @param {string} initialDb
 * @param {string} uri
 */
function resolveInstanceId(adapter, defaults, currentDb, initialDb, uri) {
    const explicit = defaults?.namespace?.instanceId;
    if (explicit) return String(explicit);
    const scope = defaults?.namespace?.scope; // 'database'|'connection'
    const dbName = scope === 'connection' ? initialDb : (currentDb || initialDb);
    return adapter.genInstanceId(dbName, uri);
}

module.exports = { resolveInstanceId };
