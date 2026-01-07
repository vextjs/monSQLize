/**
 * PopulateBuilder 填充逻辑单元测试
 * 测试 _collectForeignIds, _buildRelationMap, _fillDocuments 等方法
 */
const { describe, it, beforeEach } = require('mocha');
const { expect } = require('chai');
const { PopulateBuilder } = require('../../../lib/model/features/populate');
const RelationManager = require('../../../lib/model/features/relations');

describe('PopulateBuilder 填充逻辑单元测试', function() {
  let builder;
  let mockModel;
  let mockCollection;

  beforeEach(function() {
    mockModel = {
      name: 'User',
      _relations: new RelationManager({ name: 'User' }),
      msq: {
        collection: (name) => ({
          find: () => ({
            toArray: async () => []
          })
        })
      }
    };

    mockCollection = { name: 'users' };
    builder = new PopulateBuilder(mockModel, mockCollection);
  });

  describe('1. _collectForeignIds - 收集外键值', function() {
    it('应该收集单个外键值', function() {
      const docs = [
        { _id: '1', profileId: 'p1' },
        { _id: '2', profileId: 'p2' }
      ];

      const relation = {
        localField: 'profileId',
        foreignField: '_id'
      };

      const ids = builder._collectForeignIds(docs, relation);

      expect(ids).to.be.an('array');
      expect(ids).to.have.lengthOf(2);
      expect(ids).to.include('p1');
      expect(ids).to.include('p2');
    });

    it('应该收集外键数组', function() {
      const docs = [
        { _id: '1', tagIds: ['t1', 't2'] },
        { _id: '2', tagIds: ['t2', 't3'] }
      ];

      const relation = {
        localField: 'tagIds',
        foreignField: '_id'
      };

      const ids = builder._collectForeignIds(docs, relation);

      expect(ids).to.be.an('array');
      expect(ids).to.have.lengthOf(3); // 去重后 3 个
      expect(ids).to.include('t1');
      expect(ids).to.include('t2');
      expect(ids).to.include('t3');
    });

    it('应该跳过 null/undefined 值', function() {
      const docs = [
        { _id: '1', profileId: 'p1' },
        { _id: '2', profileId: null },
        { _id: '3', profileId: undefined },
        { _id: '4' } // 缺少字段
      ];

      const relation = {
        localField: 'profileId',
        foreignField: '_id'
      };

      const ids = builder._collectForeignIds(docs, relation);

      expect(ids).to.have.lengthOf(1);
      expect(ids[0]).to.equal('p1');
    });

    it('应该去重外键值', function() {
      const docs = [
        { _id: '1', profileId: 'p1' },
        { _id: '2', profileId: 'p1' },
        { _id: '3', profileId: 'p2' }
      ];

      const relation = {
        localField: 'profileId',
        foreignField: '_id'
      };

      const ids = builder._collectForeignIds(docs, relation);

      expect(ids).to.have.lengthOf(2);
      expect(ids).to.include('p1');
      expect(ids).to.include('p2');
    });
  });

  describe('2. _buildRelationMap - 构建映射表', function() {
    it('应该构建 single: true 的映射表', function() {
      const relatedDocs = [
        { _id: 'p1', bio: 'Bio 1' },
        { _id: 'p2', bio: 'Bio 2' }
      ];

      const relation = {
        foreignField: '_id',
        single: true
      };

      const map = builder._buildRelationMap(relatedDocs, relation);

      expect(map).to.be.instanceOf(Map);
      expect(map.size).to.equal(2);
      expect(map.get('p1')).to.deep.equal({ _id: 'p1', bio: 'Bio 1' });
      expect(map.get('p2')).to.deep.equal({ _id: 'p2', bio: 'Bio 2' });
    });

    it('应该构建 single: false 的映射表（数组）', function() {
      const relatedDocs = [
        { _id: 'post1', authorId: 'u1', title: 'Post 1' },
        { _id: 'post2', authorId: 'u1', title: 'Post 2' },
        { _id: 'post3', authorId: 'u2', title: 'Post 3' }
      ];

      const relation = {
        foreignField: 'authorId',
        single: false
      };

      const map = builder._buildRelationMap(relatedDocs, relation);

      expect(map.size).to.equal(2);
      expect(map.get('u1')).to.be.an('array');
      expect(map.get('u1')).to.have.lengthOf(2);
      expect(map.get('u2')).to.be.an('array');
      expect(map.get('u2')).to.have.lengthOf(1);
    });
  });

  describe('3. _fillDocuments - 填充文档', function() {
    it('应该填充 single: true 关系', function() {
      const docs = [
        { _id: 'u1', profileId: 'p1' },
        { _id: 'u2', profileId: 'p2' }
      ];

      const relation = {
        localField: 'profileId',
        single: true
      };

      const relatedMap = new Map([
        ['p1', { _id: 'p1', bio: 'Bio 1' }],
        ['p2', { _id: 'p2', bio: 'Bio 2' }]
      ]);

      builder._fillDocuments(docs, 'profile', relation, relatedMap);

      expect(docs[0].profile).to.deep.equal({ _id: 'p1', bio: 'Bio 1' });
      expect(docs[1].profile).to.deep.equal({ _id: 'p2', bio: 'Bio 2' });
    });

    it('应该填充 single: false 关系', function() {
      const docs = [
        { _id: 'u1' },
        { _id: 'u2' }
      ];

      const relation = {
        localField: '_id',
        single: false
      };

      const relatedMap = new Map([
        ['u1', [
          { _id: 'post1', title: 'Post 1' },
          { _id: 'post2', title: 'Post 2' }
        ]],
        ['u2', [
          { _id: 'post3', title: 'Post 3' }
        ]]
      ]);

      builder._fillDocuments(docs, 'posts', relation, relatedMap);

      expect(docs[0].posts).to.be.an('array');
      expect(docs[0].posts).to.have.lengthOf(2);
      expect(docs[1].posts).to.be.an('array');
      expect(docs[1].posts).to.have.lengthOf(1);
    });

    it('应该在外键为 null 时填充 null（single: true）', function() {
      const docs = [
        { _id: 'u1', profileId: null }
      ];

      const relation = {
        localField: 'profileId',
        single: true
      };

      const relatedMap = new Map();

      builder._fillDocuments(docs, 'profile', relation, relatedMap);

      expect(docs[0].profile).to.be.null;
    });

    it('应该在外键为 null 时填充空数组（single: false）', function() {
      const docs = [
        { _id: 'u1', tagIds: null }
      ];

      const relation = {
        localField: 'tagIds',
        single: false
      };

      const relatedMap = new Map();

      builder._fillDocuments(docs, 'tags', relation, relatedMap);

      expect(docs[0].tags).to.be.an('array');
      expect(docs[0].tags).to.have.lengthOf(0);
    });

    it('应该在找不到关联数据时填充 null（single: true）', function() {
      const docs = [
        { _id: 'u1', profileId: 'p1' }
      ];

      const relation = {
        localField: 'profileId',
        single: true
      };

      const relatedMap = new Map(); // 空映射

      builder._fillDocuments(docs, 'profile', relation, relatedMap);

      expect(docs[0].profile).to.be.null;
    });

    it('应该在找不到关联数据时填充空数组（single: false）', function() {
      const docs = [
        { _id: 'u1' }
      ];

      const relation = {
        localField: '_id',
        single: false
      };

      const relatedMap = new Map(); // 空映射

      builder._fillDocuments(docs, 'posts', relation, relatedMap);

      expect(docs[0].posts).to.be.an('array');
      expect(docs[0].posts).to.have.lengthOf(0);
    });
  });

  describe('4. _selectFields - 字段选择', function() {
    it('应该选择指定字段', function() {
      const doc = {
        _id: 'p1',
        bio: 'Software Engineer',
        avatar: 'https://example.com/avatar.jpg',
        location: 'Beijing',
        age: 30
      };

      const result = builder._selectFields(doc, 'bio avatar');

      expect(result._id).to.equal('p1'); // _id 总是包含
      expect(result.bio).to.equal('Software Engineer');
      expect(result.avatar).to.equal('https://example.com/avatar.jpg');
      expect(result.location).to.be.undefined;
      expect(result.age).to.be.undefined;
    });

    it('应该处理多个空格分隔的字段', function() {
      const doc = {
        _id: 'p1',
        field1: 'value1',
        field2: 'value2',
        field3: 'value3'
      };

      const result = builder._selectFields(doc, 'field1   field2'); // 多个空格

      expect(result.field1).to.equal('value1');
      expect(result.field2).to.equal('value2');
      expect(result.field3).to.be.undefined;
    });
  });

  describe('5. _sortDocs - 文档排序', function() {
    it('应该按单个字段升序排序', function() {
      const docs = [
        { _id: '3', order: 3 },
        { _id: '1', order: 1 },
        { _id: '2', order: 2 }
      ];

      const sorted = builder._sortDocs(docs, { order: 1 });

      expect(sorted[0].order).to.equal(1);
      expect(sorted[1].order).to.equal(2);
      expect(sorted[2].order).to.equal(3);
    });

    it('应该按单个字段降序排序', function() {
      const docs = [
        { _id: '1', order: 1 },
        { _id: '3', order: 3 },
        { _id: '2', order: 2 }
      ];

      const sorted = builder._sortDocs(docs, { order: -1 });

      expect(sorted[0].order).to.equal(3);
      expect(sorted[1].order).to.equal(2);
      expect(sorted[2].order).to.equal(1);
    });

    it('应该按多个字段排序', function() {
      const docs = [
        { _id: '1', category: 'A', order: 2 },
        { _id: '2', category: 'B', order: 1 },
        { _id: '3', category: 'A', order: 1 },
        { _id: '4', category: 'B', order: 2 }
      ];

      const sorted = builder._sortDocs(docs, { category: 1, order: 1 });

      expect(sorted[0]._id).to.equal('3'); // A, 1
      expect(sorted[1]._id).to.equal('1'); // A, 2
      expect(sorted[2]._id).to.equal('2'); // B, 1
      expect(sorted[3]._id).to.equal('4'); // B, 2
    });

    it('不应该修改原数组', function() {
      const docs = [
        { _id: '2', order: 2 },
        { _id: '1', order: 1 }
      ];

      const originalOrder = docs[0]._id;
      builder._sortDocs(docs, { order: 1 });

      expect(docs[0]._id).to.equal(originalOrder); // 原数组未修改
    });
  });

  describe('6. _fillEmptyRelation - 填充空关系', function() {
    it('应该为 single: true 填充 null', function() {
      const docs = [
        { _id: 'u1' },
        { _id: 'u2' }
      ];

      const relation = { single: true };

      builder._fillEmptyRelation(docs, 'profile', relation);

      expect(docs[0].profile).to.be.null;
      expect(docs[1].profile).to.be.null;
    });

    it('应该为 single: false 填充空数组', function() {
      const docs = [
        { _id: 'u1' },
        { _id: 'u2' }
      ];

      const relation = { single: false };

      builder._fillEmptyRelation(docs, 'posts', relation);

      expect(docs[0].posts).to.be.an('array');
      expect(docs[0].posts).to.have.lengthOf(0);
      expect(docs[1].posts).to.be.an('array');
      expect(docs[1].posts).to.have.lengthOf(0);
    });
  });
});

