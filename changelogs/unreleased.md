# Unreleased

## Fixed

- Clarified the `withCache()` performance validation baseline by aligning validation ledgers with the current benchmark source and documenting that v1 transaction benchmarks are not directly comparable to the v2 function-cache hot-path baseline.
- Restored Model v1 compatibility for object schema definitions, `validate:true` operation overrides, `validate()` response data, array-form `populate()`, selected collection proxy methods, query hook coverage, and public Model type declarations.
- Restored remaining v1 compatibility gaps across document-level Model `populate()`, Transaction stats, cache mutators, slow-query storage exports, Saga metadata/return contracts, FunctionCache registration, Mongo connection aliases, package metadata export, and widened public option types.
- Restored additional v1 public contract points by re-exposing `MonSQLize#scopedCollection()` pool scoping in the exported types, widening `ConnectionPoolManager#selectPool()` back to string operations, and reinstating chainable `ModelDocument#populate()` via `PopulateProxy`.
- Restored the remaining Transaction and Saga v1 contracts by mapping `Transaction#getInfo().status` back to `started`, switching `listSagas()` back to a synchronous string array, and re-establishing the v1 `SagaResult` shape while keeping v2 alias fields for compatibility.
- Restored ESM advanced capability parity by aligning named exports and default `MonSQLize` statics with the CJS surface, stabilized the transaction/cache-lock unit test, and expanded release preflight to run the default `npm test` gate before pack dry-run.
