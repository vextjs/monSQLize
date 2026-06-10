import { ensureWebCryptoGlobal } from './webcrypto';
import {
    configureMemoryServerEnv,
    createMemoryServerDbPath,
    memoryServerCleanupOptions,
    resolveMemoryServerBinaryVersion,
    resolveMemoryServerLaunchTimeoutMs,
    seedMemoryServerBinaryCache,
} from './memory-server-policy';

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
    const binaryVersion = resolveMemoryServerBinaryVersion(options.binaryVersion);

    async function ensureServer(): Promise<MemoryServerContext> {
        if (externalUri) {
            return { uri: externalUri, external: true };
        }

        if (memoryServerInstance) {
            return { uri: memoryServerInstance.getUri(), external: false };
        }

        if (!memoryServerPromise) {
            memoryServerPromise = (async () => {
                ensureWebCryptoGlobal();
                configureMemoryServerEnv(binaryVersion);
                await seedMemoryServerBinaryCache(binaryVersion);
                const { MongoMemoryServer } = require('mongodb-memory-server');
                const dbName = options.dbName || 'monsqlize_p2a';
                const launchTimeout = resolveMemoryServerLaunchTimeoutMs();
                memoryServerInstance = await MongoMemoryServer.create({
                    binary: { version: binaryVersion },
                    instance: {
                        dbName,
                        dbPath: createMemoryServerDbPath('single', dbName),
                        ...(launchTimeout ? { launchTimeout } : {}),
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
                await memoryServerInstance.stop(memoryServerCleanupOptions());
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
