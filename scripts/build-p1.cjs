const { mkdirSync, rmSync } = require('node:fs');
const { build } = require('esbuild');

async function main() {
    rmSync('lib', { recursive: true, force: true });
    rmSync('index.mjs', { force: true });

    mkdirSync('lib', { recursive: true });

    await build({
        entryPoints: ['src/entry/index.ts'],
        outfile: 'lib/index.js',
        bundle: true,
        packages: 'external',
        platform: 'node',
        format: 'cjs',
        target: 'node18',
        sourcemap: false,
        logLevel: 'info',
    });

    await build({
        entryPoints: ['src/entry/index.mts'],
        outfile: 'index.mjs',
        bundle: true,
        packages: 'external',
        platform: 'node',
        format: 'esm',
        target: 'node18',
        sourcemap: false,
        logLevel: 'info',
    });

    const cjsCompatEntries = [
        ['src/entry/compat/transaction/Transaction.ts', 'lib/transaction/Transaction.js'],
        ['src/entry/compat/transaction/TransactionManager.ts', 'lib/transaction/TransactionManager.js'],
        ['src/entry/compat/transaction/CacheLockManager.ts', 'lib/transaction/CacheLockManager.js'],
        ['src/entry/compat/mongodb/common/transaction-aware.ts', 'lib/mongodb/common/transaction-aware.js'],
    ];

    for (const [entryPoint, outfile] of cjsCompatEntries) {
        await build({
            entryPoints: [entryPoint],
            outfile,
            bundle: true,
            packages: 'external',
            platform: 'node',
            format: 'cjs',
            target: 'node18',
            sourcemap: false,
            logLevel: 'info',
        });
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

