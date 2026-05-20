/**
 * SSH tunnel capability — port-forward MongoDB connections through a bastion host.
 *
 * Reconstructed from v1 SSHTunnelSSH2 behaviour (v1 source was not preserved).
 * Uses the `ssh2` package (already a project dependency).
 */

import * as net from 'node:net';
import * as fs from 'node:fs';
import * as os from 'node:os';

// ssh2 ships no bundled types; import via require and cast to our minimal interface.
interface SshStream extends NodeJS.ReadWriteStream {
    close(): void;
}
interface SshClientLike {
    connect(config: object): void;
    forwardOut(
        srcHost: string,
        srcPort: number,
        dstHost: string,
        dstPort: number,
        cb: (err: Error | undefined, stream: SshStream) => void,
    ): void;
    end(): void;
    on(event: 'ready', handler: () => void): this;
    on(event: 'error', handler: (err: Error) => void): this;
}
interface SshClientConstructor {
    new(): SshClientLike;
}

// Loaded lazily inside connect() to avoid a top-level require() in the ESM bundle.
function loadSsh2Client(): SshClientConstructor {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('ssh2') as { Client: SshClientConstructor }).Client;
}

export interface SSHConfigInput {
    host: string;
    port?: number;
    username: string;
    password?: string;
    privateKey?: string | Buffer;
    /** Path to an SSH private key file (supports ~ for home directory). v1 compat. */
    privateKeyPath?: string;
    passphrase?: string;
    /** SSH handshake timeout in milliseconds (default: 30000). */
    readyTimeout?: number;
    /** Keep-alive interval in milliseconds (default: 10000). */
    keepaliveInterval?: number;
    /** Target remote host as seen from the SSH server (overrides URI auto-parse). */
    dstHost?: string;
    /** Target remote port as seen from the SSH server (overrides URI auto-parse). */
    dstPort?: number;
    /** Fixed local TCP port for the tunnel (default: OS-assigned random port). */
    localPort?: number;
}

interface SshAuthConfig {
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: string | Buffer;
    passphrase?: string;
    readyTimeout: number;
    keepaliveInterval: number;
}

export class SSHTunnelSSH2 {
    readonly remoteHost: string;
    readonly remotePort: number;
    readonly name: string;

    isConnected = false;
    localPort: number | null = null;
    sshClient: SshClientLike | null = null;
    server: net.Server | null = null;

    private readonly _sshConfig: SSHConfigInput;

    constructor(
        sshConfig: SSHConfigInput,
        remoteHost: string,
        remotePort: number,
        opts?: { name?: string },
    ) {
        this._sshConfig = sshConfig;
        this.remoteHost = remoteHost;
        this.remotePort = remotePort;
        this.name = opts?.name ?? 'MongoDB';
    }

    _buildAuthConfig(): SshAuthConfig {
        const {
            host,
            username,
            password,
            privateKey,
            privateKeyPath,
            passphrase,
            port = 22,
            readyTimeout = 20000,
            keepaliveInterval = 30000,
        } = this._sshConfig;

        if (!host || !username) {
            throw new Error('SSH config requires: host, username');
        }
        if (!password && !privateKey && !privateKeyPath) {
            throw new Error('SSH authentication required: provide password, privateKey, or privateKeyPath');
        }

        const config: SshAuthConfig = { host, port, username, readyTimeout, keepaliveInterval };

        if (password) {
            config.password = password;
        } else if (privateKey) {
            config.privateKey = privateKey;
            if (passphrase) config.passphrase = passphrase;
        } else {
            // privateKeyPath
            const keyPath = (privateKeyPath as string).replace(/^~/, os.homedir());
            config.privateKey = fs.readFileSync(keyPath);
            if (passphrase) config.passphrase = passphrase;
        }

        return config;
    }

    async connect(): Promise<void> {
        const authConfig = this._buildAuthConfig();
        const SshClient = loadSsh2Client();

        return new Promise<void>((resolve, reject) => {
            const ssh = new SshClient();
            let settled = false;

            const server = net.createServer((socket) => {
                ssh.forwardOut(
                    '127.0.0.1', 0,
                    this.remoteHost, this.remotePort,
                    (err, stream) => {
                        if (err) {
                            socket.destroy();
                            return;
                        }
                        socket.pipe(stream as unknown as NodeJS.WritableStream);
                        (stream as unknown as NodeJS.ReadableStream).pipe(socket);
                        stream.on('close', () => socket.destroy());
                        socket.on('close', () => { try { stream.close(); } catch { /* ignore */ } });
                    },
                );
            });

            server.on('error', (err) => {
                if (!settled) {
                    settled = true;
                    reject(err);
                }
            });

            server.listen(this._sshConfig.localPort ?? 0, '127.0.0.1', () => {
                this.server = server;
                const addr = server.address() as net.AddressInfo;
                this.localPort = addr.port;

                ssh.on('ready', () => {
                    if (!settled) {
                        settled = true;
                        this.sshClient = ssh;
                        this.isConnected = true;
                        resolve();
                    }
                });

                ssh.on('error', (err) => {
                    if (!settled) {
                        settled = true;
                        server.close();
                        reject(err);
                    }
                });

                ssh.connect(authConfig);
            });
        });
    }

    getTunnelUri(_protocol: string, originalUri: string): string {
        if (!this.isConnected || this.localPort === null) {
            throw new Error(`SSH tunnel [${this.remoteHost}:${this.remotePort}] not connected`);
        }
        return originalUri.replace(
            `${this.remoteHost}:${this.remotePort}`,
            `localhost:${this.localPort}`,
        );
    }

    getLocalAddress(): string {
        if (!this.isConnected || this.localPort === null) {
            throw new Error(`SSH tunnel [${this.remoteHost}:${this.remotePort}] not connected`);
        }
        return `localhost:${this.localPort}`;
    }

    async close(): Promise<void> {
        const server = this.server;
        const ssh = this.sshClient;

        this.isConnected = false;
        this.localPort = null;
        this.sshClient = null;
        this.server = null;

        await new Promise<void>((resolve) => {
            if (server) {
                server.close(() => resolve());
            } else {
                resolve();
            }
        });

        ssh?.end();
    }
}

/** Extract the first host from a MongoDB URI (handles user:pass@ prefix). */
export function parseHostFromUri(uri: string): string {
    const m = uri.match(/mongodb(?:\+srv)?:\/\/(?:[^@]+@)?([^/:?,[\]]+)/);
    return m?.[1] ?? 'localhost';
}

/** Extract the port from a MongoDB URI (defaults to 27017). */
export function parsePortFromUri(uri: string): number {
    const m = uri.match(/mongodb(?:\+srv)?:\/\/(?:[^@]+@)?[^/:?[\]]+:(\d+)/);
    return m ? parseInt(m[1], 10) : 27017;
}
