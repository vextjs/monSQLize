'use strict';

function validateTargetConfig(target, index) {
  if (!target || typeof target !== 'object') {
    throw new Error(`targets[${index}] 必须是对象`);
  }
  if (typeof target.name !== 'string' || target.name.trim() === '') {
    throw new Error(`targets[${index}].name 必须是非空字符串`);
  }
  if (typeof target.uri !== 'string' || target.uri.trim() === '') {
    throw new Error(`targets[${index}].uri 必须是非空字符串`);
  }
  if (target.collections !== undefined) {
    if (!Array.isArray(target.collections)) {
      throw new Error(`targets[${index}].collections 必须是数组`);
    }
    if (target.collections.length === 0) {
      throw new Error(`targets[${index}].collections 不能为空数组`);
    }
  }
}

function validateResumeTokenConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('[Sync] resumeToken 必须是对象');
  }
  if (config.storage !== 'file' && config.storage !== 'redis') {
    throw new Error('resumeToken.storage 必须是 file 或 redis');
  }
  if (config.storage === 'file' && typeof config.path !== 'string') {
    throw new Error('[Sync] resumeToken.path 必须是字符串');
  }
  if (config.storage === 'redis' && (!config.redis || typeof config.redis !== 'object')) {
    throw new Error('[Sync] resumeToken.redis 必须是对象');
  }
}

function validateSyncConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('[Sync] 配置必须是对象');
  }
  if (typeof config.enabled !== 'boolean') {
    throw new Error('[Sync] enabled 必须是 boolean 类型');
  }
  if (!config.enabled) {
    return;
  }
  if (!Array.isArray(config.targets) || config.targets.length === 0) {
    throw new Error('[Sync] targets 必须是非空数组');
  }
  if (config.filter !== undefined && typeof config.filter !== 'function') {
    throw new Error('[Sync] filter 必须是函数');
  }
  if (config.transform !== undefined && typeof config.transform !== 'function') {
    throw new Error('[Sync] transform 必须是函数');
  }
  config.targets.forEach((target, index) => validateTargetConfig(target, index));
  if (config.resumeToken !== undefined) {
    validateResumeTokenConfig(config.resumeToken);
  }
}

module.exports = {
  validateSyncConfig,
  validateTargetConfig,
  validateResumeTokenConfig,
};
