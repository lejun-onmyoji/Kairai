# 编译与发布流程

本文说明脚手架从**本地开发**到**上架 Marketplace** 的完整流程。原理讲解见 [脚手架原理](ARCHITECTURE.md)。

---

## 1. 流程总览

```
源码 src/ + 资源 media/
        │
        ├──► 类型检查 tsc --noEmit ──► 失败则终止
        ├──► 代码规范 eslint ────────► 失败则终止
        ├──► 集成测试 vscode-test ──► 在真实 VS Code 实例中运行
        │
        ▼
esbuild 打包（生产模式：压缩、去 sourcemap，双产物）
        │
        ▼
dist/extension.js（扩展宿主）+ dist/media/main.js（Webview）
        │
        ▼
vsce package ──► .vscodeignore 过滤 ──► kairai-scaffold-0.0.1.vsix
        │
        ├──► 本地安装验证：code --install-extension xxx.vsix
        │
        ▼
vsce publish ──► Visual Studio Marketplace（审核后上架）
```

每个环节对应 `package.json` 中的一个 npm script，可以单独执行。

---

## 2. 环境准备

- Node.js ≥ 20（脚手架开发依赖基于 Node 20 声明）；
- VS Code ≥ 1.96（`engines.vscode` 声明的最低版本）；
- `npm install` 安装全部开发依赖（`@vscode/vsce`、`esbuild`、`@vscode/test-cli` 等）。

---

## 3. 本地开发与调试

### 3.1 F5 一键调试

用 VS Code 打开项目根目录，按 **F5**：

1. `preLaunchTask` 启动默认构建任务 `npm run watch`：
   - `watch:esbuild`：esbuild 监听模式，同时重建 `dist/extension.js`（扩展宿主）与 `dist/media/main.js`（Webview）；
   - `watch:tsc` / `watch:tsc:webview`：扩展侧与 Webview 侧各自持续类型检查。
2. VS Code 启动 **Extension Development Host**——一个加载了本扩展的全新窗口（`--extensionDevelopmentPath` 指向项目目录）；
3. 在新窗口里 `Cmd/Ctrl+Shift+P` → 输入 `Kairai`，即可执行示例命令、打开面板。

### 3.2 日常开发循环

```
修改 src/ → watch 自动重建 → 切回开发宿主窗口 → Cmd/Ctrl+R 重载 → 看效果
```

调试技巧：

- 断点直接打在 `src/*.ts` 上（sourcemap 已把 `dist/extension.js` 映射回源码）；
- 扩展宿主的 `console.log` 输出在「调试控制台」面板（[extension.ts](../src/extension.ts) 激活时打印一行日志）；
- Webview 内需要按 `Cmd/Ctrl+Shift+I` 打开 Webview 自带的开发者工具（区别于宿主窗口的 DevTools）。

---

## 4. 质量校验：类型、规范、测试

```bash
npm run check-types   # 类型检查（无产出，纯校验）
npm run lint          # ESLint
npm test              # 集成测试
```

### 4.1 集成测试原理（vscode-test）

VS Code 扩展 API 无法脱离 VS Code 运行，所以测试必须跑在真实的 VS Code 里：

1. `pretest` 钩子自动执行：`compile-tests`（tsc 把测试编译到 `out/`）+ `compile`（esbuild 产出 `dist/`）+ `lint`；
2. `vscode-test` 根据 [.vscode-test.mjs](../.vscode-test.mjs) 下载一份**干净的 VS Code**（首次约 100+ MB，缓存在 `.vscode-test/`）；
3. 以 `--extensionDevelopmentPath` 模式启动它，运行 `out/test/**/*.test.js`；
4. 测试里通过 `vscode.extensions.getExtension('kairai.kairai-scaffold').activate()` 激活扩展，断言命令已注册（[extension.test.ts](../src/test/extension.test.ts)）。

也可以不经过下载，直接用已安装的 VS Code 跑测试：`.vscode/launch.json` 中的「运行扩展测试」配置。

### 4.2 常见问题

| 现象 | 处理 |
| --- | --- |
| 测试提示找不到扩展 | `package.json` 的 `publisher`/`name` 与测试中的 `EXTENSION_ID` 不一致 |
| 下载 VS Code 失败 | 网络问题，重试或手动放置缓存 |
| 测试通过但 UI 行为不对 | 集成测试只覆盖了 API 层，UI 交互需引入 vscode-extension-tester |

---

## 5. 编译：生产构建

```bash
npm run package    # = check-types + esbuild --production
```

与开发构建的差异（见 [esbuild.js](../esbuild.js) 顶部注释）：

| 模式 | 压缩 | sourcemap | 用途 |
| --- | --- | --- | --- |
| 开发（`node esbuild.js`） | 否 | 是 | 本地调试、断点 |
| 生产（`--production`） | 是 | 否 | 发布（体积小、不含源码） |

**关键机制：`vscode:prepublish` 钩子**。`package.json` 中：

```json
"scripts": {
  "vscode:prepublish": "npm run package"
}
```

每当执行 `vsce package` 或 `vsce publish` 时，vsce 会自动先跑这个脚本，保证打出来的包里**永远是刚构建的最新产物**，不会把旧代码发出去。这是官方脚手架的标准约定，不要删。

---

## 6. 打包：产出 .vsix

```bash
npm run package:vsix    # = vsce package
```

产物：`kairai-scaffold-0.0.1.vsix`（文件名 = `name` + 版本号）。这个文件可以：

- 直接分发给用户双击安装；
- 命令行安装：`code --install-extension kairai-scaffold-0.0.1.vsix`；
- 上传到 Marketplace（见第 7 节）。

### 6.1 .vscodeignore：包里放什么

vsce 自动排除 `node_modules/`、`.git/` 等，其余由 [.vscodeignore](../.vscodeignore) 决定。本脚手架的取舍逻辑：

| 排除 | 原因 |
| --- | --- |
| `src/`、`out/`、`**/*.ts`、`**/*.map` | 源码已打包进 `dist/`（`extension.js` 与 `media/main.js`），测试代码用户不需要 |
| `.vscode/`、`.github/`、`esbuild.js`、`eslint.config.mjs`、`tsconfig.json` 等 | 纯开发工具链 |
| `docs/`、`package-lock.json`、`.gitignore` | 与运行时无关 |

保留的只有：`dist/`（扩展入口 + Webview 脚本）、`media/`（HTML/CSS 模板）、`package.json`、`README.md`、`CHANGELOG.md`、`LICENSE`。

打包后可用 `npx vsce ls` 查看 .vsix 的实际内容清单，确认没有误收/漏收文件。

---

## 7. 发布到 Visual Studio Marketplace

### 7.1 一次性准备（首次发布）

1. **注册 Microsoft 账号**：访问 <https://marketplace.visualstudio.com/> 登录；
2. **创建发布者（Publisher）**：进入 <https://marketplace.visualstudio.com/manage> → Create Publisher，Publisher ID 必须与 `package.json` 的 `publisher` 字段一致（本脚手架占位为 `kairai`，发布前必须改）；
3. **生成 PAT（个人访问令牌）**：进入 <https://dev.azure.com/> → 任意组织 → User Settings → Personal Access Tokens → 新建，勾选 **Marketplace → Manage** 权限，期限建议 1 年以内。

### 7.2 登录与发布

```bash
npx vsce login kairai        # 输入上面的 PAT（写入本机凭据库，只需一次）
npm run publish:marketplace  # = vsce publish
```

`vsce publish` 会自动完成：`vscode:prepublish` 重新构建 → 打包 .vsix → 上传 → 提交审核。

### 7.3 版本升级（日常发布）

用语义化版本三件套，vsce 会自动递增 `package.json` 版本并打 git tag：

```bash
npx vsce publish patch    # 0.0.1 → 0.0.2，bug 修复
npx vsce publish minor    # 0.0.1 → 0.1.0，新功能（向后兼容）
npx vsce publish major    # 0.0.1 → 1.0.0，破坏性变更
```

每次发版前：

1. 更新 [CHANGELOG.md](../CHANGELOG.md)（Keep a Changelog 格式，内容会显示在商店页面）；
2. 运行完整校验 `npm test`；
3. 发布后 Marketplace 审核一般很快，但首次上架可能需人工审核数天。

### 7.4 常见失败原因

| 错误 | 处理 |
| --- | --- |
| `Missing publisher name` | `package.json` 缺 `publisher` 字段 |
| 发布者不存在 / PAT 无权限 | Publisher ID 拼写、PAT 的 Marketplace Manage 权限、token 是否过期 |
| `README.md` / `LICENSE` 缺失 | vsce 强制要求这两个文件存在于包内 |
| 版本号重复 | 手动改 `package.json` 的 `version`（每次必须大于上一次） |

### 7.5 发布到 Open VSX（可选）

[Codium 生态的 Open VSX](https://open-vsx.org/) 是另一个公共市场，工具为 `ovsx`：

```bash
npm i -D ovsx
npx ovsx create-namespace kairai   # 首次
npx ovsx publish -p <open-vsx token>
```

---

## 8. CI/CD：自动化编译发布

脚手架附带两个 GitHub Actions 工作流：

### 8.1 [ci.yml](../.github/workflows/ci.yml) —— 每次 push / PR

在 **ubuntu / macos / windows** 三平台矩阵上执行：

```
npm ci → lint → check-types → vscode-test（Linux 用 xvfb-run 提供虚拟显示）
→ vsce package → 上传 .vsix 作为构建产物（Artifact）
```

任何平台失败都会阻止合并，保证发布前代码在三端都被验证过。

### 8.2 [publish.yml](../.github/workflows/publish.yml) —— 打 tag 或手动触发

- 推 `v*` 标签（如 `v0.0.2`）自动发布，或从 Actions 页面手动触发并选择 `patch/minor/major` 自动升版本；
- 需要先在仓库 Settings → Secrets 配置 `VSCE_PAT`（即 7.1 节的 PAT）；
- 工作流内通过环境变量传递参数并对版本级别做白名单校验，避免注入风险。

---

## 9. 速查表

| 场景 | 命令 |
| --- | --- |
| 开发调试 | VS Code 里按 F5 |
| 类型检查 | `npm run check-types` |
| 代码规范 | `npm run lint` |
| 跑测试 | `npm test` |
| 生产构建 | `npm run package` |
| 本地打包 | `npm run package:vsix` |
| 安装本地包验证 | `code --install-extension *.vsix` |
| 检查包内容 | `npx vsce ls` |
| 登录 Marketplace | `npx vsce login <publisher>` |
| 发布 | `npm run publish:marketplace` |
| 升版本发布 | `npx vsce publish patch \| minor \| major` |
