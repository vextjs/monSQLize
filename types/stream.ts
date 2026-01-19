/**
 * 流式查询和诊断相关类型定义
 * @module types/stream
 */

/**
 * 流式查询选项
 */
export interface StreamOptions {
    projection?: Record<string, any> | string[];  // 字段投影
    sort?: Record<string, 1 | -1>;   // 排序配置
    limit?: number;                  // 限制返回数量
    skip?: number;                   // 跳过数量
    batchSize?: number;              // 每批次大小（默认 1000）
    maxTimeMS?: number;              // 查询超时时间（毫秒）
    hint?: any;                      // 索引提示
    collation?: any;                 // 排序规则
    noCursorTimeout?: boolean;       // 禁用游标超时（默认 false）
}

/**
 * Explain 选项（查询执行计划诊断）
 */
export interface ExplainOptions {
    projection?: object;             // 字段投影
    sort?: Record<string, 1 | -1>;   // 排序配置
    limit?: number;                  // 限制返回数量
    skip?: number;                   // 跳过数量
    maxTimeMS?: number;              // 查询超时时间（毫秒）
    hint?: any;                      // 索引提示
    collation?: any;                 // 排序规则
    verbosity?: 'queryPlanner' | 'executionStats' | 'allPlansExecution'; // 详细程度（默认 'queryPlanner'）
}

/**
 * Explain 执行计划结果
 */
export interface ExplainResult {
    queryPlanner: {
        plannerVersion: number;
        namespace: string;
        indexFilterSet: boolean;
        parsedQuery?: any;
        winningPlan: any;
        rejectedPlans: any[];
    };
    executionStats?: {
        executionSuccess: boolean;
        nReturned: number;
        executionTimeMillis: number;
        totalKeysExamined: number;
        totalDocsExamined: number;
        executionStages: any;
        allPlansExecution?: any[];
    };
    serverInfo?: {
        host: string;
        port: number;
        version: string;
        gitVersion: string;
    };
    ok: number;
}

