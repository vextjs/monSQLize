import type { LoggerLike } from './base';

export interface SagaContext {
    readonly executionId: string;
    readonly data: unknown;
    set(key: string, value: unknown): void;
    get<T = unknown>(key: string): T | undefined;
    has(key: string): boolean;
    getAll(): Record<string, unknown>;
}

export interface SagaStep {
    name: string;
    execute: (context: SagaContext) => Promise<unknown>;
    compensate?: (context: SagaContext) => Promise<void>;
    timeout?: number;
    retries?: number;
}

export interface SagaDefinition {
    name: string;
    steps: SagaStep[];
    timeout?: number;
    logging?: boolean;
}

export interface SagaResult {
    executionId: string;
    success: boolean;
    result?: unknown;
    error?: Error;
    completedSteps: number;
    compensatedSteps: string[];
    duration: number;
}

export interface SagaOrchestratorOptions {
    logger?: LoggerLike | null;
}

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

export declare class SagaOrchestrator {
    constructor(options?: SagaOrchestratorOptions);
    define(definition: SagaDefinition): void;
    defineSaga(definition: SagaDefinition): void;
    execute(name: string, data: unknown): Promise<SagaResult>;
    getSaga(name: string): SagaDefinition | undefined;
    listSagas(): Promise<string[]>;
    getStats(): SagaStats;
}

