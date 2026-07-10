import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DataTaskRunner } from '../capabilities/data-tasks';
import { MonSQLizeRuntime } from '../entry/runtime-core';
import type { MonSQLizeOptions } from '../../types/monsqlize';
import type {
    DataTaskCliConfig,
    DataTaskDefinition,
    DataTaskExecutionOptions,
} from '../../types/data-tasks';

interface ParsedArgs {
    action?: 'plan' | 'dry-run' | 'run' | 'verify';
    taskFile?: string;
    confirmProduction: boolean;
    json: boolean;
    snapshotDir?: string;
    help: boolean;
}

function usage(): string {
    return [
        'Usage:',
        '  monsqlize data-task plan --task <file> [--json]',
        '  monsqlize data-task dry-run --task <file> [--snapshot-dir <dir>] [--json]',
        '  monsqlize data-task run --task <file> --confirm-production [--snapshot-dir <dir>] [--json]',
        '  monsqlize data-task verify --task <file> [--json]',
    ].join('\n');
}

function parseArgs(argv: string[]): ParsedArgs {
    const args = [...argv];
    if (args[0] === 'data-task') {
        args.shift();
    }
    const parsed: ParsedArgs = {
        action: args.shift() as ParsedArgs['action'],
        confirmProduction: false,
        json: false,
        help: false,
    };
    while (args.length > 0) {
        const arg = args.shift();
        if (arg === '--task') {
            parsed.taskFile = args.shift();
        } else if (arg === '--confirm-production') {
            parsed.confirmProduction = true;
        } else if (arg === '--json') {
            parsed.json = true;
        } else if (arg === '--snapshot-dir') {
            parsed.snapshotDir = args.shift();
        } else if (arg === '--help' || arg === '-h') {
            parsed.help = true;
        } else if (arg) {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }
    return parsed;
}

function isDataTaskDefinition(value: unknown): value is DataTaskDefinition {
    return Boolean(
        value
        && typeof value === 'object'
        && typeof (value as { name?: unknown }).name === 'string'
        && (value as { target?: { collection?: unknown } }).target
        && Array.isArray((value as { steps?: unknown }).steps),
    );
}

function normalizeTaskConfig(value: unknown): DataTaskCliConfig {
    const exportedValue = value && typeof value === 'object' && 'default' in value
        ? (value as { default: unknown }).default
        : value;
    if (isDataTaskDefinition(exportedValue)) {
        return { task: exportedValue };
    }
    if (!exportedValue || typeof exportedValue !== 'object') {
        throw new Error('Task file must export a data task definition or { runtime, task }.');
    }
    const config = exportedValue as DataTaskCliConfig;
    if (!isDataTaskDefinition(config.task)) {
        throw new Error('Task file must include a valid task definition.');
    }
    return config;
}

async function loadTaskFile(file: string): Promise<DataTaskCliConfig> {
    const resolved = path.resolve(process.cwd(), file);
    if (resolved.endsWith('.json')) {
        return normalizeTaskConfig(JSON.parse(await readFile(resolved, 'utf8')));
    }
    if (resolved.endsWith('.mjs')) {
        return normalizeTaskConfig(await import(pathToFileURL(resolved).href));
    }
    return normalizeTaskConfig(require(resolved));
}

function printHumanResult(action: string, result: unknown): void {
    if (!result || typeof result !== 'object') {
        console.log(String(result));
        return;
    }
    const record = result as Record<string, unknown>;
    console.log(`monSQLize data-task ${action}: ${record.taskName ?? 'task'}`);
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
}

async function runCli(argv: string[]): Promise<void> {
    const args = parseArgs(argv);
    if (args.help || !args.action) {
        console.log(usage());
        return;
    }
    if (!['plan', 'dry-run', 'run', 'verify'].includes(args.action)) {
        throw new Error(`Unknown data-task action: ${String(args.action)}`);
    }
    if (!args.taskFile) {
        throw new Error('--task <file> is required.');
    }

    const config = await loadTaskFile(args.taskFile);
    const task = config.task as DataTaskDefinition;
    const executionOptions: DataTaskExecutionOptions = {
        confirmProduction: args.confirmProduction,
        ...(args.snapshotDir ? { snapshotDir: args.snapshotDir } : {}),
    };

    const runtimeOptions = config.runtime as MonSQLizeOptions | undefined;
    const runtime = runtimeOptions ? new MonSQLizeRuntime(runtimeOptions) : null;
    const runner = runtime?.dataTasks ?? new DataTaskRunner({});
    try {
        if (runtime && args.action !== 'plan') {
            await runtime.connect();
        }
        const result = args.action === 'plan'
            ? await runner.plan(task, executionOptions)
            : args.action === 'dry-run'
                ? await runner.dryRun(task, executionOptions)
                : args.action === 'run'
                    ? await runner.run(task, executionOptions)
                    : await runner.verify(task, executionOptions);
        if (args.json) {
            console.log(JSON.stringify(result, null, 2));
        } else {
            printHumanResult(args.action, result);
        }
    } finally {
        await runtime?.close?.().catch(() => { });
    }
}

runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
