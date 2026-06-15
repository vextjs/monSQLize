const { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { build } = require('esbuild');

const emitSourceMaps = process.env.MONSQLIZE_BUILD_SOURCEMAPS === '1';

function toEsmDeclaration(content) {
    return content
        .replace(/from '((?:\.\/|\.\.\/)[^']+)'/g, (_match, specifier) => {
            return specifier.endsWith('.mjs') ? `from '${specifier}'` : `from '${specifier}.mjs'`;
        })
        .replace(/import\('((?:\.\/|\.\.\/)[^']+)'\)/g, (_match, specifier) => {
            return specifier.endsWith('.mjs') ? `import('${specifier}')` : `import('${specifier}.mjs')`;
        });
}

function writeEsmDeclarations(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
            writeEsmDeclarations(fullPath);
            continue;
        }

        if (!entry.name.endsWith('.d.ts')) continue;

        const content = readFileSync(fullPath, 'utf8');
        writeFileSync(fullPath.replace(/\.d\.ts$/, '.d.mts'), toEsmDeclaration(content));
    }
}

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
    writeEsmDeclarations('dist/types');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

