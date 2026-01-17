/**
 * Saga 执行上下文
 * 负责保存执行数据和状态
 */
class SagaContext {
    /**
     * 构造函数
     * @param {string} sagaId - Saga 唯一标识
     * @param {Object} data - 初始数据
     */
    constructor(sagaId, data) {
        this.sagaId = sagaId;
        this.data = data;
        this.customData = new Map();
        this.completedSteps = [];
        this.stepResults = new Map();
    }

    /**
     * 保存自定义数据
     * @param {string} key - 键
     * @param {*} value - 值
     */
    set(key, value) {
        this.customData.set(key, value);
    }

    /**
     * 获取自定义数据
     * @param {string} key - 键
     * @returns {*} 值
     */
    get(key) {
        return this.customData.get(key);
    }

    /**
     * 标记步骤完成
     * @param {string} stepName - 步骤名称
     * @param {*} result - 步骤结果
     */
    markStepCompleted(stepName, result) {
        this.completedSteps.push(stepName);
        this.stepResults.set(stepName, result);
    }

    /**
     * 获取步骤结果
     * @param {string} stepName - 步骤名称
     * @returns {*} 步骤结果
     */
    getStepResult(stepName) {
        return this.stepResults.get(stepName);
    }

    /**
     * 获取所有已完成步骤
     * @returns {string[]} 已完成步骤名称列表
     */
    getCompletedSteps() {
        return [...this.completedSteps];
    }
}

module.exports = SagaContext;

