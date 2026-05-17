/**
 * ObjectId auto-conversion: pass plain strings where MongoDB expects ObjectId.
 * See: docs/objectid-auto-convert.md
 *
 * monSQLize automatically converts valid 24-hex strings to ObjectId objects
 * in query filters, update payloads, and nested documents — so you never need
 * to call `new ObjectId()` manually.
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/objectid.js
 */
import { ObjectId } from 'mongodb';
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface PostDoc { title: string; authorId: string | ObjectId; categoryId: string | ObjectId; tags: (string | ObjectId)[]; status: string; }
interface UserDoc { name: string; email: string; }

async function main() {
    const { msq, server } = await setupExample('example-objectid');

    const users = msq.collection<UserDoc>('users');
    const posts = msq.collection<PostDoc>('posts');

    // ── Seed users ────────────────────────────────────────────────────────────
    const insertResult = await users.insertMany([
        { name: 'Alice', email: 'alice@example.com' },
        { name: 'Bob',   email: 'bob@example.com' },
    ]);

    // insertedIds values are typed as `unknown` — cast to ObjectId
    const aliceId = insertResult.insertedIds[0] as ObjectId;
    const bobId   = insertResult.insertedIds[1] as ObjectId;

    // Use plain string representations of the ObjectIds
    const aliceIdStr = aliceId.toString();
    const bobIdStr   = bobId.toString();

    console.log(`  Alice ObjectId string: ${aliceIdStr}`);
    console.log(`  Bob   ObjectId string: ${bobIdStr}`);

    // ── insertOne with string ObjectId references ─────────────────────────────
    console.log('\n=== insertOne with string references ===');
    const catId = new ObjectId().toString();   // pretend a category id from an HTTP request

    const post1Result = await posts.insertOne({
        title: 'Getting started with monSQLize',
        // ✅ Pass plain strings — monSQLize converts to ObjectId automatically
        authorId: aliceIdStr,
        categoryId: catId,
        tags: [catId],
        status: 'published',
    });
    console.log(`  Inserted post: ${post1Result.insertedId}`);

    // ── findOne using string _id ──────────────────────────────────────────────
    console.log('\n=== findOne / findOneById using string id ===');

    // findOneById accepts string directly
    const alice = await users.findOneById(aliceIdStr);
    console.log(`  findOneById('${aliceIdStr}'): ${alice?.name}`);

    // find with string in filter
    const post = await posts.findOne({ authorId: aliceIdStr });
    console.log(`  findOne({ authorId: string }): "${post?.title}"`);

    // ── find with multiple string ids ─────────────────────────────────────────
    console.log('\n=== find with $in array of strings ===');
    const foundUsers = await users.find({ _id: { $in: [aliceIdStr, bobIdStr] } });
    console.log(`  Users found: ${foundUsers.map((u: UserDoc) => u.name).join(', ')}`);

    // ── findByIds — bulk id lookup ────────────────────────────────────────────
    console.log('\n=== findByIds (string array) ===');
    const byIds = await users.findByIds([aliceIdStr, bobIdStr]);
    console.log(`  findByIds results: ${byIds.map((u: UserDoc) => u.name).join(', ')}`);

    // ── updateOne with string id ──────────────────────────────────────────────
    console.log('\n=== updateOne with string _id ===');
    await posts.updateOne(
        { _id: (post1Result.insertedId as unknown as ObjectId).toString() },
        { $set: { status: 'featured' } },
    );
    const updated = await posts.findOneById((post1Result.insertedId as unknown as ObjectId).toString());
    console.log(`  Updated post status: ${updated?.status}`);

    // ── nested ObjectId conversion ────────────────────────────────────────────
    console.log('\n=== nested fields: authorId reassignment via $set ===');
    await posts.updateOne(
        { title: 'Getting started with monSQLize' },
        { $set: { authorId: bobIdStr } },
    );
    const reassigned = await posts.findOne({ title: 'Getting started with monSQLize' });
    console.log(`  New authorId (stored as ObjectId): ${reassigned?.authorId}`);
    console.log(`  Is real ObjectId: ${reassigned?.authorId instanceof ObjectId}`);

    // ── deleteOne with string id ──────────────────────────────────────────────
    console.log('\n=== deleteOne with string _id ===');
    await posts.deleteOne({ _id: (post1Result.insertedId as unknown as ObjectId).toString() });
    const gone = await posts.findOneById((post1Result.insertedId as unknown as ObjectId).toString());
    console.log(`  Deleted post exists: ${gone !== null}`);

    await teardownExample(msq, server);
    console.log('\n✅ ObjectId auto-conversion example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
