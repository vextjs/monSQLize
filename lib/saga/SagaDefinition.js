/**
 * Saga 定义
 * 封装 Saga 配置和执行逻辑
 */
const SagaExecutor = require('./SagaExecutor');

class SagaDefinition {
    /**
     * 构造函数
     * @param {Object} config - Saga 配置
     * @param {Object} orchestrator - Saga 协调器
     */
    constructor(config, orchestrator) {
        this.name = config.name;
        this.steps = config.steps;
        this.orchestrator = orchestrator;
    }

    /**
     * 执行 Saga
     * @param {Object} data - 执行数据
     * @returns {Promise<Object>} 执行结果
     */
    async execute(data) {
        const executor = new SagaExecutor(this, data, this.orchestrator);
        return await executor.execute();
    }
}

module.exports = SagaDefinition;


