/**
 * Runtime helper function thin barrel.
 *
 * After splitting the implementations into three focused modules
 * (runtime-defaults / runtime-db-facade / runtime-model), this file
 * maintains a unified export so consumers are unaffected.
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
