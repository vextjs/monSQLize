/**
 * 日期操作函数测试
 */

const MonSQLize = require('../../../../lib');
const assert = require('assert');

describe('Expression - Date Functions', function() {
  this.timeout(30000);

  let msq;
  let collection;
  let db;

  before(async function() {
    console.log('🔧 初始化测试环境...');

    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test_expression_date',
      config: { useMemoryServer: true }
    });

    const conn = await msq.connect();
    collection = conn.collection;
    db = msq._adapter.db;

    // 准备测试数据
    await db.collection('test_events').deleteMany({});
    await db.collection('test_events').insertMany([
      {
        _id: 1,
        name: 'Event A',
        createdAt: new Date('2024-03-15T14:30:45.123Z'),
        updatedAt: new Date('2024-12-25T23:59:59.999Z')
      },
      {
        _id: 2,
        name: 'Event B',
        createdAt: new Date('2023-01-01T00:00:00.000Z'),
        updatedAt: new Date('2023-06-15T12:30:00.000Z')
      },
      {
        _id: 3,
        name: 'Event C',
        createdAt: new Date('2025-07-20T08:15:30.500Z'),
        updatedAt: new Date('2025-07-20T18:45:15.750Z')
      }
    ]);

    console.log('✅ 测试数据准备完成');
  });

  after(async function() {
    if (msq) {
      await msq.close();
    }
  });

  describe('YEAR Function', function() {

    it('should extract year from date', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_events').aggregate([
        {
          $project: {
            name: 1,
            year: expr("YEAR(createdAt)")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result[0].year, 2024);
      assert.strictEqual(result[1].year, 2023);
      assert.strictEqual(result[2].year, 2025);
    });
  });

  describe('MONTH Function', function() {

    it('should extract month from date', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_events').aggregate([
        {
          $project: {
            name: 1,
            month: expr("MONTH(createdAt)")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result[0].month, 3);   // March
      assert.strictEqual(result[1].month, 1);   // January
      assert.strictEqual(result[2].month, 7);   // July
    });
  });

  describe('DAY_OF_MONTH Function', function() {

    it('should extract day of month from date', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_events').aggregate([
        {
          $project: {
            name: 1,
            day: expr("DAY_OF_MONTH(createdAt)")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result[0].day, 15);
      assert.strictEqual(result[1].day, 1);
      assert.strictEqual(result[2].day, 20);
    });
  });

  describe('HOUR Function', function() {

    it('should extract hour from date', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_events').aggregate([
        {
          $project: {
            name: 1,
            hour: expr("HOUR(createdAt)")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result[0].hour, 14);
      assert.strictEqual(result[1].hour, 0);
      assert.strictEqual(result[2].hour, 8);
    });
  });

  describe('MINUTE Function', function() {

    it('should extract minute from date', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_events').aggregate([
        {
          $project: {
            name: 1,
            minute: expr("MINUTE(createdAt)")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result[0].minute, 30);
      assert.strictEqual(result[1].minute, 0);
      assert.strictEqual(result[2].minute, 15);
    });
  });

  describe('SECOND Function', function() {

    it('should extract second from date', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_events').aggregate([
        {
          $project: {
            name: 1,
            second: expr("SECOND(createdAt)")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result[0].second, 45);
      assert.strictEqual(result[1].second, 0);
      assert.strictEqual(result[2].second, 30);
    });
  });

  describe('Combined Date Operations', function() {

    it('should use multiple date functions together', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_events').aggregate([
        {
          $project: {
            name: 1,
            year: expr("YEAR(createdAt)"),
            month: expr("MONTH(createdAt)"),
            day: expr("DAY_OF_MONTH(createdAt)"),
            hour: expr("HOUR(createdAt)"),
            minute: expr("MINUTE(createdAt)"),
            second: expr("SECOND(createdAt)")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      const event1 = result[0];
      assert.strictEqual(event1.year, 2024);
      assert.strictEqual(event1.month, 3);
      assert.strictEqual(event1.day, 15);
      assert.strictEqual(event1.hour, 14);
      assert.strictEqual(event1.minute, 30);
      assert.strictEqual(event1.second, 45);
    });

    it('should filter by date parts', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_events').aggregate([
        {
          $match: expr("YEAR(createdAt) === 2024")
        }
      ]);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'Event A');
    });

    it('should use multiple date functions in conditions', async function() {
      const { expr } = MonSQLize;

      // 测试在条件中使用日期函数
      const result = await collection('test_events').aggregate([
        {
          $project: {
            name: 1,
            year: expr("YEAR(createdAt)"),
            isAfternoon: expr("HOUR(createdAt) >= 12")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result[0].year, 2024);
      assert.strictEqual(result[0].isAfternoon, true);  // 14:30
      assert.strictEqual(result[1].isAfternoon, false); // 00:00
    });
  });
});

