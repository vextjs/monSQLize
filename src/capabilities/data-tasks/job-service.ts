import type { MonSQLizeOptions } from '../../../types/monsqlize';
import type {
    DataTaskApplyOptions,
    DataTaskApplyResult,
    DataTaskBackupRef,
    DataTaskJob,
    DataTaskPreviewOptions,
    DataTaskPreviewResult,
    DataTaskRestoreOptions,
    DataTaskRestorePreviewResult,
    DataTaskRestoreResult,
    DataTaskRestoreTargetOptions,
    DataTaskService,
} from '../../../types/data-tasks';
import type { DataTaskJobRuntimeHost } from './support';
import { DataTaskJobError, isDataTaskJobRuntime, normalizeDataTaskJob } from './job-normalizer';
import { planDataTaskJob } from './job-planner';
import { applyDataTaskPlan, validateDataTaskApproval } from './job-apply';
import { probeDataTaskBackupDirectory } from './job-backup';
import { acquireDataTaskLease } from './job-lock';
import { backupTargetHint, planDataTaskRestore, restoreDataTaskPlan, validateRestoreApproval } from './job-restore';

export interface DataTaskManagedRuntime extends DataTaskJobRuntimeHost {
    readonly options?: MonSQLizeOptions;
    connect(): Promise<unknown>;
    close(): Promise<void>;
}

export type DataTaskJobRuntimeFactory = (options: MonSQLizeOptions) => DataTaskManagedRuntime;

export class DataTaskJobService implements DataTaskService {
    constructor(private readonly runtimeFactory: DataTaskJobRuntimeFactory) {}

    async preview(job: DataTaskJob, options?: DataTaskPreviewOptions): Promise<DataTaskPreviewResult> {
        try {
            const normalized = normalizeDataTaskJob(job);
            return await this.withRuntimes(normalized.source, normalized.target, async (source, target) => {
                await probeDataTaskBackupDirectory(normalized.backup.dir);
                const plan = await planDataTaskJob(normalized, source, target, options);
                const { normalized: _normalized, plannedCollections: _planned, hashes: _hashes, ...result } = plan;
                return result;
            });
        } catch (error) {
            return this.failedPreview(job, error);
        }
    }

    async apply(job: DataTaskJob, options: DataTaskApplyOptions): Promise<DataTaskApplyResult> {
        const normalized = normalizeDataTaskJob(job);
        return this.withRuntimes(normalized.source, normalized.target, async (source, target) => {
            const lease = normalized.lock ? await acquireDataTaskLease(target, normalized.lock) : undefined;
            try {
                const plan = await planDataTaskJob(normalized, source, target);
                validateDataTaskApproval(options?.approval, plan);
                return await applyDataTaskPlan(normalized, plan, target, normalized.target, lease);
            } finally {
                await lease?.release();
            }
        });
    }

    async previewRestore(backup: DataTaskBackupRef, options?: DataTaskRestoreTargetOptions): Promise<DataTaskRestorePreviewResult> {
        const targetInput = options?.target ?? backupTargetHint(backup);
        if (!targetInput) throw new DataTaskJobError('RESTORE_FAILED', 'restore target is required when the backup is loaded in another process.', 'restore-preview');
        return this.withTarget(targetInput, async (target) => {
            const plan = await planDataTaskRestore(backup, target);
            const { backup: _backup, actions: _actions, dropIndexActions: _drop, createIndexActions: _create, beforeIndexes: _indexes, hashes: _hashes, ...result } = plan;
            return result;
        });
    }

    async restore(backup: DataTaskBackupRef, options: DataTaskRestoreOptions): Promise<DataTaskRestoreResult> {
        const targetInput = options?.target ?? backupTargetHint(backup);
        if (!targetInput) throw new DataTaskJobError('RESTORE_FAILED', 'restore target is required when the backup is loaded in another process.', 'restore');
        return this.withTarget(targetInput, async (target) => {
            const lease = await acquireDataTaskLease(target, { ttlMs: 120_000, waitTimeoutMs: 0 });
            try {
                const plan = await planDataTaskRestore(backup, target);
                if (!plan.passed) throw new DataTaskJobError('RESTORE_DRIFT', plan.errors.join('; '), 'restore');
                validateRestoreApproval(options.approval, plan);
                return await restoreDataTaskPlan(plan, target, targetInput, lease);
            } finally {
                await lease.release();
            }
        });
    }

    private async withRuntimes<TResult>(
        sourceInput: DataTaskJob['source'],
        targetInput: DataTaskJob['target'],
        callback: (source: DataTaskJobRuntimeHost, target: DataTaskJobRuntimeHost) => Promise<TResult>,
    ): Promise<TResult> {
        const managed: DataTaskManagedRuntime[] = [];
        const resolve = async (input: DataTaskJob['source']): Promise<DataTaskJobRuntimeHost> => {
            if (isDataTaskJobRuntime(input)) return input as unknown as DataTaskJobRuntimeHost;
            const runtime = this.runtimeFactory(input as MonSQLizeOptions);
            managed.push(runtime);
            await runtime.connect();
            return runtime;
        };
        try {
            const source = await resolve(sourceInput);
            const target = await resolve(targetInput);
            return await callback(source, target);
        } finally {
            await Promise.allSettled(managed.map((runtime) => runtime.close()));
        }
    }

    private async withTarget<TResult>(
        input: DataTaskJob['target'],
        callback: (target: DataTaskJobRuntimeHost) => Promise<TResult>,
    ): Promise<TResult> {
        if (isDataTaskJobRuntime(input)) return callback(input as unknown as DataTaskJobRuntimeHost);
        const runtime = this.runtimeFactory(input as MonSQLizeOptions);
        await runtime.connect();
        try {
            return await callback(runtime);
        } finally {
            await runtime.close();
        }
    }

    private failedPreview(job: DataTaskJob, error: unknown): DataTaskPreviewResult {
        const message = error instanceof Error ? error.message : String(error);
        return {
            mode: 'preview',
            jobName: typeof job?.name === 'string' && job.name.trim() ? job.name.trim() : 'data-task',
            passed: false,
            collections: [],
            warnings: [],
            errors: [error instanceof DataTaskJobError ? message : `[DataTask:INVALID_JOB] ${message}`],
        };
    }
}

export function createDataTaskService(runtimeFactory: DataTaskJobRuntimeFactory): DataTaskService {
    return new DataTaskJobService(runtimeFactory);
}
