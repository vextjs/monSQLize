import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ErrorCodes, createError } from '../../core/errors';
import type { Lock } from '../lock';
import type { ModelIndexEnsureSummary } from '../../../types/model';
import type {
    DataTaskDataSyncResult,
    DataTaskDefinition,
    DataTaskDryRunResult,
    DataTaskEnsureIndexesStep,
    DataTaskExecutionOptions,
    DataTaskExportAffectedStep,
    DataTaskIndexOperation,
    DataTaskIndexResult,
    DataTaskPlanResult,
    DataTaskRunResult,
    DataTaskRuntime,
    DataTaskSnapshotResult,
    DataTaskStepResult,
    DataTaskSyncDataStep,
    DataTaskTransformFieldsStep,
    DataTaskTransformResult,
    DataTaskVerifyResult,
    DataTaskVerifyStep,
    DataTaskWriteStrategy,
} from '../../../types/data-tasks';
import {
    assertExecutableStep,
    buildMatchFilter,
    buildPlan,
    cloneForWrite,
    comparableIndexOptions,
    endpointDatabase,
    findDocuments,
    getByPath,
    indexNameFromDeclared,
    indexNameFromOperation,
    indexOptions,
    isRecord,
    normalizeContext,
    normalizeIndexKey,
    reportProgress,
    requireStep,
    resolveMatchBy,
    resolveSnapshotConfig,
    resolveTaskCollection,
    sameEndpoint,
    sanitizeFileName,
    stableStringify,
    stringifyExtendedJson,
    resultNumber,
    type DataTaskRuntimeHost,
    type GenericRecord,
} from './support';

export class DataTaskRunner implements DataTaskRuntime {
    private readonly host: DataTaskRuntimeHost;

    constructor(host: unknown) {
        this.host = host as DataTaskRuntimeHost;
    }

    async plan(task: DataTaskDefinition, options: DataTaskExecutionOptions = {}): Promise<DataTaskPlanResult> {
        return buildPlan(task, options);
    }

    async dryRun(task: DataTaskDefinition, options: DataTaskExecutionOptions = {}): Promise<DataTaskDryRunResult> {
        const plan = await this.plan(task, { ...options, dryRun: true });
        const results: DataTaskStepResult[] = [];
        if (plan.errors.length === 0) {
            for (const step of task.steps) {
                if (step.type === 'ensureIndexes') {
                    results.push(await this.syncIndexes(task, step, { ...options, dryRun: true }));
                } else if (step.type === 'syncData') {
                    results.push(await this.syncData(task, step, { ...options, dryRun: true }));
                } else if (step.type === 'transformFields') {
                    results.push(await this.transformFields(task, step, { ...options, dryRun: true }));
                } else if (step.type === 'exportAffected') {
                    results.push({ enabled: false, skippedReason: 'dry-run does not write snapshot files.' });
                } else if (step.type === 'verify') {
                    results.push(await this.verify(task, options));
                }
            }
        }
        return {
            mode: 'dry-run',
            taskName: plan.taskName,
            plan,
            results,
            warnings: plan.warnings,
            errors: plan.errors,
        };
    }

    async run(task: DataTaskDefinition, options: DataTaskExecutionOptions = {}): Promise<DataTaskRunResult> {
        const plan = await this.plan(task, options);
        if (plan.errors.length > 0) {
            throw createError(ErrorCodes.INVALID_CONFIG, plan.errors.join(' '));
        }
        if (plan.requiresProductionConfirmation && options.confirmProduction !== true) {
            throw createError(ErrorCodes.INVALID_OPERATION, '[DataTask] production run requires confirmProduction: true.');
        }

        let lock: Lock | null = null;
        try {
            lock = await this.acquireTaskLock(task);
            const results: DataTaskStepResult[] = [];
            let snapshot: DataTaskSnapshotResult | undefined;
            if (plan.requiresSnapshot) {
                snapshot = await this.exportAffected(task, undefined, options);
                results.push(snapshot);
            }
            for (const step of task.steps) {
                if (step.type === 'ensureIndexes') {
                    results.push(await this.syncIndexes(task, step, options));
                } else if (step.type === 'syncData') {
                    results.push(await this.syncData(task, step, options));
                } else if (step.type === 'transformFields') {
                    results.push(await this.transformFields(task, step, options));
                } else if (step.type === 'exportAffected') {
                    const explicitSnapshot = await this.exportAffected(task, step, options);
                    results.push(explicitSnapshot);
                    snapshot = explicitSnapshot;
                } else if (step.type === 'verify') {
                    results.push(await this.verify(task, options));
                }
            }
            return { mode: 'run', taskName: plan.taskName, plan, snapshot, results, warnings: plan.warnings, errors: [] };
        } finally {
            await lock?.release();
        }
    }

    async verify(task: DataTaskDefinition, options: DataTaskExecutionOptions = {}): Promise<DataTaskVerifyResult> {
        const plan = await this.plan(task, options);
        const warnings = [...plan.warnings];
        const errors = [...plan.errors];
        const checks: DataTaskVerifyResult['checks'] = [];
        if (errors.length > 0) {
            return { mode: 'verify', taskName: plan.taskName, passed: false, checks, warnings, errors };
        }

        const context = normalizeContext(task);
        const target = resolveTaskCollection(this.host, task.target);
        const verifySteps = task.steps.filter((step): step is DataTaskVerifyStep => step.type === 'verify');
        const shouldCheckCount = verifySteps.length === 0 ? Boolean(task.source) : verifySteps.some((step) => step.count === true);
        const fieldChecks = verifySteps.flatMap((step) => step.fields ?? []);
        const shouldCheckIndexes = verifySteps.length === 0
            ? task.steps.some((step) => step.type === 'ensureIndexes')
            : verifySteps.some((step) => step.indexes === true);

        if (shouldCheckCount && task.source) {
            const source = resolveTaskCollection(this.host, task.source);
            const expected = await source.count(context.filter);
            const actual = await target.count(context.filter);
            checks.push({
                name: 'count',
                passed: expected === actual,
                expected,
                actual,
                message: expected === actual ? undefined : 'source and target counts differ for the task filter.',
            });
        }

        if (fieldChecks.length > 0) {
            const documents = await findDocuments(target, context);
            const missing = documents.filter((document) => fieldChecks.some((field) => getByPath(document, field) === undefined)).length;
            checks.push({
                name: 'fields',
                passed: missing === 0,
                expected: 0,
                actual: missing,
                message: missing === 0 ? undefined : 'some target documents are missing required fields.',
            });
        }

        if (shouldCheckIndexes) {
            for (const step of task.steps.filter((candidate): candidate is DataTaskEnsureIndexesStep => candidate.type === 'ensureIndexes')) {
                const result = await this.syncIndexes(task, step, { ...options, dryRun: true });
                checks.push({
                    name: 'indexes',
                    passed: result.missing === 0 && result.conflicts === 0,
                    expected: 0,
                    actual: result.missing + result.conflicts,
                    message: result.missing === 0 && result.conflicts === 0 ? undefined : 'missing or conflicting indexes remain.',
                });
            }
        }

        return {
            mode: 'verify',
            taskName: plan.taskName,
            passed: checks.every((check) => check.passed) && errors.length === 0,
            checks,
            warnings,
            errors,
        };
    }

    async syncIndexes(task: DataTaskDefinition, step?: DataTaskEnsureIndexesStep, options: DataTaskExecutionOptions = {}): Promise<DataTaskIndexResult> {
        const indexStep = requireStep<DataTaskEnsureIndexesStep>(task, 'ensureIndexes', step);
        assertExecutableStep(task, indexStep, options);
        const models = [
            ...(typeof indexStep.model === 'string' ? [indexStep.model] : []),
            ...(Array.isArray(indexStep.models) ? indexStep.models : []),
        ].filter((item) => item.trim() !== '');
        if (models.length > 0) {
            const summary = await this.host.ensureModelIndexes({
                models,
                database: endpointDatabase(task.target),
                pool: task.target.pool,
                dryRun: options.dryRun === true,
                throwOnError: false,
            });
            return this.modelIndexSummaryToResult(summary);
        }

        const collection = resolveTaskCollection(this.host, task.target);
        const existing = await collection.listIndexes();
        const operations: DataTaskIndexOperation[] = [];
        let created = 0;
        let missing = 0;
        let existingCount = 0;
        let conflicts = 0;

        for (const definition of indexStep.indexes ?? []) {
            const declaredOptions = indexOptions(definition);
            const declaredKey = stableStringify(definition.key);
            const declaredComparable = stableStringify(comparableIndexOptions(declaredOptions));
            const existingByName = typeof declaredOptions.name === 'string'
                ? existing.find((item) => item.name === declaredOptions.name)
                : undefined;
            const existingByKey = existing.find((item) => stableStringify(item.key) === declaredKey);
            const matched = existingByName ?? existingByKey;
            if (matched) {
                const existingComparable = stableStringify(comparableIndexOptions(matched));
                if ((existingByName && stableStringify(existingByName.key) !== declaredKey) || existingComparable !== declaredComparable) {
                    conflicts += 1;
                    operations.push({
                        name: typeof declaredOptions.name === 'string' ? declaredOptions.name : typeof matched.name === 'string' ? matched.name : undefined,
                        key: definition.key,
                        status: 'conflict',
                        reason: 'existing index name/key/options differ from the requested definition.',
                    });
                    if (indexStep.conflictPolicy === 'throw') {
                        throw createError(ErrorCodes.INVALID_OPERATION, '[DataTask] index conflict detected.');
                    }
                } else {
                    existingCount += 1;
                    operations.push({
                        name: typeof matched.name === 'string' ? matched.name : typeof declaredOptions.name === 'string' ? declaredOptions.name : undefined,
                        key: definition.key,
                        status: 'exists',
                    });
                }
                continue;
            }
            missing += 1;
            if (options.dryRun === true) {
                operations.push({ name: typeof declaredOptions.name === 'string' ? declaredOptions.name : undefined, key: definition.key, status: 'dry-run' });
                continue;
            }
            const createdOperation = await collection.createIndex(definition.key, declaredOptions);
            created += 1;
            operations.push({
                name: indexNameFromOperation(createdOperation) ?? (typeof declaredOptions.name === 'string' ? declaredOptions.name : undefined),
                key: definition.key,
                status: 'created',
            });
        }

        return { step: 'ensureIndexes', created, missing, existing: existingCount, conflicts, operations };
    }

    async syncData(task: DataTaskDefinition, step?: DataTaskSyncDataStep, options: DataTaskExecutionOptions = {}): Promise<DataTaskDataSyncResult> {
        const syncStep = requireStep<DataTaskSyncDataStep>(task, 'syncData', step);
        assertExecutableStep(task, syncStep, options);
        if (!task.source) {
            throw createError(ErrorCodes.INVALID_CONFIG, '[DataTask] syncData requires source.');
        }
        const context = normalizeContext({ ...task, batchSize: syncStep.batchSize ?? task.batchSize });
        const source = resolveTaskCollection(this.host, task.source);
        const target = resolveTaskCollection(this.host, task.target);
        const documents = await findDocuments(source, context);
        const matchBy = resolveMatchBy(task, syncStep);
        const strategy: DataTaskWriteStrategy = syncStep.strategy ?? 'upsert';
        const preserveSourceId = sameEndpoint(task.source, task.target) || syncStep.allowSourceIdMatch === true;
        const result: DataTaskDataSyncResult = {
            step: 'syncData',
            strategy,
            matched: 0,
            inserted: 0,
            updated: 0,
            replaced: 0,
            skipped: 0,
            duplicateMatches: 0,
            errors: [],
        };

        for (let index = 0; index < documents.length; index += 1) {
            const document = documents[index];
            reportProgress(options, { taskName: context.taskName, mode: options.dryRun ? 'dry-run' : 'run', step: 'syncData', processed: index, total: documents.length });
            try {
                const matchFilter = matchBy.length > 0 ? buildMatchFilter(document, matchBy) : {};
                const targetMatches = matchBy.length > 0 ? await target.count(matchFilter) : 0;
                if (targetMatches > 1) {
                    result.duplicateMatches += 1;
                    result.skipped += 1;
                    continue;
                }
                if (options.dryRun === true) {
                    if (strategy === 'insert') {
                        result.inserted += targetMatches === 0 ? 1 : 0;
                        result.skipped += targetMatches > 0 ? 1 : 0;
                    } else if (strategy === 'replace') {
                        result.replaced += targetMatches > 0 ? 1 : 0;
                        result.inserted += targetMatches === 0 ? 1 : 0;
                    } else {
                        result.updated += targetMatches > 0 ? 1 : 0;
                        result.inserted += targetMatches === 0 ? 1 : 0;
                    }
                    result.matched += targetMatches;
                    continue;
                }
                if (strategy === 'insert') {
                    if (matchBy.length > 0 && targetMatches > 0) {
                        result.skipped += 1;
                        result.matched += targetMatches;
                        continue;
                    }
                    await target.insertOne(cloneForWrite(document, preserveSourceId));
                    result.inserted += 1;
                } else if (strategy === 'replace') {
                    const replacement = cloneForWrite(document, preserveSourceId && (targetMatches === 0 || matchBy.includes('_id')));
                    const writeResult = await target.replaceOne(matchFilter, replacement, { upsert: true });
                    result.matched += resultNumber(writeResult, 'matchedCount');
                    result.replaced += resultNumber(writeResult, 'modifiedCount');
                    result.inserted += resultNumber(writeResult, 'upsertedCount');
                } else {
                    const updateDocument = cloneForWrite(document, false);
                    const setOnInsert = preserveSourceId && document._id !== undefined ? { _id: document._id } : undefined;
                    const updatePayload = setOnInsert ? { $set: updateDocument, $setOnInsert: setOnInsert } : { $set: updateDocument };
                    const writeResult = target.upsertOne
                        ? await target.upsertOne(matchFilter, updatePayload, { upsert: true })
                        : await target.updateOne(matchFilter, updatePayload, { upsert: true });
                    result.matched += resultNumber(writeResult, 'matchedCount');
                    result.updated += resultNumber(writeResult, 'modifiedCount');
                    result.inserted += resultNumber(writeResult, 'upsertedCount');
                }
            } catch (error) {
                result.errors.push(error instanceof Error ? error.message : String(error));
            }
        }
        reportProgress(options, { taskName: context.taskName, mode: options.dryRun ? 'dry-run' : 'run', step: 'syncData', processed: documents.length, total: documents.length });
        return result;
    }

    async transformFields(task: DataTaskDefinition, step?: DataTaskTransformFieldsStep, options: DataTaskExecutionOptions = {}): Promise<DataTaskTransformResult> {
        const transformStep = requireStep<DataTaskTransformFieldsStep>(task, 'transformFields', step);
        assertExecutableStep(task, transformStep, options);
        const context = normalizeContext(task);
        const target = resolveTaskCollection(this.host, task.target);
        const matched = await target.count(context.filter);
        const sampled = await findDocuments(target, context, transformStep.sampleSize ?? 5);
        const result: DataTaskTransformResult = { step: 'transformFields', matched, modified: 0, sampled: [], errors: [] };

        if (options.dryRun === true) {
            if (transformStep.transform) {
                for (const document of sampled) {
                    const patch = await transformStep.transform(document);
                    result.sampled.push({ before: document, after: isRecord(patch) ? { ...document, ...patch } : undefined });
                }
            } else {
                result.sampled.push(...sampled.map((document) => ({ before: document })));
            }
            return result;
        }

        if (transformStep.transform) {
            const documents = await findDocuments(target, context);
            for (let index = 0; index < documents.length; index += 1) {
                const document = documents[index];
                reportProgress(options, { taskName: context.taskName, mode: 'run', step: 'transformFields', processed: index, total: documents.length });
                try {
                    const patch = await transformStep.transform(document);
                    if (!isRecord(patch) || Object.keys(patch).length === 0) {
                        continue;
                    }
                    const id = document._id;
                    if (id === undefined) {
                        throw createError(ErrorCodes.INVALID_ARGUMENT, '[DataTask] transform function updates require target documents with _id.');
                    }
                    const updateDocument = { ...patch };
                    delete updateDocument._id;
                    if (Object.keys(updateDocument).length === 0) {
                        continue;
                    }
                    const writeResult = await target.updateOne({ _id: id }, { $set: updateDocument });
                    result.modified += resultNumber(writeResult, 'modifiedCount');
                } catch (error) {
                    result.errors.push(error instanceof Error ? error.message : String(error));
                }
            }
            reportProgress(options, { taskName: context.taskName, mode: 'run', step: 'transformFields', processed: documents.length, total: documents.length });
            return result;
        }

        const update = transformStep.pipeline ?? transformStep.update;
        if (update === undefined) {
            throw createError(ErrorCodes.INVALID_CONFIG, '[DataTask] transformFields requires update, pipeline, or transform.');
        }
        const writeResult = await target.updateMany(context.filter, update);
        result.modified = resultNumber(writeResult, 'modifiedCount');
        return result;
    }

    async exportAffected(task: DataTaskDefinition, step?: DataTaskExportAffectedStep, options: DataTaskExecutionOptions = {}): Promise<DataTaskSnapshotResult> {
        assertExecutableStep(task, step ?? { type: 'exportAffected' }, options);
        const snapshot = resolveSnapshotConfig(step?.snapshot ?? task.snapshot, options);
        if (!snapshot.enabled) {
            if (snapshot.allowRunWithoutSnapshot) {
                return { enabled: false, skippedReason: 'snapshot disabled by task configuration.' };
            }
            throw createError(ErrorCodes.INVALID_CONFIG, '[DataTask] data write steps require snapshot unless allowRunWithoutSnapshot is true.');
        }
        const context = normalizeContext(task);
        const target = resolveTaskCollection(this.host, task.target);
        const documents = await findDocuments(target, context);
        const directory = path.resolve(process.cwd(), snapshot.dir);
        await mkdir(directory, { recursive: true });
        const fileName = `${sanitizeFileName(context.taskName)}-${Date.now()}.${snapshot.format === 'jsonl' ? 'jsonl' : 'ejsonl'}`;
        const filePath = path.join(directory, fileName);
        const lines = documents.map((document) => snapshot.format === 'jsonl' ? JSON.stringify(document) : stringifyExtendedJson(document));
        const content = lines.length > 0 ? `${lines.join('\n')}\n` : '';
        await writeFile(filePath, content, 'utf8');
        const checksum = createHash('sha256').update(content).digest('hex');
        return { enabled: true, path: filePath, count: documents.length, bytes: Buffer.byteLength(content), checksum };
    }

    private modelIndexSummaryToResult(summary: ModelIndexEnsureSummary): DataTaskIndexResult {
        const operations: DataTaskIndexOperation[] = [];
        for (const item of summary.models) {
            for (const existing of item.result.existing) {
                operations.push({ name: indexNameFromDeclared(existing.declared.options), key: normalizeIndexKey(existing.declared.key), status: 'exists' });
            }
            for (const missing of item.result.missing) {
                operations.push({ name: indexNameFromDeclared(missing.options), key: normalizeIndexKey(missing.key), status: summary.dryRun ? 'dry-run' : 'missing' });
            }
            for (const created of item.result.created) {
                operations.push({ name: created.name, key: normalizeIndexKey(created.declared.key), status: 'created' });
            }
            for (const conflict of item.result.conflicts) {
                operations.push({ name: indexNameFromDeclared(conflict.declared.options), key: normalizeIndexKey(conflict.declared.key), status: 'conflict', reason: conflict.reason });
            }
        }
        return {
            step: 'ensureIndexes',
            created: summary.totals.created,
            missing: summary.totals.missing,
            existing: summary.totals.existing,
            conflicts: summary.totals.conflicts,
            operations,
        };
    }

    private async acquireTaskLock(task: DataTaskDefinition): Promise<Lock | null> {
        if (!task.lock) {
            return null;
        }
        const lockKey = typeof task.lock === 'string'
            ? task.lock
            : isRecord(task.lock) && typeof task.lock.key === 'string'
                ? task.lock.key
                : `data-task:${task.name}`;
        const ttl = isRecord(task.lock) && typeof task.lock.ttlMs === 'number' ? task.lock.ttlMs : undefined;
        const lock = await this.host.tryAcquireLock(lockKey, ttl ? { ttl } : undefined);
        if (!lock) {
            throw createError(ErrorCodes.LOCK_TIMEOUT, `[DataTask] lock is already held: ${lockKey}`);
        }
        return lock;
    }
}
