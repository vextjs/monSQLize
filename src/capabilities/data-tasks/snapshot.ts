import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ErrorCodes, createError } from '../../core/errors';
import type {
    DataTaskDefinition,
    DataTaskExecutionOptions,
    DataTaskExportAffectedStep,
    DataTaskSnapshotResult,
} from '../../../types/data-tasks';
import { cloneDocument } from './document-utils';
import {
    assertExecutableStep,
    buildMatchFilter,
    findMatchingDocuments,
    iterateDocuments,
    normalizeContext,
    resolveMatchBy,
    resolveSnapshotConfig,
    resolveTaskCollection,
    sanitizeFileName,
    stableStringify,
    stringifyExtendedJson,
    type DataTaskRuntimeHost,
    type GenericRecord,
} from './support';

interface SnapshotEntry {
    match: GenericRecord;
    before: GenericRecord | null;
}

async function* snapshotEntries(host: DataTaskRuntimeHost, task: DataTaskDefinition): AsyncGenerator<SnapshotEntry> {
    const context = normalizeContext(task);
    const targetContext = { ...context, projection: undefined };
    const target = resolveTaskCollection(host, task.target);
    const seen = new Set<string>();
    let hasWriteSelector = false;

    for (const step of task.steps) {
        if (step.type === 'syncData') {
            hasWriteSelector = true;
            if (!task.source) {
                throw createError(ErrorCodes.INVALID_CONFIG, '[DataTask] syncData snapshot requires source.');
            }
            const source = resolveTaskCollection(host, task.source);
            const syncContext = normalizeContext({ ...task, batchSize: step.batchSize ?? task.batchSize });
            const matchBy = resolveMatchBy(task, step);
            const seenBusinessKeys = new Set<string>();
            for await (const document of iterateDocuments(source, syncContext)) {
                const match = buildMatchFilter(document, matchBy);
                const businessKey = stableStringify(match);
                if (seenBusinessKeys.has(businessKey)) {
                    throw createError(ErrorCodes.INVALID_OPERATION, `[DataTask] source contains duplicate business key ${stringifyExtendedJson(match)}.`);
                }
                seenBusinessKeys.add(businessKey);
                const targetDocuments = await findMatchingDocuments(target, match, 2);
                if (targetDocuments.length > 1) {
                    throw createError(ErrorCodes.INVALID_OPERATION, `[DataTask] business key ${stringifyExtendedJson(match)} matches multiple target documents.`);
                }
                const before = targetDocuments[0] ? cloneDocument(targetDocuments[0]) : null;
                const identity = before?._id === undefined
                    ? `insert:${businessKey}`
                    : `target:${stringifyExtendedJson(before._id)}`;
                if (!seen.has(identity)) {
                    seen.add(identity);
                    yield { match, before };
                }
            }
        } else if (step.type === 'transformFields') {
            hasWriteSelector = true;
            for await (const document of iterateDocuments(target, targetContext)) {
                if (document._id === undefined) {
                    throw createError(ErrorCodes.INVALID_OPERATION, '[DataTask] safe transform snapshots require target documents with _id.');
                }
                const identity = `target:${stringifyExtendedJson(document._id)}`;
                if (!seen.has(identity)) {
                    seen.add(identity);
                    yield { match: { _id: document._id }, before: cloneDocument(document) };
                }
            }
        }
    }

    if (!hasWriteSelector) {
        for await (const document of iterateDocuments(target, targetContext)) {
            if (document._id === undefined) {
                throw createError(ErrorCodes.INVALID_OPERATION, '[DataTask] safe affected snapshots require target documents with _id.');
            }
            const identity = `target:${stringifyExtendedJson(document._id)}`;
            if (!seen.has(identity)) {
                seen.add(identity);
                yield { match: { _id: document._id }, before: cloneDocument(document) };
            }
        }
    }
}

export async function writeAffectedSnapshot(
    host: DataTaskRuntimeHost,
    task: DataTaskDefinition,
    step: DataTaskExportAffectedStep | undefined,
    options: DataTaskExecutionOptions,
    assertHeld: () => void,
): Promise<DataTaskSnapshotResult> {
    assertExecutableStep(task, step ?? { type: 'exportAffected' }, options);
    const snapshot = resolveSnapshotConfig(step?.snapshot ?? task.snapshot, options);
    if (!snapshot.enabled) {
        if (snapshot.allowRunWithoutSnapshot) {
            return { step: 'exportAffected', passed: true, enabled: false, skippedReason: 'snapshot disabled by task configuration.' };
        }
        throw createError(ErrorCodes.INVALID_CONFIG, '[DataTask] data write steps require snapshot unless allowRunWithoutSnapshot is true.');
    }

    const context = normalizeContext(task);
    const directory = path.resolve(process.cwd(), snapshot.dir);
    await mkdir(directory, { recursive: true });
    const fileName = `${sanitizeFileName(context.taskName)}-${Date.now()}-${randomUUID().slice(0, 8)}.${snapshot.format === 'jsonl' ? 'jsonl' : 'ejsonl'}`;
    const filePath = path.join(directory, fileName);
    const manifestPath = `${filePath}.manifest.json`;
    const handle = await open(filePath, 'wx');
    const hash = createHash('sha256');
    let count = 0;
    let existingCount = 0;
    let insertCandidates = 0;
    let bytes = 0;
    let completed = false;
    try {
        for await (const entry of snapshotEntries(host, task)) {
            assertHeld();
            const line = `${snapshot.format === 'jsonl' ? JSON.stringify(entry) : stringifyExtendedJson(entry)}\n`;
            await handle.write(line, undefined, 'utf8');
            hash.update(line);
            bytes += Buffer.byteLength(line);
            count += 1;
            if (entry.before === null) insertCandidates += 1; else existingCount += 1;
        }
        await handle.close();

        const checksum = hash.digest('hex');
        const createdAt = new Date().toISOString();
        const manifest = {
            version: 1,
            taskName: context.taskName,
            target: task.target,
            filter: context.filter,
            createdAt,
            format: snapshot.format,
            count,
            existingCount,
            insertCandidates,
            bytes,
            checksum,
        };
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
        completed = true;
        return {
            step: 'exportAffected',
            passed: true,
            enabled: true,
            path: filePath,
            manifestPath,
            createdAt,
            taskName: context.taskName,
            target: task.target,
            filter: context.filter,
            format: snapshot.format,
            count,
            existingCount,
            insertCandidates,
            bytes,
            checksum,
        };
    } finally {
        if (!completed) {
            await handle.close().catch(() => undefined);
            await Promise.all([
                rm(filePath, { force: true }),
                rm(manifestPath, { force: true }),
            ]);
        }
    }
}
