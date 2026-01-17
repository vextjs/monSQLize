/**
 * SyncConfig 单元测试
 *
 * 测试同步配置验证功能
 */

const { expect } = require('chai');
const {
    validateSyncConfig,
    validateTargetConfig,
    validateResumeTokenConfig
} = require('../../../lib/sync/SyncConfig');

describe('SyncConfig 配置验证', () => {

    describe('validateSyncConfig()', () => {

        it('应该验证通过：完整配置', () => {
            const config = {
                enabled: true,
                targets: [
                    {
                        name: 'backup-main',
                        uri: 'mongodb://localhost:27017/backup',
                        collections: ['users', 'orders']
                    }
                ],
                resumeToken: {
                    storage: 'file',
                    path: './.sync-resume-token'
                }
            };

            expect(() => validateSyncConfig(config)).to.not.throw();
        });

        it('应该验证通过：未启用', () => {
            const config = {
                enabled: false
            };

            expect(() => validateSyncConfig(config)).to.not.throw();
        });

        it('应该抛出错误：config 不是对象', () => {
            expect(() => validateSyncConfig(null)).to.throw('[Sync] 配置必须是对象');
            expect(() => validateSyncConfig('string')).to.throw('[Sync] 配置必须是对象');
        });

        it('应该抛出错误：enabled 不是 boolean', () => {
            const config = {
                enabled: 'true',
                targets: []
            };

            expect(() => validateSyncConfig(config)).to.throw('[Sync] enabled 必须是 boolean 类型');
        });

        it('应该抛出错误：targets 为空', () => {
            const config = {
                enabled: true,
                targets: []
            };

            expect(() => validateSyncConfig(config)).to.throw('[Sync] targets 必须是非空数组');
        });

        it('应该抛出错误：targets 不是数组', () => {
            const config = {
                enabled: true,
                targets: 'not-array'
            };

            expect(() => validateSyncConfig(config)).to.throw('[Sync] targets 必须是非空数组');
        });

        it('应该抛出错误：filter 不是函数', () => {
            const config = {
                enabled: true,
                targets: [
                    { name: 'backup', uri: 'mongodb://localhost:27017/backup' }
                ],
                filter: 'not-function'
            };

            expect(() => validateSyncConfig(config)).to.throw('[Sync] filter 必须是函数');
        });

        it('应该抛出错误：transform 不是函数', () => {
            const config = {
                enabled: true,
                targets: [
                    { name: 'backup', uri: 'mongodb://localhost:27017/backup' }
                ],
                transform: 'not-function'
            };

            expect(() => validateSyncConfig(config)).to.throw('[Sync] transform 必须是函数');
        });
    });

    describe('validateTargetConfig()', () => {

        it('应该验证通过：完整 target', () => {
            const target = {
                name: 'backup-main',
                uri: 'mongodb://localhost:27017/backup',
                collections: ['users', 'orders']
            };

            expect(() => validateTargetConfig(target, 0)).to.not.throw();
        });

        it('应该验证通过：无 collections', () => {
            const target = {
                name: 'backup-main',
                uri: 'mongodb://localhost:27017/backup'
            };

            expect(() => validateTargetConfig(target, 0)).to.not.throw();
        });

        it('应该抛出错误：target 不是对象', () => {
            expect(() => validateTargetConfig(null, 0)).to.throw('targets[0] 必须是对象');
        });

        it('应该抛出错误：缺少 name', () => {
            const target = {
                uri: 'mongodb://localhost:27017/backup'
            };

            expect(() => validateTargetConfig(target, 0)).to.throw('targets[0].name 必须是非空字符串');
        });

        it('应该抛出错误：缺少 uri', () => {
            const target = {
                name: 'backup-main'
            };

            expect(() => validateTargetConfig(target, 0)).to.throw('targets[0].uri 必须是非空字符串');
        });

        it('应该抛出错误：collections 不是数组', () => {
            const target = {
                name: 'backup-main',
                uri: 'mongodb://localhost:27017/backup',
                collections: 'users'
            };

            expect(() => validateTargetConfig(target, 0)).to.throw('targets[0].collections 必须是数组');
        });

        it('应该抛出错误：collections 为空数组', () => {
            const target = {
                name: 'backup-main',
                uri: 'mongodb://localhost:27017/backup',
                collections: []
            };

            expect(() => validateTargetConfig(target, 0)).to.throw('targets[0].collections 不能为空数组');
        });
    });

    describe('validateResumeTokenConfig()', () => {

        it('应该验证通过：文件模式', () => {
            const config = {
                storage: 'file',
                path: './.sync-resume-token'
            };

            expect(() => validateResumeTokenConfig(config)).to.not.throw();
        });

        it('应该验证通过：Redis 模式', () => {
            const config = {
                storage: 'redis',
                redis: {}
            };

            expect(() => validateResumeTokenConfig(config)).to.not.throw();
        });

        it('应该抛出错误：config 不是对象', () => {
            expect(() => validateResumeTokenConfig(null)).to.throw('[Sync] resumeToken 必须是对象');
        });

        it('应该抛出错误：storage 无效', () => {
            const config = {
                storage: 'invalid'
            };

            expect(() => validateResumeTokenConfig(config)).to.throw('resumeToken.storage 必须是 file 或 redis');
        });

        it('应该抛出错误：path 不是字符串', () => {
            const config = {
                storage: 'file',
                path: 123
            };

            expect(() => validateResumeTokenConfig(config)).to.throw('[Sync] resumeToken.path 必须是字符串');
        });

        it('应该抛出错误：redis 不是对象', () => {
            const config = {
                storage: 'redis',
                redis: 'not-object'
            };

            expect(() => validateResumeTokenConfig(config)).to.throw('[Sync] resumeToken.redis 必须是对象');
        });
    });
});

