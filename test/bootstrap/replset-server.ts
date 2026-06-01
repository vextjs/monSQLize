import { ensureWebCryptoGlobal } from './webcrypto';

type ReplSetOptions = {
    uri?: string;
    binaryVersion?: string;
    dbName?: string;
};

type ReplSetContext = {
    uri: string;
    external: boolean;
};

type ReplSetBootstrap = {
    setup(): Promise<ReplSetContext>;
    teardown(): Promise<boolean>;
    getUri(): string | null;
};

let replSetPromise: Promise<any> | null = null;
let replSetInstance: any = null;

export function createReplSetBootstrap(options: ReplSetOptions = {}): ReplSetBootstrap {
    const externalUri = options.uri || process.env.MONSQLIZE_REPLSET_URI;
    const binaryVersion = options.binaryVersion || process.env.MONSQLIZE_REPLSET_BINARY_VERSION || process.env.MONSQLIZE_MEMORY_MONGO_BINARY_VERSION;

    async function ensureServer(): Promise<ReplSetContext> {
        if (externalUri) {
            return { uri: externalUri, external: true };
        }

        if (replSetInstance) {
            return { uri: replSetInstance.getUri(), external: false };
        }

        if (!replSetPromise) {
            replSetPromise = (async () => {
                ensureWebCryptoGlobal();
                const { MongoMemoryReplSet } = require('mongodb-memory-server');
                replSetInstance = await MongoMemoryReplSet.create({
                    ...(binaryVersion ? { binary: { version: binaryVersion } } : {}),
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
