/**
 * SSH隧道管理器 - ssh2实现
 * 支持密码认证和私钥认证
 */

const { Client } = require('ssh2');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * 基于ssh2的SSH隧道管理器
 * 支持密码认证和私钥认证
 */
class SSHTunnelSSH2 {
    /**
     * @param {Object} sshConfig - SSH配置
     * @param {string} sshConfig.host - SSH服务器地址
     * @param {number} [sshConfig.port=22] - SSH端口
     * @param {string} sshConfig.username - SSH用户名
     * @param {string} [sshConfig.password] - SSH密码
     * @param {string} [sshConfig.privateKey] - 私钥内容
     * @param {string} [sshConfig.privateKeyPath] - 私钥路径
     * @param {string} [sshConfig.passphrase] - 私钥密码
     * @param {number} [sshConfig.localPort] - 本地监听端口（可选，默认随机）
     * @param {number} [sshConfig.readyTimeout=20000] - 连接超时（毫秒）
     * @param {number} [sshConfig.keepaliveInterval=30000] - 心跳间隔（毫秒）
     * @param {string} remoteHost - 远程主机（数据库服务器地址）
     * @param {number} remotePort - 远程端口（数据库端口）
     * @param {Object} options - 可选配置
     * @param {Object} options.logger - 日志记录器
     * @param {string} options.name - 隧道名称（用于日志）
     */
    constructor(sshConfig, remoteHost, remotePort, options = {}) {
        this.sshConfig = sshConfig;
        this.remoteHost = remoteHost;
        this.remotePort = remotePort;
        this.logger = options.logger;
        this.name = options.name || `${remoteHost}:${remotePort}`;

        this.sshClient = null;
        this.server = null;
        this.localPort = null;
        this.isConnected = false;
    }

    /**
     * 建立SSH隧道
     * @returns {Promise<number>} 本地监听端口
     */
    async connect() {
        if (this.isConnected) {
            this.logger?.warn?.(`SSH tunnel [${this.name}] already connected`);
            return this.localPort;
        }

        return new Promise((resolve, reject) => {
            this.sshClient = new Client();

            this.sshClient.on('ready', () => {
                this.logger?.info?.(`✅ SSH connection established [${this.name}]`);

                // 创建本地TCP服务器（端口转发）
                this.server = net.createServer((sock) => {
                    this.sshClient.forwardOut(
                        sock.remoteAddress,
                        sock.remotePort,
                        this.remoteHost,
                        this.remotePort,
                        (err, stream) => {
                            if (err) {
                                this.logger?.error?.(`SSH forward error [${this.name}]`, err);
                                return sock.end();
                            }
                            sock.pipe(stream).pipe(sock);
                        }
                    );
                });

                // 监听本地端口（0 = 随机端口）
                const port = this.sshConfig.localPort || 0;
                this.server.listen(port, 'localhost', () => {
                    this.localPort = this.server.address().port;
                    this.isConnected = true;

                    this.logger?.info?.(`✅ SSH tunnel ready [${this.name}]`, {
                        localPort: this.localPort,
                        remote: `${this.remoteHost}:${this.remotePort}`
                    });

                    resolve(this.localPort);
                });

                this.server.on('error', (err) => {
                    this.logger?.error?.(`Local server error [${this.name}]`, err);
                    reject(err);
                });
            });

            this.sshClient.on('error', (err) => {
                this.logger?.error?.(`SSH connection error [${this.name}]`, err);
                reject(err);
            });

            this.sshClient.on('end', () => {
                this.logger?.info?.(`SSH connection ended [${this.name}]`);
                this.isConnected = false;
            });

            // 构建认证配置并连接
            try {
                const authConfig = this._buildAuthConfig();
                this.sshClient.connect(authConfig);
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * 关闭SSH隧道
     */
    async close() {
        if (this.server) {
            this.server.close();
            this.server = null;
        }

        if (this.sshClient) {
            this.sshClient.end();
            this.sshClient = null;
        }

        this.isConnected = false;
        this.localPort = null;

        this.logger?.info?.(`✅ SSH tunnel closed [${this.name}]`);
    }

    /**
     * 获取隧道连接URI
     * @param {string} protocol - 数据库协议（mongodb/postgresql/mysql/redis）
     * @param {string} originalUri - 原始URI
     * @returns {string} 替换后的本地URI
     */
    getTunnelUri(protocol, originalUri) {
        if (!this.isConnected) {
            throw new Error(`SSH tunnel [${this.name}] not connected`);
        }

        // 替换主机:端口为 localhost:本地端口
        const pattern = new RegExp(`${protocol}://([^@]*@)?([^:/]+):(\\d+)`);
        const replacement = `${protocol}://$1localhost:${this.localPort}`;

        return originalUri.replace(pattern, replacement);
    }

    /**
     * 获取本地连接地址
     * @returns {string} localhost:端口
     */
    getLocalAddress() {
        if (!this.isConnected) {
            throw new Error(`SSH tunnel [${this.name}] not connected`);
        }
        return `localhost:${this.localPort}`;
    }

    /**
     * 构建SSH认证配置
     * @private
     */
    _buildAuthConfig() {
        const { host, port, username, password, privateKey, privateKeyPath, passphrase } = this.sshConfig;

        if (!host || !username) {
            throw new Error('SSH config requires: host, username');
        }

        const config = {
            host,
            port: port || 22,
            username,
            readyTimeout: this.sshConfig.readyTimeout || 20000,
            keepaliveInterval: this.sshConfig.keepaliveInterval || 30000,
        };

        // 优先使用私钥认证
        if (privateKey) {
            config.privateKey = privateKey;
            if (passphrase) config.passphrase = passphrase;
        } else if (privateKeyPath) {
            const resolvedPath = privateKeyPath.startsWith('~')
                ? path.join(os.homedir(), privateKeyPath.slice(1))
                : privateKeyPath;
            config.privateKey = fs.readFileSync(resolvedPath);
            if (passphrase) config.passphrase = passphrase;
        } else if (password) {
            // 密码认证
            config.password = password;
        } else {
            throw new Error('SSH authentication required: privateKey, privateKeyPath, or password');
        }

        return config;
    }
}

module.exports = { SSHTunnelSSH2 };


