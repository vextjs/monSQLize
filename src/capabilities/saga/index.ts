/**
 * P4-C Saga orchestrator 能力。
 *
 * 说明：
 * - 当前模块负责 Saga 定义、执行、补偿与统计的最小闭环。
 * - 公开与共享类型统一由 `types/saga.d.ts` 承接；此处只保留运行时实现。
 */

import { ErrorCodes, createError } from '../../core/errors';
import type { LoggerLike } from '../../core/logger';
import type {
    SagaContext,
    SagaDefinition,
    SagaOrchestratorOptions,
    SagaResult,
    SagaStats,
    SagaStep,
} from '../../../types/saga';

export type {
    SagaContext,
    SagaDefinition,
    SagaOrchestratorOptions,
    SagaResult,
    SagaStats,
    SagaStep,
} from '../../../types/saga';

class SagaExecutionContext implements SagaContext {
    private readonly values = new Map<string, unknown>();

    constructor(
        public readonly executionId: string,
        public readonly data: unknown,
    ) {}

    set(key: string, value: unknown): void {
        this.values.set(key, value);
    }

    get<T = unknown>(key: string): T | undefined {
        return this.values.get(key) as T | undefined;
    }

    has(key: string): boolean {
        return this.values.has(key);
    }

    getAll(): Record<string, unknown> {
        return Object.fromEntries(this.values.entries());
    }
}

export class SagaOrchestrator {
    private readonly sagas = new Map<string, SagaDefinition>();
    private readonly logger: LoggerLike | null;
    private readonly stats: SagaStats = {
        totalExecutions: 0,
        successCount: 0,
        failureCount: 0,
        compensationCount: 0,
    };

    constructor(options: SagaOrchestratorOptions = {}) {
        this.logger = options.logger ?? null;
    }

    /**
     * 注册 Saga 定义。
     * @since v1.1.0
     */
    define(definition: SagaDefinition): void {
        validateSagaDefinition(definition);
        this.sagas.set(definition.name, normalizeSagaDefinition(definition));
    }

    /**
     * `define()` 兼容别名。
     * @since v1.1.0
     */
    defineSaga(definition: SagaDefinition): void {
        this.define(definition);
    }

    /**
     * 执行指定 Saga。
     * @since v1.1.0
     */
    async execute(name: string, data: unknown): Promise<SagaResult> {
        const definition = this.sagas.get(name);
        if (!definition) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, `Saga '${name}' is not defined.`);
        }

        const executionId = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const startedAt = Date.now();
        const context = new SagaExecutionContext(executionId, data);
        const completedSteps: SagaStep[] = [];
        const completedStepNames: string[] = [];
        const compensatedSteps: string[] = [];
        let lastResult: unknown;

        this.stats.totalExecutions += 1;

        try {
            for (const step of definition.steps) {
                lastResult = await executeStepWithRetry(step, context, definition.timeout, this.logger);
                completedSteps.push(step);
                completedStepNames.push(step.name);
                if (lastResult !== undefined) {
                    context.set(step.name, lastResult);
                }
            }

            this.stats.successCount += 1;
            return {
                executionId,
                success: true,
                result: lastResult,
                completedSteps: completedStepNames,
                compensatedSteps,
                duration: Date.now() - startedAt,
            };
        } catch (cause) {
            const error = cause instanceof Error ? cause : new Error(String(cause));
            this.stats.failureCount += 1;

            for (const step of [...completedSteps].reverse()) {
                if (typeof step.compensate !== 'function') {
                    continue;
                }
                try {
                    await step.compensate(context);
                    compensatedSteps.push(step.name);
                    this.stats.compensationCount += 1;
                } catch (compensationError) {
                    this.logger?.error?.('[Saga] compensation failed', {
                        saga: name,
                        step: step.name,
                        error: compensationError,
                    });
                }
            }

            return {
                executionId,
                success: false,
                error,
                completedSteps: completedStepNames,
                compensatedSteps,
                duration: Date.now() - startedAt,
            };
        }
    }

    /**
     * 获取 Saga 定义。
     * @since v1.1.0
     */
    getSaga(name: string): SagaDefinition | undefined {
        return this.sagas.get(name);
    }

    /**
     * 获取已注册的 Saga 名称。
     * @since v1.1.0
     */
    listSagas(): string[] {
        return [...this.sagas.keys()];
    }

    /**
     * 获取执行统计。
     * @since v1.1.0
     */
    getStats(): SagaStats {
        return {
            ...this.stats,
        };
    }
}

function normalizeSagaDefinition(definition: SagaDefinition): SagaDefinition {
    return {
        name: definition.name,
        timeout: definition.timeout,
        logging: definition.logging ?? true,
        steps: definition.steps.map((step) => ({
            ...step,
            retries: step.retries ?? 0,
        })),
    };
}

function validateSagaDefinition(definition: SagaDefinition): void {
    if (!definition || typeof definition !== 'object') {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'Saga definition must be an object.');
    }
    if (typeof definition.name !== 'string' || definition.name.trim() === '') {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'Saga definition requires a non-empty name.');
    }
    if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'Saga definition requires a non-empty steps array.');
    }

    for (const step of definition.steps) {
        if (!step || typeof step !== 'object') {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'Saga step must be an object.');
        }
        if (typeof step.name !== 'string' || step.name.trim() === '') {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'Saga step requires a non-empty name.');
        }
        if (typeof step.execute !== 'function') {
            throw createError(ErrorCodes.INVALID_ARGUMENT, `Saga step '${step.name}' requires an execute function.`);
        }
        if (step.compensate !== undefined && typeof step.compensate !== 'function') {
            throw createError(ErrorCodes.INVALID_ARGUMENT, `Saga step '${step.name}' compensate must be a function.`);
        }
        if (step.timeout !== undefined && (!Number.isFinite(step.timeout) || step.timeout <= 0)) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, `Saga step '${step.name}' timeout must be a positive number.`);
        }
        if (step.retries !== undefined && (!Number.isInteger(step.retries) || step.retries < 0)) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, `Saga step '${step.name}' retries must be a non-negative integer.`);
        }
    }
}

async function executeStepWithRetry(
    step: SagaStep,
    context: SagaContext,
    defaultTimeout: number | undefined,
    logger: LoggerLike | null,
): Promise<unknown> {
    const retries = step.retries ?? 0;
    let attempt = 0;
    while (true) {
        try {
            const promise = step.execute(context);
            const timeout = step.timeout ?? defaultTimeout;
            return timeout && timeout > 0
                ? await withTimeout(step.name, promise, timeout)
                : await promise;
        } catch (cause) {
            if (attempt >= retries) {
                throw cause;
            }
            attempt += 1;
            logger?.warn?.('[Saga] retrying step', {
                step: step.name,
                attempt,
                retries,
                error: cause,
            });
        }
    }
}

async function withTimeout<T>(stepName: string, promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | null = null;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_resolve, reject) => {
                timer = setTimeout(() => {
                    reject(createError(ErrorCodes.INVALID_ARGUMENT, `Saga step '${stepName}' timed out after ${timeoutMs}ms.`));
                }, timeoutMs);
                timer.unref?.();
            }),
        ]);
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}

