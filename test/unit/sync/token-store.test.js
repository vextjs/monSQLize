/**
 * ResumeTokenStore 单元测试
 *
 * 测试 Resume Token 持久化功能
 */

const { expect } = require('chai');
const fs = require('fs').promises;
const path = require('path');
const ResumeTokenStore = require('../../../lib/sync/ResumeTokenStore');

describe('ResumeTokenStore Resume Token 存储', () => {

    const testTokenPath = path.join(__dirname, '.test-resume-token');
    const testToken = { _data: 'test-token-data', timestamp: Date.now() };

    afterEach(async () => {
        // 清理测试文件
        try {
            await fs.unlink(testTokenPath);
        } catch (error) {
            // 忽略文件不存在错误
        }
    });

    describe('文件存储模式', () => {

        it('应该保存 Token 到文件', async () => {
            const store = new ResumeTokenStore({
                storage: 'file',
                path: testTokenPath
            });

            await store.save(testToken);

            // 验证文件存在
            const fileContent = await fs.readFile(testTokenPath, 'utf8');
            const savedToken = JSON.parse(fileContent);

            expect(savedToken).to.deep.equal(testToken);
        });

        it('应该从文件加载 Token', async () => {
            const store = new ResumeTokenStore({
                storage: 'file',
                path: testTokenPath
            });

            // 先保存
            await store.save(testToken);

            // 再加载
            const loadedToken = await store.load();

            expect(loadedToken).to.deep.equal(testToken);
        });

        it('应该返回 null：文件不存在', async () => {
            const store = new ResumeTokenStore({
                storage: 'file',
                path: testTokenPath + '-not-exist'
            });

            const loadedToken = await store.load();

            expect(loadedToken).to.be.null;
        });

        it('应该清除 Token 文件', async () => {
            const store = new ResumeTokenStore({
                storage: 'file',
                path: testTokenPath
            });

            // 先保存
            await store.save(testToken);

            // 验证文件存在
            let exists = true;
            try {
                await fs.access(testTokenPath);
            } catch (error) {
                exists = false;
            }
            expect(exists).to.be.true;

            // 清除
            await store.clear();

            // 验证文件已删除
            exists = true;
            try {
                await fs.access(testTokenPath);
            } catch (error) {
                exists = false;
            }
            expect(exists).to.be.false;
        });

        it('应该创建目录：目录不存在', async () => {
            const nestedPath = path.join(__dirname, 'nested', 'dir', '.token');
            const store = new ResumeTokenStore({
                storage: 'file',
                path: nestedPath
            });

            await store.save(testToken);

            // 验证文件存在
            const fileContent = await fs.readFile(nestedPath, 'utf8');
            const savedToken = JSON.parse(fileContent);

            expect(savedToken).to.deep.equal(testToken);

            // 清理
            await fs.unlink(nestedPath);
            await fs.rmdir(path.join(__dirname, 'nested', 'dir'));
            await fs.rmdir(path.join(__dirname, 'nested'));
        });
    });

    describe('Redis 存储模式', () => {

        let mockRedis;

        beforeEach(() => {
            // Mock Redis 客户端
            const storage = new Map();
            mockRedis = {
                get: async (key) => storage.get(key) || null,
                set: async (key, value) => storage.set(key, value),
                del: async (key) => storage.delete(key)
            };
        });

        it('应该保存 Token 到 Redis', async () => {
            const store = new ResumeTokenStore({
                storage: 'redis',
                redis: mockRedis
            });

            await store.save(testToken);

            // 验证 Redis 中存在
            const savedData = await mockRedis.get('monsqlize:sync:resume-token');
            const savedToken = JSON.parse(savedData);

            expect(savedToken).to.deep.equal(testToken);
        });

        it('应该从 Redis 加载 Token', async () => {
            const store = new ResumeTokenStore({
                storage: 'redis',
                redis: mockRedis
            });

            // 先保存
            await store.save(testToken);

            // 再加载
            const loadedToken = await store.load();

            expect(loadedToken).to.deep.equal(testToken);
        });

        it('应该返回 null：Redis 中无数据', async () => {
            const store = new ResumeTokenStore({
                storage: 'redis',
                redis: mockRedis
            });

            const loadedToken = await store.load();

            expect(loadedToken).to.be.null;
        });

        it('应该清除 Redis Token', async () => {
            const store = new ResumeTokenStore({
                storage: 'redis',
                redis: mockRedis
            });

            // 先保存
            await store.save(testToken);

            // 验证存在
            let data = await mockRedis.get('monsqlize:sync:resume-token');
            expect(data).to.not.be.null;

            // 清除
            await store.clear();

            // 验证已删除
            data = await mockRedis.get('monsqlize:sync:resume-token');
            expect(data).to.be.null;
        });
    });

    describe('默认配置', () => {

        it('应该使用默认 storage: file', async () => {
            const store = new ResumeTokenStore({
                path: testTokenPath
            });

            expect(store.storage).to.equal('file');
        });

        it('应该使用默认 path', () => {
            const store = new ResumeTokenStore({
                storage: 'file'
            });

            expect(store.path).to.equal('./.sync-resume-token');
        });
    });
});

