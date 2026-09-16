# 更新日志

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- 侧栏框架（`WebviewView`）：活动栏图标 + 侧栏容器 + 可插拔功能框架
  - 宿主侧：`src/sidebar/`（provider 负责渲染/路由/生命周期，registry 管理功能清单，features/ 放各功能逻辑）
  - Webview 侧：`src/webview/media/sidebar/`（路由器按 featureId 挂载视图，bridge 封装消息通道）
  - 共享契约：`src/shared/sidebar.ts` 统一功能 ID 与消息格式，两侧清单用 `Record<SidebarFeatureId, ...>` 约束，漏注册会编译报错
  - 功能骨架：概览（已实现，含一次完整的消息往返自检）、Agent Harness（占位）、井字棋（占位）
  - 命令：`kairai.openSidebar`（打开侧栏）、`kairai.switchFeature`（QuickPick 切换功能，挂在侧栏标题栏）
  - 状态持久化：当前功能存 `globalState`，Webview 文档被销毁重建后自动恢复
- 抽出 `src/webview/html.ts`：CSP + nonce + 模板占位符注入，面板与侧栏共用（`panel.ts` 相应简化）
- 抽出 `src/webview/media/vscode-api.d.ts`：`acquireVsCodeApi` 全局类型声明，两侧 Webview 脚本共用
- 新增 `src/test/sidebar.test.ts`：注册表、功能切换、HTML 占位符替换、消息路由、非法 ID 容错等 9 个用例
- esbuild 增加第三个构建目标（`dist/media/sidebar.js`）

## [0.0.1] - 2026-09-11

### Added

- 初始版本：搭建 VS Code 扩展脚手架
  - 示例命令：`kairai.helloWorld`（读取配置弹出问候语）、`kairai.openPanel`（编辑器标题栏入口）
  - 示例 Webview 面板：CSP + nonce 注入、本地资源加载、双向消息通信（Webview 侧脚本为 TypeScript，与扩展共享消息契约）
  - 示例配置项 `kairai.greeting` 与状态栏实时联动
  - esbuild 打包 + `@vscode/test-cli` 测试 + `vsce` 打包发布完整链路
  - GitHub Actions CI / 发布工作流
