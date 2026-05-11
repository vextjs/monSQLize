/**
 * P2-A MongoDB 连接适配。
 *
 * 说明：
 * - 当前阶段只恢复 connect/close 与最小默认 db 句柄。
 * - Memory Server 由测试 bootstrap 管理；运行时仅接收外部提供的 URI。
 */

import { MongoClient } from 'mongodb';

import { createConnectionError, createError, ErrorCodes, type MonSQLizeError } from '../../../core/errors';
import type { Logger } from '../../../core/logger';
import type { MongoConnectConfig, MongoConnectionState } from '../../../../types/mongodb';

export type { MongoConnectConfig, MongoConnectionState } from '../../../../types/mongodb';

/**
 * 建立 MongoDB 连接。
 * @since v1.3.0
 */
export async function connectMongo(params: {
    databaseName: string;
    config?: MongoConnectConfig;
    logger?: Logger;
}): Promise<MongoConnectionState> {
    const databaseName = params.databaseName?.trim();
    if (!databaseName) {
        throw createError(ErrorCodes.INVALID_DATABASE_NAME, 'Database name must be a non-empty string.');
    }

    const uri = params.config?.uri?.trim();
    if (!uri) {
        throw createError(ErrorCodes.INVALID_CONFIG, 'MongoDB connect requires config.uri.');
    }

    const client = new MongoClient(uri, params.config?.options);

    try {
        await client.connect();
        const db = client.db(databaseName);
        params.logger?.info?.('MongoDB connected', { databaseName });
        return { client, db };
    } catch (cause) {
        try {
            await client.close();
        } catch {
            // ignore close failure after connect error
        }
        throw createConnectionError(
            `Failed to connect to MongoDB database: ${databaseName}`,
            cause instanceof Error ? cause : undefined,
        );
    }
}

/**
 * 关闭 MongoDB 连接。
 * @since v1.3.0
 */
export async function closeMongo(client: MongoClient | null | undefined, logger?: Logger): Promise<void> {
    if (!client) {
        return;
    }

    try {
        await client.close();
        logger?.info?.('MongoDB connection closed');
    } catch (cause) {
        const error = createError(
            ErrorCodes.CONNECTION_CLOSED,
            'Failed to close MongoDB connection cleanly.',
            undefined,
            cause instanceof Error ? cause : undefined,
        ) as MonSQLizeError;
        logger?.warn?.(error.message, error.cause);
    }
}

