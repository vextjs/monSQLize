# Node.js 多版本测试指南

**文档版本**: 1.0  
**最后更新**: 2025-01-02

---

## 📋 目标

安装 nvm (Node Version Manager) 并使用它测试 monSQLize 在不同 Node.js 版本下的兼容性。

---

## 🔧 安装 nvm-windows

### 方式 1: 使用 Winget（推荐）

```powershell
# 以管理员身份运行 PowerShell
winget install CoreyButler.NVMforWindows
```

### 方式 2: 下载安装包

1. 访问: https://github.com/coreybutler/nvm-windows/releases
2. 下载最新的 `nvm-setup.exe`
3. 运行安装程序（需要管理员权限）
4. 按提示完成安装

### 验证安装

```powershell
# 重新打开 PowerShell
nvm version

# 应该显示类似输出：
# 1.2.2
```

---

## 🚀 使用 nvm 管理 Node.js 版本

### 1. 查看可用版本

```powershell
# 查看远程可用版本
nvm list available

# 输出示例：
#   LTS
#   20.19.4    (Latest LTS: Iron)
#   18.20.5    (Latest LTS: Hydrogen)
#   ...
```

### 2. 安装 Node.js 版本

```powershell
# 安装 Node.js 14.x (最低支持版本)
nvm install 14.21.3

# 安装 Node.js 16.x
nvm install 16.20.2

# 安装 Node.js 18.x (LTS)
nvm install 18.20.5

# 安装 Node.js 20.x (LTS, 推荐)
nvm install 20.19.4

# 安装 Node.js 22.x (最新)
nvm install 22.12.0
```

### 3. 切换 Node.js 版本

```powershell
# 查看已安装版本
nvm list

# 切换到 Node.js 20.x
nvm use 20.19.4

# 验证当前版本
node -v
# 输出: v20.19.4
```

### 4. 设置默认版本

```powershell
# 设置默认使用 Node.js 20.x
nvm alias default 20.19.4
```

---

## 🧪 运行 Node.js 多版本测试

### 自动化测试脚本

monSQLize 已提供自动化测试脚本：

```powershell
# 切换到项目目录
cd D:\OneDrive\Project\MySelf\monSQLize

# 运行 Node.js 多版本测试
npm run test:compatibility:node
```

### 脚本功能

`scripts/test-node-versions.js` 会自动：

1. 检测已安装的 Node.js 版本
2. 依次切换到每个版本
3. 运行完整测试套件
4. 记录测试结果
5. 生成兼容性报告

---

## 📊 手动测试步骤

如果自动化脚本有问题，可以手动测试：

### 1. 测试 Node.js 14.x

```powershell
# 切换版本
nvm use 14.21.3

# 确认版本
node -v  # 应该显示 v14.21.3

# 清理依赖
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json

# 重新安装依赖
npm install

# 运行测试
npm test

# 记录结果
echo "Node.js 14.21.3: 测试通过/失败" >> test-results.txt
```

### 2. 测试 Node.js 16.x

```powershell
# 切换版本
nvm use 16.20.2

# 重新安装依赖（重要！）
Remove-Item -Recurse -Force node_modules
npm install

# 运行测试
npm test
```

### 3. 测试 Node.js 18.x (LTS)

```powershell
nvm use 18.20.5
Remove-Item -Recurse -Force node_modules
npm install
npm test
```

### 4. 测试 Node.js 20.x (LTS, 推荐)

```powershell
nvm use 20.19.4
Remove-Item -Recurse -Force node_modules
npm install
npm test
```

### 5. 测试 Node.js 22.x (最新)

```powershell
nvm use 22.12.0
Remove-Item -Recurse -Force node_modules
npm install
npm test
```

---

## 📋 测试清单

### 准备阶段

- [ ] 安装 nvm-windows
- [ ] 安装 Node.js 14.x
- [ ] 安装 Node.js 16.x
- [ ] 安装 Node.js 18.x
- [ ] 安装 Node.js 20.x
- [ ] 安装 Node.js 22.x

### 测试阶段

- [ ] 测试 Node.js 14.x
- [ ] 测试 Node.js 16.x
- [ ] 测试 Node.js 18.x
- [ ] 测试 Node.js 20.x
- [ ] 测试 Node.js 22.x

### 完成阶段

- [ ] 生成兼容性报告
- [ ] 更新文档
- [ ] 提交测试结果

---

## 🎯 预期测试结果

### 兼容性预期

| Node.js 版本 | 预期结果 | 说明 |
|-------------|---------|------|
| 14.x | ✅ 通过 | 最低支持版本 |
| 16.x | ✅ 通过 | LTS 版本 |
| 18.x | ✅ 通过 | 当前 LTS，推荐 |
| 20.x | ✅ 通过 | 最新 LTS，推荐 |
| 22.x | ✅ 通过 | 最新版本 |

### 测试覆盖

每个版本都会运行：
- ✅ 30 个测试套件
- ✅ 102 个测试用例
- ✅ 连接、CRUD、索引、事务、缓存等所有功能

---

## ⚠️ 注意事项

### 1. 清理依赖

**重要**：切换 Node.js 版本后必须重新安装依赖！

```powershell
# 错误做法 ❌
nvm use 16.20.2
npm test  # 可能使用旧版本编译的模块

# 正确做法 ✅
nvm use 16.20.2
Remove-Item -Recurse -Force node_modules
npm install
npm test
```

### 2. 原生模块重编译

某些原生模块（如 `bson`）需要重编译：

```powershell
# 如果测试失败，尝试重建原生模块
npm rebuild
```

### 3. MongoDB Memory Server

首次运行可能需要下载 MongoDB Memory Server 二进制文件：
- 耗时：约 1-3 分钟
- 大小：约 50-100 MB
- 位置：`~/.cache/mongodb-memory-server/`

---

## 📊 报告生成

### 自动生成报告

```powershell
# 运行测试并生成报告
npm run test:compatibility:node

# 报告位置
reports/monSQLize/node-compatibility-{timestamp}.json
```

### 报告格式

```json
{
  "timestamp": "2025-01-02T...",
  "results": [
    {
      "version": "14.21.3",
      "success": true,
      "duration": 85000,
      "testsPassed": 102,
      "testsFailed": 0
    },
    {
      "version": "16.20.2",
      "success": true,
      "duration": 83000,
      "testsPassed": 102,
      "testsFailed": 0
    }
  ],
  "summary": {
    "total": 5,
    "passed": 5,
    "failed": 0,
    "passRate": "100.00%"
  }
}
```

---

## 🎉 完成后

### 1. 恢复到推荐版本

```powershell
# 切换回 Node.js 20.x (推荐)
nvm use 20.19.4

# 重新安装依赖
Remove-Item -Recurse -Force node_modules
npm install
```

### 2. 更新兼容性文档

如果发现兼容性问题，更新文档：
- `docs/COMPATIBILITY.md`
- `README.md`

### 3. 提交测试结果

将测试报告提交到仓库：
```bash
git add reports/monSQLize/node-compatibility-*.json
git commit -m "test: Node.js 多版本兼容性测试"
```

---

## 🚨 故障排除

### 问题 1: nvm 命令未找到

**原因**: 环境变量未生效

**解决**:
```powershell
# 重新打开 PowerShell
# 或手动添加到 PATH
$env:PATH += ";C:\Users\{YourName}\AppData\Roaming\nvm"
```

### 问题 2: 切换版本后 node 命令无效

**原因**: 需要管理员权限

**解决**:
```powershell
# 以管理员身份运行 PowerShell
nvm use 20.19.4
```

### 问题 3: 原生模块错误

**错误**:
```
Error: The module was compiled against a different Node.js version
```

**解决**:
```powershell
# 重建原生模块
npm rebuild

# 或重新安装依赖
Remove-Item -Recurse -Force node_modules
npm install
```

### 问题 4: mongodb-memory-server 下载失败

**原因**: 网络问题或防火墙

**解决**:
```powershell
# 方法 1: 使用代理
$env:HTTP_PROXY = "http://proxy.example.com:8080"
npm test

# 方法 2: 手动下载并放到缓存目录
# 下载: https://fastdl.mongodb.org/...
# 放到: ~/.cache/mongodb-memory-server/
```

---

## 📚 相关文档

- 📖 [nvm-windows GitHub](https://github.com/coreybutler/nvm-windows)
- 📖 [Node.js 版本列表](https://nodejs.org/en/about/releases/)
- 📖 [monSQLize 兼容性矩阵](./COMPATIBILITY.md)

---

## 💡 最佳实践

### 开发环境

- 使用 Node.js 20.x (最新 LTS)
- 定期测试多版本兼容性
- 使用 `.nvmrc` 文件固定版本

### CI/CD

- 在 GitHub Actions 中测试多版本
- 使用矩阵策略并行测试
- 自动生成兼容性报告

---

**下一步**: 完成 nvm 安装后，运行 `npm run test:compatibility:node` 开始测试！

