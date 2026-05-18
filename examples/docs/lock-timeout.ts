/**
 * Lock timeout / recovery example.
 * See: docs/failure-recovery-examples.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/lock-timeout.js
 */
import MonSQLize from 'monsqlize';

async function main() {
    const manager = new MonSQLize.LockManager({ lockKeyPrefix: 'example:lock:' });

    try {
        console.log('=== Lock timeout / recovery ===');
        const held = await manager.acquireLock('inventory:sku-1', { ttl: 5000 });
        console.log(`  First lock acquired: ${held.isHeld()}`);

        const tryLock = await manager.tryAcquireLock('inventory:sku-1');
        console.log(`  tryAcquireLock while held: ${tryLock === null ? 'null (expected)' : 'unexpected lock'}`);

        try {
            await manager.acquireLock('inventory:sku-1', { retryTimes: 0, retryDelay: 1 });
        } catch (error) {
            console.log(`  acquireLock timeout code: ${(error as { code?: string }).code ?? 'unknown'}`);
        }

        await held.release();
        const recovered = await manager.tryAcquireLock('inventory:sku-1', { ttl: 5000 });
        console.log(`  Lock recovered after release: ${recovered ? 'yes' : 'no'}`);
        await recovered?.release();
        console.log('✅ Lock timeout example complete');
    } finally {
        manager.clear();
        manager.close();
    }
}

main().catch((error) => {
    console.error('❌ Example failed:', error);
    process.exit(1);
});
