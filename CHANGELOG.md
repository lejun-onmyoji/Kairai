# 更新日志

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.0.1] - 2026-09-11

### Added

- 初始版本：搭建 VS Code 扩展脚手架
  - 示例命令：`kairai.helloWorld`（读取配置弹出问候语）、`kairai.openPanel`（编辑器标题栏入口）
  - 示例 Webview 面板：CSP + nonce 注入、本地资源加载、双向消息通信（Webview 侧脚本为 TypeScript，与扩展共享消息契约）
  - 示例配置项 `kairai.greeting` 与状态栏实时联动
  - esbuild 打包 + `@vscode/test-cli` 测试 + `vsce` 打包发布完整链路
  - GitHub Actions CI / 发布工作流
