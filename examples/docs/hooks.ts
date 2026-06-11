/**
 * Model hooks example: insert, update, and delete lifecycle callbacks.
 * See: docs/hooks.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/hooks.js
 */
import MonSQLize from 'monsqlize';
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface HookUserDoc {
    email: string;
    role?: string;
    slug?: string;
}

const auditEvents: string[] = [];

MonSQLize.Model.define('hook_users', {
    schema: {},
    hooks() {
        return {
            insert: {
                before(_ctx: Record<string, unknown>, payload: unknown) {
                    auditEvents.push('before:insert');
                    const values = payload as Record<string, unknown>;
                    const email = String(values.email ?? '');
                    return {
                        role: 'user',
                        ...values,
                        slug: email.split('@')[0],
                    };
                },
                after() {
                    auditEvents.push('after:insert');
                },
            },
            update: {
                before() {
                    auditEvents.push('before:update');
                },
                after() {
                    auditEvents.push('after:update');
                },
            },
            delete: {
                before() {
                    auditEvents.push('before:delete');
                },
                after() {
                    auditEvents.push('after:delete');
                },
            },
        };
    },
});

async function main() {
    const { msq, server } = await setupExample('example-hooks');

    try {
        const users = msq.model<HookUserDoc>('hook_users');

        const created = await users.insertOne({ email: 'ada@example.com' });
        const inserted = await users.findOneById(created.insertedId);
        console.log('insert hook default role:', inserted?.role);
        console.log('insert hook slug:', inserted?.slug);

        await users.updateOne({ _id: created.insertedId }, { $set: { email: 'ada.lovelace@example.com' } });
        const updated = await users.findOneById(created.insertedId);
        console.log('update hook email:', updated?.email);

        await users.deleteOne({ _id: created.insertedId });
        const deleted = await users.findOneById(created.insertedId);
        console.log('delete result:', deleted === null ? 'deleted' : 'still-present');
        console.log('hook events:', auditEvents.join(' > '));
    } finally {
        MonSQLize.Model._clear();
        await teardownExample(msq, server);
    }

    console.log('Hooks example complete');
}

main().catch((err) => {
    console.error('Example failed:', err);
    process.exit(1);
});
