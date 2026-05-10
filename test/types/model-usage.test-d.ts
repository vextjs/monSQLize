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
    defaults: { nickname: 'ada' },
    methods: {
        greet() {
            return `${this.firstName}`;
        },
    },
    relations: { posts: relation },
    virtuals: { displayName: virtual },
    connection: { database: 'tenant_a' },
});

const runtime = new MonSQLize({ type: 'mongodb', databaseName: 'types_model' });
const users = runtime.model<UserDoc>('users');
expectType<ModelAccessor<UserDoc>>(users);
expectType<PopulateProxy<ModelDocument<UserDoc> | null>>(users.findOne({ firstName: 'Ada' }));
expectType<PopulateProxy<ModelDocument<UserDoc> | null>>(users.findById('id').populate('posts'));
expectType<PopulateProxy<Array<ModelDocument<UserDoc>>>>(users.find({}).populate({ path: 'posts' }));
expectType<PopulateProxy<{ rows: Array<ModelDocument<UserDoc>>; count: number }>>(users.findAndCount({}));
expectType<PopulateProxy<{ data: Array<ModelDocument<UserDoc>>; page: { page: number; limit: number }; totals: { total: number; totalPages: number } }>>(users.findPage({ page: 1, limit: 10 }));
expectType<Promise<{ valid: boolean; errors?: Array<{ field: string; message: string; value?: unknown }> }>>(users.validate({ firstName: 'Ada', lastName: 'Lovelace' }));

const scoped = runtime.use('tenant_a').model<UserDoc>('users');
expectType<ModelAccessor<UserDoc>>(scoped);

