import type { LoggerLike } from './base';

/** Execution context passed to each Saga step; provides data sharing between steps. */
export interface SagaContext {
    /** Unique ID for this Saga execution run. */
    readonly executionId: string;
    /** Initial data passed to `executeSaga`. */
    readonly data: unknown;
    /** Store a value in the shared step context. */
    set(key: string, value: unknown): void;
    /** Retrieve a previously stored value. */
    get<T = unknown>(key: string): T | undefined;
    /** Return `true` if a value exists for `key`. */
    has(key: string): boolean;
    /** Return all stored key-value pairs. */
    getAll(): Record<string, unknown>;
}

/** A single step within a Saga, consisting of a forward action and an optional compensation handler. */
export interface SagaStep {
    name: string;
    execute: (context: SagaContext) => Promise<unknown>;
    /** Compensation handler — receives the context and the step's own execute result. */
    compensate?: (context: SagaContext, result?: unknown) => Promise<void>;
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
    sagaId: string;
    /** @alias sagaId — v1 compatibility */
    executionId?: string;
    sagaName: string;
    success: boolean;
    /** The return value of the last completed step (success path). */
    result?: unknown;
    /** Error message string (set when success is false). */
    error?: string;
    completedSteps: number;
    /** Names of steps whose compensation handlers were invoked. */
    compensatedSteps?: string[];
    /** Total execution duration in milliseconds. */
    duration: number;
    /** Present on the failure path when at least one completed step has a compensate function. */
    compensation?: {
        success: boolean;
        results: Array<{ stepName: string; success: boolean; reason?: string; error?: string; duration?: number; }>;
    };
}

/** Options for constructing a `SagaOrchestrator`. */
export interface SagaOrchestratorOptions {
    logger?: LoggerLike | null;
}

/** Aggregate statistics for a `SagaOrchestrator` instance. */
export interface SagaStats {
    totalExecutions: number;
    /** @since v1.0.8 — primary v1 field name */
    successfulExecutions: number;
    /** @since v1.0.8 — primary v1 field name */
    failedExecutions: number;
    /** @since v1.0.8 — primary v1 field name */
    compensatedExecutions: number;
    successRate?: string;
    storageMode?: string;
    /** @alias successfulExecutions */
    successCount: number;
    /** @alias failedExecutions */
    failureCount: number;
    /** @alias compensatedExecutions */
    compensationCount: number;
}

/** Orchestrates the execution and compensation of multi-step Saga workflows. */
export declare class SagaOrchestrator {
    constructor(options?: SagaOrchestratorOptions);
    /** Register a Saga definition (sync). */
    define(definition: SagaDefinition): void;
    /** Register a Saga definition (async; returns a confirmation object). */
    defineSaga(definition: SagaDefinition): Promise<{ name: string }>;
    /** Execute the named Saga with the given initial data. */
    execute(name: string, data: unknown): Promise<SagaResult>;
    /** Return the definition for a registered Saga by name. */
    getSaga(name: string): SagaDefinition | undefined;
    /** Return the names of all registered Sagas. */
    listSagas(): Promise<string[]>;
    /** Return aggregate execution statistics. */
    getStats(): SagaStats;
}
