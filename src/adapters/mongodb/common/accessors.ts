/**
 * MongoDB 适配器公共访问器桶形导出。
 *
 * 将 collection-accessor（MongoCollectionAccessor）与 db-accessor（MongoDbAccessor）
 * 统一从同一入口导出，供上层能力层与运行时装配使用。
 */
export { MongoCollectionAccessor } from './collection-accessor';
export { MongoDbAccessor } from './db-accessor';
