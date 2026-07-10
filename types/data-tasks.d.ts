import type { MonSQLizeOptions } from './monsqlize';

export type DataTaskEnvironment = 'development' | 'test' | 'staging' | 'production' | 'prod' | 'live';
export type DataTaskMode = 'plan' | 'dry-run' | 'run' | 'verify';
export type DataTaskStepType = 'ensureIndexes' | 'syncData' | 'transformFields' | 'exportAffected' | 'verify';
export type DataTaskWriteStrategy = 'insert' | 'upsert' | 'merge' | 'replace';
export type DataTaskIndexConflictPolicy = 'report' | 'throw';
export type DataTaskSnapshotFormat = 'jsonl' | 'extended-jsonl';
export type DataTaskRiskLevel = 'low' | 'medium' | 'high';

export interface DataTaskEndpoint {
    collection: string;
    database?: string;
    db?: string;
    pool?: string;
}

export interface DataTaskLockOptions {
    key?: string;
    ttlMs?: number;
    renewIntervalMs?: number;
    scope?: 'process';
}

export type DataTaskLock = boolean | string | DataTaskLockOptions;

export interface DataTaskSnapshotOptions {
    enabled?: boolean;
    dir?: string;
    format?: DataTaskSnapshotFormat;
    allowRunWithoutSnapshot?: boolean;
}

export type DataTaskSnapshot = boolean | string | DataTaskSnapshotOptions;

export interface DataTaskIndexDefinition {
    key: Record<string, unknown>;
    options?: Record<string, unknown>;
    name?: string;
}

export interface DataTaskEnsureIndexesStep {
    type: 'ensureIndexes';
    model?: string;
    models?: string[];
    indexes?: DataTaskIndexDefinition[];
    conflictPolicy?: DataTaskIndexConflictPolicy;
}

export interface DataTaskSyncDataStep {
    type: 'syncData';
    strategy?: DataTaskWriteStrategy;
    matchBy?: string[];
    batchSize?: number;
    allowSourceIdMatch?: boolean;
}

export interface DataTaskTransformFieldsStep {
    type: 'transformFields';
    update?: Record<string, unknown> | Record<string, unknown>[];
    pipeline?: Record<string, unknown>[];
    transform?: (document: Record<string, unknown>) => Record<string, unknown> | null | undefined | Promise<Record<string, unknown> | null | undefined>;
    sampleSize?: number;
}

export interface DataTaskExportAffectedStep {
    type: 'exportAffected';
    snapshot?: DataTaskSnapshot;
}

export interface DataTaskVerifyStep {
    type: 'verify';
    count?: boolean;
    fields?: string[];
    indexes?: boolean;
    sample?: number;
}

export type DataTaskStep =
    | DataTaskEnsureIndexesStep
    | DataTaskSyncDataStep
    | DataTaskTransformFieldsStep
    | DataTaskExportAffectedStep
    | DataTaskVerifyStep;

export interface DataTaskDefinition {
    name: string;
    source?: DataTaskEndpoint;
    target: DataTaskEndpoint;
    filter?: Record<string, unknown>;
    projection?: Record<string, unknown> | string[];
    sort?: Record<string, 1 | -1>;
    matchBy?: string[];
    batchSize?: number;
    snapshot?: DataTaskSnapshot;
    lock?: DataTaskLock;
    allowFullCollection?: boolean;
    environment?: DataTaskEnvironment;
    production?: boolean;
    steps: DataTaskStep[];
}

export interface DataTaskCliConfig {
    runtime?: MonSQLizeOptions;
    task: DataTaskDefinition;
}

export interface DataTaskExecutionOptions {
    confirmProduction?: boolean;
    approvedSnapshotChecksum?: string;
    continueOnError?: boolean;
    snapshotDir?: string;
    allowRunWithoutSnapshot?: boolean;
    onProgress?: (progress: DataTaskProgress) => void;
}

export interface DataTaskProgress {
    taskName: string;
    mode: DataTaskMode;
    step: DataTaskStepType;
    processed: number;
    batch?: number;
    total?: number;
    message?: string;
}

export interface DataTaskStepPlan {
    type: DataTaskStepType;
    willWrite: boolean;
    requiresSource: boolean;
    requiresFilter: boolean;
    requiresSnapshot: boolean;
    warnings: string[];
    errors: string[];
}

export interface DataTaskPlanResult {
    mode: 'plan';
    taskName: string;
    passed: boolean;
    environment?: DataTaskEnvironment;
    isProduction: boolean;
    risk: DataTaskRiskLevel;
    willWrite: boolean;
    requiresProductionConfirmation: boolean;
    requiresSnapshot: boolean;
    requiresSnapshotApproval: boolean;
    steps: DataTaskStepPlan[];
    warnings: string[];
    errors: string[];
}

export interface DataTaskSnapshotResult {
    step: 'exportAffected';
    passed: boolean;
    enabled: boolean;
    path?: string;
    manifestPath?: string;
    createdAt?: string;
    taskName?: string;
    target?: DataTaskEndpoint;
    filter?: Record<string, unknown>;
    format?: DataTaskSnapshotFormat;
    count?: number;
    existingCount?: number;
    insertCandidates?: number;
    bytes?: number;
    checksum?: string;
    skippedReason?: string;
}

export interface DataTaskIndexOperation {
    name?: string;
    key: Record<string, unknown>;
    status: 'exists' | 'missing' | 'created' | 'conflict' | 'dry-run';
    reason?: string;
}

export interface DataTaskIndexResult {
    step: 'ensureIndexes';
    passed: boolean;
    created: number;
    missing: number;
    existing: number;
    conflicts: number;
    operations: DataTaskIndexOperation[];
    errors: string[];
}

export interface DataTaskDataSyncResult {
    step: 'syncData';
    passed: boolean;
    strategy: DataTaskWriteStrategy;
    matched: number;
    inserted: number;
    updated: number;
    replaced: number;
    skipped: number;
    duplicateMatches: number;
    processed: number;
    batchCount: number;
    failed: number;
    errors: string[];
}

export interface DataTaskTransformResult {
    step: 'transformFields';
    passed: boolean;
    matched: number;
    modified: number;
    processed: number;
    batchCount: number;
    failed: number;
    sampled: Array<{ before: Record<string, unknown>; after: Record<string, unknown> }>;
    errors: string[];
}

export interface DataTaskVerifyMismatch {
    match: Record<string, unknown>;
    reason: string;
    expected?: unknown;
    actual?: unknown;
}

export interface DataTaskVerifyResult {
    mode: 'verify';
    taskName: string;
    passed: boolean;
    checked: number;
    mismatched: number;
    mismatches: DataTaskVerifyMismatch[];
    checks: Array<{ name: string; passed: boolean; message?: string; expected?: unknown; actual?: unknown }>;
    warnings: string[];
    errors: string[];
}

export type DataTaskStepResult =
    | DataTaskIndexResult
    | DataTaskDataSyncResult
    | DataTaskTransformResult
    | DataTaskSnapshotResult
    | DataTaskVerifyResult;

export interface DataTaskDryRunResult {
    mode: 'dry-run';
    taskName: string;
    passed: boolean;
    plan: DataTaskPlanResult;
    snapshot?: DataTaskSnapshotResult;
    results: DataTaskStepResult[];
    warnings: string[];
    errors: string[];
}

export interface DataTaskRunResult {
    mode: 'run';
    taskName: string;
    passed: boolean;
    status: 'passed' | 'failed';
    plan: DataTaskPlanResult;
    snapshot?: DataTaskSnapshotResult;
    results: DataTaskStepResult[];
    warnings: string[];
    errors: string[];
}

export interface DataTaskRuntime {
    plan(task: DataTaskDefinition, options?: DataTaskExecutionOptions): Promise<DataTaskPlanResult>;
    dryRun(task: DataTaskDefinition, options?: DataTaskExecutionOptions): Promise<DataTaskDryRunResult>;
    run(task: DataTaskDefinition, options?: DataTaskExecutionOptions): Promise<DataTaskRunResult>;
    verify(task: DataTaskDefinition, options?: DataTaskExecutionOptions): Promise<DataTaskVerifyResult>;
    syncIndexes(task: DataTaskDefinition, step?: DataTaskEnsureIndexesStep, options?: DataTaskExecutionOptions): Promise<DataTaskIndexResult>;
    syncData(task: DataTaskDefinition, step?: DataTaskSyncDataStep, options?: DataTaskExecutionOptions): Promise<DataTaskDataSyncResult>;
    transformFields(task: DataTaskDefinition, step?: DataTaskTransformFieldsStep, options?: DataTaskExecutionOptions): Promise<DataTaskTransformResult>;
    exportAffected(task: DataTaskDefinition, step?: DataTaskExportAffectedStep, options?: DataTaskExecutionOptions): Promise<DataTaskSnapshotResult>;
}

export declare class DataTaskRunner implements DataTaskRuntime {
    constructor(host: unknown);
    plan(task: DataTaskDefinition, options?: DataTaskExecutionOptions): Promise<DataTaskPlanResult>;
    dryRun(task: DataTaskDefinition, options?: DataTaskExecutionOptions): Promise<DataTaskDryRunResult>;
    run(task: DataTaskDefinition, options?: DataTaskExecutionOptions): Promise<DataTaskRunResult>;
    verify(task: DataTaskDefinition, options?: DataTaskExecutionOptions): Promise<DataTaskVerifyResult>;
    syncIndexes(task: DataTaskDefinition, step?: DataTaskEnsureIndexesStep, options?: DataTaskExecutionOptions): Promise<DataTaskIndexResult>;
    syncData(task: DataTaskDefinition, step?: DataTaskSyncDataStep, options?: DataTaskExecutionOptions): Promise<DataTaskDataSyncResult>;
    transformFields(task: DataTaskDefinition, step?: DataTaskTransformFieldsStep, options?: DataTaskExecutionOptions): Promise<DataTaskTransformResult>;
    exportAffected(task: DataTaskDefinition, step?: DataTaskExportAffectedStep, options?: DataTaskExecutionOptions): Promise<DataTaskSnapshotResult>;
}
