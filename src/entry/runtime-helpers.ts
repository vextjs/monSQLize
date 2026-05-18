/**
 * 运行时辅助函数集合桶（thin barrel）。
 *
 * 将实现拆分到 runtime-defaults / runtime-db-facade / runtime-model
 * 三个专注模块后，此文件对外保持统一导出，消费者无感知。
 */
export { buildPublicDefaults } from './runtime-defaults';
export {
    createRuntimeDbFacade,
    createRuntimeAccessors,
    resolveDatabaseName,
    type RuntimeDbFacadeHost,
} from './runtime-db-facade';
export {
    createRuntimeModelHost,
    createRuntimeModelInstance,
    type RuntimeModelHost,
} from './runtime-model';
