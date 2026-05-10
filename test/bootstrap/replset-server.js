let replSetPromise = null;
let replSetInstance = null;

function createReplSetBootstrap(options = {}) {
    const externalUri = options.uri || process.env.MONSQLIZE_REPLSET_URI;

    async function ensureServer() {
        if (externalUri) {
            return { uri: externalUri, external: true };
        }

        if (replSetInstance) {
            return { uri: replSetInstance.getUri(), external: false };
        }

        if (!replSetPromise) {
            replSetPromise = (async () => {
                const { MongoMemoryReplSet } = require('mongodb-memory-server');
                replSetInstance = await MongoMemoryReplSet.create({
                    replSet: {
                        count: 1,
                        dbName: options.dbName || 'monsqlize_p4a',
                    },
                });
                return replSetInstance;
            })();
        }

        const replSet = await replSetPromise;
        return { uri: replSet.getUri(), external: false };
    }

    return {
        async setup() {
            const { uri, external } = await ensureServer();
            return { uri, external };
        },
        async teardown() {
            if (externalUri) {
                return true;
            }
            if (replSetInstance) {
                await replSetInstance.stop();
                replSetInstance = null;
            }
            replSetPromise = null;
            return true;
        },
        getUri() {
            if (externalUri) {
                return externalUri;
            }
            return replSetInstance?.getUri() || null;
        },
    };
}

module.exports = {
    createReplSetBootstrap,
};

