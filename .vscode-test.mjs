import { defineConfig } from "@vscode/test-cli";

/**
 * @vscode/test-cli 测试配置：
 * 自动下载一份干净的 VS Code（Electron），在其中以「扩展开发宿主」模式
 * 加载本扩展并运行 out/test 下编译好的测试用例。
 */
export default defineConfig({
  files: "out/test/**/*.test.js",
});
