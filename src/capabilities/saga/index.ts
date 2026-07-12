/**
 * Saga orchestrator capability.
 *
 * Description:
 * - Responsible for Saga definition, execution, compensation, and statistics.
 * - Public and shared types are managed by `types/saga.d.ts`; only runtime implementation is kept here.
 */

import { randomBytes } from 'node:crypto';
import { ErrorCodes, createError } from '../../core/errors';
import type { LoggerLike } from '../../core/logger';
import type {
    SagaContext,
    SagaDefinition,
    SagaMetadataCache,
    SagaOrchestratorOptions,
    SagaResult,
    SagaStats,
    SagaStep,
} from '../../../types/saga';

export type {
    SagaContext,
    SagaDefinition,
    SagaMetadataCache,
    SagaOrchestratorOptions,
    SagaResult,
    SagaStats,
    SagaStep,
} from '../../../types/saga';

class SagaExecutionContext implements SagaContext {
    private readonly values = new Map<string, unknown>();
    private _signal: AbortSignal | undefined;

    // v1 compat: tracked separately so existing code that reads these fields still works.
    /** @deprecated v1 compat — ordered list of completed step names. */
    readonly completedSteps: string[] = [];
    private readonly _stepResults = new Map<string, unknown>();

    constructor(
        public readonly executionId: string,
        public readonly data: unknown,
    ) { }

    /** @deprecated Use `executionId` — v1 compatibility alias. */
    get sagaId(): string { return this.executionId; }

    get signal(): AbortSignal | undefined { return this._signal; }

    setSignal(signal: AbortSignal | undefined): void {
        this._signal = signal;
    }

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

    /**
     * Mark a step as completed and record its result.
     * @deprecated v1 compat — called automatically by the orchestrator. Use `ctx.get(stepName)` to retrieve step results.
     */
    markStepCompleted(stepName: string, result: unknown): void {
        this.completedSteps.push(stepName);
        this._stepResults.set(stepName, result);
    }

    /**
     * Return the result of a previously completed step.
     * @deprecated v1 compat — use `ctx.get(stepName)` instead.
     */
    getStepResult(stepName: string): unknown {
        return this._stepResults.get(stepName);
    }

    /**
     * Return an ordered copy of completed step names.
     * @deprecated v1 compat — use `ctx.getAll()` instead.
     */
    getCompletedSteps(): string[] {
        return [...this.completedSteps];
    }
}

/**
 * Legacy-compatible in-process Saga orchestrator with compensation support.
 * New durable workflow orchestration should live in the application/framework layer.
 * @since v1.8.0
 */
export class SagaOrchestrator {
    /** Whether Redis-style metadata storage is used. */
    public readonly useRedis: boolean;
    /** Map of registered Saga definitions. */
    public readonly sagas = new Map<string, SagaDefinition>();
    private readonly logger: LoggerLike | null;
    private readonly cache: SagaMetadataCache | null;
    private readonly _stats = {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        compensatedExecutions: 0,
    };

    constructor(options: SagaOrchestratorOptions = {}) {
        this.logger = options.logger ?? null;
        this.cache = options.cache ?? null;
        this.useRedis = Boolean(
            this.cache &&
            typeof this.cache.keys === 'function' &&
            typeof this.cache.publish === 'function',
        );
    }

    /**
     * Register a Saga definition.
     * @since v1.1.0
     */
    define(definition: SagaDefinition): void {
        validateSagaDefinition(definition);
        const normalized = normalizeSagaDefinition(definition);
        this.sagas.set(definition.name, normalized);
        void this.persistSagaMetadata(normalized);
    }

    /**
     * Compatibility alias for `define()` — async and returns the registered Saga definition object.
     * @since v1.1.0
     */
    async defineSaga(definition: SagaDefinition): Promise<SagaDefinition> {
        validateSagaDefinition(definition);
        const normalized = normalizeSagaDefinition(definition);
        this.sagas.set(definition.name, normalized);
        await this.persistSagaMetadata(normalized);
        return normalized;
    }

    /**
     * Execute the specified Saga.
     * @since v1.1.0
     */
    async execute(name: string, data: unknown): Promise<SagaResult> {
        const definition = this.sagas.get(name);
        if (!definition) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, `Saga '${name}' is not defined`);
        }

        const sagaId = `saga_${randomBytes(8).toString('hex')}`;
        const startedAt = Date.now();
        const context = new SagaExecutionContext(sagaId, data);
        const completedSteps: Array<{ step: SagaStep; result: unknown }> = [];

        this._stats.totalExecutions += 1;

        try {
            for (const step of definition.steps) {
                const result = await executeStepWithRetry(step, context, definition.timeout, this.logger);
                completedSteps.push({ step, result });
                if (result !== undefined) {
                    context.set(step.name, result);
                }
                context.markStepCompleted(step.name, result);
            }

            this._stats.successfulExecutions += 1;
            const stepNames = completedSteps.map(({ step }) => step.name);
            return {
                sagaId,
                executionId: sagaId,
                sagaName: name,
                success: true,
                completedSteps: stepNames,
                completedStepCount: stepNames.length,
                completedStepNames: stepNames,
                compensatedSteps: [],
                result: completedSteps[completedSteps.length - 1]?.result,
                duration: Date.now() - startedAt,
            } as SagaResult;
        } catch (cause) {
            const publicError = cause instanceof Error ? cause : new Error(String(cause));
            const completedStepNames = completedSteps.map(({ step }) => step.name);
            this._stats.failedExecutions += 1;

            const compensationResults: Array<{
                stepName: string;
                success: boolean;
                reason?: string;
                error?: string;
                duration?: number;
            }> = [];

            const hasCompensationSteps = completedSteps.some(({ step }) => typeof step.compensate === 'function');
            if (hasCompensationSteps) {
                this._stats.compensatedExecutions += 1;
            }

            for (const { step, result: stepResult } of [...completedSteps].reverse()) {
                if (typeof step.compensate !== 'function') {
                    compensationResults.push({ stepName: step.name, success: false, reason: 'no-compensate-defined' });
                    continue;
                }
                const compStart = Date.now();
                try {
                    await step.compensate(context, stepResult);
                    compensationResults.push({ stepName: step.name, success: true, duration: Date.now() - compStart });
                } catch (compensationError) {
                    const compMsg = compensationError instanceof Error ? compensationError.message : String(compensationError);
                    compensationResults.push({ stepName: step.name, success: false, error: compMsg });
                    this.logger?.error?.('[Saga] compensation failed', {
                        saga: name,
                        step: step.name,
                        error: compensationError,
                    });
                }
            }

            const compensationSuccess = compensationResults.every(
                (r) => r.success || r.reason === 'no-compensate-defined',
            );

            return {
                sagaId,
                executionId: sagaId,
                sagaName: name,
                success: false,
                completedSteps: completedStepNames,
                completedStepCount: completedStepNames.length,
                completedStepNames,
                compensatedSteps: compensationResults
                    .filter(r => r.reason !== 'no-compensate-defined')
                    .map(r => r.stepName),
                duration: Date.now() - startedAt,
                error: publicError,
                errorMessage: publicError.message,
                errorCause: cause instanceof Error ? cause : undefined,
                compensation: {
                    success: compensationSuccess,
                    results: compensationResults,
                },
            } as SagaResult;
        }
    }

    /**
     * Get a Saga definition.
     * @since v1.1.0
     */
    getSaga(name: string): SagaDefinition | undefined {
        return this.sagas.get(name);
    }

    /**
     * Get all registered Saga names.
     * @since v1.1.0
     */
    listSagas(): string[] {
        return [...this.sagas.keys()];
    }

    /**
     * Get execution statistics.
     * @since v1.1.0
     */
    getStats(): SagaStats {
        const { totalExecutions, successfulExecutions, failedExecutions, compensatedExecutions } = this._stats;
        const successRate =
            totalExecutions > 0 ? `${Math.round((successfulExecutions / totalExecutions) * 100)}%` : '0%';
        return {
            totalExecutions,
            successfulExecutions,
            failedExecutions,
            compensatedExecutions,
            successRate,
            storageMode: 'memory',
            // v1 aliases
            successCount: successfulExecutions,
            failureCount: failedExecutions,
            compensationCount: compensatedExecutions,
        } as unknown as SagaStats;
    }

    private async persistSagaMetadata(definition: SagaDefinition): Promise<void> {
        if (!this.useRedis || !this.cache) {
            return;
        }
        try {
            await this.cache.set(`monsqlize:saga:def:${definition.name}`, definition);
        } catch (error) {
            this.logger?.warn?.('[Saga] failed to persist saga metadata', {
                saga: definition.name,
                error,
            });
        }
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
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'Saga name is required');
    }
    if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'Saga steps must be a non-empty array');
    }

    for (const step of definition.steps) {
        if (!step || typeof step !== 'object') {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'Saga step must be an object.');
        }
        if (typeof step.name !== 'string' || step.name.trim() === '') {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'Saga step requires a non-empty name.');
        }
        if (typeof step.execute !== 'function') {
            throw createError(ErrorCodes.INVALID_ARGUMENT, `Each step must have name and execute function`);
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
            const timeout = step.timeout ?? defaultTimeout;
            const controller = timeout && timeout > 0 ? new AbortController() : null;
            (context as SagaExecutionContext).setSignal?.(controller?.signal);
            const promise = step.execute(context);
            return timeout && timeout > 0
                ? await withTimeout(step.name, promise, timeout, () => {
                    controller?.abort(createError(ErrorCodes.OPERATION_TIMEOUT, `Saga step '${step.name}' timed out after ${timeout}ms.`));
                })
                : await promise;
        } catch (cause) {
            if (isOperationTimeout(cause)) {
                throw cause;
            }
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

function isOperationTimeout(error: unknown): boolean {
    return error instanceof Error
        && 'code' in error
        && (error as Error & { code?: string }).code === ErrorCodes.OPERATION_TIMEOUT;
}

async function withTimeout<T>(stepName: string, promise: Promise<T>, timeoutMs: number, onTimeout?: () => void): Promise<T> {
    let timer: NodeJS.Timeout | null = null;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_resolve, reject) => {
                timer = setTimeout(() => {
                    reject(createError(ErrorCodes.OPERATION_TIMEOUT, `Saga step '${stepName}' timed out after ${timeoutMs}ms.`));
                    onTimeout?.();
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

