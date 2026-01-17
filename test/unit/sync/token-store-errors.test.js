/**
 * ResumeTokenStore 错误注入测试
 *
 * 测试错误处理和边缘情况，提升覆盖率到 95%+
 */

const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs').promises;
const path = require('path');
const ResumeTokenStore = require('../../../lib/sync/ResumeTokenStore');

describe('ResumeTokenStore 错误注入测试', () => {

    const testTokenPath = path.join(__dirname, '.test-resume-token-error');
    const testToken = { _data: 'test-token-data', timestamp: Date.now() };

    afterEach(async () => {
        // 清理测试文件
        try {
            await fs.unlink(testTokenPath);
        } catch (error) {
            // 忽略
        }
        // 恢复所有 stub
        sinon.restore();
    });

    describe('文件系统错误处理', () => {

        it('应该处理文件读取权限错误', async () => {
            const store = new ResumeTokenStore({
                storage: 'file',
                path: testTokenPath
            });

            // 先创建文件
            await store.save(testToken);

            // Mock fs.readFile 抛出权限错误
            const readFileStub = sinon.stub(fs, 'readFile');
            readFileStub.rejects(new Error('EACCES: permission denied'));

            // 应该捕获错误并返回 null
            const result = await store.load();

            expect(result).to.be.null;
            expect(readFileStub.calledOnce).to.be.true;
        });

        it('应该处理文件读取磁盘错误', async () => {
            const store = new ResumeTokenStore({
                storage: 'file',
                path: testTokenPath
            });

            // Mock fs.readFile 抛出磁盘错误
            const readFileStub = sinon.stub(fs, 'readFile');
            readFileStub.rejects(new Error('EIO: i/o error'));

            // 应该捕获错误并返回 null
            const result = await store.load();

            expect(result).to.be.null;
            expect(readFileStub.calledOnce).to.be.true;
        });

        it('应该处理 JSON 解析错误', async () => {
            const store = new ResumeTokenStore({
                storage: 'file',
                path: testTokenPath
            });

            // 写入无效的 JSON
            await fs.writeFile(testTokenPath, 'invalid json{');

            // 应该捕获错误并返回 null
            const result = await store.load();

            expect(result).to.be.null;
        });

        it('应该处理文件删除失败', async () => {
            const store = new ResumeTokenStore({
                storage: 'file',
                path: testTokenPath
            });

            // 先保存
            await store.save(testToken);

            // Mock fs.unlink 抛出错误
            const unlinkStub = sinon.stub(fs, 'unlink');
            unlinkStub.rejects(new Error('EBUSY: resource busy'));

            // clear 应该捕获错误但不抛出
            await store.clear();

            expect(unlinkStub.calledOnce).to.be.true;
        });

        it('应该处理文件写入错误', async () => {
            const store = new ResumeTokenStore({
                storage: 'file',
                path: testTokenPath
            });

            // Mock fs.writeFile 抛出错误
            const writeFileStub = sinon.stub(fs, 'writeFile');
            writeFileStub.rejects(new Error('ENOSPC: no space left'));

            // save() 会捕获错误并记录日志，不抛出
            await store.save(testToken);

            // 验证 writeFile 被调用
            expect(writeFileStub.calledOnce).to.be.true;
        });
    });

    describe('Redis 错误处理', () => {

        let mockRedis;

        beforeEach(() => {
            mockRedis = {
                get: sinon.stub(),
                set: sinon.stub(),
                del: sinon.stub()
            };
        });

        it('应该处理 Redis get 错误', async () => {
            const store = new ResumeTokenStore({
                storage: 'redis',
                redis: mockRedis
            });

            // Mock Redis get 抛出错误
            mockRedis.get.rejects(new Error('Redis connection lost'));

            // 应该捕获错误并返回 null
            const result = await store.load();

            expect(result).to.be.null;
            expect(mockRedis.get.calledOnce).to.be.true;
        });

        it('应该处理 Redis set 错误', async () => {
            const store = new ResumeTokenStore({
                storage: 'redis',
                redis: mockRedis
            });

            // Mock Redis set 抛出错误
            mockRedis.set.rejects(new Error('Redis timeout'));

            // save() 会捕获错误并记录日志，不抛出
            await store.save(testToken);

            // 验证 set 被调用
            expect(mockRedis.set.calledOnce).to.be.true;
        });

        it('应该处理 Redis del 错误', async () => {
            const store = new ResumeTokenStore({
                storage: 'redis',
                redis: mockRedis
            });

            // Mock Redis del 抛出错误
            mockRedis.del.rejects(new Error('Redis error'));

            // clear 应该捕获错误但不抛出
            await store.clear();

            expect(mockRedis.del.calledOnce).to.be.true;
        });

        it('应该处理 Redis 返回的无效数据', async () => {
            const store = new ResumeTokenStore({
                storage: 'redis',
                redis: mockRedis
            });

            // Mock Redis 返回无效 JSON
            mockRedis.get.resolves('invalid json{');

            // 应该捕获错误并返回 null
            const result = await store.load();

            expect(result).to.be.null;
            expect(mockRedis.get.calledOnce).to.be.true;
        });
    });

    describe('边缘情况', () => {

        it('应该处理 Token 为 null', async () => {
            const store = new ResumeTokenStore({
                storage: 'file',
                path: testTokenPath
            });

            // 保存 null
            await store.save(null);

            // 应该能保存和读取
            const result = await store.load();
            expect(result).to.be.null;
        });

        it('应该处理 Token 为空对象', async () => {
            const store = new ResumeTokenStore({
                storage: 'file',
                path: testTokenPath
            });

            // 保存空对象
            await store.save({});

            // 应该能保存和读取
            const result = await store.load();
            expect(result).to.deep.equal({});
        });
    });

    describe('并发场景', () => {

        it('应该处理并发读取', async () => {
            const store = new ResumeTokenStore({
                storage: 'file',
                path: testTokenPath
            });

            // 先保存
            await store.save(testToken);

            // 并发读取多次
            const results = await Promise.all([
                store.load(),
                store.load(),
                store.load(),
                store.load(),
                store.load()
            ]);

            // 所有结果应该一致
            results.forEach(result => {
                expect(result).to.deep.equal(testToken);
            });
        });

        it('应该处理并发写入', async () => {
            const store = new ResumeTokenStore({
                storage: 'file',
                path: testTokenPath
            });

            const tokens = Array.from({ length: 5 }, (_, i) => ({
                _data: `token-${i}`,
                timestamp: Date.now() + i
            }));

            // 并发写入多次
            await Promise.all(tokens.map(token => store.save(token)));

            // 应该能读取（最后一个写入的）
            const result = await store.load();
            expect(result).to.be.an('object');
            expect(result._data).to.match(/token-\d/);
        });
    });
});

