/**
 * URI 解析器单元测试
 */

const { parseUri } = require('../../../lib/infrastructure/uri-parser');
const { expect } = require('chai');

describe('URI Parser (单元测试)', () => {
    describe('MongoDB URI解析', () => {
        it('应该解析标准MongoDB URI', () => {
            const result = parseUri('mongodb://localhost:27017/mydb');

            expect(result.protocol).to.equal('mongodb');
            expect(result.host).to.equal('localhost');
            expect(result.port).to.equal(27017);
            expect(result.auth).to.be.null;
        });

        it('应该解析带认证的MongoDB URI', () => {
            const result = parseUri('mongodb://user:pass@mongo.internal:27017/mydb');

            expect(result.protocol).to.equal('mongodb');
            expect(result.host).to.equal('mongo.internal');
            expect(result.port).to.equal(27017);
            expect(result.auth).to.equal('user:pass');
        });

        it('应该解析非标准端口的MongoDB URI', () => {
            const result = parseUri('mongodb://mongo.example.com:30000/mydb');

            expect(result.protocol).to.equal('mongodb');
            expect(result.host).to.equal('mongo.example.com');
            expect(result.port).to.equal(30000);
        });
    });

    describe('PostgreSQL URI解析（未来扩展）', () => {
        it('应该解析PostgreSQL URI', () => {
            const result = parseUri('postgresql://user:pass@postgres.internal:5432/mydb');

            expect(result.protocol).to.equal('postgresql');
            expect(result.host).to.equal('postgres.internal');
            expect(result.port).to.equal(5432);
            expect(result.auth).to.equal('user:pass');
        });
    });

    describe('MySQL URI解析（未来扩展）', () => {
        it('应该解析MySQL URI', () => {
            const result = parseUri('mysql://user:pass@mysql.internal:3306/mydb');

            expect(result.protocol).to.equal('mysql');
            expect(result.host).to.equal('mysql.internal');
            expect(result.port).to.equal(3306);
            expect(result.auth).to.equal('user:pass');
        });
    });

    describe('Redis URI解析（未来扩展）', () => {
        it('应该解析Redis URI', () => {
            const result = parseUri('redis://redis.internal:6379/0');

            expect(result.protocol).to.equal('redis');
            expect(result.host).to.equal('redis.internal');
            expect(result.port).to.equal(6379);
            expect(result.auth).to.be.null;
        });
    });

    describe('错误处理', () => {
        it('应该拒绝不支持的URI格式', () => {
            expect(() => parseUri('http://example.com:80'))
                .to.throw('Unsupported URI format');
        });

        it('应该拒绝无效的URI', () => {
            expect(() => parseUri('invalid-uri'))
                .to.throw('Unsupported URI format');
        });
    });
});

