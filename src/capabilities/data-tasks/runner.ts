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
    findMatchingDocuments,
    getByPath,
    indexNameFromDeclared,
    indexNameFromOperation,
    indexOptions,
    isRecord,
    normalizeContext,
    normalizeIndexKey,
    orderedIndexKeyString,
    iterateDocumentBatches,
    iterateDocuments,
    reportProgress,
    requireStep,
    resolveMatchBy,
    resolveTaskCollection,
    sameEndpoint,
    stableStringify,
    stringifyExtendedJson,
    resultNumber,
    type DataTaskRuntimeHost,
    type GenericRecord,
} from './support';
import { applyUpdatePreview, cloneDocument, deepMergeDocuments } from './document-utils';
import { writeAffectedSnapshot } from './snapshot';

interface InternalExecutionOptions extends DataTaskExecutionOptions {
    dryRun?: boolean;
    assertLockHeld?: () => void;
}

interface TaskLockLease {
    assertHeld(): void;
    release(): Promise<void>;
}

function stepResultPassed(result: DataTaskStepResult): boolean {
    return result.passed !== false;
}

function stepResultErrors(result: DataTaskStepResult): string[] {
    return 'errors' in result && Array.isArray(result.errors) ? result.errors : [];
}

function assertLockHeld(options: DataTaskExecutionOptions): void {
    (options as InternalExecutionOptions).assertLockHeld?.();
}

function isDryRun(options: DataTaskExecutionOptions): boolean {
    return (options as InternalExecutionOptions).dryRun === true;
}

function withDryRun(options: DataTaskExecutionOptions): InternalExecutionOptions {
    return { ...options, dryRun: true };
}

function sampleValueMatches(expected: unknown, actual: unknown, allowNestedTargetFields: boolean): boolean {
    const expectedBson = isRecord(expected) && typeof expected._bsontype === 'string';
    if (allowNestedTargetFields
        && isRecord(expected)
        && isRecord(actual)
        && !expectedBson
        && !(expected instanceof Date)
        && !Buffer.isBuffer(expected)) {
        return Object.entries(expected).every(([field, value]) => sampleValueMatches(value, actual[field], true));
    }
    return stringifyExtendedJson(expected) === stringifyExtendedJson(actual);
}

export class DataTaskRunner implements DataTaskRuntime {
    private readonly host: DataTaskRuntimeHost;

    constructor(host: unknown) {
        this.host = host as DataTaskRuntimeHost;
    }

    async plan(task: DataTaskDefinition, options: DataTaskExecutionOptions = {}): Promise<DataTaskPlanResult> {
        return buildPlan(task, options);
    }

    async dryRun(task: DataTaskDefinition, options: DataTaskExecutionOptions = {}): Promise<DataTaskDryRunResult> {
        const dryRunOptions = withDryRun(options);
        const plan = await this.plan(task, dryRunOptions);
        const results: DataTaskStepResult[] = [];
        const errors = [...plan.errors];
        const warnings = [...plan.warnings];
        if (plan.errors.length === 0) {
            for (const step of task.steps) {
                try {
                    let result: DataTaskStepResult;
                    if (step.type === 'ensureIndexes') {
                        result = await this.syncIndexes(task, step, dryRunOptions);
                    } else if (step.type === 'syncData') {
                        result = await this.syncData(task, step, dryRunOptions);
                    } else if (step.type === 'transformFields') {
                        result = await this.transformFields(task, step, dryRunOptions);
                    } else if (step.type === 'exportAffected') {
                        result = { step: 'exportAffected', passed: true, enabled: false, skippedReason: 'dry-run does not write snapshot files.' };
                    } else {
                        const deferredWarning = '[DataTask] verify steps are deferred until run() or verify().';
                        warnings.push(deferredWarning);
                        result = {
                            mode: 'verify',
                            taskName: plan.taskName,
                            passed: true,
                            checked: 0,
                            mismatched: 0,
                            mismatches: [],
                            checks: [{ name: 'deferred', passed: true, message: deferredWarning }],
                            warnings: [deferredWarning],
                            errors: [],
                        };
                    }
                    results.push(result);
                    errors.push(...stepResultErrors(result));
                    if (!stepResultPassed(result) && options.continueOnError !== true) {
                        break;
                    }
                } catch (error) {
                    errors.push(error instanceof Error ? error.message : String(error));
                    if (options.continueOnError !== true) break;
                }
            }
        }
        const passed = plan.passed && errors.length === 0 && results.every(stepResultPassed);
        return {
            mode: 'dry-run',
            taskName: plan.taskName,
            passed,
            plan,
            results,
            warnings,
            errors,
        };
    }

    async run(task: DataTaskDefinition, options: DataTaskExecutionOptions = {}): Promise<DataTaskRunResult> {
        if (isDryRun(options)) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, '[DataTask] run() does not accept dryRun; call dryRun() instead.');
        }
        const plan = await this.plan(task, options);
        if (plan.errors.length > 0) {
            throw createError(ErrorCodes.INVALID_CONFIG, plan.errors.join(' '));
        }
        if (plan.requiresProductionConfirmation && options.confirmProduction !== true) {
            throw createError(ErrorCodes.INVALID_OPERATION, '[DataTask] production run requires confirmProduction: true.');
        }
        if (plan.requiresSnapshotApproval && !options.approvedSnapshotChecksum) {
            throw createError(ErrorCodes.INVALID_OPERATION, '[DataTask] production data writes require approvedSnapshotChecksum from a reviewed exportAffected() result.');
        }

        let lease: TaskLockLease | null = null;
        try {
            lease = await this.acquireTaskLock(task);
            const executionOptions: InternalExecutionOptions = {
                ...options,
                assertLockHeld: () => lease?.assertHeld(),
            };
            const results: DataTaskStepResult[] = [];
            const errors: string[] = [];
            let snapshot: DataTaskSnapshotResult | undefined;
            if (plan.requiresSnapshot) {
                try {
                    lease?.assertHeld();
                    snapshot = await this.exportAffected(task, undefined, executionOptions);
                } catch (error) {
                    errors.push(error instanceof Error ? error.message : String(error));
                    return {
                        mode: 'run',
                        taskName: plan.taskName,
                        passed: false,
                        status: 'failed',
                        plan,
                        results,
                        warnings: plan.warnings,
                        errors,
                    };
                }
                if (plan.requiresSnapshotApproval && snapshot.checksum !== options.approvedSnapshotChecksum) {
                    throw createError(
                        ErrorCodes.INVALID_OPERATION,
                        `[DataTask] approved snapshot checksum does not match the current affected set (approved ${options.approvedSnapshotChecksum}, current ${snapshot.checksum ?? 'missing'}).`,
                    );
                }
            }
            for (const step of task.steps) {
                try {
                    lease?.assertHeld();
                    let result: DataTaskStepResult;
                    if (step.type === 'ensureIndexes') {
                        result = await this.syncIndexes(task, step, executionOptions);
                    } else if (step.type === 'syncData') {
                        result = await this.syncData(task, step, executionOptions);
                    } else if (step.type === 'transformFields') {
                        result = await this.transformFields(task, step, executionOptions);
                    } else if (step.type === 'exportAffected') {
                        result = snapshot ?? await this.exportAffected(task, step, executionOptions);
                        snapshot = result;
                    } else {
                        result = await this.verify(task, executionOptions);
                    }
                    results.push(result);
                    errors.push(...stepResultErrors(result));
                    if (!stepResultPassed(result) && options.continueOnError !== true) break;
                } catch (error) {
                    errors.push(error instanceof Error ? error.message : String(error));
                    if (options.continueOnError !== true) break;
                }
            }
            const passed = errors.length === 0 && results.every(stepResultPassed);
            return {
                mode: 'run',
                taskName: plan.taskName,
                passed,
                status: passed ? 'passed' : 'failed',
                plan,
                snapshot,
                results,
                warnings: plan.warnings,
                errors,
            };
        } finally {
            await lease?.release();
        }
    }

    async verify(task: DataTaskDefinition, options: DataTaskExecutionOptions = {}): Promise<DataTaskVerifyResult> {
        const dryRunOptions = withDryRun(options);
        const plan = await this.plan(task, dryRunOptions);
        const warnings = [...plan.warnings];
        const errors = [...plan.errors];
        const checks: DataTaskVerifyResult['checks'] = [];
        const mismatches: DataTaskVerifyResult['mismatches'] = [];
        let checked = 0;
        if (errors.length > 0) {
            return { mode: 'verify', taskName: plan.taskName, passed: false, checked, mismatched: 0, mismatches, checks, warnings, errors };
        }

        const context = normalizeContext(task);
        const target = resolveTaskCollection(this.host, task.target);
        const verifySteps = task.steps.filter((step): step is DataTaskVerifyStep => step.type === 'verify');
        const shouldCheckCount = verifySteps.length === 0 ? Boolean(task.source) : verifySteps.some((step) => step.count === true);
        const fieldChecks = verifySteps.flatMap((step) => step.fields ?? []);
        const sampleSize = verifySteps.reduce((maximum, step) => Math.max(maximum, step.sample ?? 0), 0);
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
            let missing = 0;
            for await (const document of iterateDocuments(target, context)) {
                checked += 1;
                const missingFields = fieldChecks.filter((field) => getByPath(document, field) === undefined);
                if (missingFields.length > 0) {
                    missing += 1;
                    mismatches.push({
                        match: document._id === undefined ? {} : { _id: document._id },
                        reason: `missing required fields: ${missingFields.join(', ')}`,
                    });
                }
            }
            checks.push({
                name: 'fields',
                passed: missing === 0,
                expected: 0,
                actual: missing,
                message: missing === 0 ? undefined : 'some target documents are missing required fields.',
            });
        }

        if (sampleSize > 0 && task.source) {
            const source = resolveTaskCollection(this.host, task.source);
            const syncStep = task.steps.find((step): step is DataTaskSyncDataStep => step.type === 'syncData');
            const matchBy = resolveMatchBy(task, syncStep);
            const allowNestedTargetFields = (syncStep?.strategy ?? 'upsert') === 'merge';
            let sampleChecked = 0;
            for await (const sourceDocument of iterateDocuments(source, context, sampleSize)) {
                const match = buildMatchFilter(sourceDocument, matchBy);
                const targetMatches = await findMatchingDocuments(target, match, 2);
                sampleChecked += 1;
                checked += 1;
                if (targetMatches.length !== 1) {
                    mismatches.push({
                        match,
                        reason: targetMatches.length === 0 ? 'sample target document is missing.' : 'sample business key matches multiple target documents.',
                        expected: 1,
                        actual: targetMatches.length,
                    });
                    continue;
                }
                const expected = cloneForWrite(sourceDocument, sameEndpoint(task.source, task.target) || matchBy.includes('_id'));
                const actual = targetMatches[0];
                const differingFields = Object.keys(expected).filter((field) => !sampleValueMatches(expected[field], actual[field], allowNestedTargetFields));
                if (differingFields.length > 0) {
                    mismatches.push({
                        match,
                        reason: `sample fields differ: ${differingFields.join(', ')}`,
                        expected: Object.fromEntries(differingFields.map((field) => [field, expected[field]])),
                        actual: Object.fromEntries(differingFields.map((field) => [field, actual[field]])),
                    });
                }
            }
            const sampleMismatches = mismatches.filter((item) => item.reason.startsWith('sample')).length;
            checks.push({
                name: 'sample',
                passed: sampleMismatches === 0,
                expected: sampleChecked,
                actual: sampleChecked - sampleMismatches,
                message: sampleMismatches === 0 ? undefined : 'source-to-target sample verification failed.',
            });
        }

        if (shouldCheckIndexes) {
            for (const step of task.steps.filter((candidate): candidate is DataTaskEnsureIndexesStep => candidate.type === 'ensureIndexes')) {
                const result = await this.syncIndexes(task, step, dryRunOptions);
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
            checked,
            mismatched: mismatches.length,
            mismatches,
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
                dryRun: isDryRun(options),
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
            const declaredKey = orderedIndexKeyString(definition.key);
            const declaredComparable = stableStringify(comparableIndexOptions(declaredOptions));
            const existingByName = typeof declaredOptions.name === 'string'
                ? existing.find((item) => item.name === declaredOptions.name)
                : undefined;
            const existingByKey = existing.find((item) => orderedIndexKeyString(item.key) === declaredKey);
            const matched = existingByName ?? existingByKey;
            if (matched) {
                const existingComparable = stableStringify(comparableIndexOptions(matched));
                if ((existingByName && orderedIndexKeyString(existingByName.key) !== declaredKey) || existingComparable !== declaredComparable) {
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
            if (isDryRun(options)) {
                operations.push({ name: typeof declaredOptions.name === 'string' ? declaredOptions.name : undefined, key: definition.key, status: 'dry-run' });
                continue;
            }
            assertLockHeld(options);
            const createdOperation = await collection.createIndex(definition.key, declaredOptions);
            created += 1;
            operations.push({
                name: indexNameFromOperation(createdOperation) ?? (typeof declaredOptions.name === 'string' ? declaredOptions.name : undefined),
                key: definition.key,
                status: 'created',
            });
        }

        return { step: 'ensureIndexes', passed: conflicts === 0, created, missing, existing: existingCount, conflicts, operations, errors: [] };
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
        const matchBy = resolveMatchBy(task, syncStep);
        const strategy: DataTaskWriteStrategy = syncStep.strategy ?? 'upsert';
        if (!['insert', 'upsert', 'merge', 'replace'].includes(strategy)) {
            throw createError(ErrorCodes.INVALID_CONFIG, `[DataTask] unsupported syncData strategy: ${String(strategy)}.`);
        }
        const preserveSourceId = sameEndpoint(task.source, task.target) || syncStep.allowSourceIdMatch === true;
        const total = await source.count(context.filter);
        const result: DataTaskDataSyncResult = {
            step: 'syncData',
            passed: true,
            strategy,
            matched: 0,
            inserted: 0,
            updated: 0,
            replaced: 0,
            skipped: 0,
            duplicateMatches: 0,
            processed: 0,
            batchCount: 0,
            failed: 0,
            errors: [],
        };

        syncBatches: for await (const batch of iterateDocumentBatches(source, context)) {
            result.batchCount += 1;
            for (const document of batch) {
                try {
                    const matchFilter = buildMatchFilter(document, matchBy);
                    const targetDocuments = await findMatchingDocuments(target, matchFilter, 2);
                    result.matched += targetDocuments.length;
                    if (targetDocuments.length > 1) {
                        throw createError(ErrorCodes.INVALID_OPERATION, `[DataTask] business key ${stringifyExtendedJson(matchFilter)} matches multiple target documents.`);
                    }
                    const existing = targetDocuments[0];
                    if (isDryRun(options)) {
                        if (strategy === 'insert') {
                            result.inserted += existing ? 0 : 1;
                            result.skipped += existing ? 1 : 0;
                        } else if (existing) {
                            if (strategy === 'replace') result.replaced += 1; else result.updated += 1;
                        } else {
                            result.inserted += 1;
                        }
                    } else if (strategy === 'insert') {
                        if (existing) {
                            result.skipped += 1;
                        } else {
                            assertLockHeld(options);
                            await target.insertOne(cloneForWrite(document, preserveSourceId));
                            result.inserted += 1;
                        }
                    } else if (strategy === 'replace') {
                        assertLockHeld(options);
                        if (existing) {
                            const replacement = cloneForWrite(document, false);
                            if (existing._id !== undefined) replacement._id = existing._id;
                            const filter = existing._id === undefined ? matchFilter : { _id: existing._id };
                            const writeResult = await target.replaceOne(filter, replacement, { upsert: false });
                            result.replaced += resultNumber(writeResult, 'modifiedCount');
                        } else {
                            await target.insertOne(cloneForWrite(document, preserveSourceId));
                            result.inserted += 1;
                        }
                    } else if (strategy === 'merge') {
                        assertLockHeld(options);
                        if (existing) {
                            const merged = deepMergeDocuments(existing, cloneForWrite(document, false));
                            if (existing._id !== undefined) merged._id = existing._id;
                            const filter = existing._id === undefined ? matchFilter : { _id: existing._id };
                            const writeResult = await target.replaceOne(filter, merged, { upsert: false });
                            result.updated += resultNumber(writeResult, 'modifiedCount');
                        } else {
                            await target.insertOne(cloneForWrite(document, preserveSourceId));
                            result.inserted += 1;
                        }
                    } else {
                        assertLockHeld(options);
                        const updateDocument = cloneForWrite(document, false);
                        const setOnInsert = preserveSourceId && document._id !== undefined ? { _id: document._id } : undefined;
                        const updatePayload = setOnInsert ? { $set: updateDocument, $setOnInsert: setOnInsert } : { $set: updateDocument };
                        const writeResult = target.upsertOne
                            ? await target.upsertOne(matchFilter, updatePayload, { upsert: true })
                            : await target.updateOne(matchFilter, updatePayload, { upsert: true });
                        result.updated += resultNumber(writeResult, 'modifiedCount');
                        result.inserted += resultNumber(writeResult, 'upsertedCount');
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    result.errors.push(message);
                    result.failed += 1;
                    if (/matches multiple target documents/.test(message)) result.duplicateMatches += 1;
                    if (options.continueOnError !== true) {
                        break syncBatches;
                    }
                } finally {
                    if (result.processed < total) result.processed += 1;
                    reportProgress(options, {
                        taskName: context.taskName,
                        mode: isDryRun(options) ? 'dry-run' : 'run',
                        step: 'syncData',
                        processed: result.processed,
                        total,
                        batch: result.batchCount,
                    });
                }
            }
        }
        result.passed = result.failed === 0 && result.duplicateMatches === 0;
        return result;
    }

    async transformFields(task: DataTaskDefinition, step?: DataTaskTransformFieldsStep, options: DataTaskExecutionOptions = {}): Promise<DataTaskTransformResult> {
        const transformStep = requireStep<DataTaskTransformFieldsStep>(task, 'transformFields', step);
        assertExecutableStep(task, transformStep, options);
        const context = normalizeContext(task);
        const target = resolveTaskCollection(this.host, task.target);
        const matched = await target.count(context.filter);
        const sampled = await findDocuments(target, context, transformStep.sampleSize ?? 5);
        const result: DataTaskTransformResult = {
            step: 'transformFields',
            passed: true,
            matched,
            modified: 0,
            processed: 0,
            batchCount: 0,
            failed: 0,
            sampled: [],
            errors: [],
        };

        if (isDryRun(options)) {
            if (transformStep.transform) {
                for (const document of sampled) {
                    const before = cloneDocument(document);
                    const patch = await transformStep.transform(cloneDocument(document));
                    const previewPatch = isRecord(patch) ? cloneDocument(patch) : {};
                    delete previewPatch._id;
                    result.sampled.push({ before, after: { ...cloneDocument(before), ...previewPatch } });
                }
            } else if (transformStep.pipeline || Array.isArray(transformStep.update)) {
                const pipeline = transformStep.pipeline ?? transformStep.update as GenericRecord[];
                if (!target.aggregate) {
                    throw createError(ErrorCodes.INVALID_OPERATION, '[DataTask] pipeline dry-run requires collection.aggregate().');
                }
                const previewPipeline: GenericRecord[] = [
                    { $match: context.filter },
                    { $sort: Object.keys(context.sort ?? {}).length > 0 ? context.sort : { _id: 1 } },
                    { $limit: transformStep.sampleSize ?? 5 },
                    ...pipeline,
                ];
                const afterDocuments = await target.aggregate(previewPipeline);
                if (afterDocuments.length !== sampled.length) {
                    throw createError(ErrorCodes.INVALID_OPERATION, '[DataTask] update pipeline preview changed the sample cardinality and cannot produce a safe before/after diff.');
                }
                result.sampled.push(...sampled.map((document, index) => ({
                    before: cloneDocument(document),
                    after: cloneDocument(afterDocuments[index]),
                })));
            } else {
                if (!isRecord(transformStep.update)) {
                    throw createError(ErrorCodes.INVALID_CONFIG, '[DataTask] update operator dry-run requires an update document.');
                }
                result.sampled.push(...sampled.map((document) => ({
                    before: cloneDocument(document),
                    after: applyUpdatePreview(document, transformStep.update as GenericRecord),
                })));
            }
            result.processed = sampled.length;
            result.batchCount = sampled.length > 0 ? 1 : 0;
            return result;
        }

        if (transformStep.transform) {
            transformBatches: for await (const batch of iterateDocumentBatches(target, context)) {
                result.batchCount += 1;
                for (const document of batch) {
                    try {
                        const patch = await transformStep.transform(cloneDocument(document));
                        if (!isRecord(patch) || Object.keys(patch).length === 0) {
                            continue;
                        }
                        const id = document._id;
                        if (id === undefined) {
                            throw createError(ErrorCodes.INVALID_ARGUMENT, '[DataTask] transform function updates require target documents with _id.');
                        }
                        const updateDocument = cloneDocument(patch);
                        delete updateDocument._id;
                        if (Object.keys(updateDocument).length === 0) {
                            continue;
                        }
                        assertLockHeld(options);
                        const writeResult = await target.updateOne({ _id: id }, { $set: updateDocument });
                        result.modified += resultNumber(writeResult, 'modifiedCount');
                    } catch (error) {
                        result.errors.push(error instanceof Error ? error.message : String(error));
                        result.failed += 1;
                        if (options.continueOnError !== true) break transformBatches;
                    } finally {
                        result.processed += 1;
                        reportProgress(options, {
                            taskName: context.taskName,
                            mode: 'run',
                            step: 'transformFields',
                            processed: result.processed,
                            total: matched,
                            batch: result.batchCount,
                        });
                    }
                }
            }
            result.passed = result.failed === 0;
            return result;
        }

        const update = transformStep.pipeline ?? transformStep.update;
        if (update === undefined) {
            throw createError(ErrorCodes.INVALID_CONFIG, '[DataTask] transformFields requires update, pipeline, or transform.');
        }
        assertLockHeld(options);
        const writeResult = await target.updateMany(context.filter, update);
        result.modified = resultNumber(writeResult, 'modifiedCount');
        result.processed = matched;
        result.batchCount = matched > 0 ? 1 : 0;
        return result;
    }

    async exportAffected(task: DataTaskDefinition, step?: DataTaskExportAffectedStep, options: DataTaskExecutionOptions = {}): Promise<DataTaskSnapshotResult> {
        return writeAffectedSnapshot(this.host, task, step, options, () => assertLockHeld(options));
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
            passed: summary.totals.conflicts === 0 && summary.totals.failed === 0,
            created: summary.totals.created,
            missing: summary.totals.missing,
            existing: summary.totals.existing,
            conflicts: summary.totals.conflicts,
            operations,
            errors: summary.totals.failed > 0 ? [`[DataTask] ${summary.totals.failed} model index operations failed.`] : [],
        };
    }

    private async acquireTaskLock(task: DataTaskDefinition): Promise<TaskLockLease | null> {
        if (!task.lock) {
            return null;
        }
        const lockKey = typeof task.lock === 'string'
            ? task.lock
            : isRecord(task.lock) && typeof task.lock.key === 'string'
                ? task.lock.key
                : `data-task:${task.name}`;
        const ttl = isRecord(task.lock) && typeof task.lock.ttlMs === 'number' ? task.lock.ttlMs : 10000;
        const renewInterval = isRecord(task.lock) && typeof task.lock.renewIntervalMs === 'number'
            ? task.lock.renewIntervalMs
            : Math.max(1, Math.min(Math.floor(ttl / 3), ttl - 1));
        const lock: Lock | null = await this.host.tryAcquireLock(lockKey, { ttl });
        if (!lock) {
            throw createError(ErrorCodes.LOCK_TIMEOUT, `[DataTask] lock is already held: ${lockKey}`);
        }
        let stopped = false;
        let lostError: Error | null = null;
        let timer: NodeJS.Timeout | null = null;
        let renewal: Promise<void> | null = null;

        const schedule = () => {
            if (stopped || lostError) return;
            timer = setTimeout(() => {
                renewal = lock.renew(ttl)
                    .then((renewed) => {
                        if (!renewed) {
                            lostError = createError(ErrorCodes.LOCK_TIMEOUT, `[DataTask] lock ownership was lost: ${lockKey}`);
                        }
                    })
                    .catch((error) => {
                        const reason = error instanceof Error ? error.message : String(error);
                        lostError = createError(ErrorCodes.LOCK_TIMEOUT, `[DataTask] lock renewal failed for ${lockKey}: ${reason}`);
                    })
                    .finally(() => {
                        renewal = null;
                        schedule();
                    });
            }, renewInterval);
            timer.unref?.();
        };
        schedule();

        return {
            assertHeld() {
                if (lostError) throw lostError;
                if (lock.released) {
                    throw createError(ErrorCodes.LOCK_TIMEOUT, `[DataTask] lock was released before task completion: ${lockKey}`);
                }
            },
            async release() {
                stopped = true;
                if (timer) clearTimeout(timer);
                await renewal;
                await lock.release();
            },
        };
    }
}
