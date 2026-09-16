# Kairai Scaffold

一个开箱即用的 **VS Code 扩展脚手架**：内置命令、Webview 面板、可插拔的侧栏（WebviewView）框架、配置项与状态栏示例，附带完整的类型检查 / 测试 / 打包 / 发布链路。

- 📖 [脚手架原理](docs/ARCHITECTURE.md) — 扩展运行模型、清单文件、Webview、侧栏框架、构建原理
- 🚀 [编译与发布流程](docs/BUILD_PUBLISH.md) — 本地调试、测试、vsce 打包、Marketplace 发布与 CI/CD

## 功能演示

| 示例 | 入口 | 演示的知识点 |
| --- | --- | --- |
| `kairai.helloWorld` | 命令面板 / 状态栏点击 | 命令注册、配置读取、`executeCommand` 联动 |
| `kairai.openPanel` | 命令面板 / 编辑器标题栏图标 | Webview 创建、CSP 注入、双向消息通信 |
| **Kairai 侧栏** | 活动栏（最左侧）的 ✦ 图标 | `WebviewView`、活动栏容器、可插拔功能框架、状态持久化 |
| `kairai.openSidebar` / `kairai.switchFeature` | 命令面板 / 侧栏标题栏图标 | 聚焦视图、按注册表生成功能选择列表 |
| `kairai.greeting` 配置项 | 设置 → 扩展 → Kairai | 配置贡献、`onDidChangeConfiguration` 监听 |
| 状态栏问候语 | 窗口右下角 | `StatusBarItem` 与配置实时联动 |

### 侧栏框架

侧栏是「一个容器 + 多个可插拔功能」的框架，功能之间互不感知，顶部切换栏由注册表自动生成：

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| 概览 | ✅ 已实现 | 框架说明 + 一次「界面 → 宿主 → 界面」往返自检 |
| Agent Harness | 🚧 占位骨架 | 已预留会话循环、工具调用、流式输出、中断的接入点 |
| 井字棋 | 🚧 占位骨架 | 已预留棋盘状态、落子校验、AI 走子的接入点 |

新增功能只需四步（详见 [第 7.6 节](docs/ARCHITECTURE.md#76-新增一个侧栏功能)）：在 `src/shared/sidebar.ts` 登记 ID → 写宿主侧 `src/sidebar/features/xxx.ts` → 写 Webview 侧 `src/webview/media/sidebar/views/xxx.ts` → 在两处清单里注册；漏注册会直接编译报错。

## 快速开始

```bash
npm install     # 安装依赖
```

在 VS Code 中打开本项目，按 **F5** 启动「扩展开发宿主」（Extension Development Host）：
1. 自动执行 watch 任务（esbuild 打包 + tsc 类型检查并行监听）；
2. 打开一个新的 VS Code 窗口，其中加载了本扩展；
3. 在新窗口按 `Cmd/Ctrl+Shift+P` 输入 `Kairai` 即可看到全部示例命令；点左侧活动栏的 ✦ 图标（Kairai）可打开侧栏。

修改代码后回到扩展宿主窗口，按 `Cmd/Ctrl+R` 重载即可看到效果。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run watch` | 开发监听：esbuild 打包 + 类型检查 |
| `npm run check-types` | TypeScript 类型检查（不产出文件） |
| `npm run lint` | ESLint 检查 |
| `npm run compile` | 完整校验并构建开发包到 `dist/` |
| `npm test` | 在干净的 VS Code 实例中运行扩展测试 |
| `npm run package` | 生产构建（压缩、无 sourcemap） |
| `npm run package:vsix` | 打包出 `.vsix` 安装包 |
| `npm run publish:marketplace` | 发布到 Visual Studio Marketplace |

## 目录结构

```
.
├── .github/workflows/        # CI（三平台测试 + 打包）与发布工作流
├── .vscode/                  # F5 调试配置、watch 任务、推荐扩展
├── docs/                     # 原理与发布流程文档
├── media/                    # Webview 静态模板（HTML/CSS/图标，随扩展发布）
├── src/
│   ├── commands/             # 示例命令（helloWorld / openPanel / sidebar）
│   ├── shared/               # 扩展 ↔ Webview 共享契约（面板、侧栏各一份）
│   ├── sidebar/              # 侧栏框架：provider / registry / features（宿主侧逻辑）
│   ├── webview/
│   │   ├── html.ts           # CSP + nonce + 模板注入（面板与侧栏共用）
│   │   ├── panel.ts          # Webview 面板：CSP、资源加载、消息通信
│   │   └── media/            # Webview 侧脚本（面板 main.ts / 侧栏 sidebar/）
│   ├── statusBar.ts          # 状态栏示例
│   ├── extension.ts          # 入口：activate / deactivate
│   └── test/                 # 扩展集成测试（运行于真实 VS Code 中）
├── esbuild.js                # 打包脚本（扩展宿主 + 两个 Webview，共三产物）
├── .vscode-test.mjs          # @vscode/test-cli 测试配置
├── .vscodeignore             # .vsix 打包排除清单
├── package.json              # 扩展清单：contributions、脚本、依赖
├── tsconfig.json             # 扩展侧类型检查（产出由 esbuild 负责）
└── tsconfig.webview.json     # Webview 侧类型检查（含 DOM lib）
```

## 基于脚手架开发新扩展

1. 全局替换扩展标识：`package.json` 中的 `name`、`publisher`、`repository`，以及命令前缀 `kairai.*`、配置前缀 `kairai.*`、视图/容器 ID `kairai`，还有测试中的 `EXTENSION_ID`；
2. 在 `src/commands/` 下添加自己的命令，并在 `package.json` 的 `contributes.commands` 中登记；
3. 需要界面时参考 `src/webview/panel.ts` 与 `media/`；常驻型界面（或个人练习场这类多页面工具）用侧栏功能框架，照 [第 7.6 节](docs/ARCHITECTURE.md#76-新增一个侧栏功能) 的步骤加功能即可；
4. 在 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 查阅每个文件的职责与扩展机制。

## License

[MIT](LICENSE)
