# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning (SemVer).

## [Unreleased]
### Added
- Multi-level caching (local + remote) via `MultiLevelCache` with graceful degradation when remote is unavailable.
- Cache configuration: support `cache.multiLevel=true` to automatically compose local memory cache with an optional remote CacheLike instance.
- Documentation updates in README: usage of multi-level cache, injection priority rules (instance first, config later), FAQ, and examples.
- TypeScript declarations enhanced:
  - `MemoryCacheOptions`, `WritePolicy`/`MultiLevelCachePolicy`, `MultiLevelCacheOptions` types.
  - `BaseOptions.cache` is now a union: `CacheLike | MemoryCacheOptions | MultiLevelCacheOptions | object`.

### Changed
- STATUS updated: "Multi-level cache (local+remote)" marked as implemented with notes on behavior and degradation.

### Notes
- Recommended release type: minor (x.y.z -> x.(y+1).0), since new features are backward compatible and opt-in.

[Unreleased]: ./
