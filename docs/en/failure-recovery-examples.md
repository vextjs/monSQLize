# Example of failure and recovery paths

> This set of examples specifically covers common recovery scenarios "outside the success path" to prevent users from seeing only the happy path.

## Sample summary table

| Scenario | Example | Focus |
|------|------|--------|
| Transaction rollback | `examples/docs/transaction-rollback.ts` | After an error occurs during the transaction, the data should remain in the stable state after the rollback |
| Sync target failure recovery | `examples/docs/sync-target-failure.ts` | `errorCount`, `syncedCount`, target stats should accurately reflect failure and recovery |
| Lock competition/timeout | `examples/docs/lock-timeout.ts` | `tryAcquireLock()` null return, `acquireLock()` timeout error, recovery after release |
| Pool fallback / recovery | `examples/docs/pool-fallback.ts` | The analytics pool automatically falls back to the primary after downgrading, and then takes over the read traffic again after recovery |

## How to execute

```bash
npm run test:examples
```

Or execute alone:

```bash
node .generated/examples-dist/examples/docs/transaction-rollback.js
node .generated/examples-dist/examples/docs/sync-target-failure.js
node .generated/examples-dist/examples/docs/lock-timeout.js
node .generated/examples-dist/examples/docs/pool-fallback.js
```

## Design principles

- **Default closed-loop priority**: All examples use the local memory environment or fake client and can be run directly.
- **Recovery signals are observable**: The log output must clearly show the failure point, recovery point, and post-recovery status.
- **Aligned with the formal verification chain**: These examples are also classified as `npm run test:examples` and are not presentations that can only be written but not run.
