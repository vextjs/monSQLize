/**
 * 配置管理器 - 单元测试
 * @version 1.3.0
 * @since 2025-12-22
 */

const { SlowQueryLogConfigManager, DEFAULT_CONFIG } = require('../../lib/slow-query-log/config-manager');

describe('SlowQueryLogConfigManager', () => {
  describe('mergeConfig', () => {
    describe('场景1：未配置', () => {
      test('undefined返回禁用默认值', () => {
        const config = SlowQueryLogConfigManager.mergeConfig(undefined, 'mongodb');

        expect(config.enabled).toBe(false);
        expect(config.storage).toBeDefined();
        expect(config.deduplication).toBeDefined();
        expect(config.batch).toBeDefined();
      });

      test('null返回禁用默认值', () => {
        const config = SlowQueryLogConfigManager.mergeConfig(null, 'mongodb');

        expect(config.enabled).toBe(false);
      });
    });

    describe('场景2：boolean快捷配置', () => {
      test('true启用默认配置', () => {
        const config = SlowQueryLogConfigManager.mergeConfig(true, 'mongodb');

        expect(config.enabled).toBe(true);
        expect(config.storage.type).toBe('mongodb');
        expect(config.storage.useBusinessConnection).toBe(true);
        expect(config.deduplication.enabled).toBe(true);
        expect(config.batch.enabled).toBe(true);
      });

      test('false禁用配置', () => {
        const config = SlowQueryLogConfigManager.mergeConfig(false, 'mongodb');

        expect(config.enabled).toBe(false);
      });

      test('自动推断storage.type', () => {
        const config = SlowQueryLogConfigManager.mergeConfig(true, 'postgresql');

        expect(config.storage.type).toBe('postgresql');
      });
    });

    describe('场景3：对象配置', () => {
      test('深度合并配置', () => {
        const userConfig = {
          enabled: true,
          storage: {
            mongodb: {
              ttl: 3 * 24 * 3600
            }
          }
        };

        const config = SlowQueryLogConfigManager.mergeConfig(userConfig, 'mongodb');

        expect(config.enabled).toBe(true);
        expect(config.storage.mongodb.ttl).toBe(3 * 24 * 3600);
        expect(config.storage.mongodb.database).toBe('admin');  // 默认值保留
        expect(config.storage.mongodb.collection).toBe('slow_query_logs');
      });

      test('智能推断：提供storage配置自动启用', () => {
        const userConfig = {
          storage: {
            mongodb: {
              ttl: 1 * 24 * 3600
            }
          }
        };

        const config = SlowQueryLogConfigManager.mergeConfig(userConfig, 'mongodb');

        expect(config.enabled).toBe(true);  // 自动启用
      });

      test('自动推断storage.type（复用连接）', () => {
        const userConfig = {
          enabled: true,
          storage: {
            useBusinessConnection: true
          }
        };

        const config = SlowQueryLogConfigManager.mergeConfig(userConfig, 'postgresql');

        expect(config.storage.type).toBe('postgresql');
      });

      test('自动推断storage.type（独立连接默认MongoDB）', () => {
        const userConfig = {
          enabled: true,
          storage: {
            useBusinessConnection: false,
            uri: 'mongodb://localhost:27017/admin'
          }
        };

        const config = SlowQueryLogConfigManager.mergeConfig(userConfig, 'postgresql');

        expect(config.storage.type).toBe('mongodb');
      });

      test('覆盖默认配置', () => {
        const userConfig = {
          enabled: true,
          batch: {
            size: 20,
            interval: 3000
          }
        };

        const config = SlowQueryLogConfigManager.mergeConfig(userConfig, 'mongodb');

        expect(config.batch.size).toBe(20);
        expect(config.batch.interval).toBe(3000);
        expect(config.batch.enabled).toBe(true);  // 默认值保留
      });
    });

    describe('场景4：错误配置', () => {
      test('无效配置类型抛出异常', () => {
        expect(() => {
          SlowQueryLogConfigManager.mergeConfig('invalid', 'mongodb');
        }).toThrow('Invalid slowQueryLog config type');
      });

      test('数字配置抛出异常', () => {
        expect(() => {
          SlowQueryLogConfigManager.mergeConfig(123, 'mongodb');
        }).toThrow('Invalid slowQueryLog config type');
      });
    });
  });

  describe('validate', () => {
    describe('storage.type验证', () => {
      test('有效的storage.type通过验证', () => {
        const config = {
          storage: { type: 'mongodb', useBusinessConnection: true, uri: null, mongodb: DEFAULT_CONFIG.storage.mongodb },
          deduplication: DEFAULT_CONFIG.deduplication,
          batch: DEFAULT_CONFIG.batch
        };

        expect(() => {
          SlowQueryLogConfigManager.validate(config, 'mongodb');
        }).not.toThrow();
      });

      test('无效的storage.type抛出异常', () => {
        const config = {
          storage: { type: 'invalid', useBusinessConnection: true, uri: null, mongodb: DEFAULT_CONFIG.storage.mongodb },
          deduplication: DEFAULT_CONFIG.deduplication,
          batch: DEFAULT_CONFIG.batch
        };

        expect(() => {
          SlowQueryLogConfigManager.validate(config, 'mongodb');
        }).toThrow('Invalid storage.type');
      });
    });

    describe('useBusinessConnection验证', () => {
      test('复用连接且类型一致通过验证', () => {
        const config = {
          storage: { type: 'mongodb', useBusinessConnection: true, uri: null, mongodb: DEFAULT_CONFIG.storage.mongodb },
          deduplication: DEFAULT_CONFIG.deduplication,
          batch: DEFAULT_CONFIG.batch
        };

        expect(() => {
          SlowQueryLogConfigManager.validate(config, 'mongodb');
        }).not.toThrow();
      });

      test('复用连接但类型不一致抛出异常', () => {
        const config = {
          storage: { type: 'postgresql', useBusinessConnection: true, uri: null, mongodb: DEFAULT_CONFIG.storage.mongodb },
          deduplication: DEFAULT_CONFIG.deduplication,
          batch: DEFAULT_CONFIG.batch
        };

        expect(() => {
          SlowQueryLogConfigManager.validate(config, 'mongodb');
        }).toThrow('Cannot use business connection when storage type');
      });

      test('独立连接但未提供uri抛出异常', () => {
        const config = {
          storage: { type: 'mongodb', useBusinessConnection: false, uri: null, mongodb: DEFAULT_CONFIG.storage.mongodb },
          deduplication: DEFAULT_CONFIG.deduplication,
          batch: DEFAULT_CONFIG.batch
        };

        expect(() => {
          SlowQueryLogConfigManager.validate(config, 'mongodb');
        }).toThrow('storage.uri is required when useBusinessConnection=false');
      });

      test('独立连接且提供uri通过验证', () => {
        const config = {
          storage: {
            type: 'mongodb',
            useBusinessConnection: false,
            uri: 'mongodb://localhost:27017/admin',
            mongodb: DEFAULT_CONFIG.storage.mongodb
          },
          deduplication: DEFAULT_CONFIG.deduplication,
          batch: DEFAULT_CONFIG.batch
        };

        expect(() => {
          SlowQueryLogConfigManager.validate(config, 'mongodb');
        }).not.toThrow();
      });
    });

    describe('deduplication.strategy验证', () => {
      test('有效的strategy通过验证', () => {
        const config = {
          storage: { type: 'mongodb', useBusinessConnection: true, uri: null, mongodb: DEFAULT_CONFIG.storage.mongodb },
          deduplication: { enabled: true, strategy: 'aggregate', keepRecentExecutions: 0 },
          batch: DEFAULT_CONFIG.batch
        };

        expect(() => {
          SlowQueryLogConfigManager.validate(config, 'mongodb');
        }).not.toThrow();
      });

      test('无效的strategy抛出异常', () => {
        const config = {
          storage: { type: 'mongodb', useBusinessConnection: true, uri: null, mongodb: DEFAULT_CONFIG.storage.mongodb },
          deduplication: { enabled: true, strategy: 'invalid', keepRecentExecutions: 0 },
          batch: DEFAULT_CONFIG.batch
        };

        expect(() => {
          SlowQueryLogConfigManager.validate(config, 'mongodb');
        }).toThrow('Invalid deduplication.strategy');
      });
    });

    describe('TTL验证', () => {
      test('正数TTL通过验证', () => {
        const config = {
          storage: {
            type: 'mongodb',
            useBusinessConnection: true,
            uri: null,
            mongodb: { ...DEFAULT_CONFIG.storage.mongodb, ttl: 7 * 24 * 3600 }
          },
          deduplication: DEFAULT_CONFIG.deduplication,
          batch: DEFAULT_CONFIG.batch
        };

        expect(() => {
          SlowQueryLogConfigManager.validate(config, 'mongodb');
        }).not.toThrow();
      });

      test('负数TTL抛出异常', () => {
        const config = {
          storage: {
            type: 'mongodb',
            useBusinessConnection: true,
            uri: null,
            mongodb: { ...DEFAULT_CONFIG.storage.mongodb, ttl: -1 }
          },
          deduplication: DEFAULT_CONFIG.deduplication,
          batch: DEFAULT_CONFIG.batch
        };

        expect(() => {
          SlowQueryLogConfigManager.validate(config, 'mongodb');
        }).toThrow('storage.mongodb.ttl must be positive');
      });
    });

    describe('batch配置验证', () => {
      test('有效的batch.size通过验证', () => {
        const config = {
          storage: { type: 'mongodb', useBusinessConnection: true, uri: null, mongodb: DEFAULT_CONFIG.storage.mongodb },
          deduplication: DEFAULT_CONFIG.deduplication,
          batch: { enabled: true, size: 10, interval: 5000, maxBufferSize: 100 }
        };

        expect(() => {
          SlowQueryLogConfigManager.validate(config, 'mongodb');
        }).not.toThrow();
      });

      test('batch.size < 1抛出异常', () => {
        const config = {
          storage: { type: 'mongodb', useBusinessConnection: true, uri: null, mongodb: DEFAULT_CONFIG.storage.mongodb },
          deduplication: DEFAULT_CONFIG.deduplication,
          batch: { enabled: true, size: 0, interval: 5000, maxBufferSize: 100 }
        };

        expect(() => {
          SlowQueryLogConfigManager.validate(config, 'mongodb');
        }).toThrow('batch.size must be between 1 and 1000');
      });

      test('batch.size > 1000抛出异常', () => {
        const config = {
          storage: { type: 'mongodb', useBusinessConnection: true, uri: null, mongodb: DEFAULT_CONFIG.storage.mongodb },
          deduplication: DEFAULT_CONFIG.deduplication,
          batch: { enabled: true, size: 1001, interval: 5000, maxBufferSize: 100 }
        };

        expect(() => {
          SlowQueryLogConfigManager.validate(config, 'mongodb');
        }).toThrow('batch.size must be between 1 and 1000');
      });

      test('batch.interval < 100抛出异常', () => {
        const config = {
          storage: { type: 'mongodb', useBusinessConnection: true, uri: null, mongodb: DEFAULT_CONFIG.storage.mongodb },
          deduplication: DEFAULT_CONFIG.deduplication,
          batch: { enabled: true, size: 10, interval: 50, maxBufferSize: 100 }
        };

        expect(() => {
          SlowQueryLogConfigManager.validate(config, 'mongodb');
        }).toThrow('batch.interval must be >= 100ms');
      });
    });
  });

  describe('默认配置', () => {
    test('DEFAULT_CONFIG结构完整', () => {
      expect(DEFAULT_CONFIG).toHaveProperty('enabled');
      expect(DEFAULT_CONFIG).toHaveProperty('storage');
      expect(DEFAULT_CONFIG).toHaveProperty('deduplication');
      expect(DEFAULT_CONFIG).toHaveProperty('batch');
      expect(DEFAULT_CONFIG).toHaveProperty('filter');
      expect(DEFAULT_CONFIG).toHaveProperty('advanced');
    });

    test('默认值符合预期', () => {
      expect(DEFAULT_CONFIG.enabled).toBe(false);
      expect(DEFAULT_CONFIG.storage.type).toBe(null);
      expect(DEFAULT_CONFIG.storage.useBusinessConnection).toBe(true);
      expect(DEFAULT_CONFIG.deduplication.enabled).toBe(true);
      expect(DEFAULT_CONFIG.deduplication.strategy).toBe('aggregate');
      expect(DEFAULT_CONFIG.batch.enabled).toBe(true);
      expect(DEFAULT_CONFIG.batch.size).toBe(10);
      expect(DEFAULT_CONFIG.batch.interval).toBe(5000);
    });
  });
});

