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
    completedSteps: string[];
    compensatedSteps: string[];
    duration: number;
}

export interface SagaOrchestratorOptions {
    logger?: LoggerLike | null;
}

export interface SagaStats {
    totalExecutions: number;
    successCount: number;
    failureCount: number;
    compensationCount: number;
}

export declare class SagaOrchestrator {
    constructor(options?: SagaOrchestratorOptions);
    define(definition: SagaDefinition): void;
    defineSaga(definition: SagaDefinition): void;
    execute(name: string, data: unknown): Promise<SagaResult>;
    getSaga(name: string): SagaDefinition | undefined;
    listSagas(): string[];
    getStats(): SagaStats;
}

