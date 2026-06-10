# Roadmap boundary description

## Currently explicitly supported

monSQLize is currently a **MongoDB enhancement layer**, including:

- MongoDB query extension
- Cache / Function Cache
- Model
- Transaction / Lock / Saga
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

- It can be said that "the long-term vision is a unified query syntax".
- It must also be clear that "**The current official support scope is only MongoDB**".
- When adding new documents or examples, roadmap capabilities must not be written as currently available capabilities.
