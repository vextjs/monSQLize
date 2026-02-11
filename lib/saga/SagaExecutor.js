/**
 * Saga 执行器
 * 负责步骤执行和补偿
 */
const SagaContext = require('./SagaContext');

class SagaExecutor {
    /**
     * 构造函数
     * @param {Object} definition - Saga 定义
     * @param {Object} data - 执行数据
     * @param {Object} orchestrator - Saga 协调器
     */
    constructor(definition, data, orchestrator) {
        this.definition = definition;
        this.orchestrator = orchestrator;
        this.context = new SagaContext(this._generateSagaId(), data);
        this.completedSteps = [];
    }

    /**
     * 执行 Saga
     * @returns {Promise<Object>} 执行结果
     */
    async execute() {
        const startTime = Date.now();

        this.orchestrator.logger?.info(
            `[Saga] 开始执行: ${this.definition.name} (${this.context.sagaId})`
        );

        try {
            // 顺序执行步骤
            for (let i = 0; i < this.definition.steps.length; i++) {
                const step = this.definition.steps[i];

                this.orchestrator.logger?.info(
                    `[Saga] 执行步骤 ${i + 1}/${this.definition.steps.length}: ${step.name}`
                );

                const stepStartTime = Date.now();

                // 执行步骤
                const result = await step.execute(this.context);

                const stepDuration = Date.now() - stepStartTime;

                // 记录成功的步骤
                this.completedSteps.push({
                    step,
                    index: i,
                    result,
                    duration: stepDuration,
                    timestamp: Date.now()
                });

                // 标记步骤完成
                this.context.markStepCompleted(step.name, result);

                this.orchestrator.logger?.info(
                    `[Saga] 步骤完成: ${step.name} (耗时 ${stepDuration}ms)`
                );
            }

            const totalDuration = Date.now() - startTime;

            this.orchestrator.logger?.info(
                `[Saga] 执行成功: ${this.definition.name} (总耗时 ${totalDuration}ms)`
            );

            return {
                success: true,
                sagaId: this.context.sagaId,
                sagaName: this.definition.name,
                completedSteps: this.completedSteps.length,
                duration: totalDuration
            };

        } catch (error) {
            const totalDuration = Date.now() - startTime;

            this.orchestrator.logger?.error(
                `[Saga] 执行失败: ${this.definition.name}, 错误: ${error.message}`
            );

            // 自动补偿
            const compensationResult = await this._compensate(error);

            return {
                success: false,
                sagaId: this.context.sagaId,
                sagaName: this.definition.name,
                completedSteps: this.completedSteps.length,
                failedStep: this.completedSteps.length,
                error: error.message,
                duration: totalDuration,
                compensation: compensationResult
            };
        }
    }

    /**
     * 补偿已完成的步骤
     * @private
     * @param {Error} originalError - 原始错误
     * @returns {Promise<Object>} 补偿结果
     */
    async _compensate(originalError) {
        this.orchestrator.logger?.warn(
            `[Saga] 开始补偿: ${this.completedSteps.length} 个已完成步骤`
        );

        const compensationResults = [];

        // 逆序补偿
        for (let i = this.completedSteps.length - 1; i >= 0; i--) {
            const completed = this.completedSteps[i];
            const step = completed.step;

            if (!step.compensate) {
                this.orchestrator.logger?.warn(
                    `[Saga] 步骤 ${step.name} 没有定义补偿操作，跳过`
                );

                compensationResults.push({
                    stepName: step.name,
                    success: false,
                    reason: 'no-compensate-defined'
                });

                continue;
            }

            try {
                this.orchestrator.logger?.info(
                    `[Saga] 补偿步骤: ${step.name}`
                );

                const startTime = Date.now();

                await step.compensate(this.context, completed.result);

                const duration = Date.now() - startTime;

                this.orchestrator.logger?.info(
                    `[Saga] 补偿成功: ${step.name} (耗时 ${duration}ms)`
                );

                compensationResults.push({
                    stepName: step.name,
                    success: true,
                    duration
                });

            } catch (compensateError) {
                this.orchestrator.logger?.error(
                    `[Saga] 补偿失败: ${step.name}, 错误: ${compensateError.message}`
                );

                compensationResults.push({
                    stepName: step.name,
                    success: false,
                    error: compensateError.message
                });
            }
        }

        // 检查是否所有补偿都成功
        const allSuccess = compensationResults.every(
            r => r.success || r.reason === 'no-compensate-defined'
        );

        if (!allSuccess) {
            this.orchestrator.logger?.error(
                '[Saga] 部分补偿失败，需要人工介入'
            );
        } else {
            this.orchestrator.logger?.info(
                '[Saga] 所有补偿完成'
            );
        }

        return {
            success: allSuccess,
            results: compensationResults
        };
    }

    /**
     * 生成 Saga ID
     * @private
     * @returns {string} Saga ID
     */
    _generateSagaId() {
        return `saga_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

module.exports = SagaExecutor;


