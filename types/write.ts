/**
 * 写操作相关类型定义
 * @module types/write
 */

/**
 * 写确认级别
 */
export interface WriteConcern {
    w?: number | 'majority';         // 写确认级别（默认 1）
    j?: boolean;                     // 是否等待日志落盘（默认 false）
    wtimeout?: number;               // 写超时时间（毫秒）
}

/**
 * 简化的插入选项（用于简化调用形式）
 */
export interface InsertOneSimplifiedOptions {
    writeConcern?: WriteConcern;     // 写确认级别（可选）
    bypassDocumentValidation?: boolean; // 跳过文档验证（可选）
    comment?: string;                // 查询注释（用于生产环境日志跟踪）
    session?: any;                   // 事务会话
    /** 🆕 v1.1.5: 是否启用精准缓存失效（查询级别，优先于实例配置） */
    autoInvalidate?: boolean;
}

/**
 * insertOne 完整选项
 */
export interface InsertOneOptions {
    document: any;                   // 要插入的文档
    writeConcern?: WriteConcern;     // 写确认级别（可选）
    bypassDocumentValidation?: boolean; // 跳过文档验证（可选）
    comment?: string;                // 查询注释（用于生产环境日志跟踪）
}

/**
 * insertOne 返回结果
 */
export interface InsertOneResult {
    acknowledged: boolean;           // 是否被确认
    insertedId: any;                 // 插入的文档 _id
}

/**
 * 简化的批量插入选项（用于简化调用形式）
 */
export interface InsertManySimplifiedOptions {
    ordered?: boolean;               // 是否有序插入（默认 true）
    writeConcern?: WriteConcern;     // 写确认级别（可选）
    bypassDocumentValidation?: boolean; // 跳过文档验证（可选）
    comment?: string;                // 查询注释（用于生产环境日志跟踪）
    session?: any;                   // 事务会话
    /** 🆕 v1.1.5: 是否启用精准缓存失效（查询级别，优先于实例配置） */
    autoInvalidate?: boolean;
}

/**
 * insertMany 完整选项
 */
export interface InsertManyOptions {
    documents: any[];                // 要插入的文档数组
    ordered?: boolean;               // 是否有序插入（默认 true）
    writeConcern?: WriteConcern;     // 写确认级别（可选）
    bypassDocumentValidation?: boolean; // 跳过文档验证（可选）
    comment?: string;                // 查询注释（用于生产环境日志跟踪）
}

/**
 * insertMany 返回结果
 */
export interface InsertManyResult {
    acknowledged: boolean;           // 是否被确认
    insertedCount: number;           // 成功插入的文档数量
    insertedIds: { [key: number]: any }; // 插入的文档 _id 映射表
}

