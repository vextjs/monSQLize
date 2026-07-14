import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateDataTaskApproval } from '../../../src/capabilities/data-tasks/job-apply';
import { probeDataTaskBackupDirectory, readDataTaskBackup } from '../../../src/capabilities/data-tasks/job-backup';
import { acquireDataTaskLease } from '../../../src/capabilities/data-tasks/job-lock';
import { hashDataTaskValue } from '../../../src/capabilities/data-tasks/job-normalizer';
import { validateRestoreApproval } from '../../../src/capabilities/data-tasks/job-restore';
import { DataTaskJobService } from '../../../src/capabilities/data-tasks/job-service';
import type { DataTaskApproval } from '../../../types/data-tasks';

const hashes = {
    jobHash: 'job-hash',
    sourceHash: 'source-hash',
    targetHash: 'target-hash',
    indexHash: 'index-hash',
};

function approval(kind: 'apply' | 'restore', overrides: Partial<DataTaskApproval> = {}): DataTaskApproval {
    const payload = {
        kind,
        ...hashes,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        ...overrides,
    };
    return { ...payload, token: hashDataTaskValue(payload) };
}

function hostWithCollection(collection: Record<string, unknown>): any {
    return { collection: () => collection };
}

describe('dataTasks job defensive branches', () => {
    it('validates apply approvals by kind, token, expiry, and every bound hash', () => {
        const plan = { hashes } as any;
        assert.throws(() => validateDataTaskApproval(null as any, plan), (error: any) => error.code === 'APPROVAL_STALE');
        assert.throws(() => validateDataTaskApproval(approval('restore'), plan), /apply approval/);
        assert.throws(() => validateDataTaskApproval({ ...approval('apply'), token: 'invalid' }, plan), /token is invalid/);
        assert.throws(() => validateDataTaskApproval(approval('apply', { expiresAt: new Date(Date.now() - 1_000).toISOString() }), plan), /expired/);
        for (const key of Object.keys(hashes) as Array<keyof typeof hashes>) {
            assert.throws(() => validateDataTaskApproval(approval('apply', { [key]: 'drifted' }), plan), new RegExp(`${key} drifted`));
        }
        assert.doesNotThrow(() => validateDataTaskApproval(approval('apply'), plan));
    });

    it('validates restore approvals by kind, token, expiry, and every bound hash', () => {
        const plan = { hashes } as any;
        assert.throws(() => validateRestoreApproval(null as any, plan), (error: any) => error.code === 'RESTORE_DRIFT');
        assert.throws(() => validateRestoreApproval(approval('apply'), plan), /restore approval/);
        assert.throws(() => validateRestoreApproval({ ...approval('restore'), token: 'invalid' }, plan), /token is invalid/);
        assert.throws(() => validateRestoreApproval(approval('restore', { expiresAt: new Date(Date.now() - 1_000).toISOString() }), plan), /expired/);
        for (const key of Object.keys(hashes) as Array<keyof typeof hashes>) {
            assert.throws(() => validateRestoreApproval(approval('restore', { [key]: 'drifted' }), plan), new RegExp(`${key} drifted`));
        }
        assert.doesNotThrow(() => validateRestoreApproval(approval('restore'), plan));
    });

    it('rejects unsupported, failed, duplicate, and occupied lease acquisitions', async () => {
        await assert.rejects(
            () => acquireDataTaskLease(hostWithCollection({}), { ttlMs: 1_000, waitTimeoutMs: 0 }),
            /does not support lease lock operations/,
        );
        await assert.rejects(
            () => acquireDataTaskLease(hostWithCollection({
                findOneAndUpdate: async () => { throw new Error('acquire failed'); },
                deleteOne: async () => ({ deletedCount: 0 }),
            }), { ttlMs: 1_000, waitTimeoutMs: 0 }),
            /lease acquisition failed: acquire failed/,
        );
        await assert.rejects(
            () => acquireDataTaskLease(hostWithCollection({
                findOneAndUpdate: async () => { throw 'acquire string failed'; },
                deleteOne: async () => ({ deletedCount: 0 }),
            }), { ttlMs: 1_000, waitTimeoutMs: 0 }),
            /lease acquisition failed: acquire string failed/,
        );
        await assert.rejects(
            () => acquireDataTaskLease(hostWithCollection({
                findOneAndUpdate: async () => { throw { code: 11000 }; },
                deleteOne: async () => ({ deletedCount: 0 }),
            }), { ttlMs: 1_000, waitTimeoutMs: 0 }),
            /another data task holds/,
        );
        await assert.rejects(
            () => acquireDataTaskLease(hostWithCollection({
                findOneAndUpdate: async () => ({ owner: 'someone-else' }),
                deleteOne: async () => ({ deletedCount: 0 }),
            }), { ttlMs: 1_000, waitTimeoutMs: 0 }),
            /another data task holds/,
        );
    });

    it('waits for a lease, releases idempotently, and rejects use after release', async () => {
        let attempts = 0;
        let deletes = 0;
        const lease = await acquireDataTaskLease(hostWithCollection({
            findOneAndUpdate: async (_filter: unknown, update: any) => {
                attempts += 1;
                return attempts === 1 ? { owner: 'someone-else' } : { owner: update.$set.owner };
            },
            updateOne: async () => ({ matchedCount: 1 }),
            deleteOne: async () => { deletes += 1; return { deletedCount: 1 }; },
        }), { ttlMs: 1_000, waitTimeoutMs: 200 });
        assert.equal(attempts, 2);
        assert.doesNotThrow(() => lease.assertHeld());
        await lease.release();
        await lease.release();
        assert.equal(deletes, 1);
        assert.throws(() => lease.assertHeld(), (error: any) => error.code === 'LOCK_LOST');
    });

    it('detects lost ownership and renewal exceptions', async () => {
        for (const renew of [
            async () => ({ matchedCount: 0 }),
            async () => null,
            async () => { throw 'renew failed'; },
        ]) {
            const lease = await acquireDataTaskLease(hostWithCollection({
                findOneAndUpdate: async (_filter: unknown, update: any) => ({ owner: update.$set.owner }),
                updateOne: renew,
                deleteOne: async () => ({ deletedCount: 1 }),
            }), { ttlMs: 1_000, waitTimeoutMs: 0 });
            await new Promise((resolve) => setTimeout(resolve, 320));
            assert.throws(() => lease.assertHeld(), (error: any) => error.code === 'LOCK_LOST');
            await lease.release();
        }
    });

    it('fails closed when a renewal remains pending beyond the local lease expiry', async () => {
        let finishRenewal: ((value: { matchedCount: number }) => void) | undefined;
        const lease = await acquireDataTaskLease(hostWithCollection({
            findOneAndUpdate: async (_filter: unknown, update: any) => ({
                owner: update.$set.owner,
                expiresAt: update.$set.expiresAt,
            }),
            updateOne: async () => new Promise<{ matchedCount: number }>((resolve) => { finishRenewal = resolve; }),
            deleteOne: async () => ({ deletedCount: 1 }),
        }), { ttlMs: 1_000, waitTimeoutMs: 0 });

        await new Promise((resolve) => setTimeout(resolve, 1_050));
        assert.throws(() => lease.assertHeld(), (error: any) => error.code === 'LOCK_LOST' && /expired/.test(error.message));
        finishRenewal?.({ matchedCount: 1 });
        await lease.release();
    });

    it('reports backup probe failures and facade fallback errors', async () => {
        const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'monsqlize-job-branch-'));
        const filePath = path.join(temporary, 'not-a-directory');
        await fs.writeFile(filePath, 'file', 'utf8');
        try {
            await assert.rejects(() => probeDataTaskBackupDirectory(filePath), (error: any) => (
                error.code === 'BACKUP_FAILED' && error.phase === 'backup'
            ));
        } finally {
            await fs.rm(temporary, { recursive: true, force: true });
        }

        const service = new DataTaskJobService(() => { throw new Error('factory not used'); });
        const invalid = await service.preview(null as any);
        assert.equal(invalid.jobName, 'data-task');
        assert.match(invalid.errors[0], /INVALID_JOB/);

        const source = { collection: () => ({}) } as any;
        const target = {
            collection: () => ({ listIndexes: async () => { throw new Error('unexpected index read failure'); } }),
        } as any;
        const generic = await service.preview({
            name: 'generic-failure', source, target, targetEnvironment: 'test',
            collections: [{ name: 'items', data: { all: true, identity: { mode: 'source-id' } } }],
        });
        assert.match(generic.errors[0], /^\[DataTask:INVALID_JOB\].*unexpected index read failure/);

        const stringTarget = {
            collection: () => ({ listIndexes: async () => { throw 'string index failure'; } }),
        } as any;
        const stringFailure = await service.preview({
            name: 'string-failure', source, target: stringTarget, targetEnvironment: 'test',
            collections: [{ name: 'items', data: { all: true, identity: { mode: 'source-id' } } }],
        });
        assert.match(stringFailure.errors[0], /string index failure/);

        const backup = { runId: 'run', manifestPath: 'manifest.json', checksum: 'checksum' };
        await assert.rejects(() => service.previewRestore(backup), /restore target is required/);
        await assert.rejects(() => service.restore(backup, { approval: approval('restore') }), /restore target is required/);
    });

    it('rejects malformed backup manifests, escaped payload paths, and checksum drift', async () => {
        const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'monsqlize-job-manifest-'));
        const manifestDirectory = path.join(temporary, 'run');
        const manifestPath = path.join(manifestDirectory, 'manifest.json');
        const checksum = createHash('sha256').update('').digest('hex');
        await fs.mkdir(manifestDirectory);
        await fs.writeFile(path.join(manifestDirectory, 'backup.ejsonl'), '', 'utf8');
        const manifest = {
            version: 1,
            kind: 'monsqlize-data-task-backup',
            runId: 'run',
            compression: 'none',
            dataFile: 'backup.ejsonl',
            checksum,
            entryCount: 0,
        };
        try {
            const invalidCases: Array<[Record<string, unknown>, RegExp]> = [
                [{ kind: 'other' }, /invalid backup manifest/],
                [{ version: 2 }, /invalid backup manifest/],
                [{ runId: 'other' }, /invalid backup manifest/],
                [{ compression: 'zip' }, /invalid backup compression/],
                [{ entryCount: -1 }, /invalid backup entry count/],
                [{ checksum: 'invalid' }, /invalid backup checksum/],
                [{ dataFile: null }, /data file must stay beside its manifest/],
                [{ dataFile: '' }, /data file must stay beside its manifest/],
                [{ dataFile: path.resolve(temporary, 'outside.ejsonl') }, /data file must stay beside its manifest/],
                [{ dataFile: 'nested/backup.ejsonl' }, /data file must stay beside its manifest/],
                [{ dataFile: '..' }, /data file escaped its manifest directory/],
            ];
            for (const [overrides, expected] of invalidCases) {
                await fs.writeFile(manifestPath, JSON.stringify({ ...manifest, ...overrides }), 'utf8');
                await assert.rejects(
                    () => readDataTaskBackup({ runId: 'run', manifestPath, checksum }),
                    expected,
                );
            }

            await fs.writeFile(manifestPath, JSON.stringify(manifest), 'utf8');
            await assert.rejects(
                () => readDataTaskBackup({ runId: 'run', manifestPath, checksum: '0'.repeat(64) }),
                /backup checksum mismatch/,
            );
        } finally {
            await fs.rm(temporary, { recursive: true, force: true });
        }
    });
});
