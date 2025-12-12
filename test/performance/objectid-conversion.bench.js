/**
 * ObjectId 转换性能基准测试
 * @description 测试自动转换对性能的影响
 *
 * 通过标准：
 * - 简单查询：< 0.5ms（> 2000 ops/sec）
 * - 复杂查询：< 2ms（> 500 ops/sec）
 * - 无转换场景：< 0.05ms（> 20000 ops/sec）
 * - 相对开销：< 10%
 */

const Benchmark = require('benchmark');
const { ObjectId } = require('mongodb');

// 临时引入转换函数（实际实现后会从正式路径导入）
// 这里先使用 mock 版本进行测试
const mockConverter = {
  // 简化版本的转换函数（用于测试）
  convertObjectIdStrings(obj, depth = 0) {
    if (depth > 10 || obj === null || obj === undefined) return obj;
    if (obj instanceof ObjectId) return obj;

    if (typeof obj === 'string') {
      if (/^[0-9a-fA-F]{24}$/.test(obj) && ObjectId.isValid(obj)) {
        try {
          return new ObjectId(obj);
        } catch {
          return obj;
        }
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      let hasConverted = false;
      const converted = obj.map(item => {
        const newItem = this.convertObjectIdStrings(item, depth + 1);
        if (newItem !== item) hasConverted = true;
        return newItem;
      });
      return hasConverted ? converted : obj;
    }

    if (typeof obj === 'object') {
      let hasConverted = false;
      const converted = {};

      for (const [key, value] of Object.entries(obj)) {
        // 简化版：只检查字段名
        const shouldConvert = key === '_id' || key.endsWith('Id') || key.endsWith('Ids');

        if (typeof value === 'string' && shouldConvert &&
            /^[0-9a-fA-F]{24}$/.test(value) && ObjectId.isValid(value)) {
          try {
            converted[key] = new ObjectId(value);
            hasConverted = true;
          } catch {
            converted[key] = value;
          }
        } else {
          const newValue = this.convertObjectIdStrings(value, depth + 1);
          if (newValue !== value) hasConverted = true;
          converted[key] = newValue;
        }
      }

      return hasConverted ? converted : obj;
    }

    return obj;
  }
};

// 创建测试套件
const suite = new Benchmark.Suite('ObjectId Conversion Performance');

// 测试数据
const validObjectIdString = '507f1f77bcf86cd799439011';
const validObjectId = new ObjectId(validObjectIdString);

// 场景1：简单查询（1个字段）
const simpleQuery = {
  _id: validObjectIdString
};

suite.add('Simple query (1 field)', () => {
  mockConverter.convertObjectIdStrings(simpleQuery);
});

// 场景2：简单查询（已经是 ObjectId）
const simpleQueryObjectId = {
  _id: validObjectId
};

suite.add('Simple query (ObjectId)', () => {
  mockConverter.convertObjectIdStrings(simpleQueryObjectId);
});

// 场景3：复杂查询（10+字段）
const complexQuery = {
  $or: [
    {
      _id: {
        $in: [
          '507f1f77bcf86cd799439011',
          '507f1f77bcf86cd799439012',
          '507f1f77bcf86cd799439013'
        ]
      }
    },
    { userId: '507f1f77bcf86cd799439014' }
  ],
  departmentId: '507f1f77bcf86cd799439015',
  managerId: { $ne: '507f1f77bcf86cd799439016' },
  createdById: '507f1f77bcf86cd799439017',
  updatedById: '507f1f77bcf86cd799439018'
};

suite.add('Complex query (10+ fields)', () => {
  mockConverter.convertObjectIdStrings(complexQuery);
});

// 场景4：无需转换的对象（性能基准）
const noConversionQuery = {
  name: 'John Doe',
  age: 30,
  email: 'john@example.com',
  status: 'active',
  tags: ['tag1', 'tag2', 'tag3']
};

suite.add('No conversion needed (baseline)', () => {
  mockConverter.convertObjectIdStrings(noConversionQuery);
});

// 场景5：大对象（100字段，其中10个需要转换）
const largeObject = {};
for (let i = 0; i < 100; i++) {
  if (i % 10 === 0) {
    largeObject[`userId${i}`] = validObjectIdString;
  } else {
    largeObject[`field${i}`] = `value${i}`;
  }
}

suite.add('Large object (100 fields)', () => {
  mockConverter.convertObjectIdStrings(largeObject);
});

// 场景6：深层嵌套（5层）
const deepNested = {
  _id: validObjectIdString,
  level1: {
    userId: validObjectIdString,
    level2: {
      managerId: validObjectIdString,
      level3: {
        departmentId: validObjectIdString,
        level4: {
          createdById: validObjectIdString
        }
      }
    }
  }
};

suite.add('Deep nested (5 levels)', () => {
  mockConverter.convertObjectIdStrings(deepNested);
});

// 场景7：数组（$in 操作，100个ID）
const arrayQuery = {
  _id: {
    $in: Array.from({ length: 100 }, (_, i) =>
      `507f1f77bcf86cd7994390${String(i).padStart(2, '0')}`
    )
  }
};

suite.add('Array ($in with 100 IDs)', () => {
  mockConverter.convertObjectIdStrings(arrayQuery);
});

// 运行测试
console.log('🚀 开始性能基准测试...\n');
console.log('测试环境:');
console.log(`  Node.js: ${process.version}`);
console.log(`  平台: ${process.platform} ${process.arch}`);
console.log(`  CPU: ${require('os').cpus()[0].model}\n`);

const results = [];

suite
  .on('cycle', (event) => {
    const benchmark = event.target;
    const name = benchmark.name;
    const hz = benchmark.hz;
    const meanTime = (1000 / hz).toFixed(4);

    console.log(`✓ ${name}`);
    console.log(`  Ops/sec: ${hz.toFixed(2)}`);
    console.log(`  Mean time: ${meanTime} ms`);
    console.log(`  ±${benchmark.stats.rme.toFixed(2)}%\n`);

    results.push({
      name,
      hz,
      meanTime: parseFloat(meanTime),
      rme: benchmark.stats.rme
    });
  })
  .on('complete', function() {
    console.log('=' .repeat(60));
    console.log('📊 测试完成\n');

    // 找到最快和最慢的
    const fastest = this.filter('fastest').map('name')[0];
    const slowest = this.filter('slowest').map('name')[0];

    console.log(`最快: ${fastest}`);
    console.log(`最慢: ${slowest}\n`);

    // 计算相对开销
    const baseline = results.find(r => r.name === 'No conversion needed (baseline)');
    const simple = results.find(r => r.name === 'Simple query (1 field)');
    const complex = results.find(r => r.name === 'Complex query (10+ fields)');

    if (baseline && simple) {
      const simpleOverhead = ((baseline.hz / simple.hz) - 1) * 100;
      console.log(`简单查询开销: ${simpleOverhead.toFixed(2)}%`);

      if (simpleOverhead < 10) {
        console.log('  ✅ 通过（< 10%）');
      } else if (simpleOverhead < 20) {
        console.log(`  ⚠️  警告（10% - 20%）`);
      } else {
        console.log(`  ❌ 失败（> 20%）`);
      }
    }

    if (baseline && complex) {
      const complexOverhead = ((baseline.hz / complex.hz) - 1) * 100;
      console.log(`复杂查询开销: ${complexOverhead.toFixed(2)}%`);

      if (complexOverhead < 10) {
        console.log('  ✅ 通过（< 10%）');
      } else if (complexOverhead < 20) {
        console.log(`  ⚠️  警告（10% - 20%）`);
      } else {
        console.log(`  ❌ 失败（> 20%）`);
      }
    }

    console.log('\n' + '='.repeat(60));

    // 验证性能要求
    console.log('\n🎯 性能要求验证:\n');

    let passed = true;

    // 简单查询：< 0.5ms
    if (simple && simple.meanTime < 0.5) {
      console.log(`✅ 简单查询: ${simple.meanTime}ms < 0.5ms`);
    } else if (simple) {
      console.log(`❌ 简单查询: ${simple.meanTime}ms >= 0.5ms`);
      passed = false;
    }

    // 复杂查询：< 2ms
    if (complex && complex.meanTime < 2) {
      console.log(`✅ 复杂查询: ${complex.meanTime}ms < 2ms`);
    } else if (complex) {
      console.log(`❌ 复杂查询: ${complex.meanTime}ms >= 2ms`);
      passed = false;
    }

    // 基准：< 0.05ms
    if (baseline && baseline.meanTime < 0.05) {
      console.log(`✅ 无转换基准: ${baseline.meanTime}ms < 0.05ms`);
    } else if (baseline) {
      console.log(`⚠️  无转换基准: ${baseline.meanTime}ms >= 0.05ms（可接受）`);
    }

    // 相对开销：< 10%
    if (baseline && simple) {
      const overhead = ((baseline.hz / simple.hz) - 1) * 100;
      if (overhead < 10) {
        console.log(`✅ 相对开销: ${overhead.toFixed(2)}% < 10%`);
      } else {
        console.log(`❌ 相对开销: ${overhead.toFixed(2)}% >= 10%`);
        passed = false;
      }
    }

    console.log('\n' + '='.repeat(60));

    if (passed) {
      console.log('\n✅ 性能测试通过！可以继续实施。\n');
      process.exit(0);
    } else {
      console.log('\n❌ 性能测试失败！需要优化后再实施。\n');
      process.exit(1);
    }
  })
  .run({ async: false });

