// Thin barrel — implementation split into focused modules.
// Consumers that import from this file continue to work unchanged.
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
