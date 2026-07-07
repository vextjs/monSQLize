# Roadmap boundary description

## Product positioning

monSQLize is a **database-native production data runtime layer for TypeScript services**.

The current stable adapter is MongoDB. MySQL and PostgreSQL are planned as future database-native adapters under the same runtime contract. The shared contract is the production runtime layer: cache consistency, connection lifecycle, transaction helpers, model constraints, synchronization, and observability.

## Adapter status

| Adapter | Status | Notes |
|---------|--------|-------|
| MongoDB | Stable | Current production runtime adapter |
| MySQL | Planned / in development | Not part of the current npm runtime yet |
| PostgreSQL | Planned / in development | Not part of the current npm runtime yet |

## Currently explicitly supported

The current MongoDB adapter includes:

- MongoDB query extension
- Database query cache
- Model
- Transaction
- Pool / Sync / Slow Query Log

## Currently explicitly not supported

The following is still a roadmap and is not part of the current version delivery commitment:

- MySQL runtime support
- PostgreSQL runtime support
- Production-ready implementation of "one query syntax that automatically adapts to all databases"

## Why should we write clearly?

The long-term vision is preserved in the README, but the actual delivery must be consistent with the currently validated assets. Otherwise users will mistakenly think:

1. The current npm package already supports non-MongoDB databases;
2. Just change the configuration to seamlessly switch to the underlying SQL database.

## External expression rules

- It can be said that "MySQL and PostgreSQL are planned as database-native runtime adapters".
- It must also be clear that "**The current official support scope is only MongoDB**".
- When adding new documents or examples, roadmap capabilities must not be written as currently available capabilities.
- Avoid promising that SQL adapters will behave as transparent MongoDB dialects. SQL query, transaction, prepared-statement, and connection semantics must remain explicit when those adapters are introduced.
