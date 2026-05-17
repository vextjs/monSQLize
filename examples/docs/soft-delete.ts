/**
 * Soft-delete operations: findWithDeleted, findOnlyDeleted, restore, forceDelete.
 * Requires softDelete: true in model definition.
 * See: docs/model.md#soft-delete
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/soft-delete.js
 */
import MonSQLize from 'monsqlize';
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface ArticleDoc { title: string; author: string; status: string; }

// Define model with soft delete enabled (static, before connect)
MonSQLize.Model.define('articles', {
    schema: (dsl: unknown) => (dsl as (shape: Record<string, string>) => Record<string, unknown>)({
        title: 'string',
        author: 'string',
        status: 'string',
    }),
    options: { softDelete: true },
});

async function main() {
    const { msq, server } = await setupExample('example-soft-delete');
    const Article = msq.model<ArticleDoc>('articles');

    // ── Seed data ──────────────────────────────────────────────────────────
    await Article.insertMany([
        { title: 'Getting Started', author: 'Alice', status: 'published' },
        { title: 'Advanced Guide', author: 'Bob', status: 'published' },
        { title: 'Draft Post', author: 'Alice', status: 'draft' },
        { title: 'Old Tutorial', author: 'Carol', status: 'published' },
    ]);

    // ── deleteOne — soft delete (sets deletedAt, not physically removed) ──
    console.log('=== Soft delete ===');
    await Article.deleteOne({ title: 'Old Tutorial' });
    await Article.deleteMany({ status: 'draft' });

    const activeCount = await Article.count({});
    console.log(`  Active articles: ${activeCount} (expected 2)`);

    // ── findWithDeleted — include soft-deleted docs ────────────────────────
    console.log('\n=== findWithDeleted ===');
    const allDocs = await Article.findWithDeleted({});
    console.log(`  Total (including deleted): ${allDocs.length} (expected 4)`);
    for (const doc of allDocs as Array<ArticleDoc & { deletedAt?: unknown }>) {
        const mark = doc.deletedAt ? ' [deleted]' : '';
        console.log(`  - "${doc.title}" by ${doc.author}${mark}`);
    }

    // ── findOnlyDeleted — only soft-deleted docs ──────────────────────────
    console.log('\n=== findOnlyDeleted ===');
    const deletedDocs = await Article.findOnlyDeleted({});
    console.log(`  Deleted docs: ${deletedDocs.length} (expected 2)`);

    // ── restore — un-delete one document ─────────────────────────────────
    console.log('\n=== restore ===');
    await Article.restore({ title: 'Draft Post' });
    const afterRestore = await Article.count({});
    console.log(`  Active after restore: ${afterRestore} (expected 3)`);

    // ── forceDelete — permanently remove (bypass soft delete) ─────────────
    console.log('\n=== forceDelete ===');
    await Article.forceDelete({ title: 'Old Tutorial' });
    const allAfterForce = await Article.findWithDeleted({});
    console.log(`  Total after forceDelete: ${allAfterForce.length} (expected 3)`);

    MonSQLize.Model._clear();
    await teardownExample(msq, server);
    console.log('\n✅ Soft-delete example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
