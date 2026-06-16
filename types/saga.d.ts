import type { LoggerLike } from './base';

export interface SagaMetadataCache {
    set(key: string, value: any, ttl?: number): void | Promise<void>;
    keys?(pattern?: string): string[] | Promise<string[]>;
    publish?(channel: string, message: string): void | Promise<unknown>;
}

/** Execution context passed to each Saga step; provides data sharing between steps. */
export interface SagaContext {
    /** Unique ID for this Saga execution run. */
    readonly executionId: string;
    /** @deprecated Use `executionId` — v1 compatibility alias. */
    readonly sagaId?: string;
    /** Initial data passed to `executeSaga`. */
    readonly data: any;
    /** Store a value in the shared step context. */
    set(key: string, value: any): void;
    /** Retrieve a previously stored value. v1 compat — default generic is `any` to match v1 callers that did not annotate. */
    get<T = any>(key: string): T | undefined;
    /** Return `true` if a value exists for `key`. */
    has(key: string): boolean;
    /** Return all stored key-value pairs. */
    getAll(): Record<string, any>;
    /**
     * Ordered list of completed step names.
     * @deprecated v1 compat — populated automatically by the orchestrator.
     */
    readonly completedSteps: string[];
    /**
     * Mark a step as completed and record its result.
     * @deprecated v1 compat — called automatically by the orchestrator. Use `ctx.get(stepName)` to retrieve step results.
     */
    markStepCompleted(stepName: string, result: unknown): void;
    /**
     * Return the result of a previously completed step.
     * @deprecated v1 compat — use `ctx.get(stepName)` instead.
     */
    getStepResult(stepName: string): unknown;
    /**
     * Return an ordered copy of completed step names.
     * @deprecated v1 compat — use `ctx.getAll()` instead.
     */
    getCompletedSteps(): string[];
}

/** A single step within a Saga, consisting of a forward action and an optional compensation handler. */
export interface SagaStep {
    name: string;
    execute: (context: SagaContext) => Promise<any>;
    /** Compensation handler — receives the context and the step's own execute result. v1 compat — required so callers may invoke `step.compensate(ctx)` without optional-chaining. */
    compensate: (context: SagaContext, result?: any) => Promise<void>;
    /** Per-step timeout in milliseconds (overrides Saga-level timeout). */
    timeout?: number;
    /** Number of retry attempts on step failure. */
    retries?: number;
}

/** Definition of a Saga, including its ordered steps and execution configuration. */
export interface SagaDefinition {
    name: string;
    steps: SagaStep[];
    /** Overall Saga timeout in milliseconds. */
    timeout?: number;
    /** Whether to emit detailed execution logs. */
    logging?: boolean;
}

/** Result returned after a Saga execution (success or failure). */
export interface SagaResult {
    /** v2 field — present when emitted by v2 runtime; v1 fixtures may omit. */
    sagaId?: string;
    /** Primary v1 field — always present in both v1 and v2 runtime output. */
    executionId: string;
    /** v2 field — present when emitted by v2 runtime; v1 fixtures may omit. */
    sagaName?: string;
    success: boolean;
    /** The return value of the last completed step (success path). */
    result?: any;
    /** v1-compatible Error object (set when success is false). */
    error?: Error;
    /** v2 compatibility alias for message-only consumers. */
    errorMessage?: string;
    /** Ordered list of completed step names. */
    completedSteps: string[];
    /** v2 compatibility alias for count-only consumers. */
    completedStepCount?: number;
    /** @deprecated Alias of `completedSteps` retained for v2 callers. */
    completedStepNames?: string[];
    /** Names of steps whose compensation handlers were invoked. v1 compat — runtime always populates an array (empty on success). */
    compensatedSteps: string[];
    /** Total execution duration in milliseconds. */
    duration: number;
    /** Original Error object (failure path only). v1 compat — `error` field is a string in v2. */
    errorCause?: any;
    /** Present on the failure path when at least one completed step has a compensate function. */
    compensation?: {
        success: boolean;
        results: Array<{ stepName: string; success: boolean; reason?: string; error?: string; duration?: number; }>;
    };
}

/** Options for constructing a `SagaOrchestrator`. */
export interface SagaOrchestratorOptions {
    logger?: LoggerLike | null;
    cache?: SagaMetadataCache | null;
}

/** Aggregate statistics for a `SagaOrchestrator` instance. */
export interface SagaStats {
    totalExecutions: number;
    /** @since v1.0.8 — v2 extension; v1 fixtures may omit. */
    successfulExecutions?: number;
    /** @since v1.0.8 — v2 extension; v1 fixtures may omit. */
    failedExecutions?: number;
    /** @since v1.0.8 — v2 extension; v1 fixtures may omit. */
    compensatedExecutions?: number;
    successRate?: string;
    storageMode?: string;
    /** Primary v1 field — always present in both v1 and v2 runtime output. */
    successCount: number;
    /** Primary v1 field — always present in both v1 and v2 runtime output. */
    failureCount: number;
    /** Primary v1 field — always present in both v1 and v2 runtime output. */
    compensationCount: number;
}

/**
 * Legacy-compatible in-process Saga orchestrator with compensation support.
 * @deprecated Saga APIs are retained for compatibility. Prefer application/framework-level workflow orchestration.
 */
export declare class SagaOrchestrator {
    constructor(options?: SagaOrchestratorOptions);
    /** @deprecated Saga APIs are retained for compatibility. Prefer application/framework-level workflow orchestration. */
    define(definition: SagaDefinition): void;
    /** @deprecated Saga APIs are retained for compatibility. Prefer application/framework-level workflow orchestration. */
    defineSaga(definition: SagaDefinition): Promise<SagaDefinition>;
    /** @deprecated Saga APIs are retained for compatibility. Prefer application/framework-level workflow orchestration. */
    execute(name: string, data: any): Promise<SagaResult>;
    /** Return the definition for a registered Saga by name. */
    getSaga(name: string): SagaDefinition | undefined;
    /** Return the names of all registered Sagas. */
    listSagas(): string[];
    /** Return aggregate execution statistics. */
    getStats(): SagaStats;
}
