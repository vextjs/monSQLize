/**
 * SSH隧道管理器 - 统一入口
 * 使用ssh2库实现，支持密码认证和私钥认证
 */

const { SSHTunnelSSH2 } = require('./ssh-tunnel-ssh2');

/**
 * SSH隧道管理器
 * 直接使用ssh2实现
 */
class SSHTunnelManager {
    /**
     * 创建SSH隧道实例
     * @param {Object} sshConfig - SSH配置
     * @param {string} remoteHost - 远程主机
     * @param {number} remotePort - 远程端口
     * @param {Object} options - 可选配置
     * @returns {Object} SSH隧道实例
     */
    static create(sshConfig, remoteHost, remotePort, options = {}) {
        return new SSHTunnelSSH2(sshConfig, remoteHost, remotePort, options);
    }

    /**
     * 获取当前实现信息
     * @returns {Object}
     */
    static getInfo() {
        return {
            implementation: 'ssh2',
            supportsPassword: true,
            supportsPrivateKey: true,
            dependencies: ['ssh2']
        };
    }
}

module.exports = { SSHTunnelManager };


