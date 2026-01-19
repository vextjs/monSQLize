/**
 * 事务相关类型定义
 * @module types/transaction
 * @since v0.2.0
 */

/**
 * MongoDB 事务会话（原生 ClientSession）
 * @since v0.2.0
 */
export interface MongoSession {
    /** 会话 ID */
    id: any;
    /** 是否在事务中 */
    inTransaction(): boolean;
    /** 事务状态 */
    transaction?: {
        state: string;
    };
    /** 结束会话 */
    endSession(): void;
    /** 其他 MongoDB 原生方法 */
    [key: string]: any;
}

/**
 * Transaction 事务类
 * 封装 MongoDB 原生会话，提供事务生命周期管理
 * @since v0.2.0
 */
export interface Transaction {
    /** 事务唯一 ID */
    readonly id: string;

    /** MongoDB 原生会话对象（传递给查询方法） */
    readonly session: MongoSession;

    /**
     * 启动事务
     * @returns Promise<void>
     */
    start(): Promise<void>;

    /**
     * 提交事务
     * @returns Promise<void>
     */
    commit(): Promise<void>;

    /**
     * 中止（回滚）事务
     * @returns Promise<void>
     */
    abort(): Promise<void>;

    /**
     * 结束会话（清理资源）
     * @returns Promise<void>
     */
    end(): Promise<void>;

    /**
     * 获取事务执行时长（毫秒）
     * @returns number
     */
    getDuration(): number;

    /**
     * 获取事务信息
     * @returns 事务状态信息
     */
    getInfo(): {
        id: string;
        status: 'pending' | 'started' | 'committed' | 'aborted';
        duration: number;
        sessionId: string;
    };
}

