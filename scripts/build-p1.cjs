const { cpSync, mkdirSync, rmSync } = require('node:fs');
const { build } = require('esbuild');

const emitSourceMaps = process.env.MONSQLIZE_BUILD_SOURCEMAPS === '1';

async function main() {
    rmSync('lib', { recursive: true, force: true });
    rmSync('dist', { recursive: true, force: true });

    mkdirSync('dist/cjs', { recursive: true });
    mkdirSync('dist/esm', { recursive: true });
    mkdirSync('dist/types', { recursive: true });

    await build({
        entryPoints: ['src/entry/index.ts'],
        outfile: 'dist/cjs/index.cjs',
        bundle: true,
        packages: 'external',
        platform: 'node',
        format: 'cjs',
        target: 'node18',
        sourcemap: emitSourceMaps,
        logLevel: 'info',
    });

    await build({
        entryPoints: ['src/entry/index.mts'],
        outfile: 'dist/esm/index.mjs',
        bundle: true,
        packages: 'external',
        platform: 'node',
        format: 'esm',
        target: 'node18',
        sourcemap: emitSourceMaps,
        logLevel: 'info',
    });

    const cjsCompatEntries = [
        ['src/entry/compat/transaction/Transaction.ts', 'dist/cjs/transaction/Transaction.cjs'],
        ['src/entry/compat/transaction/TransactionManager.ts', 'dist/cjs/transaction/TransactionManager.cjs'],
        ['src/entry/compat/transaction/CacheLockManager.ts', 'dist/cjs/transaction/CacheLockManager.cjs'],
        ['src/entry/compat/mongodb/common/transaction-aware.ts', 'dist/cjs/mongodb/common/transaction-aware.cjs'],
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
            sourcemap: emitSourceMaps,
            logLevel: 'info',
        });
    }

    cpSync('types', 'dist/types', { recursive: true });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

