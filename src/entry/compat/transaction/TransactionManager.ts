/**
 * TransactionManager CJS 兼容再导出。
 *
 * 以 module.exports = TransactionManager 形式提供 v1 风格的 require() 入口，
 * 保持对旧版消费者的向后兼容性。
 */
import { TransactionManager } from '../../../capabilities/transaction';

export = TransactionManager;
