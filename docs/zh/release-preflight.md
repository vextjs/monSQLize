# 发布前检查与故障恢复

## 命令

```bash
npm run release:preflight
```

也可以通过 GitHub Actions 手动触发 **Release Preflight** workflow。`v*` tag 与 npm 发布 workflow 必须经过同一门禁。preflight 不会创建 tag、发布 npm 包或部署文档。

## 它会做什么

1. 检查 `package-lock.json` 是否与当前 `package.json` 版本一致，且不包含 `file:` / `workspace:` / sibling 本地路径残留。
2. 检查当前 `package.json` 版本对应的 changelog 文件是否存在。
3. 检查工程治理必需文档是否存在：
   - `docs/en/support-matrix.md`
   - `docs/en/file-dependency-governance.md`
   - `docs/en/verification-entrypoints.md`
   - `docs/zh/support-matrix.md`
   - `docs/zh/file-dependency-governance.md`
   - `docs/zh/verification-entrypoints.md`
4. 执行快速静态/运行时门禁和完整公开验证链。
5. 强制执行源码 coverage、可运行示例、MongoDB server matrix、真实 dataTasks integration、CLI matrix 与 package-install smoke。
6. 执行 `npm pack --dry-run` 并核对打包边界。
7. `prepublishOnly` 与仓库发布路径共用同一个 `release:preflight` 真相源，直接 publish 也不能绕过门禁。
8. `verify:release` 仍是显式执行的私有真实环境补充检查，不能代替公开门禁。

## 为什么不是直接 publish

这个脚本的目标是把**版本信息、公开验证链、依赖发布边界、打包可消费性**先收口，再进入人工确认的 release / tag / publish 阶段。

## 推荐顺序

```bash
npm run release:preflight
# 可选的私有真实环境复核：
# npm run verify:release
git status
VERSION=$(node -p "require('./package.json').version")
git tag "v${VERSION}"
git push origin "v${VERSION}"
```

tag 会启动仓库 preflight 与 publish workflow，此时不要部署 Pages。registry 验收通过后，手动运行 **Deploy Docs to GitHub Pages**，传入 `release_tag=vX.Y.Z`；该 workflow 会检出指定 tag，并在 tag、`package.json` 与 npm registry 版本不一致时拒绝部署。

如果 tag 触发的 publish 因认证或 registry 可用性等可恢复原因失败，可以用同一个已存在的 `release_tag` 手动重跑 publish workflow。workflow 会检出并校验该 tag 的 commit，不能把默认分支上的未打 tag 提交直接发布。

## 发布后验收

创建或确认 GitHub Release 前，对准确版本执行：

```bash
VERSION=$(node -p "require('./package.json').version")
npm view "monsqlize@${VERSION}" version dist.integrity dist.tarball --registry=https://registry.npmjs.org/
npm view monsqlize dist-tags --json --registry=https://registry.npmjs.org/

TEMP_DIR=$(mktemp -d)
npm --prefix "${TEMP_DIR}" init -y
npm --prefix "${TEMP_DIR}" install "monsqlize@${VERSION}" --registry=https://registry.npmjs.org/
node -e "const M=require('${TEMP_DIR}/node_modules/monsqlize'); if (!M) process.exit(1)"
node --input-type=module -e "import M from '${TEMP_DIR}/node_modules/monsqlize/dist/esm/index.mjs'; if (!M) process.exit(1)"
"${TEMP_DIR}/node_modules/.bin/monsqlize" --version
```

验收要求：目标版本、integrity 与 tarball 元数据存在；`latest` 指向预期稳定版；CJS、ESM 与 CLI 均可加载；Git tag 指向发布提交；GitHub Release 与 Pages 也引用同一个 tag。

## 半发布故障恢复

任何修正前先记录 `VERSION`、上一稳定版、发布提交与 registry 证据：

```bash
VERSION=$(node -p "require('./package.json').version")
PREVIOUS_STABLE=2.0.6
RELEASE_COMMIT=$(git rev-parse HEAD)
npm view "monsqlize@${VERSION}" version dist.integrity --json --registry=https://registry.npmjs.org/ || true
npm view monsqlize dist-tags --json --registry=https://registry.npmjs.org/
git ls-remote --tags origin "refs/tags/v${VERSION}"
```

- **tag 已存在、npm 版本不存在：** 保持不可变 tag 指向已复核提交，修复认证或 workflow 后重跑 preflight，再对同一 tag 重跑 publish；不要部署文档。
- **npm 版本已存在、tag 或 GitHub Release 缺失：** 先核对 registry integrity，再在 `RELEASE_COMMIT` 创建并推送 `v${VERSION}`，GitHub Release 必须基于该 tag。不得移动消费者可能已经获取的 tag。
- **缺陷版本已经成为 `latest`：** 先把 `latest` 恢复到上一稳定版；保留缺陷版本供审计并标记 deprecated；发布新的修正版后再前移 `latest`。

```bash
npm dist-tag add "monsqlize@${PREVIOUS_STABLE}" latest
npm dist-tag add "monsqlize@${VERSION}" next
npm deprecate "monsqlize@${VERSION}" "已被取代；修正版发布前请使用 ${PREVIOUS_STABLE}"
```

- **Pages 与 npm 不一致：** 用最后一个通过 npm 校验的稳定 tag 运行 Pages workflow；未发布或版本不一致会被 workflow 拒绝。
- **registry integrity 与复核包不一致：** 立即停止。npm 版本不可覆盖；不得重新指向 tag 或在同一版本上重发，应保留证据并调查后发布新版本。
