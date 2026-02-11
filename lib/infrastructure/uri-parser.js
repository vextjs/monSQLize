/**
 * 通用URI解析器
 * 支持：mongodb://、postgresql://、mysql://、redis://
 */

/**
 * 解析数据库连接URI
 * @param {string} uri - 数据库连接URI
 * @returns {{protocol: string, auth: string|null, host: string, port: number}} 解析结果
 */
function parseUri(uri) {
    const patterns = {
        mongodb: /mongodb:\/\/([^@]*@)?([^:/]+):(\d+)/,
        postgresql: /postgresql:\/\/([^@]*@)?([^:/]+):(\d+)/,
        mysql: /mysql:\/\/([^@]*@)?([^:/]+):(\d+)/,
        redis: /redis:\/\/([^@]*@)?([^:/]+):(\d+)/
    };

    for (const [protocol, pattern] of Object.entries(patterns)) {
        const match = uri.match(pattern);
        if (match) {
            return {
                protocol,
                auth: match[1] ? match[1].slice(0, -1) : null,  // 去掉末尾的@
                host: match[2],
                port: parseInt(match[3], 10)
            };
        }
    }

    throw new Error(`Unsupported URI format: ${uri}`);
}

module.exports = { parseUri };


