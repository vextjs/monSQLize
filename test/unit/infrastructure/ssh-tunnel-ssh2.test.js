/**
 * SSH隧道ssh2实现单元测试
 */

const { SSHTunnelSSH2 } = require('../../../lib/infrastructure/ssh-tunnel-ssh2');
const { expect } = require('chai');

describe('SSHTunnelSSH2 (单元测试)', () => {
    describe('构造函数', () => {
        it('应该正确创建SSH隧道实例', () => {
            const ssh = new SSHTunnelSSH2(
                { host: 'bastion.example.com', username: 'user', password: 'pass' },
                'mongo.internal',
                27017,
                { name: 'Test' }
            );

            expect(ssh).to.be.instanceOf(SSHTunnelSSH2);
            expect(ssh.name).to.equal('Test');
            expect(ssh.remoteHost).to.equal('mongo.internal');
            expect(ssh.remotePort).to.equal(27017);
            expect(ssh.isConnected).to.be.false;
        });
    });

    describe('_buildAuthConfig', () => {
        it('应该支持密码认证', () => {
            const ssh = new SSHTunnelSSH2(
                { host: 'bastion.example.com', username: 'user', password: 'testpass' },
                'mongo.internal',
                27017
            );

            const config = ssh._buildAuthConfig();

            expect(config.host).to.equal('bastion.example.com');
            expect(config.username).to.equal('user');
            expect(config.password).to.equal('testpass');
            expect(config.port).to.equal(22);
        });

        it('应该支持私钥认证', () => {
            const ssh = new SSHTunnelSSH2(
                { host: 'bastion.example.com', username: 'user', privateKey: 'fake-key-content' },
                'mongo.internal',
                27017
            );

            const config = ssh._buildAuthConfig();

            expect(config.host).to.equal('bastion.example.com');
            expect(config.username).to.equal('user');
            expect(config.privateKey).to.equal('fake-key-content');
        });

        it('应该支持自定义SSH端口', () => {
            const ssh = new SSHTunnelSSH2(
                { host: 'bastion.example.com', port: 2222, username: 'user', password: 'pass' },
                'mongo.internal',
                27017
            );

            const config = ssh._buildAuthConfig();
            expect(config.port).to.equal(2222);
        });

        it('应该在缺少认证信息时抛出错误', () => {
            const ssh = new SSHTunnelSSH2(
                { host: 'bastion.example.com', username: 'user' },
                'mongo.internal',
                27017
            );

            expect(() => ssh._buildAuthConfig()).to.throw('SSH authentication required');
        });

        it('应该在缺少host时抛出错误', () => {
            const ssh = new SSHTunnelSSH2(
                { username: 'user', password: 'pass' },
                'mongo.internal',
                27017
            );

            expect(() => ssh._buildAuthConfig()).to.throw('SSH config requires: host, username');
        });
    });

    describe('getTunnelUri', () => {
        it('应该正确替换MongoDB URI', () => {
            const ssh = new SSHTunnelSSH2(
                { host: 'bastion', username: 'user', password: 'pass' },
                'mongo.internal',
                27017
            );

            ssh.isConnected = true;
            ssh.localPort = 27018;

            const originalUri = 'mongodb://mongo.internal:27017/mydb';
            const tunnelUri = ssh.getTunnelUri('mongodb', originalUri);

            expect(tunnelUri).to.equal('mongodb://localhost:27018/mydb');
        });

        it('应该正确替换带认证的MongoDB URI', () => {
            const ssh = new SSHTunnelSSH2(
                { host: 'bastion', username: 'user', password: 'pass' },
                'mongo.internal',
                27017
            );

            ssh.isConnected = true;
            ssh.localPort = 27018;

            const originalUri = 'mongodb://user:pass@mongo.internal:27017/mydb';
            const tunnelUri = ssh.getTunnelUri('mongodb', originalUri);

            expect(tunnelUri).to.equal('mongodb://user:pass@localhost:27018/mydb');
        });

        it('应该在未连接时抛出错误', () => {
            const ssh = new SSHTunnelSSH2(
                { host: 'bastion', username: 'user', password: 'pass' },
                'mongo.internal',
                27017
            );

            ssh.isConnected = false;

            expect(() => ssh.getTunnelUri('mongodb', 'mongodb://mongo.internal:27017/mydb'))
                .to.throw('SSH tunnel [mongo.internal:27017] not connected');
        });
    });

    describe('getLocalAddress', () => {
        it('应该返回正确的本地地址', () => {
            const ssh = new SSHTunnelSSH2(
                { host: 'bastion', username: 'user', password: 'pass' },
                'mongo.internal',
                27017
            );

            ssh.isConnected = true;
            ssh.localPort = 27018;

            const address = ssh.getLocalAddress();
            expect(address).to.equal('localhost:27018');
        });

        it('应该在未连接时抛出错误', () => {
            const ssh = new SSHTunnelSSH2(
                { host: 'bastion', username: 'user', password: 'pass' },
                'mongo.internal',
                27017
            );

            ssh.isConnected = false;

            expect(() => ssh.getLocalAddress())
                .to.throw('SSH tunnel [mongo.internal:27017] not connected');
        });
    });

    describe('close', () => {
        it('应该清理状态', async () => {
            const ssh = new SSHTunnelSSH2(
                { host: 'bastion', username: 'user', password: 'pass' },
                'mongo.internal',
                27017
            );

            ssh.isConnected = true;
            ssh.localPort = 27018;
            ssh.sshClient = { end: () => {} };
            ssh.server = { close: () => {} };

            await ssh.close();

            expect(ssh.isConnected).to.be.false;
            expect(ssh.localPort).to.be.null;
            expect(ssh.sshClient).to.be.null;
            expect(ssh.server).to.be.null;
        });
    });
});

