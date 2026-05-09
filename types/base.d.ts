export type DbType = 'mongodb';

export interface ExpressionObject {
    __expr__: string;
    __compiled__: boolean;
}

export type ExpressionFunction = (expression: string) => ExpressionObject;

export interface LoggerLike {
    debug?: (...args: unknown[]) => void;
    info?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
}

export declare const enum ErrorCodes {
    NOT_CONNECTED = 'NOT_CONNECTED',
    INVALID_CONFIG = 'INVALID_CONFIG',
    INVALID_EXPRESSION = 'INVALID_EXPRESSION',
    INVALID_PAGINATION = 'INVALID_PAGINATION',
    UNSUPPORTED_DATABASE = 'UNSUPPORTED_DATABASE',
    MODEL_NOT_DEFINED = 'MODEL_NOT_DEFINED',
}

export interface MonSQLizeError extends Error {
    code: string;
    details?: unknown[];
    cause?: Error;
}

