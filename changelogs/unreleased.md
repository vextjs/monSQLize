# Unreleased

## Fixed

- Restored Model v1 compatibility for object schema definitions, `validate:true` operation overrides, `validate()` response data, array-form `populate()`, selected collection proxy methods, query hook coverage, and public Model type declarations.
- Restored remaining v1 compatibility gaps across document-level Model `populate()`, Transaction stats, cache mutators, slow-query storage exports, Saga metadata/return contracts, FunctionCache registration, Mongo connection aliases, package metadata export, and widened public option types.
- Restored ESM advanced capability parity by aligning named exports and default `MonSQLize` statics with the CJS surface, stabilized the transaction/cache-lock unit test, and expanded release preflight to run the default `npm test` gate before pack dry-run.
