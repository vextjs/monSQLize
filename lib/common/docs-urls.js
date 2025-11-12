/**
 * 文档 URL 配置
 * 统一管理所有文档链接
 */

// GitHub 仓库基础 URL
const REPO_BASE_URL = 'https://github.com/vextjs/monSQLize';

// 文档基础 URL
const DOCS_BASE_URL = `${REPO_BASE_URL}/blob/main/docs`;

/**
 * 文档 URL 映射
 */
const DOCS_URLS = {
    // 链式调用 API 文档
    chainingAPI: `${DOCS_BASE_URL}/chaining-api.md`,
    chainingMethods: `${DOCS_BASE_URL}/chaining-methods.md`,

    // 具体方法文档锚点
    'chaining.limit': `${DOCS_BASE_URL}/chaining-api.md#limit`,
    'chaining.skip': `${DOCS_BASE_URL}/chaining-api.md#skip`,
    'chaining.sort': `${DOCS_BASE_URL}/chaining-api.md#sort`,
    'chaining.project': `${DOCS_BASE_URL}/chaining-api.md#project`,
    'chaining.hint': `${DOCS_BASE_URL}/chaining-api.md#hint`,
    'chaining.collation': `${DOCS_BASE_URL}/chaining-api.md#collation`,
    'chaining.comment': `${DOCS_BASE_URL}/chaining-api.md#comment`,
    'chaining.maxTimeMS': `${DOCS_BASE_URL}/chaining-api.md#maxtimems`,
    'chaining.batchSize': `${DOCS_BASE_URL}/chaining-api.md#batchsize`,
    'chaining.explain': `${DOCS_BASE_URL}/chaining-api.md#explain`,
    'chaining.stream': `${DOCS_BASE_URL}/chaining-api.md#stream`,
    'chaining.toArray': `${DOCS_BASE_URL}/chaining-api.md#toarray`,
    'chaining.allowDiskUse': `${DOCS_BASE_URL}/chaining-api.md#allowdiskuse`,

    // find 方法文档
    find: `${DOCS_BASE_URL}/find.md`,

    // aggregate 方法文档
    aggregate: `${REPO_BASE_URL}/blob/main/README.md#aggregate`,

    // 错误处理
    errors: `${REPO_BASE_URL}/blob/main/README.md#error-handling`,
};

/**
 * 获取文档 URL
 * @param {string} key - 文档键
 * @returns {string} 文档 URL
 */
function getDocUrl(key) {
    return DOCS_URLS[key] || DOCS_URLS.chainingAPI;
}

/**
 * 生成带文档链接的错误消息
 * @param {string} message - 错误消息
 * @param {string} docKey - 文档键
 * @returns {string} 完整的错误消息
 */
function createErrorMessage(message, docKey) {
    const docUrl = getDocUrl(docKey);
    return `${message}\nSee: ${docUrl}`;
}

module.exports = {
    REPO_BASE_URL,
    DOCS_BASE_URL,
    DOCS_URLS,
    getDocUrl,
    createErrorMessage
};

