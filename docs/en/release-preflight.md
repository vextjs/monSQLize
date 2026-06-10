# Check instructions before publishing

## Command

```bash
npm run release:preflight
```

You can also manually trigger the **Release Preflight** workflow through GitHub Actions; the same set of access control will also be automatically executed when the `v*` tag is pushed.

## What will it do

1. Check whether `package-lock.json` is consistent with the current `package.json` version and does not contain `file:` / `workspace:` / sibling local path residue.
2. Check whether the changelog file corresponding to the current `package.json` version exists.
3. Check whether the necessary documents for project management exist:
   - `docs/support-matrix.md`
   - `docs/file-dependency-governance.md`
   - `docs/verification-entrypoints.md`
4. Run `npm run verify:fast`
5. Run `npm test`
6. Run `npm pack --dry-run`
7. The original `npm publish` will still trigger the same set of `release:preflight` through `prepublishOnly` to prevent bypassing the access control
8. The warehouse publishing workflow and `npm run release:publish` will first explicitly execute `release:preflight`, and then use `npm publish --ignore-scripts` to publish to avoid repeated execution of complete access control within the publishing action.
9. **Will not** run `npm run verify:release` (the latter relies on a private real environment and is a supplementary review of the operator's explicit opt-in)

## Why not publish directly?

The goal of this script is to close the version information, public verification chain, dependency release boundary, and package consumability first, and then enter the release/tag/publish stage of manual confirmation.

## Recommended order

```bash
npm run release:preflight
# If you need to supplement the private real machine review, execute it explicitly:
# npm run verify:release
git status
# tag/publish requires manual confirmation and is not automatically executed by preflight
git tag vX.Y.Z
npm run release:publish
```

> If you take the warehouse automation path, you can manually run `Release Preflight` of GitHub Actions first, and then push the `v*` tag or manually run the `Publish to npm` workflow after confirming that it is passed. The real publish step has skipped duplicate lifecycle scripts because the same job predecessor step has already completed `release:preflight`.
