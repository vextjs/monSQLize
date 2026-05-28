import { expectAssignable, expectType } from 'tsd';
import MonSQLize, {
    type ModelAccessor,
    type ModelDefinition,
    type ModelDocument,
    type PopulateProxy,
    type RelationConfig,
    type VirtualConfig,
} from 'monsqlize';

type UserDoc = {
    _id?: unknown;
    firstName: string;
    lastName: string;
    nickname?: string;
    posts?: Array<{ title: string }>;
};

const relation: RelationConfig = {
    from: 'posts',
    localField: '_id',
    foreignField: 'authorId',
};

const virtual: VirtualConfig = {
    get() {
        return `${this.firstName} ${this.lastName}`;
    },
};

expectAssignable<ModelDefinition<UserDoc>>({
    schema: { type: 'object', properties: { firstName: { type: 'string' } } },
    indexes: [{ key: { firstName: 1 }, unique: false }],
    defaults: { nickname: 'ada' },
    methods: {
        greet() {
            return `${this.firstName}`;
        },
    },
    relations: { posts: relation },
    virtuals: { displayName: virtual },
    connection: { database: 'tenant_a' },
    options: { validate: true, timestamps: { createdAt: true, updatedAt: 'updatedAt' } },
});

const runtime = new MonSQLize({ type: 'mongodb', databaseName: 'types_model' });
const users = runtime.model<UserDoc>('users');
declare const userDocument: ModelDocument<UserDoc>;
expectType<ModelAccessor<UserDoc>>(users);
expectType<PopulateProxy<ModelDocument<UserDoc> | null>>(users.findOne({ firstName: 'Ada' }));
expectType<PopulateProxy<ModelDocument<UserDoc> | null>>(users.findOneById('id').populate('posts'));
expectType<PopulateProxy<ModelDocument<UserDoc> | null>>(userDocument.populate('posts'));
expectType<PopulateProxy<ModelDocument<UserDoc> | null>>(userDocument.populate('posts').populate('posts'));
expectType<Promise<{ valid: boolean; errors?: Array<{ field: string; message: string; value?: unknown }>; data?: unknown }>>(userDocument.validate());
expectType<PopulateProxy<Array<ModelDocument<UserDoc>>>>(users.find({}).populate([{ path: 'posts' }]));
expectType<PopulateProxy<{ data: Array<ModelDocument<UserDoc>>; total: number }>>(users.findAndCount({}));
expectType<PopulateProxy<{
    items: Array<ModelDocument<UserDoc>>;
    pageInfo: {
        hasNext: boolean;
        hasPrev: boolean;
        startCursor: string | null;
        endCursor: string | null;
        currentPage?: number;
    };
    totals?: Record<string, unknown>;
    meta?: import('monsqlize').MetaInfo;
}>>(users.findPage({ page: 1, limit: 10 }));
expectType<{ valid: boolean; errors?: Array<{ field: string; message: string; value?: unknown }>; data?: unknown }>(users.validate({ firstName: 'Ada', lastName: 'Lovelace' }));
expectType<Record<string, string>>(users.getEnums());
expectType<Promise<import('monsqlize').DeleteBatchResult>>(users.deleteBatch({ firstName: 'Ada' }));
expectType<Promise<import('monsqlize').BookmarkPrewarmResult>>(users.prewarmBookmarks({ limit: 10 }, [1, 2]));
expectType<Promise<import('monsqlize').BookmarkListResult>>(users.listBookmarks({ limit: 10 }));
expectType<Promise<import('monsqlize').BookmarkClearResult>>(users.clearBookmarks({ limit: 10 }));
expectType<NodeJS.ReadableStream>(users.stream({ firstName: 'Ada' }));
expectType<Promise<unknown>>(users.explain({ firstName: 'Ada' }));
expectType<Promise<number>>(users.invalidate('find'));
expectType<Promise<boolean>>(users.dropCollection());
expectType<Promise<boolean>>(users.createCollection('users_archive'));
expectType<Promise<boolean>>(users.createView('users_view', 'users', []));
expectType<Promise<unknown[]>>(users.indexStats());
expectType<Promise<{ ok: number; collection: string }>>(users.setValidator({ $jsonSchema: { bsonType: 'object' } }));
expectType<Promise<{ validator: Record<string, unknown> | null; validationLevel: string; validationAction: string }>>(users.getValidator());
expectType<Promise<{ ns: string; count: number; size: number; storageSize: number; totalIndexSize: number; nindexes: number; avgObjSize?: number; scaleFactor?: number }>>(users.stats());
expectType<Promise<{ renamed: boolean; from: string; to: string }>>(users.renameCollection('users_renamed'));
expectType<Promise<Record<string, unknown>>>(users.collMod({ validationLevel: 'moderate' }));
expectType<Promise<{ ok: number; collection: string; capped: boolean; size: number }>>(users.convertToCapped(1024));

const scoped = runtime.use('tenant_a').model<UserDoc>('users');
expectType<ModelAccessor<UserDoc>>(scoped);

