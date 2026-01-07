/**
 * RelationManager 单元测试
 */
const { describe, it, before, after } = require('mocha');
const { expect } = require('chai');
const RelationManager = require('../../../lib/model/features/relations');

describe('RelationManager 单元测试', function() {
  let manager;
  let mockModel;

  before(function() {
    // 模拟 Model
    mockModel = {
      name: 'User',
      definition: {}
    };
  });

  beforeEach(function() {
    manager = new RelationManager(mockModel);
  });

  describe('1. 基础功能', function() {
    it('应该成功创建 RelationManager 实例', function() {
      expect(manager).to.be.instanceOf(RelationManager);
      expect(manager.model).to.equal(mockModel);
      expect(manager.relations).to.be.instanceOf(Map);
    });
  });

  describe('2. 注册 one-to-one 关系', function() {
    it('应该成功注册 one-to-one 关系', function() {
      manager.define('profile', {
        from: 'profiles',
        localField: 'profileId',
        foreignField: '_id',
        single: true
      });

      const relation = manager.get('profile');
      expect(relation).to.deep.equal({
        from: 'profiles',
        localField: 'profileId',
        foreignField: '_id',
        single: true
      });
    });
  });

  describe('3. 注册 one-to-many 关系', function() {
    it('应该成功注册 one-to-many 关系', function() {
      manager.define('posts', {
        from: 'posts',
        localField: '_id',
        foreignField: 'authorId',
        single: false
      });

      const relation = manager.get('posts');
      expect(relation).to.deep.equal({
        from: 'posts',
        localField: '_id',
        foreignField: 'authorId',
        single: false
      });
    });
  });

  describe('4. normalize - 设置默认值', function() {
    it('应该设置 single 默认值为 false', function() {
      manager.define('posts', {
        from: 'posts',
        localField: '_id',
        foreignField: 'authorId'
        // 未指定 single
      });

      const relation = manager.get('posts');
      expect(relation.single).to.equal(false);
    });
  });

  describe('5. validate - 验证必需字段', function() {
    it('应该在缺少 from 时抛出错误', function() {
      expect(() => {
        manager.define('profile', {
          localField: 'profileId',
          foreignField: '_id'
        });
      }).to.throw('relations 配置缺少必需字段: from');
    });

    it('应该在缺少 localField 时抛出错误', function() {
      expect(() => {
        manager.define('profile', {
          from: 'profiles',
          foreignField: '_id'
        });
      }).to.throw('relations 配置缺少必需字段: localField');
    });

    it('应该在缺少 foreignField 时抛出错误', function() {
      expect(() => {
        manager.define('profile', {
          from: 'profiles',
          localField: 'profileId'
        });
      }).to.throw('relations 配置缺少必需字段: foreignField');
    });
  });

  describe('6. validate - 验证字段类型', function() {
    it('应该在 from 不是字符串时抛出错误', function() {
      expect(() => {
        manager.define('profile', {
          from: 123, // 不是字符串
          localField: 'profileId',
          foreignField: '_id'
        });
      }).to.throw('relations.from 必须是字符串');
    });

    it('应该在 single 不是布尔值时抛出错误', function() {
      expect(() => {
        manager.define('profile', {
          from: 'profiles',
          localField: 'profileId',
          foreignField: '_id',
          single: 'true' // 字符串，不是布尔值
        });
      }).to.throw('relations.single 必须是布尔值');
    });
  });

  describe('7. get - 获取关系定义', function() {
    it('应该获取已定义的关系', function() {
      manager.define('profile', {
        from: 'profiles',
        localField: 'profileId',
        foreignField: '_id',
        single: true
      });

      const relation = manager.get('profile');
      expect(relation).to.not.be.null;
      expect(relation.from).to.equal('profiles');
    });

    it('应该在关系不存在时返回 null', function() {
      const relation = manager.get('notExist');
      expect(relation).to.be.null;
    });
  });

  describe('8. 重复定义同名关系', function() {
    it('应该覆盖旧的关系定义', function() {
      // 第一次定义
      manager.define('profile', {
        from: 'profiles',
        localField: 'profileId',
        foreignField: '_id',
        single: true
      });

      // 第二次定义（覆盖）
      manager.define('profile', {
        from: 'user_profiles',
        localField: 'userId',
        foreignField: '_id',
        single: false
      });

      const relation = manager.get('profile');
      expect(relation.from).to.equal('user_profiles');
      expect(relation.localField).to.equal('userId');
      expect(relation.single).to.equal(false);
    });
  });

  describe('9. getAll - 获取所有关系', function() {
    it('应该返回所有已定义的关系', function() {
      manager.define('profile', {
        from: 'profiles',
        localField: 'profileId',
        foreignField: '_id',
        single: true
      });

      manager.define('posts', {
        from: 'posts',
        localField: '_id',
        foreignField: 'authorId',
        single: false
      });

      const allRelations = manager.getAll();
      expect(allRelations).to.be.instanceOf(Map);
      expect(allRelations.size).to.equal(2);
      expect(allRelations.has('profile')).to.be.true;
      expect(allRelations.has('posts')).to.be.true;
    });
  });

  describe('10. has / getNames - 辅助方法', function() {
    it('应该正确检查关系是否存在', function() {
      manager.define('profile', {
        from: 'profiles',
        localField: 'profileId',
        foreignField: '_id',
        single: true
      });

      expect(manager.has('profile')).to.be.true;
      expect(manager.has('notExist')).to.be.false;
    });

    it('应该返回所有关系名称', function() {
      manager.define('profile', {
        from: 'profiles',
        localField: 'profileId',
        foreignField: '_id',
        single: true
      });

      manager.define('posts', {
        from: 'posts',
        localField: '_id',
        foreignField: 'authorId'
      });

      const names = manager.getNames();
      expect(names).to.be.an('array');
      expect(names).to.have.lengthOf(2);
      expect(names).to.include('profile');
      expect(names).to.include('posts');
    });
  });
});

