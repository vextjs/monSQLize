/**
 * ObjectId 跨版本兼容性单元测试
 *
 * 测试 convertObjectIdStrings 函数是否能正确处理：
 * 1. 来自其他 BSON 版本的 ObjectId 实例
 * 2. 嵌套对象和数组中的跨版本 ObjectId
 * 3. 边界情况和错误处理
 */

const { expect } = require('chai');
const { ObjectId } = require('mongodb');
const { convertObjectIdStrings } = require('../../../lib/utils/objectid-converter');

// 模拟旧版本的 ObjectId
class LegacyObjectId {
  constructor(hex) {
    if (hex && typeof hex === 'string' && /^[0-9a-fA-F]{24}$/.test(hex)) {
      this._id = hex;
    } else {
      // 生成随机 24 位十六进制字符串
      this._id = Array(24)
        .fill(0)
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join('');
    }
  }

  toString() {
    return this._id;
  }

  toHexString() {
    return this._id;
  }
}

// 设置 constructor.name 为 'ObjectId' 以模拟真实场景
Object.defineProperty(LegacyObjectId.prototype.constructor, 'name', {
  value: 'ObjectId',
  writable: false
});

describe('ObjectId Cross-Version Compatibility', () => {

  describe('基础转换', () => {
    it('应该将旧版本 ObjectId 转换为当前版本', () => {
      const legacyId = new LegacyObjectId('507f1f77bcf86cd799439011');
      const converted = convertObjectIdStrings(legacyId);

      expect(converted).to.be.instanceOf(ObjectId);
      expect(converted.toString()).to.equal('507f1f77bcf86cd799439011');
    });

    it('当前版本的 ObjectId 应该保持不变', () => {
      const currentId = new ObjectId('507f1f77bcf86cd799439011');
      const converted = convertObjectIdStrings(currentId);

      expect(converted).to.equal(currentId); // 应该是同一个实例
      expect(converted).to.be.instanceOf(ObjectId);
    });

    it('有效的 ObjectId 字符串应该被转换', () => {
      const hexString = '507f1f77bcf86cd799439011';
      const converted = convertObjectIdStrings(hexString);

      expect(converted).to.be.instanceOf(ObjectId);
      expect(converted.toString()).to.equal(hexString);
    });

    it('无效的字符串应该保持不变', () => {
      const invalidString = 'not-a-valid-objectid';
      const converted = convertObjectIdStrings(invalidString);

      expect(converted).to.equal(invalidString);
    });
  });

  describe('对象中的转换', () => {
    it('应该转换对象中的旧版本 ObjectId 字段', () => {
      const legacyUserId = new LegacyObjectId('507f1f77bcf86cd799439011');
      const legacyProductId = new LegacyObjectId('507f191e810c19729de860ea');

      const obj = {
        userId: legacyUserId,
        productId: legacyProductId,
        name: 'Test Product'
      };

      const converted = convertObjectIdStrings(obj);

      expect(converted.userId).to.be.instanceOf(ObjectId);
      expect(converted.userId.toString()).to.equal('507f1f77bcf86cd799439011');
      expect(converted.productId).to.be.instanceOf(ObjectId);
      expect(converted.productId.toString()).to.equal('507f191e810c19729de860ea');
      expect(converted.name).to.equal('Test Product');
    });

    it('应该转换嵌套对象中的 ObjectId', () => {
      const legacyId = new LegacyObjectId('507f1f77bcf86cd799439011');

      const obj = {
        user: {
          _id: legacyId,
          profile: {
            avatarId: new LegacyObjectId('507f191e810c19729de860ea')
          }
        }
      };

      const converted = convertObjectIdStrings(obj);

      expect(converted.user._id).to.be.instanceOf(ObjectId);
      expect(converted.user._id.toString()).to.equal('507f1f77bcf86cd799439011');
      expect(converted.user.profile.avatarId).to.be.instanceOf(ObjectId);
      expect(converted.user.profile.avatarId.toString()).to.equal('507f191e810c19729de860ea');
    });
  });

  describe('数组中的转换', () => {
    it('应该转换数组中的旧版本 ObjectId', () => {
      const ids = [
        new LegacyObjectId('507f1f77bcf86cd799439011'),
        new LegacyObjectId('507f191e810c19729de860ea')
      ];

      const converted = convertObjectIdStrings(ids);

      expect(converted).to.be.an('array');
      expect(converted).to.have.lengthOf(2);
      expect(converted[0]).to.be.instanceOf(ObjectId);
      expect(converted[0].toString()).to.equal('507f1f77bcf86cd799439011');
      expect(converted[1]).to.be.instanceOf(ObjectId);
      expect(converted[1].toString()).to.equal('507f191e810c19729de860ea');
    });

    it('应该转换对象数组中的 ObjectId', () => {
      const users = [
        { userId: new LegacyObjectId('507f1f77bcf86cd799439011'), name: 'Alice' },
        { userId: new LegacyObjectId('507f191e810c19729de860ea'), name: 'Bob' }
      ];

      const converted = convertObjectIdStrings(users);

      expect(converted).to.be.an('array');
      expect(converted[0].userId).to.be.instanceOf(ObjectId);
      expect(converted[0].userId.toString()).to.equal('507f1f77bcf86cd799439011');
      expect(converted[1].userId).to.be.instanceOf(ObjectId);
      expect(converted[1].userId.toString()).to.equal('507f191e810c19729de860ea');
    });
  });

  describe('边界情况', () => {
    it('应该处理 null 和 undefined', () => {
      expect(convertObjectIdStrings(null)).to.be.null;
      expect(convertObjectIdStrings(undefined)).to.be.undefined;
    });

    it('应该处理空对象和空数组', () => {
      expect(convertObjectIdStrings({})).to.deep.equal({});
      expect(convertObjectIdStrings([])).to.deep.equal([]);
    });

    it('应该处理混合类型的对象', () => {
      const obj = {
        _id: new LegacyObjectId('507f1f77bcf86cd799439011'),
        name: 'Test',
        count: 42,
        active: true,
        createdAt: new Date('2024-01-01'),
        tags: ['tag1', 'tag2']
      };

      const converted = convertObjectIdStrings(obj);

      expect(converted._id).to.be.instanceOf(ObjectId);
      expect(converted.name).to.equal('Test');
      expect(converted.count).to.equal(42);
      expect(converted.active).to.equal(true);
      expect(converted.createdAt).to.be.instanceOf(Date);
      expect(converted.tags).to.deep.equal(['tag1', 'tag2']);
    });

    it('应该保持 Date、RegExp 等特殊对象不变', () => {
      const date = new Date('2024-01-01');
      const regex = /test/i;

      expect(convertObjectIdStrings(date)).to.equal(date);
      expect(convertObjectIdStrings(regex)).to.equal(regex);
    });
  });

  describe('性能优化验证', () => {
    it('无需转换时应该返回原对象（不克隆）', () => {
      const obj = { name: 'Test', count: 42 };
      const converted = convertObjectIdStrings(obj);

      expect(converted).to.equal(obj); // 应该是同一个引用
    });

    it('无需转换的数组应该返回原数组', () => {
      const arr = ['a', 'b', 'c'];
      const converted = convertObjectIdStrings(arr);

      expect(converted).to.equal(arr); // 应该是同一个引用
    });
  });

  describe('错误处理', () => {
    it('应该处理无效的旧版本 ObjectId', () => {
      // 模拟一个 toString() 返回无效值的对象
      const invalidLegacy = {
        constructor: { name: 'ObjectId' },
        toString: () => 'invalid-hex'
      };

      const converted = convertObjectIdStrings(invalidLegacy);

      // 应该返回原对象（转换失败时的降级行为）
      expect(converted).to.equal(invalidLegacy);
    });

    it('应该处理 toString() 抛出异常的情况', () => {
      const throwingLegacy = {
        constructor: { name: 'ObjectId' },
        toString: () => {
          throw new Error('toString failed');
        }
      };

      // 不应该抛出异常
      expect(() => convertObjectIdStrings(throwingLegacy)).to.not.throw();
    });
  });

  describe('实际场景模拟', () => {
    it('模拟 mongoose 查询结果转换', () => {
      // 模拟从 mongoose (bson@4.x/5.x) 获取的数据
      const mongooseData = {
        _id: new LegacyObjectId('507f1f77bcf86cd799439011'),
        userId: new LegacyObjectId('507f191e810c19729de860ea'),
        orderId: new LegacyObjectId('5f47ac3c5e07df001f2e46de'),
        items: [
          { productId: new LegacyObjectId('5f47ac3c5e07df001f2e46df'), qty: 2 },
          { productId: new LegacyObjectId('5f47ac3c5e07df001f2e46e0'), qty: 1 }
        ],
        metadata: {
          createdBy: new LegacyObjectId('507f1f77bcf86cd799439011'),
          updatedBy: new LegacyObjectId('507f191e810c19729de860ea')
        },
        createdAt: new Date('2024-01-01'),
        status: 'completed'
      };

      const converted = convertObjectIdStrings(mongooseData);

      // 验证所有 ObjectId 都被转换
      expect(converted._id).to.be.instanceOf(ObjectId);
      expect(converted.userId).to.be.instanceOf(ObjectId);
      expect(converted.orderId).to.be.instanceOf(ObjectId);
      expect(converted.items[0].productId).to.be.instanceOf(ObjectId);
      expect(converted.items[1].productId).to.be.instanceOf(ObjectId);
      expect(converted.metadata.createdBy).to.be.instanceOf(ObjectId);
      expect(converted.metadata.updatedBy).to.be.instanceOf(ObjectId);

      // 验证其他字段保持不变
      expect(converted.createdAt).to.be.instanceOf(Date);
      expect(converted.status).to.equal('completed');
      expect(converted.items[0].qty).to.equal(2);
    });
  });
});
