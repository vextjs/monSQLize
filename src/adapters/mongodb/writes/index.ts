/**
 * MongoDB write adapter layer.
 *
 * Description:
 * - Implements insertOne / insertMany / insertBatch / updateOne / updateMany / updateBatch /
 *   deleteOne / deleteMany / deleteBatch / replaceOne / findOneAnd* / upsertOne / incrementOne.
 * - Preserves the native MongoDB return structure; batch operations support batchSize / ordered options.
 */

export type {
    BatchErrorRecord,
    BatchWriteOptions,
    DeleteBatchResult,
    IncrementOneOptions,
    InsertBatchResult,
    UpdateBatchOptions,
    UpdateBatchResult,
} from '../../../../types/collection';

export { createIncrementUpdate, splitIntoBatches } from './write-utils';
export {
    deleteManyDocuments,
    deleteOneDocument,
    findOneAndDeleteDocument,
    findOneAndReplaceDocument,
    findOneAndUpdateDocument,
    incrementOneDocument,
    insertManyDocuments,
    insertOneDocument,
    replaceOneDocument,
    updateManyDocuments,
    updateOneDocument,
    upsertOneDocument,
} from './write-basic';
export type { IncrementOneResult } from './write-basic';
export {
    deleteBatchDocuments,
    insertBatchDocuments,
    updateBatchDocuments,
} from './write-batch';
