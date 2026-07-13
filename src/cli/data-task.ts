import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import packageJson from '../../package.json';
import { createDataTaskService } from '../capabilities/data-tasks/job-service';
import { MonSQLizeRuntime } from '../entry/runtime-core';
import type {
    DataTaskApproval,
    DataTaskBackupRef,
    DataTaskJob,
} from '../../types/data-tasks';

interface ParsedArgs {
    action?: 'preview' | 'apply' | 'preview-restore' | 'restore';
    taskFile?: string;
    json: boolean;
    approvalFile?: string;
    backupFile?: string;
    outFile?: string;
    help: boolean;
    version: boolean;
}

function usage(): string {
    return [
        'Usage:',
        '  monsqlize data-task preview --task <job.mjs> [--out <preview.json>] [--json]',
        '  monsqlize data-task apply --task <job.mjs> --approval <preview.json> [--out <result.json>] [--json]',
        '  monsqlize data-task preview-restore --task <job.mjs> --backup <manifest.json> [--out <preview.json>] [--json]',
        '  monsqlize data-task restore --task <job.mjs> --backup <manifest.json> --approval <preview.json> [--out <result.json>] [--json]',
        '  monsqlize --help | --version',
    ].join('\n');
}

function parseArgs(argv: string[]): ParsedArgs {
    const args = [...argv];
    if (args[0] === 'data-task') {
        args.shift();
    }
    const parsed: ParsedArgs = {
        json: false,
        help: false,
        version: false,
    };
    if (args[0] === '--help' || args[0] === '-h') {
        parsed.help = true;
        args.shift();
    } else if (args[0] === '--version' || args[0] === '-v') {
        parsed.version = true;
        args.shift();
    } else {
        parsed.action = args.shift() as ParsedArgs['action'];
    }
    while (args.length > 0) {
        const arg = args.shift();
        if (arg === '--task') {
            parsed.taskFile = args.shift();
        } else if (arg === '--json') {
            parsed.json = true;
        } else if (arg === '--approval') {
            parsed.approvalFile = args.shift();
        } else if (arg === '--backup') {
            parsed.backupFile = args.shift();
        } else if (arg === '--out') {
            parsed.outFile = args.shift();
        } else if (arg === '--help' || arg === '-h') {
            parsed.help = true;
        } else if (arg === '--version' || arg === '-v') {
            parsed.version = true;
        } else if (arg) {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }
    return parsed;
}

function collectFailures(value: unknown, location = 'result'): string[] {
    if (!value || typeof value !== 'object') return [];
    const record = value as Record<string, unknown>;
    const failures: string[] = [];
    if (record.passed === false || record.status === 'failed' || record.status === 'partial') {
        failures.push(`${location} reported failure.`);
    }
    if (Array.isArray(record.errors)) {
        for (const error of record.errors) failures.push(`${location}: ${String(error)}`);
    }
    if (Array.isArray(record.results)) {
        record.results.forEach((result, index) => failures.push(...collectFailures(result, `${location}.results[${index}]`)));
    }
    return [...new Set(failures)];
}

function unwrapDefault(value: unknown): unknown {
    return value && typeof value === 'object' && 'default' in value
        ? (value as { default: unknown }).default
        : value;
}

function isDataTaskJob(value: unknown): value is DataTaskJob {
    return Boolean(value && typeof value === 'object'
        && typeof (value as { name?: unknown }).name === 'string'
        && typeof (value as { targetEnvironment?: unknown }).targetEnvironment === 'string'
        && Array.isArray((value as { collections?: unknown }).collections));
}

function normalizeJobConfig(value: unknown): DataTaskJob {
    const exportedValue = unwrapDefault(value);
    if (!isDataTaskJob(exportedValue)) throw new Error('Task file must directly export a DataTaskJob.');
    return exportedValue;
}

async function loadTaskFile(file: string): Promise<unknown> {
    const resolved = path.resolve(process.cwd(), file);
    if (resolved.endsWith('.json')) {
        return JSON.parse(await readFile(resolved, 'utf8'));
    }
    if (resolved.endsWith('.mjs')) {
        return import(pathToFileURL(resolved).href);
    }
    return require(resolved);
}

async function loadApproval(file: string): Promise<DataTaskApproval> {
    const parsed = JSON.parse(await readFile(path.resolve(process.cwd(), file), 'utf8')) as unknown;
    const approval = parsed && typeof parsed === 'object' && 'approval' in parsed
        ? (parsed as { approval?: DataTaskApproval }).approval
        : parsed as DataTaskApproval;
    if (!approval || (approval.kind !== 'apply' && approval.kind !== 'restore')) throw new Error('--approval must reference a preview result or approval object.');
    return approval;
}

async function loadBackupRef(file: string): Promise<DataTaskBackupRef> {
    const resolved = path.resolve(process.cwd(), file);
    const parsed = JSON.parse(await readFile(resolved, 'utf8')) as Partial<DataTaskBackupRef> & { runId?: string; checksum?: string };
    if (parsed.manifestPath && parsed.runId && parsed.checksum) return { runId: parsed.runId, checksum: parsed.checksum, manifestPath: path.resolve(path.dirname(resolved), parsed.manifestPath) };
    if (typeof parsed.runId !== 'string' || typeof parsed.checksum !== 'string') throw new Error('--backup must reference a dataTasks manifest or backup ref.');
    return { runId: parsed.runId, checksum: parsed.checksum, manifestPath: resolved };
}

function printHumanResult(action: string, result: unknown): void {
    if (!result || typeof result !== 'object') {
        console.log(String(result));
        return;
    }
    const record = result as Record<string, unknown>;
    console.log(`monSQLize data-task ${action}: ${record.jobName ?? record.taskName ?? 'task'}`);
    if (record.passed !== undefined) {
        console.log(`passed: ${String(record.passed)}`);
    }
    if (Array.isArray(record.errors) && record.errors.length > 0) {
        console.log(`errors: ${record.errors.length}`);
        for (const error of record.errors) {
            console.log(`- ${String(error)}`);
        }
    }
    if (Array.isArray(record.warnings) && record.warnings.length > 0) {
        console.log(`warnings: ${record.warnings.length}`);
        for (const warning of record.warnings) {
            console.log(`- ${String(warning)}`);
        }
    }
    if (Array.isArray(record.results)) {
        console.log(`results: ${record.results.length}`);
    }
    if (Array.isArray(record.collections)) console.log(`collections: ${record.collections.length}`);
    const failures = collectFailures(result).filter((failure) => !failure.startsWith('result:'));
    if (failures.length > 0) {
        console.log(`nested failures: ${failures.length}`);
        for (const failure of failures) console.log(`- ${failure}`);
    }
    if (record.backup && typeof record.backup === 'object') {
        const backup = record.backup as Record<string, unknown>;
        if (backup.manifestPath) console.log(`backup: ${String(backup.manifestPath)}`);
    }
}

async function outputResult(args: ParsedArgs, action: string, result: unknown): Promise<void> {
    const serialized = `${JSON.stringify(result, null, 2)}\n`;
    if (args.outFile) await writeFile(path.resolve(process.cwd(), args.outFile), serialized, 'utf8');
    if (args.json) console.log(serialized.trimEnd()); else printHumanResult(action, result);
    if (collectFailures(result).length > 0) process.exitCode = 1;
}

async function runCli(argv: string[]): Promise<void> {
    const args = parseArgs(argv);
    if (args.version) {
        console.log(packageJson.version);
        return;
    }
    if (args.help || !args.action) {
        console.log(usage());
        return;
    }
    if (!['preview', 'apply', 'preview-restore', 'restore'].includes(args.action)) {
        throw new Error(`Unknown data-task action: ${String(args.action)}`);
    }
    if (!args.taskFile) {
        throw new Error('--task <file> is required.');
    }

    const loaded = await loadTaskFile(args.taskFile);
    const job = normalizeJobConfig(loaded);
    if (typeof (job.source as { collection?: unknown }).collection === 'function'
        || typeof (job.target as { collection?: unknown }).collection === 'function') {
        throw new Error('CLI DataTaskJob source and target must be MonSQLizeOptions, not runtime instances.');
    }
    const service = createDataTaskService((options) => new MonSQLizeRuntime(options) as unknown as import('../capabilities/data-tasks/job-service').DataTaskManagedRuntime);
    let result: unknown;
    if (args.action === 'preview') {
        result = await service.preview(job);
    } else if (args.action === 'apply') {
        if (!args.approvalFile) throw new Error('apply requires --approval <preview.json>.');
        result = await service.apply(job, { approval: await loadApproval(args.approvalFile) });
    } else {
        if (!args.backupFile) throw new Error(`${args.action} requires --backup <manifest.json>.`);
        const backup = await loadBackupRef(args.backupFile);
        if (args.action === 'preview-restore') {
            result = await service.previewRestore(backup, { target: job.target });
        } else {
            if (!args.approvalFile) throw new Error('restore requires --approval <preview.json>.');
            result = await service.restore(backup, { target: job.target, approval: await loadApproval(args.approvalFile) });
        }
    }
    await outputResult(args, args.action, result);
}

runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
