# 发布前检查说明

## 命令

```bash
npm run release:preflight
```

也可以通过 GitHub Actions 手动触发 **Release Preflight** workflow；推送 `v*` tag 时也会自动执行同一套门禁。

## 它会做什么

1. 检查 `package-lock.json` 是否与当前 `package.json` 版本一致，且不包含 `file:` / `workspace:` / sibling 本地路径残留。
2. 检查当前 `package.json` 版本对应的 changelog 文件是否存在。
3. 检查工程治理必需文档是否存在：
   - `docs/support-matrix.md`
   - `docs/file-dependency-governance.md`
   - `docs/verification-entrypoints.md`
4. 运行 `npm run verify:fast`
5. 运行 `npm test`
6. 运行 `npm pack --dry-run`
7. 原始 `npm publish` 仍会通过 `prepublishOnly` 触发同一套 `release:preflight`，防止绕过门禁
8. 仓库发布 workflow 和 `npm run release:publish` 会先显式执行 `release:preflight`，再用 `npm publish --ignore-scripts` 发布，避免在发布动作内重复执行完整门禁
9. **不会**运行 `npm run verify:release`（后者依赖私有真实环境，属于操作者显式 opt-in 的补充复核）

## 为什么不是直接 publish

这个脚本的目标是把**版本信息、公开验证链、依赖发布边界、打包可消费性**先收口，再进入人工确认的 release / tag / publish 阶段。

## 推荐顺序

```bash
npm run release:preflight
# 如需补充私有实机复核，再显式执行：
# npm run verify:release
git status
# tag / publish 需要人工确认，不由 preflight 自动执行
git tag vX.Y.Z
npm run release:publish
```

> 若走仓库自动化路径，可先手动运行 GitHub Actions 的 `Release Preflight`，确认通过后再推送 `v*` tag 或手动运行 `Publish to npm` workflow。真实 publish step 已跳过重复 lifecycle scripts，因为同一 job 前置步骤已经完成 `release:preflight`。
