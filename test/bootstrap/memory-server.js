/**
 * P2-A Memory Server bootstrap。
 *
 * 说明：
 * - 默认优先使用 `mongodb-memory-server` 启动真实内存 MongoDB。
 * - 若显式提供 `options.uri` / `MONSQLIZE_MEMORY_MONGO_URI`，则直接复用外部 URI。
 */

let memoryServerPromise = null;
let memoryServerInstance = null;

function createMemoryServerBootstrap(options = {}) {
    const externalUri = options.uri || process.env.MONSQLIZE_MEMORY_MONGO_URI;

    async function ensureServer() {
        if (externalUri) {
            return { uri: externalUri, external: true };
        }

        if (memoryServerInstance) {
            return { uri: memoryServerInstance.getUri(), external: false };
        }

        if (!memoryServerPromise) {
            memoryServerPromise = (async () => {
                const { MongoMemoryServer } = require('mongodb-memory-server');
                memoryServerInstance = await MongoMemoryServer.create({
                    instance: {
                        dbName: options.dbName || 'monsqlize_p2a',
                    },
                });
                return memoryServerInstance;
            })();
        }

        const server = await memoryServerPromise;
        return { uri: server.getUri(), external: false };
    }

    return {
        /**
         * 准备测试环境。
         * @since v1.3.0
         */
        async setup() {
            const { uri, external } = await ensureServer();
            return { uri, external };
        },

        /**
         * 清理测试环境。
         * @since v1.3.0
         */
        async teardown() {
            if (externalUri) {
                return true;
            }

            if (memoryServerInstance) {
                await memoryServerInstance.stop();
                memoryServerInstance = null;
            }
            memoryServerPromise = null;
            return true;
        },

        /**
         * 获取当前 bootstrap 使用的连接串。
         * @since v1.3.0
         */
        getUri() {
            if (externalUri) {
                return externalUri;
            }
            return memoryServerInstance?.getUri() || null;
        },
    };
}

module.exports = {
    createMemoryServerBootstrap,
};

