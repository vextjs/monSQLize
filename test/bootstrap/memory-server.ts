type MemoryServerOptions = {
    uri?: string;
    binaryVersion?: string;
    dbName?: string;
};

type MemoryServerContext = {
    uri: string;
    external: boolean;
};

type MemoryServerBootstrap = {
    setup(): Promise<MemoryServerContext>;
    teardown(): Promise<boolean>;
    getUri(): string | null;
};

let memoryServerPromise: Promise<any> | null = null;
let memoryServerInstance: any = null;

export function createMemoryServerBootstrap(options: MemoryServerOptions = {}): MemoryServerBootstrap {
    const externalUri = options.uri || process.env.MONSQLIZE_MEMORY_MONGO_URI;
    const binaryVersion = options.binaryVersion || process.env.MONSQLIZE_MEMORY_MONGO_BINARY_VERSION;

    async function ensureServer(): Promise<MemoryServerContext> {
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
                    ...(binaryVersion ? { binary: { version: binaryVersion } } : {}),
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
        async setup() {
            const { uri, external } = await ensureServer();
            return { uri, external };
        },
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
        getUri() {
            if (externalUri) {
                return externalUri;
            }
            return memoryServerInstance?.getUri() || null;
        },
    };
}