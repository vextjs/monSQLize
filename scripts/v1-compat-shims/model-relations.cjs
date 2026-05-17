'use strict';

class RelationManager {
  constructor(model) {
    this.model = model;
    this.relations = new Map();
  }

  define(name, config = {}) {
    for (const field of ['from', 'localField', 'foreignField']) {
      if (!(field in config)) {
        throw new Error(`relations 配置缺少必需字段: ${field}`);
      }
    }
    if (typeof config.from !== 'string') {
      throw new Error('relations.from 必须是字符串');
    }
    if (config.single !== undefined && typeof config.single !== 'boolean') {
      throw new Error('relations.single 必须是布尔值');
    }

    const relation = {
      from: config.from,
      localField: config.localField,
      foreignField: config.foreignField,
      single: config.single ?? false,
    };
    this.relations.set(name, relation);
    return relation;
  }

  get(name) {
    return this.relations.get(name) ?? null;
  }

  has(name) {
    return this.relations.has(name);
  }

  getAll() {
    return new Map(this.relations);
  }

  getNames() {
    return Array.from(this.relations.keys());
  }
}

module.exports = RelationManager;
