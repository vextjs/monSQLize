declare module 'monsqlize' {
    type DbType = 'mongodb';
    interface LoggerLike { debug?: (...args: any[]) => void; info?: (...args: any[]) => void; warn?: (...args: any[]) => void; error?: (...args: any[]) => void }
    interface CacheLike {
        get(key: string): Promise<any>;
        set(key: string, val: any, ttl?: number): Promise<void>;
        del(key: string): Promise<boolean>;
        exists(key: string): Promise<boolean>;
        getMany(keys: string[]): Promise<Record<string, any>>;
        setMany(obj: Record<string, any>, ttl?: number): Promise<boolean>;
        delMany(keys: string[]): Promise<number>;
        delPattern(pattern: string): Promise<number>;
        clear(): void;
        keys(pattern?: string): string[];
        getStats?(): any;
    }
    interface BaseOptions {
        type: DbType;
        databaseName: string;
        config: any;
        cache?: CacheLike | object;
        logger?: LoggerLike;
        maxTimeMS?: number; // 全局默认查询超时（毫秒）
        findLimit?: number; // 全局默认 find limit（未传 limit 时使用；0 表示不限制）
        namespace?: { instanceId?: string; scope?: 'database' | 'connection' };
        slowQueryMs?: number; // 慢查询日志阈值（毫秒），默认 500
    }
    interface FindOptions {
        query?: any;
        projection?: Record<string, any> | string[];
        sort?: Record<string, 1 | -1>;
        limit?: number;
        skip?: number;
        cache?: number;
        maxTimeMS?: number;
    }
    interface CountOptions {
        query?: any;
        cache?: number;
        maxTimeMS?: number;
    }
    interface CollectionAccessor {
        getNamespace(): { iid: string; type: string; db: string; collection: string };
        dropCollection(): Promise<boolean>;
        createCollection(name?: string | null, options?: any): Promise<boolean>;
        createView(viewName: string, source: string, pipeline?: any[]): Promise<boolean>;
        findOne(options?: FindOptions): Promise<any | null>;
        find(options?: FindOptions): Promise<any[]>;
        count(options?: CountOptions): Promise<number>;
        invalidate(op?: 'find' | 'findOne' | 'count'): Promise<number>;
    }

    type DbAccessor = {
        collection: (name: string) => CollectionAccessor;
        db: (dbName: string) => { collection: (name: string) => CollectionAccessor };
    };

    export default class MonSQLize {
        constructor(options: BaseOptions);
        connect(): Promise<DbAccessor>;
        getCache(): CacheLike;
        getDefaults(): { maxTimeMS?: number; findLimit?: number; namespace?: { instanceId?: string; scope?: 'database' | 'connection' }; slowQueryMs?: number };
        close(): Promise<void>;
    }
}
