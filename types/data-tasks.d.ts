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

export interface DataTaskJobCliConfig {
    job: DataTaskJob;
}

export type DataTaskJobErrorCode =
    | 'INVALID_JOB'
    | 'IDENTITY_CONFLICT'
    | 'INDEX_CONFLICT'
    | 'APPROVAL_STALE'
    | 'BACKUP_FAILED'
    | 'LOCK_NOT_ACQUIRED'
    | 'LOCK_LOST'
    | 'APPLY_PARTIAL'
    | 'RESTORE_DRIFT'
    | 'RESTORE_FAILED';

export declare class DataTaskJobError extends Error {
    readonly code: DataTaskJobErrorCode;
    readonly phase: string;
    readonly collection?: string;
    constructor(code: DataTaskJobErrorCode, message: string, phase?: string, collection?: string);
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

export interface DataTaskConnectionRuntime {
    readonly options?: MonSQLizeOptions;
    collection(name: string): unknown;
    connect?(): Promise<unknown>;
    close?(): Promise<void>;
}

export type DataTaskConnection = DataTaskConnectionRuntime | MonSQLizeOptions;

export type DataTaskIdentity =
    | { mode: 'fields'; fields: string[] }
    | { mode: 'source-id'; conflictBy?: string[] };

export type DataTaskTransform =
    | { pipeline: Record<string, unknown>[]; handler?: never }
    | { handler: (document: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>; pipeline?: never };

export interface DataTaskDataRule {
    filter?: Record<string, unknown>;
    all?: boolean;
    identity: DataTaskIdentity;
    strategy?: 'upsert' | 'insert';
    projection?: Record<string, unknown>;
    transform?: DataTaskTransform;
    /** Maximum source documents this collection may plan. Defaults to 10000. */
    maxDocuments?: number;
    /** Write-ahead checkpoint batch size. Writes remain ordered within each batch. */
    batchSize?: number;
}

export interface DataTaskVerifyRule {
    mode?: 'sample' | 'full';
    fields?: string[];
    sampleSize?: number;
}

export interface DataTaskCollectionJob {
    name: string;
    targetName?: string;
    indexes?: DataTaskIndexDefinition[];
    data?: DataTaskDataRule;
    verify?: DataTaskVerifyRule;
}

export interface DataTaskBackupOptions {
    dir?: string;
    format?: 'extended-jsonl';
    compression?: 'gzip' | 'none';
    retentionDays?: number;
    /** Maximum uncompressed affected-scope backup size in bytes. Defaults to 256 MiB. */
    maxBytes?: number;
}

export interface DataTaskLeaseLockOptions {
    ttlMs?: number;
    waitTimeoutMs?: number;
}

export interface DataTaskJob {
    name: string;
    description?: string;
    source: DataTaskConnection;
    target: DataTaskConnection;
    targetEnvironment: DataTaskEnvironment;
    collections: DataTaskCollectionJob[];
    backup?: DataTaskBackupOptions;
    lock?: boolean | DataTaskLeaseLockOptions;
}

export interface DataTaskApproval {
    kind: 'apply' | 'restore';
    token: string;
    jobHash: string;
    sourceHash: string;
    targetHash: string;
    indexHash: string;
    issuedAt: string;
    expiresAt: string;
}

export interface DataTaskIndexPlan {
    name?: string;
    key: Record<string, unknown>;
    options: Record<string, unknown>;
    status: 'existing' | 'missing' | 'conflict';
    reason?: string;
}

export interface DataTaskChangeSample {
    identity: Record<string, unknown>;
    operation: 'insert' | 'update';
    before: Record<string, unknown> | null;
    after: Record<string, unknown>;
}

export interface DataTaskCollectionPreview {
    source: string;
    target: string;
    data: {
        source: number;
        insert: number;
        update: number;
        unchanged: number;
        conflict: number;
    };
    indexes: DataTaskIndexPlan[];
    samples: DataTaskChangeSample[];
    backupDocuments: number;
    backupBytes: number;
}

export interface DataTaskPreviewResult {
    mode: 'preview';
    jobName: string;
    passed: boolean;
    collections: DataTaskCollectionPreview[];
    warnings: string[];
    errors: string[];
    approval?: DataTaskApproval;
}

export interface DataTaskPreviewOptions {
    approvalTtlMs?: number;
    sampleSize?: number;
}

export interface DataTaskBackupRef {
    runId: string;
    manifestPath: string;
    checksum: string;
}

export interface DataTaskApplyOptions {
    approval: DataTaskApproval;
}

export interface DataTaskApplyResult {
    mode: 'apply';
    runId: string;
    jobName: string;
    passed: boolean;
    status: 'passed' | 'partial' | 'failed';
    collections: DataTaskCollectionPreview[];
    backup: DataTaskBackupRef;
    warnings: string[];
    errors: string[];
}

export interface DataTaskRestoreTargetOptions {
    target?: DataTaskConnection;
}

export interface DataTaskRestorePreviewResult {
    mode: 'preview-restore';
    runId: string;
    passed: boolean;
    restoreDocuments: number;
    deleteDocuments: number;
    dropIndexes: number;
    createIndexes: number;
    warnings: string[];
    errors: string[];
    approval?: DataTaskApproval;
}

export interface DataTaskRestoreOptions extends DataTaskRestoreTargetOptions {
    approval: DataTaskApproval;
}

export interface DataTaskRestoreResult {
    mode: 'restore';
    runId: string;
    passed: boolean;
    status: 'passed' | 'partial' | 'failed';
    safetyBackup: DataTaskBackupRef;
    restoredDocuments: number;
    deletedDocuments: number;
    droppedIndexes: number;
    createdIndexes: number;
    warnings: string[];
    errors: string[];
}

export interface DataTaskService {
    preview(job: DataTaskJob, options?: DataTaskPreviewOptions): Promise<DataTaskPreviewResult>;
    apply(job: DataTaskJob, options: DataTaskApplyOptions): Promise<DataTaskApplyResult>;
    previewRestore(backup: DataTaskBackupRef, options?: DataTaskRestoreTargetOptions): Promise<DataTaskRestorePreviewResult>;
    restore(backup: DataTaskBackupRef, options: DataTaskRestoreOptions): Promise<DataTaskRestoreResult>;
}

export declare const dataTasks: DataTaskService;
