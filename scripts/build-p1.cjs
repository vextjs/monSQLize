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
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

